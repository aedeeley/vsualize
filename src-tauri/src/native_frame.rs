//! Suppress native caption painting without deleting the working HTML controls.
//!
//! Windows hooks must be installed on the HWND's owning thread. IPC commands
//! can arrive on other threads, so all refresh entry points dispatch to the UI
//! thread. Only the setup hook uses `initialize_webview` directly.

#[cfg(any(windows, test))]
mod corner_geometry;
#[cfg(windows)]
mod windows;

/// Call from Tauri's setup hook, before showing the initially hidden window.
pub fn initialize_webview(window: &tauri::WebviewWindow) {
    #[cfg(windows)]
    if window.label() == "main" {
        if let Ok(hwnd) = window.hwnd() {
            windows::apply(hwnd.0 as *mut std::ffi::c_void, true);
            windows::update_shape(hwnd.0 as *mut std::ffi::c_void,
                window.is_fullscreen().unwrap_or(false), window.scale_factor().unwrap_or(1.0), true);
        }
    }
    #[cfg(not(windows))]
    let _ = window;
}

pub fn apply(window: &tauri::Window, repaint: bool) {
    #[cfg(windows)]
    {
        if window.label() != "main" { return; }
        let target = window.clone();
        if let Err(error) = window.run_on_main_thread(move || {
            if let Ok(hwnd) = target.hwnd() {
                windows::apply(hwnd.0 as *mut std::ffi::c_void, repaint);
                windows::update_shape(hwnd.0 as *mut std::ffi::c_void,
                    target.is_fullscreen().unwrap_or(false), target.scale_factor().unwrap_or(1.0), repaint);
            }
        }) {
            eprintln!("Could not refresh Vsualize's caption guard: {error}");
        }
    }
    #[cfg(not(windows))]
    let _ = (window, repaint);
}

pub fn apply_webview(window: &tauri::WebviewWindow, repaint: bool) {
    #[cfg(windows)]
    {
        if window.label() != "main" { return; }
        let target = window.clone();
        if let Err(error) = window.run_on_main_thread(move || {
            if let Ok(hwnd) = target.hwnd() {
                windows::apply(hwnd.0 as *mut std::ffi::c_void, repaint);
                windows::update_shape(hwnd.0 as *mut std::ffi::c_void,
                    target.is_fullscreen().unwrap_or(false), target.scale_factor().unwrap_or(1.0), repaint);
            }
        }) {
            eprintln!("Could not refresh Vsualize's caption guard: {error}");
        }
    }
    #[cfg(not(windows))]
    let _ = (window, repaint);
}
