# Primary API references consulted

- Tauri Windows prerequisites: https://v2.tauri.app/start/prerequisites/
- Tauri Windows distribution: https://v2.tauri.app/distribute/windows-installer/
- Tauri 2 Rust Window APIs: https://docs.rs/tauri/latest/tauri/window/struct.Window.html
- Tauri tray API: https://docs.rs/tauri/latest/tauri/tray/struct.TrayIconBuilder.html
- Tauri window-state plugin: https://v2.tauri.app/plugin/window-state/
- Windows shared loopback capture: https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording
- wasapi 0.24.0 AudioClient: https://docs.rs/wasapi/0.24.0/wasapi/struct.AudioClient.html
- wasapi capture packet API: https://docs.rs/wasapi/0.24.0/wasapi/struct.AudioCaptureClient.html

Consulting these references is not a substitute for running the Windows build and hardware tests. No shader source was copied from Kauna or VVavy.


## Native-resolution update (0.2.10)

- WebGL specification, drawing buffer size and high-DPI pixel mapping: https://registry.khronos.org/webgl/specs/latest/1.0/
- Actual drawing buffer dimensions: https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/drawingBufferWidth
- This update was verified against the specification plus the supplied source; it does not depend on a new graphics library.
