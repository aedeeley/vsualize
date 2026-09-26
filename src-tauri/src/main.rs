#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod audio;
mod native_frame;
mod updater;

use audio::{AudioConfig, AudioFrame, AudioState, DeviceInfo};
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    ipc::Channel,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, State, Window,
};
use tauri_plugin_window_state::StateFlags;

#[derive(Default)]
struct TrayAvailable(AtomicBool);

#[tauri::command]
async fn start_audio(config: AudioConfig, on_frame: Channel<AudioFrame>, state: State<'_, AudioState>) -> Result<(), String> {
    state.start(config, on_frame)
}
#[tauri::command]
async fn stop_audio(state: State<'_, AudioState>) -> Result<(), String> { state.stop() }
#[tauri::command]
async fn list_audio_devices() -> Result<Vec<DeviceInfo>, String> {
    tauri::async_runtime::spawn_blocking(audio::devices).await.map_err(|e| e.to_string())?
}

fn restore_visible_area(window: &tauri::WebviewWindow) {
    let (Ok(position), Ok(size), Ok(monitors)) = (window.outer_position(), window.outer_size(), window.available_monitors()) else { return; };
    let visible = monitors.iter().any(|monitor| {
        let p = monitor.position(); let s = monitor.size();
        let left = (position.x as i64).max(p.x as i64);
        let top = (position.y as i64).max(p.y as i64);
        let right = (position.x as i64 + size.width as i64).min(p.x as i64 + s.width as i64);
        let bottom = (position.y as i64 + size.height as i64).min(p.y as i64 + s.height as i64);
        right - left >= 80 && bottom - top >= 80
    });
    if !visible { let _ = window.center(); }
}
fn reveal(app: &tauri::AppHandle, recover: bool) {
    if let Some(window) = app.get_webview_window("main") {
        if recover {
            let _ = window.set_fullscreen(false);
            let _ = window.set_always_on_bottom(false);
            let _ = window.set_always_on_top(false);
            let _ = window.set_skip_taskbar(false);
            let _ = window.set_size(tauri::LogicalSize::new(640.0, 600.0));
            let _ = window.center();
            let _ = window.emit("window-recovered", ());
        }
        restore_visible_area(&window);
        native_frame::apply_webview(&window, true);
        let _ = window.unminimize(); let _ = window.show(); let _ = window.set_focus();
        let _ = window.emit("ui-reveal", ());
    }
}

#[tauri::command]
fn window_action(window: Window, action: String, value: Option<Value>, tray: State<'_, TrayAvailable>) -> Result<(), String> {
    let text = value.as_ref().and_then(Value::as_str).unwrap_or("");
    let result = match action.as_str() {
        "drag" => {
            native_frame::apply(&window, true);
            let result = window.start_dragging();
            native_frame::apply(&window, true);
            result
        },
        "resize" => {
            use tauri_runtime::ResizeDirection as R;
            let direction = match text {
                "North" => R::North, "South" => R::South,
                "East" => R::East, "West" => R::West,
                "NorthEast" => R::NorthEast, "NorthWest" => R::NorthWest,
                "SouthEast" => R::SouthEast, "SouthWest" => R::SouthWest,
                _ => return Err("Unknown resize direction".into()),
            };
            window.start_resize_dragging(direction)
        }
        "fullscreen" => {
            let result = window.set_fullscreen(!window.is_fullscreen().map_err(|e| e.to_string())?);
            native_frame::apply(&window, true);
            result
        },
        "exit-fullscreen" => {
            let result = window.set_fullscreen(false);
            native_frame::apply(&window, true);
            result
        },
        "minimize" => window.minimize(),
        "quit" => window.close(),
        "center" => window.center(),
        "ready" => { native_frame::apply(&window, true); window.show() },
        "taskbar" => {
            let hidden = value.as_ref().and_then(Value::as_bool).ok_or("Expected a taskbar visibility boolean")?;
            if hidden && !tray.inner().0.load(Ordering::Acquire) { return Err("Tray icon unavailable. Keeping the app on the taskbar for recovery.".into()); }
            window.set_skip_taskbar(hidden)
        }
        "layer" => {
            if !matches!(text, "normal" | "top" | "bottom") { return Err("Unknown window layer".into()); }
            window.set_always_on_top(false).map_err(|e| e.to_string())?;
            window.set_always_on_bottom(false).map_err(|e| e.to_string())?;
            match text {
                "top" => window.set_always_on_top(true),
                "bottom" => window.set_always_on_bottom(true),
                _ => Ok(()),
            }
        }
        _ => return Err("Unknown window action".into()),
    };
    result.map_err(|e| e.to_string())
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| reveal(app, false)))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::new().with_state_flags(StateFlags::POSITION | StateFlags::SIZE).build())
        .manage(AudioState::default())
        .manage(TrayAvailable::default())
        .manage(updater::UpdateState::default())
        .invoke_handler(tauri::generate_handler![start_audio, stop_audio, list_audio_devices, window_action, updater::check_update, updater::install_update])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show controls", true, None::<&str>)?;
            let recover = MenuItem::with_id(app, "recover", "Recover window / center", true, None::<&str>)?;
            let stop = MenuItem::with_id(app, "stop", "Stop audio capture", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Vsualize", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &recover, &stop, &quit])?;
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?;
            match TrayIconBuilder::with_id("vsualize-tray")
                .tooltip("Vsualize")
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => reveal(app, false),
                    "recover" => reveal(app, true),
                    "stop" => {
                        let _ = app.state::<AudioState>().stop();
                        if let Some(window) = app.get_webview_window("main") { let _ = window.emit("audio-stopped", ()); }
                    }
                    "quit" => {
                        if let Some(window) = app.get_webview_window("main") { let _ = window.close(); }
                        else { app.exit(0); }
                    }
                    _ => (),
                }).build(app) {
                Ok(_) => app.state::<TrayAvailable>().inner().0.store(true, Ordering::Release),
                Err(error) => eprintln!("Tray unavailable; taskbar hiding is disabled: {error}"),
            }
            if let Some(window) = app.get_webview_window("main") {
                restore_visible_area(&window);
                // Install the native paint guard before the first visible frame.
                native_frame::initialize_webview(&window);
                window.show()?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Native style changes can recreate the stale caption surface.
            match event {
                tauri::WindowEvent::Focused(_) => native_frame::apply(window, true),
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_)
                | tauri::WindowEvent::ScaleFactorChanged { .. } => native_frame::apply(window, false),
                _ => (),
            }
            if let tauri::WindowEvent::Resized(_) = event {
                let _ = window.emit("window-minimized", window.is_minimized().unwrap_or(false));
            }
        })
        .build(tauri::generate_context!())
        .expect("Vsualize could not initialize its desktop shell");
    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event { let _ = handle.state::<AudioState>().stop(); }
    });
}
