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

#[tauri::command]
pub async fn check_update(app: AppHandle, state: State<'_, UpdateState>) -> Result<UpdateInfo, String> {
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
    fn update_operations_are_exclusive_and_unlock_on_error() {
        let state = UpdateState::default();
        let operation = state.begin().unwrap();
        assert!(state.begin().is_err());
        drop(operation);
        assert!(state.begin().is_ok());
    }
}
