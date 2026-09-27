use serde::Serialize;
use std::sync::{atomic::{AtomicBool, Ordering}, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState {
    busy: AtomicBool,
    pending: Mutex<Option<Update>>,
}

struct Operation<'a>(&'a AtomicBool);
impl Drop for Operation<'_> {
    fn drop(&mut self) { self.0.store(false, Ordering::Release); }
}
impl UpdateState {
    fn begin(&self) -> Result<Operation<'_>, String> {
        self.busy.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "An update operation is already running.".to_string())?;
        Ok(Operation(&self.busy))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo { current_version: String, version: Option<String>, notes: Option<String> }

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress { downloaded: usize, total: Option<u64>, phase: &'static str }

fn changelog_url(version: &str) -> Result<String, String> {
    let parts: Vec<_> = version.split('.').collect();
    if version.len() > 64 || parts.len() != 3
        || parts.iter().any(|part| part.is_empty() || !part.bytes().all(|c| c.is_ascii_digit())) {
        return Err("Invalid release version".into());
    }
    Ok(format!("https://github.com/aedeeley/vsualize/releases/tag/v{version}"))
}

/// Open only this app's release page, never an arbitrary URL from the feed.
#[tauri::command]
pub fn open_update_changelog(version: String) -> Result<(), String> {
    let url = changelog_url(&version)?;
    #[cfg(windows)]
    {
        use windows::{core::{w, HSTRING, PCWSTR}, Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL}};
        let result = unsafe { ShellExecuteW(None, w!("open"), &HSTRING::from(url), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
        if result.0 as isize <= 32 { return Err("Could not open the default browser".into()); }
        Ok(())
    }
    #[cfg(not(windows))]
    { let _ = url; Err("Opening release notes requires the Windows app".into()) }
}

#[tauri::command]
pub async fn check_update(app: AppHandle, state: State<'_, UpdateState>) -> Result<UpdateInfo, String> {
    if cfg!(feature = "safety-diagnostics") { return Ok(UpdateInfo { current_version: app.package_info().version.to_string(), version: None, notes: None }); }
    let _operation = state.begin()?;
    let update = app.updater_builder().timeout(Duration::from_secs(30)).build()
        .map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let info = UpdateInfo {
        current_version: app.package_info().version.to_string(),
        version: update.as_ref().map(|u| u.version.clone()),
        notes: update.as_ref().and_then(|u| u.body.clone()),
    };
    *state.pending.lock().map_err(|_| "Update state unavailable")? = update;
    Ok(info)
}

#[tauri::command]
pub async fn install_update(app: AppHandle, version: String, state: State<'_, UpdateState>) -> Result<(), String> {
    if cfg!(feature = "safety-diagnostics") { return Err("Updates are disabled in the isolated safety test build.".into()); }
    let _operation = state.begin()?;
    // Install exactly the release the user reviewed. Do not silently substitute
    // a newer release if the feed changes between checking and clicking Install.
    let mut update = {
        let pending = state.pending.lock().map_err(|_| "Update state unavailable")?;
        let update = pending.as_ref().ok_or("Check for updates before installing.")?;
        if update.version != version { return Err("The selected update changed. Check again.".into()); }
        update.clone()
    };
    update.timeout = Some(Duration::from_secs(120));
    let mut downloaded = 0;
    let mut last_progress = std::time::Instant::now();
    update.download_and_install(|chunk, total| {
        downloaded += chunk;
        if last_progress.elapsed() >= Duration::from_millis(100) {
            last_progress = std::time::Instant::now();
            let _ = app.emit("update-progress", Progress { downloaded, total, phase: "downloading" });
        }
    }, || {
        let _ = app.emit("update-progress", Progress { downloaded: 0, total: None, phase: "installing" });
    }).await.map_err(|e| e.to_string())?;
    // On Windows the updater exits the app as it launches the signed installer.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn changelog_links_are_limited_to_stable_vsualize_releases() {
        assert_eq!(changelog_url("0.4.1").unwrap(), "https://github.com/aedeeley/vsualize/releases/tag/v0.4.1");
        for version in ["", "0.4", "0.4.1/../../other", "0.4.1?url=evil", "https://example.com", "0.4.1\0", "0..1"] {
            assert!(changelog_url(version).is_err());
        }
    }
    #[test]
    fn update_operations_are_exclusive_and_unlock_on_error() {
        let state = UpdateState::default();
        let operation = state.begin().unwrap();
        assert!(state.begin().is_err());
        drop(operation);
        assert!(state.begin().is_ok());
    }
}
