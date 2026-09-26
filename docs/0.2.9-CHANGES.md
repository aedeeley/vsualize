# Vsualize 0.2.9: clean 8px corners

This is a cumulative desktop SOURCE update, not a compiled Windows installer.
It includes the evolving multicolor palette patch and the curated 21-effect library.

## What changed

The earlier rounding was attached only to the HTML body. The application now has
one isolated, transparent child surface containing the canvas, controls, drag
region and resize handles. All four corners are clipped at 8 logical/CSS pixels.
The browser preview's sample backdrop is inside this clip rather than a root/body
background that can propagate to the rectangular document canvas.

A Windows host-region cutout now removes the outer corner areas from the actual
application HWND, rather than relying on CSS to cut away a native backing surface.
The region follows the client rectangle in window coordinates. It is updated
before first show, on resize/display-scale changes, on fullscreen actions and on
focus gain/loss. Unchanged shapes are cached; activation checks the actual OS
region before reusing it. A reentry guard avoids SetWindowRgn notification loops.
Successful SetWindowRgn calls transfer region ownership to Windows; temporary
region objects are released. The existing native caption guard remains active.

The visible radius is 8 CSS pixels, scaled for the monitor. The native integer
region retains partially covered pixels so CSS supplies the smooth edge instead
of a second jagged, tightly cropped curve. There is no new border, shadow or
opaque cover. True fullscreen and native maximized windows remove the host cutout;
normal windowed mode uses 8px again. The app's full-window button uses fullscreen.

Only the outside corner cutouts are forced clear. Solid background mode stays
solid INSIDE the rounded surface; Desktop mode retains its existing transparency.
Palette generation, saved settings, audio, motion, all 21 effect shaders and their
thumbnails are byte-preserved from the latest cumulative 0.2.8 source.

## Update the local desktop app

1. Quit Vsualize, including its tray instance. Let any existing build finish.
2. Merge EVERYTHING INSIDE this package's Vsualize folder into the existing
   source folder next to UPDATE-WINDOWS.cmd and package.json. Replace files.
   Keep node_modules and src-tauri/target to reuse the existing build cache.
3. Run UPDATE-WINDOWS.cmd. Do not rerun SETUP-WINDOWS.cmd.
4. Confirm Settings says 0.2.9. Check the four corners over a light wallpaper with
   controls visible/hidden, then click another app and compare. Resize the window
   and try fullscreen, then return to windowed mode.

The change includes native Rust files as well as HTML/CSS: copying only style.css
will NOT install the native window-region fix.
For an installed Start-menu copy, use BUILD-INSTALLER.cmd and run the resulting
new setup file after the executable build succeeds. Rebuilding the source does
not replace a separately installed executable.

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
