## Validation and limits

The frontend was compiled with TypeScript 5.8.3. All 138 executed Node tests passed;
one Windows-only logging test was skipped. The actual CSS layout/alpha checks
passed (153 checks at 100%, 150%, 200%). A separate headed-Chromium test with focus
emulation DISABLED verified real browser-tab focus transitions, alpha coverage
and retained antialias pixels at 100%, 125%, 150%, 175%, 200% (305 checks).
These browser tests use a static 2D probe, not WebGL or native Windows.
All 21 unmodified effect shaders also compiled/rendered in Mesa GLES and passed
the existing palette/transparency tests. This is offscreen OpenGL ES, not WebView2.

Native Rust/Windows compilation and real HWND/WebView2 behavior have NOT been
validated in this environment. Rust and a Windows toolchain were not available.
Native tests for region focus/resize/DPI/fullscreen behavior, foreign-thread
rejection and unrelated-window preservation are included for the normal Windows
build's cargo test step. Passing browser checks is not a native Windows pass.
No new Tauri window configuration keys or Cargo/npm dependencies were introduced.

## API references checked for this implementation

- Microsoft SetWindowRgn: window-relative coordinates, ownership transfer and
  window-position notifications:
  https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowrgn
- Microsoft rounded-corner guidance: automatic DWM rounding is not guaranteed for
  highly customized/alpha-layered windows:
  https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/ui/apply-rounded-corners
- Tauri 2.11.6 WindowEvent focus, resize and display scale events:
  https://docs.rs/tauri/2.11.6/tauri/enum.WindowEvent.html
