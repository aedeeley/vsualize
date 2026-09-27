//! Native capture permission and deadline. No browser timer can extend this lease.
use crate::audio::{AudioConfig, AudioFrame, AudioState};
use serde::Serialize;
use std::{sync::Mutex, time::{Duration, Instant, SystemTime}};
use tauri::{AppHandle, Emitter, Manager, State, Window, ipc::Channel};

#[derive(Clone, Serialize)]
pub struct Snapshot { revision: u64, epoch: u64, phase: &'static str, reason: &'static str }
struct Session {
    revision: u64, epoch: u64, phase: &'static str, reason: &'static str,
    started: Instant, wall_started: SystemTime, minutes: u32,
}
impl Default for Session {
    fn default() -> Self { Self { revision: 0, epoch: 0, phase: "stopped", reason: "notice", started: Instant::now(), wall_started: SystemTime::now(), minutes: 30 } }
}
impl Session {
    fn snapshot(&self) -> Snapshot { Snapshot { revision: self.revision, epoch: self.epoch, phase: self.phase, reason: self.reason } }
    fn expired(&self) -> bool {
        let limit = Duration::from_secs(self.minutes as u64 * 60);
        self.phase != "stopped" && self.minutes > 0 &&
            (self.started.elapsed() >= limit || self.wall_started.elapsed().unwrap_or_default() >= limit)
    }
    fn stop(&mut self, reason: &'static str) { self.phase = "stopped"; self.reason = reason; }
    fn external_stop(&mut self, reason: &'static str) { self.epoch += 1; self.stop(reason); }
    fn apply(&mut self, action: &str, minutes: u32, revision: u64, epoch: u64) -> Result<(), String> {
        if ![0,15,30,60,120].contains(&minutes) { return Err("Invalid session duration".into()); }
        if !matches!(action, "start" | "stop" | "suspend" | "restore" | "duration") { return Err("Invalid session action".into()); }
        if epoch != self.epoch { return Err("Session was stopped by the system. Resume again.".into()); }
        if revision <= self.revision { return Err("Stale session request".into()); }
        self.revision = revision;
        if self.expired() { self.stop("expired"); }
        match action {
            "start" => { self.started = Instant::now(); self.wall_started = SystemTime::now(); self.minutes = minutes; self.phase = "running"; self.reason = "manual"; },
            "stop" => self.stop("manual"),
            "suspend" if self.phase == "running" => self.phase = "suspended",
            "restore" if self.phase == "suspended" => self.phase = "running",
            "duration" => { self.minutes = minutes; if self.expired() { self.stop("expired"); } },
            _ => (),
        }
        Ok(())
    }
}
#[derive(Default)]
pub struct SessionState(Mutex<Session>);
impl SessionState {
    pub fn start_audio(&self, config: AudioConfig, channel: Channel<AudioFrame>, audio: &AudioState) -> Result<(), String> {
        let mut current = self.0.lock().map_err(|_| "Session lock failed")?;
        if current.expired() { current.stop("expired"); let _ = audio.stop(); }
        if current.phase != "running" { return Err("Resume visuals before starting capture".into()); }
        // Hold the lease lock through start; a concurrent stop always cancels it afterwards.
        audio.start(config, channel)
    }
}
#[tauri::command]
pub fn session_control(window: Window, action: String, minutes: u32, revision: u64, epoch: u64, state: State<'_, SessionState>, audio: State<'_, AudioState>) -> Result<Snapshot, String> {
    if window.label() != "main" { return Err("Only the main window controls sessions".into()); }
    let mut current = state.0.lock().map_err(|_| "Session lock failed")?;
    current.apply(&action, minutes, revision, epoch)?;
    if current.phase != "running" { audio.stop()?; }
    crate::diagnostics::event("session-control", &current.snapshot());
    Ok(current.snapshot())
}
#[tauri::command]
pub fn session_status(window: Window, state: State<'_, SessionState>) -> Result<Snapshot, String> {
    if window.label() != "main" { return Err("Only the main window controls sessions".into()); }
    Ok(state.0.lock().map_err(|_| "Session lock failed")?.snapshot())
}
pub fn stop(app: &AppHandle, reason: &'static str) {
    let state = app.state::<SessionState>();
    if let Ok(mut current) = state.0.lock() {
        current.external_stop(reason);
        if let Err(error) = app.state::<AudioState>().stop() { eprintln!("Capture stop failed: {error}"); }
        crate::diagnostics::event("native-stop", &current.snapshot());
        let _ = app.emit("session-stopped", current.snapshot());
    };
}
pub fn monitor(app: AppHandle) {
    std::thread::spawn(move || {
        let mut previous = SystemTime::now();
        let mut diagnostic_tick = 0;
        loop {
            std::thread::sleep(Duration::from_millis(250));
            let now = SystemTime::now();
            let gap = now.duration_since(previous).unwrap_or_default(); previous = now;
            diagnostic_tick += 1;
            if diagnostic_tick % 4 == 0 { crate::diagnostics::counters(); }
            let state = app.state::<SessionState>();
            let Ok(mut current) = state.0.lock() else { continue; };
            if current.phase == "stopped" { continue; }
            let reason = if current.expired() { Some("expired") } else if gap > Duration::from_secs(5) { Some("wake") } else { None };
            if let Some(reason) = reason {
                current.external_stop(reason);
                if let Err(error) = app.state::<AudioState>().stop() { eprintln!("Capture stop failed: {error}"); }
                crate::diagnostics::event("native-stop", &current.snapshot());
                let _ = app.emit("session-stopped", current.snapshot());
            }
        }
    });
}

#[cfg(windows)]
mod lifecycle;
pub fn install(window: &tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    return lifecycle::install(window);
    #[cfg(not(windows))]
    { let _ = window; Ok(()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn expiry_survives_minimize_and_duration_change() {
        let mut s = Session::default(); s.apply("start",30,1,0).unwrap();
        s.started -= Duration::from_secs(20*60); s.apply("suspend",30,2,0).unwrap();
        s.apply("duration",15,3,0).unwrap(); assert_eq!(s.phase,"stopped"); assert_eq!(s.reason,"expired");
        s.apply("restore",15,4,0).unwrap(); assert_eq!(s.phase,"stopped");
    }
    #[test] fn explicit_start_is_only_way_to_restart() {
        let mut s=Session::default(); s.apply("restore",30,1,0).unwrap(); assert_eq!(s.phase,"stopped");
        s.apply("start",0,2,0).unwrap(); s.started-=Duration::from_secs(86400); assert!(!s.expired());
        s.stop("wake"); s.apply("duration",60,3,0).unwrap(); assert_eq!(s.phase,"stopped");
        s.apply("start",60,4,0).unwrap(); assert_eq!(s.phase,"running");
    }
    #[test] fn invalid_and_out_of_order_commands_cannot_reopen_capture() {
        let mut s=Session::default(); s.apply("stop",30,2,0).unwrap();
        assert!(s.apply("start",30,1,0).is_err()); assert!(s.apply("start",999,3,0).is_err());
        assert!(s.apply("unknown",30,3,0).is_err()); assert_eq!(s.phase,"stopped");
    }
    #[test] fn autonomous_stop_invalidates_all_previously_issued_starts() {
        let mut s=Session::default(); s.apply("start",30,1,0).unwrap();
        s.external_stop("wake");
        for revision in [2,3,9,100] { assert!(s.apply("start",30,revision,0).is_err()); }
        assert_eq!(s.phase,"stopped"); assert_eq!(s.reason,"wake");
        s.apply("start",30,101,1).unwrap(); assert_eq!(s.phase,"running");
        s.external_stop("manual"); assert!(s.apply("restore",30,102,1).is_err());
    }
}
