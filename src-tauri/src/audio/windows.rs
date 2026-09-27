//! One COM apartment and WASAPI client per source. No loopback driver or cable.
use super::{analyzer::{Analyzer, Encoding, PcmFormat}, DeviceInfo, SharedSnapshot};
use std::{sync::{atomic::{AtomicBool, Ordering}, Arc}, thread, time::{Duration, Instant}};
use wasapi::{DeviceEnumerator, Direction, SampleType, StreamMode};

type Result<T> = std::result::Result<T, String>;
struct ComApartment;
impl ComApartment {
    fn new() -> Result<Self> {
        wasapi::initialize_mta().ok().map_err(|e| format!("Could not initialize audio COM apartment: {e}"))?;
        Ok(Self)
    }
}
impl Drop for ComApartment { fn drop(&mut self) { wasapi::deinitialize(); } }
fn err(error: impl std::fmt::Display) -> String { error.to_string() }

pub fn devices() -> Result<Vec<DeviceInfo>> {
    let _com = ComApartment::new()?;
    let enumerator = DeviceEnumerator::new().map_err(err)?;
    let mut results = Vec::new();
    for (direction, kind) in [(Direction::Render, "desktop"), (Direction::Capture, "microphone")] {
        let collection = enumerator.get_device_collection(&direction).map_err(err)?;
        for index in 0..collection.get_nbr_devices().map_err(err)? {
            let device = match collection.get_device_at_index(index) { Ok(d) => d, Err(_) => continue };
            let id = match device.get_id() { Ok(id) => id, Err(_) => continue };
            let name = device.get_friendlyname().unwrap_or_else(|_| "Unnamed audio device".into());
            results.push(DeviceInfo { id, name, kind: kind.into() });
        }
    }
    Ok(results)
}

pub(super) fn capture(desktop: bool, id: String, source: SharedSnapshot, cancel: Arc<AtomicBool>) {
    while !cancel.load(Ordering::Acquire) {
        let result = capture_once(desktop, &id, &source, &cancel);
        // capture_once has returned: its COM/client/device locals have been dropped.
        crate::diagnostics::event("capture-resources-released", &desktop);
        if let Err(message) = result {
            if let Ok(mut state) = source.lock() {
                state.updated = None;
                state.status = format!("Error: {message}. Retrying…");
            }
            // Brief, cancellable backoff prevents hot spinning on unplugged devices.
            for _ in 0..20 {
                if cancel.load(Ordering::Acquire) { return; }
                thread::sleep(Duration::from_millis(50));
            }
        }
    }
}
fn capture_once(desktop: bool, id: &str, source: &SharedSnapshot, cancel: &AtomicBool) -> Result<()> {
    let _com = ComApartment::new()?;
    let enumerator = DeviceEnumerator::new().map_err(err)?;
    let direction = if desktop { Direction::Render } else { Direction::Capture };
    let device = if id.is_empty() {
        enumerator.get_default_device(&direction).map_err(err)?
    } else { enumerator.get_device(id).map_err(err)? };
    let selected_id = device.get_id().map_err(err)?;
    let name = device.get_friendlyname().unwrap_or_else(|_| "Audio device".into());
    let mut client = device.get_iaudioclient().map_err(err)?;
    let format = client.get_mixformat().map_err(err)?;
    let bits = format.get_bitspersample();
    let encoding = match (format.get_subformat().map_err(err)?, bits) {
        (SampleType::Float, 32) => Encoding::Float32,
        (SampleType::Float, 64) => Encoding::Float64,
        (SampleType::Int, 8) => Encoding::Unsigned8,
        (SampleType::Int, 16) => Encoding::Signed16,
        (SampleType::Int, 24) => Encoding::Signed24,
        (SampleType::Int, 32) => Encoding::Signed32,
        _ => return Err(format!("Unsupported PCM encoding ({bits} bits)")),
    };
    // Integer valid bits in a wider container are left-aligned by WAVEFORMATEXTENSIBLE.
    let pcm = PcmFormat {
        channels: format.get_nchannels() as usize,
        sample_rate: format.get_samplespersec(),
        stride: format.get_blockalign() as usize,
        sample_bytes: bits as usize / 8,
        encoding,
    };
    let mut analyzer = Analyzer::new(pcm)?;
    let mode = StreamMode::EventsShared { autoconvert: false, buffer_duration_hns: 200_000 };
    // Capture on a render endpoint enables WASAPI shared-mode loopback.
    client.initialize_client(&format, &Direction::Capture, &mode).map_err(err)?;
    let event = client.set_get_eventhandle().map_err(err)?;
    let capture = client.get_audiocaptureclient().map_err(err)?;
    client.start_stream().map_err(err)?;
    crate::diagnostics::event("capture-stream-start", &desktop);
    if let Ok(mut state) = source.lock() {
        state.status = format!("Listening: {name}"); state.updated = None;
        state.packets = 0; state.sample_rate = pcm.sample_rate; state.channels = pcm.channels;
    }
    let mut buffer = Vec::<u8>::new();
    let mut check_default = Instant::now();
    let result = (|| -> Result<()> {
        while !cancel.load(Ordering::Acquire) {
            // A timeout during silent loopback is normal. Packet queries still catch errors.
            let _ = event.wait_for_event(80);
            if id.is_empty() && check_default.elapsed() >= Duration::from_secs(1) {
                check_default = Instant::now();
                let now = enumerator.get_default_device(&direction).map_err(err)?.get_id().map_err(err)?;
                if now != selected_id { return Ok(()); } // Reopen the new default endpoint.
            }
            loop {
                if cancel.load(Ordering::Acquire) { break; }
                let frames = capture.get_next_packet_size().map_err(err)?.unwrap_or(0) as usize;
                if frames == 0 { break; }
                let size = frames.checked_mul(pcm.stride).ok_or("Invalid capture buffer size")?;
                if size > 16 * 1024 * 1024 { return Err("Capture packet exceeds the safety limit".into()); }
                buffer.resize(size, 0);
                let (read_frames, info) = capture.read_from_device(&mut buffer).map_err(err)?;
                crate::diagnostics::packet();
                if let Ok(mut state) = source.lock() { state.packets = state.packets.saturating_add(1); }
                if info.flags.data_discontinuity { analyzer.reset(); }
                if let Some(analysis) = analyzer.push(&buffer, read_frames as usize, info.flags.silent) {
                    crate::diagnostics::analysis();
                    if let Ok(mut state) = source.lock() { state.analysis = analysis; state.updated = Some(Instant::now()); }
                }
            }
        }
        Ok(())
    })();
    let _ = client.stop_stream();
    result
}
