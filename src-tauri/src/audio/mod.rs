mod analyzer;
#[cfg(windows)]
mod windows;

use analyzer::{display_level, display_spectrum, Analysis, BANDS};
#[cfg(test)]
use analyzer::WAVE;
use serde::{Deserialize, Serialize};
use std::{
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use tauri::ipc::Channel;

// Deliver the latest analysis at approximately the display's 60 Hz cadence.
// This is a feature stream, never a queue of captured PCM or delayed frames.
const FRAME_INTERVAL: Duration = Duration::from_millis(16);

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioConfig {
    pub mode: String,
    pub desktop_device: String,
    pub microphone_device: String,
    pub desktop_gain: f32,
    pub microphone_gain: f32,
    pub sensitivity: f32,
    pub noise_gate: f32,
}
impl AudioConfig {
    fn validate(&self) -> Result<(), String> {
        if !matches!(self.mode.as_str(), "desktop" | "microphone" | "both" | "demo" | "off") {
            return Err("Unknown audio mode".into());
        }
        for value in [self.desktop_gain, self.microphone_gain, self.sensitivity] {
            if !value.is_finite() || !(0.0..=5.0).contains(&value) { return Err("Audio gain is out of range".into()); }
        }
        if !self.noise_gate.is_finite() || !(0.0..=0.1).contains(&self.noise_gate) {
            return Err("Noise gate is out of range".into());
        }
        if self.desktop_device.len() > 4096 || self.microphone_device.len() > 4096 { return Err("Invalid device ID".into()); }
        Ok(())
    }
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputDiagnostics {
    pub raw_rms: f32,
    pub packet_age_ms: Option<u64>,
    pub packets: u64,
    pub sample_rate: u32,
    pub channels: usize,
    pub gated: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioFrame {
    pub volume: f32,
    pub bass: f32,
    pub mid: f32,
    pub treble: f32,
    pub beat: f32,
    pub spectrum: Vec<f32>,
    pub waveform: Vec<f32>,
    pub desktop_level: f32,
    pub microphone_level: f32,
    pub desktop_status: String,
    pub microphone_status: String,
    pub desktop_input: InputDiagnostics,
    pub microphone_input: InputDiagnostics,
}
#[derive(Serialize)]
pub struct DeviceInfo { pub id: String, pub name: String, pub kind: String }

pub(super) struct Snapshot {
    analysis: Analysis,
    updated: Option<Instant>,
    status: String,
    packets: u64,
    sample_rate: u32,
    channels: usize,
}
impl Snapshot {
    fn new(selected: bool) -> Self {
        Self { analysis: Analysis::default(), updated: None, status: if selected { "Connecting…" } else { "Not selected" }.into(), packets: 0, sample_rate: 0, channels: 0 }
    }
    fn diagnostics(&self, gate: f32) -> InputDiagnostics {
        let raw = self.current(0.0).rms;
        InputDiagnostics {
            raw_rms: raw,
            packet_age_ms: self.updated.map(|time| time.elapsed().as_millis().min(u64::MAX as u128) as u64),
            packets: self.packets, sample_rate: self.sample_rate, channels: self.channels,
            gated: raw > 0.0 && raw < gate,
        }
    }
    fn current(&self, gate: f32) -> Analysis {
        if self.analysis.rms < gate { return Analysis::default(); }
        let Some(updated) = self.updated else { return Analysis::default(); };
        let elapsed = updated.elapsed().as_secs_f32();
        // Shared-mode loopback may emit no packets at all while the output is silent.
        let scale = (-(elapsed - 0.10).max(0.0) * 24.0).exp();
        if elapsed > 0.6 { return Analysis::default(); }
        let mut data = self.analysis.clone();
        data.rms *= scale;
        if data.rms < gate { return Analysis::default(); }
        for n in &mut data.power { *n *= scale * scale; }
        for n in &mut data.waveform { *n *= scale; }
        data
    }
}

type SharedSnapshot = Arc<Mutex<Snapshot>>;
struct Session { cancel: Arc<AtomicBool>, thread: JoinHandle<()> }
#[derive(Default)]
pub struct AudioState { session: Mutex<Option<Session>> }
impl AudioState {
    pub fn stop(&self) -> Result<(), String> {
        let mut current = self.session.lock().map_err(|_| "Audio session lock failed")?;
        if let Some(session) = current.take() {
            session.cancel.store(true, Ordering::Release);
            let _ = session.thread.join();
        }
        Ok(())
    }
    pub fn start(&self, config: AudioConfig, channel: Channel<AudioFrame>) -> Result<(), String> {
        config.validate()?;
        let mut current = self.session.lock().map_err(|_| "Audio session lock failed")?;
        if let Some(session) = current.take() {
            session.cancel.store(true, Ordering::Release);
            let _ = session.thread.join();
        }
        if matches!(config.mode.as_str(), "off" | "demo") { return Ok(()); }
        #[cfg(not(windows))]
        return Err("Native capture currently targets Windows. Use the explicit Demo preview on other systems.".into());
        #[cfg(windows)]
        {
            let cancel = Arc::new(AtomicBool::new(false));
            let worker_cancel = cancel.clone();
            let thread = thread::Builder::new().name("vsualize-audio".into())
                .spawn(move || controller(config, channel, worker_cancel)).map_err(|e| e.to_string())?;
            *current = Some(Session { cancel, thread });
            Ok(())
        }
    }
}
impl Drop for AudioState { fn drop(&mut self) { let _ = self.stop(); } }

struct BeatDetector {
    previous: [f32; BANDS], average: f32, envelope: f32, elapsed: f32, last: Instant,
}
impl BeatDetector {
    fn new() -> Self { Self { previous: [0.0; BANDS], average: 0.0, envelope: 0.0, elapsed: 0.0, last: Instant::now() } }
    fn update(&mut self, spectrum: &[f32], volume: f32, dt: Duration) -> f32 {
        let dt = dt.as_secs_f32().clamp(0.001, 0.1);
        // Normalize flux and envelopes to the former 33 ms cadence. Increasing
        // delivery frequency must not halve beat duration or the averaging time.
        let cadence = dt / 0.033;
        let flux = spectrum.iter().zip(&self.previous).map(|(a, b)| (a - b).max(0.0)).sum::<f32>() / BANDS as f32 / cadence;
        let threshold = self.average * 1.65 + 0.012;
        self.envelope *= 0.76f32.powf(cadence);
        if self.elapsed > 0.396 && volume > 0.03 && flux > threshold && self.last.elapsed() > Duration::from_millis(180) {
            self.envelope = (0.4 + (flux - threshold) * 9.0).clamp(0.0, 1.0);
            self.last = Instant::now();
        }
        self.average += (flux - self.average) * (1.0 - 0.93f32.powf(cadence));
        self.previous.copy_from_slice(spectrum);
        self.elapsed += dt;
        self.envelope
    }
}

fn combine(desktop: &Analysis, mic: &Analysis, config: &AudioConfig, desktop_status: String, mic_status: String) -> AudioFrame {
    let dg = config.desktop_gain * config.sensitivity;
    let mg = config.microphone_gain * config.sensitivity;
    let drms = desktop.rms * dg;
    let mrms = mic.rms * mg;
    let spectrum: Vec<f32> = desktop.power.iter().zip(&mic.power)
        .map(|(d, m)| display_spectrum(d * dg * dg + m * mg * mg)).collect();
    let average = |start: usize, end: usize| spectrum[start..end].iter().sum::<f32>() / (end - start) as f32;
    // Streams may have unrelated clocks. Combine features, not raw PCM. Show the
    // louder source's waveform instead of an invalid, unsynchronized waveform mix.
    let (wave, gain) = if drms >= mrms { (&desktop.waveform, dg) } else { (&mic.waveform, mg) };
    AudioFrame {
        volume: display_level((drms * drms + mrms * mrms).sqrt()),
        bass: average(5, 44), mid: average(44, 89), treble: average(89, 125), beat: 0.0,
        waveform: wave.iter().map(|n| (n * gain).clamp(-1.0, 1.0)).collect(), spectrum,
        desktop_level: display_level(drms), microphone_level: display_level(mrms),
        desktop_status, microphone_status: mic_status,
        desktop_input: InputDiagnostics::default(), microphone_input: InputDiagnostics::default(),
    }
}

#[cfg(windows)]
fn controller(config: AudioConfig, channel: Channel<AudioFrame>, cancel: Arc<AtomicBool>) {
    let desktop_selected = matches!(config.mode.as_str(), "desktop" | "both");
    let microphone_selected = matches!(config.mode.as_str(), "microphone" | "both");
    let desktop = Arc::new(Mutex::new(Snapshot::new(desktop_selected)));
    let mic = Arc::new(Mutex::new(Snapshot::new(microphone_selected)));
    let mut workers = Vec::new();
    for (selected, is_desktop, id, snapshot) in [
        (desktop_selected, true, config.desktop_device.clone(), desktop.clone()),
        (microphone_selected, false, config.microphone_device.clone(), mic.clone()),
    ] {
        if !selected { continue; }
        let token = cancel.clone();
        let failed = snapshot.clone();
        match thread::Builder::new().name(if is_desktop { "wasapi-desktop" } else { "wasapi-mic" }.into())
            .spawn(move || windows::capture(is_desktop, id, snapshot, token)) {
            Ok(handle) => workers.push(handle),
            Err(error) => if let Ok(mut source) = failed.lock() { source.status = format!("Error: {error}"); },
        }
    }
    let mut detector = BeatDetector::new();
    let mut previous_frame = Instant::now() - FRAME_INTERVAL;
    while !cancel.load(Ordering::Acquire) {
        let start = Instant::now();
        let dt = start.duration_since(previous_frame);
        previous_frame = start;
        let (d, ds, di) = match desktop.lock() { Ok(s) => (s.current(config.noise_gate), s.status.clone(), s.diagnostics(config.noise_gate)), Err(_) => break };
        let (m, ms, mi) = match mic.lock() { Ok(s) => (s.current(config.noise_gate), s.status.clone(), s.diagnostics(config.noise_gate)), Err(_) => break };
        let mut frame = combine(&d, &m, &config, ds, ms);
        frame.desktop_input = di; frame.microphone_input = mi;
        frame.beat = detector.update(&frame.spectrum, frame.volume, dt);
        if channel.send(frame).is_err() { break; }
        if let Some(wait) = FRAME_INTERVAL.checked_sub(start.elapsed()) { thread::sleep(wait); }
    }
    cancel.store(true, Ordering::Release);
    for worker in workers { let _ = worker.join(); }
}

pub fn devices() -> Result<Vec<DeviceInfo>, String> {
    #[cfg(windows)]
    return windows::devices();
    #[cfg(not(windows))]
    return Err("Native audio devices are implemented for Windows only in this prototype.".into());
}

#[cfg(test)]
mod tests {
    use super::*;
    fn config() -> AudioConfig { AudioConfig { mode: "both".into(), desktop_device: "".into(), microphone_device: "".into(), desktop_gain: 1.0, microphone_gain: 1.0, sensitivity: 1.0, noise_gate: 0.0 } }
    #[test]
    fn mixed_power_keeps_both_sources_without_pcm_cancellation() {
        let d = Analysis { rms: 0.1, power: [0.001; BANDS], waveform: [0.2; WAVE] };
        let m = Analysis { rms: 0.1, power: [0.001; BANDS], waveform: [-0.2; WAVE] };
        let mixed = combine(&d, &m, &config(), "OK".into(), "OK".into());
        assert!(mixed.spectrum[10] > display_spectrum(d.power[10]));
        assert!(mixed.waveform[10] > 0.0);
        assert_eq!(mixed.spectrum.len(), BANDS); assert_eq!(mixed.waveform.len(), WAVE);
    }
    #[test]
    fn stale_source_cannot_freeze_a_visual_on_old_energy() {
        let s = Snapshot { analysis: Analysis { rms: 1.0, ..Analysis::default() }, updated: Some(Instant::now() - Duration::from_secs(2)), status: "OK".into(), packets: 10, sample_rate: 48000, channels: 2 };
        assert_eq!(s.current(0.0).rms, 0.0);
    }
    #[test]
    fn config_rejects_invalid_gain() {
        let mut c = config(); c.sensitivity = f32::NAN; assert!(c.validate().is_err());
        c.sensitivity = 1.0; c.mode = "unknown".into(); assert!(c.validate().is_err());
    }
    #[test]
    fn no_beat_is_invented_in_silence() {
        let mut detector = BeatDetector::new();
        for _ in 0..100 { assert_eq!(detector.update(&[0.0; BANDS], 0.0, FRAME_INTERVAL), 0.0); }
    }
    #[test]
    fn beat_release_has_the_same_duration_at_both_delivery_rates() {
        let mut old = BeatDetector::new(); old.envelope = 1.0;
        let mut fast = BeatDetector::new(); fast.envelope = 1.0;
        for _ in 0..10 { old.update(&[0.0; BANDS], 0.0, Duration::from_millis(33)); }
        for _ in 0..20 { fast.update(&[0.0; BANDS], 0.0, Duration::from_micros(16_500)); }
        assert!((old.envelope - fast.envelope).abs() < 1e-6);
    }
    #[test]
    fn raw_diagnostics_explain_gate_without_fabricating_visual_energy() {
        let s = Snapshot {
            analysis: Analysis { rms: 0.001, ..Analysis::default() },
            updated: Some(Instant::now()), status: "Listening: test".into(),
            packets: 10, sample_rate: 48000, channels: 2,
        };
        let info = s.diagnostics(0.002);
        assert!(info.gated); assert!(info.raw_rms > 0.0);
        assert_eq!(s.current(0.002).rms, 0.0);
        assert_eq!(info.sample_rate, 48000); assert_eq!(info.channels, 2);
        assert!(info.packet_age_ms.is_some());
    }
    #[test]
    fn silent_loopback_diagnostics_do_not_retain_old_level() {
        let s = Snapshot {
            analysis: Analysis { rms: 0.8, ..Analysis::default() },
            updated: Some(Instant::now() - Duration::from_secs(2)), status: "Listening: test".into(),
            packets: 8, sample_rate: 48000, channels: 2,
        };
        let info = s.diagnostics(0.002);
        assert_eq!(info.raw_rms, 0.0); assert!(!info.gated);
        assert!(info.packet_age_ms.unwrap() >= 2000);
    }

}
