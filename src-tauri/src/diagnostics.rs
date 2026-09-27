//! Opt-in, bounded local evidence for the safety test build. No audio or identifiers.
use serde::{Deserialize, Serialize};
use tauri::Window;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase { Running, Suspended, Stopped }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FrontendSample {
    phase: Phase, frames: u64, draws: u64, compiles: u64, audio_ticks: u64,
    hidden: bool, fps: u32, width: u32, height: u32,
}
#[tauri::command]
pub fn safety_diagnostics(window: Window, sample: Option<FrontendSample>) -> Result<bool, String> {
    if window.label() != "main" { return Err("Only the main window may report diagnostics".into()); }
    if let Some(sample) = sample {
        if sample.fps > 240 || sample.width > 32768 || sample.height > 32768 { return Err("Invalid diagnostic dimensions or cadence".into()); }
        event("frontend", &sample);
    }
    Ok(enabled())
}

#[cfg(feature = "safety-diagnostics")]
mod local {
    use super::*;
    use std::{fs::{File, OpenOptions}, io::Write, sync::{Mutex, OnceLock}, time::{Instant, SystemTime, UNIX_EPOCH}};
    struct Log { file: File, bytes: usize, start: Instant }
    static LOG: OnceLock<Mutex<Option<Log>>> = OnceLock::new();
    fn log() -> &'static Mutex<Option<Log>> {
        LOG.get_or_init(|| Mutex::new(std::env::var_os("VSUALIZE_SAFETY_LOG")
            .and_then(|p| OpenOptions::new().write(true).create_new(true).open(p).ok())
            .map(|file| Log { file, bytes: 0, start: Instant::now() })))
    }
    pub fn enabled() -> bool { log().lock().map(|l| l.is_some()).unwrap_or(false) }
    pub fn event(name: &'static str, data: &impl Serialize) {
        let Ok(mut guard) = log().lock() else { return; };
        let Some(log) = guard.as_mut() else { return; };
        if log.bytes >= 16 * 1024 * 1024 || log.start.elapsed().as_secs() >= 3 * 60 * 60 { *guard = None; return; }
        let entry = serde_json::json!({"event":name,"pid":std::process::id(),"unixMs":SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),"elapsedMs":log.start.elapsed().as_millis(),"data":data});
        if let Ok(mut bytes) = serde_json::to_vec(&entry) {
            bytes.push(b'\n'); log.bytes += bytes.len();
            if log.file.write_all(&bytes).and_then(|_|log.file.flush()).is_err() { *guard = None; }
        }
    }
}
pub fn enabled() -> bool {
    #[cfg(feature = "safety-diagnostics")] { local::enabled() }
    #[cfg(not(feature = "safety-diagnostics"))] { false }
}
pub fn event(name: &'static str, data: &impl Serialize) {
    #[cfg(feature = "safety-diagnostics")] local::event(name, data);
    #[cfg(not(feature = "safety-diagnostics"))] { let _ = (name, data); }
}

#[cfg(feature = "safety-diagnostics")]
mod counts {
    use std::sync::atomic::AtomicU64;
    pub static PACKETS: AtomicU64 = AtomicU64::new(0);
    pub static ANALYSES: AtomicU64 = AtomicU64::new(0);
}
pub fn packet() { #[cfg(feature = "safety-diagnostics")] { counts::PACKETS.fetch_add(1, std::sync::atomic::Ordering::Relaxed); } }
pub fn analysis() { #[cfg(feature = "safety-diagnostics")] { counts::ANALYSES.fetch_add(1, std::sync::atomic::Ordering::Relaxed); } }
pub fn counters() {
    #[cfg(feature = "safety-diagnostics")] event("audio-counters", &serde_json::json!({"packets":counts::PACKETS.load(std::sync::atomic::Ordering::Relaxed),"analyses":counts::ANALYSES.load(std::sync::atomic::Ordering::Relaxed)}));
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn diagnostic_schema_rejects_unbounded_or_private_fields() {
        let base = serde_json::json!({"phase":"stopped","frames":0,"draws":0,"compiles":0,"audioTicks":0,"hidden":false,"fps":60,"width":640,"height":600});
        assert!(serde_json::from_value::<FrontendSample>(base.clone()).is_ok());
        let mut extra = base.clone(); extra["deviceName"] = "private".into();
        assert!(serde_json::from_value::<FrontendSample>(extra).is_err());
        let mut invalid = base; invalid["phase"] = "arbitrary".into();
        assert!(serde_json::from_value::<FrontendSample>(invalid).is_err());
    }
}
