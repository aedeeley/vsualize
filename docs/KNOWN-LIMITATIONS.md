## Current 0.3.0 release

Twelve r5 effects, four controls, adaptive rendering and signed updates are now implemented. The Windows installer and native tests passed; real RX 6800 XT shader rendering and live desktop capture were observed. See [current validation](TEST-REPORT-0.3.0.md) for the precise checks and limits. Physical end-to-end latency, sustained FPS and future-version update installation are not claimed as measured. The installer lacks a Windows Authenticode certificate.

All sections below describe historical versions.

## Historical 0.2.11 delivery

- 11 effects remain. The five sliders and palette use screenshot-specific, per-effect defaults.
- These defaults replace the old shared tuning once. Later custom values persist per effect.
- Native 4K rendering, colors, audio and native window implementation remain unchanged from 0.2.10.
- Windows compilation, WebView2 graphics, live capture and native-corner behavior were not tested in this environment.
- Chromium interaction tests use mocked WebGL/native IPC. Separate real offscreen GLES checks exercise shader compilation and rendering, not Windows.
- No new effects, instrument separation or explosion pack was added.
- The old sections below are historical. The current verification is TEST-REPORT-0.2.11.md.

## Current 0.2.10 rendering note

Native resolution is now available without an app-imposed pixel budget. At 4K this can substantially increase GPU load. Live Windows/WebView2 performance remains untested here. Light/Balanced retain reduced resolution. See TEST-REPORT-0.2.10.md.

## 0.2.8 delivery notes

- Removal-only update: 21 retained effects, no new visual or audio behavior.
- Native Windows compilation/capture/window behavior were not tested here.
- Current checks: TEST-REPORT-0.2.8.md. Older sections/reports describe their releases.
- If updating in place, the build removes only the five explicitly retired shader
  module files. Existing dependencies, build caches and retained shaders stay intact.
- Retained effect/source and thumbnail integrity is checked against 0.2.7 hashes.

## 0.2.7 delivery notes

- Windows compilation, WebView2 rendering, native caption suppression and live capture were not run here.
- Real shader checks used offscreen Mesa GLES; browser UI checks used explicit graphics/native mocks.
- Julia/Bloom/Mandelbrot use finite inward journeys with crossfades, not arbitrary-precision infinite zoom. Fine fractal edges can shimmer at low resolution.
- Ripple is a projected procedural contour surface driven by delayed spectrum history, not a physical water simulation or exact Kauna reproduction. It uses a heavy-effect pixel budget; actual frame rate depends on hardware/quality.
- This pass improves all 26 existing effects. It does not add the previously discussed dedicated explosion pack or six-band instrument separation.
- Quick local highlights and particle births remain intentionally responsive. Motion smoothing governs the slower structural lane; it does not promise elimination of every rapid local detail change.
- Earlier version test reports are historical. Use TEST-REPORT-0.2.7.md for this delivery.

# Prototype boundaries and Windows acceptance checklist

## Music-response update 0.2.6

The shared TypeScript response layer decodes existing log-display FFT data and
adds bounded adaptive frequency scaling. It cannot recover already clipped
frequency values and does not isolate instruments or estimate tempo. Capture
source configuration and input gain remain important. This is not a replacement
for checking that live meters actually correspond to the selected output device.

The 26 shaders were executed in offscreen Mesa GLES3 here, not browser WebGL2 or
Windows WebView2. UI event tests explicitly mock graphics and the native bridge.
Real end-to-end music timing, Windows compilation and subjective reactivity still
need testing on the actual machine. See TEST-REPORT-0.2.6.md. The 4px CSS patch is
included; native source, ghost-caption code and build/logger scripts are unchanged.


## Build repair 0.2.5

The earlier noRedirectionBitmap configuration field was incompatible with the
released Tauri 2.11.6 runtime and is removed. The old transcript did not capture
the native failure details. The new logger and preflight are intended to expose
any additional configuration/compiler problem. They do not establish that the
Windows build, compositor workaround or audio devices have been validated.
The Windows-only PowerShell logging integration test is skipped on non-Windows
hosts and runs as part of npm test on Windows.

## Live-audio update 0.2.3

The LIVE state describes nonzero received analysis data, not recognition of a particular song or application. Desktop captures only the selected playback endpoint. Raw input diagnostics are pre-gain and pre-gate RMS, while the spectrum and final meters reflect settings. A silent WASAPI loopback may legitimately produce no new packets; absence of packets on a silent endpoint alone is not labelled a device failure. IPC heartbeat loss is reported separately.

The browser starts disconnected and cannot capture desktop audio. The native UI integration test uses an explicit mock channel; it validates frontend status/controls, not Windows or actual music capture. The source package contains no compiled EXE or installed update.

## Not yet verified on Windows

The native code has been written against current primary API documentation, but could not be compiled in the Linux authoring environment because Rust and downloadable build dependencies were unavailable. A first native build may expose integration issues. Browser smoke tests do not validate WASAPI, WebView2 permissions, tray behavior, Rust compilation, or desktop alpha composition.

Before calling this a dependable local build, test these on the actual machine:

1. Compile using START-WINDOWS.cmd, including Rust unit tests. Keep build.log on failure.
2. Play audio through the default Windows output, then explicitly select another output device.
3. Test Microphone and Both. Check each contribution independently, including a contribution of zero.
4. Change the default output, unplug an input, reconnect it, and let playback go silent. Energy should decay instead of freezing, and failures should be reported.
5. Click/drag the gradient, resize all edges, change monitors/DPI, restart, and verify geometry restoration.
6. Test transparency over wallpaper and an ordinary app. There should be no opaque webview rectangle when transparent mode is enabled.
7. Test layer settings, minimize/resume, fullscreen, taskbar hiding, and system-tray recovery.
8. Watch actual CPU/GPU usage with the preferred window size. Set Light quality or 30 fps as needed.

## Native caption update 0.2.4

The 0.2.2/0.2.3 style-only workaround did not remove the extra row on the user's
machine. Version 0.2.4 installs a persistent native non-client paint guard before
first show and protects the main host plus its same-thread, same-process child
wrappers. It suppresses WM_NCPAINT and non-minimized WM_NCACTIVATE caption drawing,
prevents caption styles returning, and disables host DWM non-client rendering.
The working app controls, transparency, resize hit testing and minimize/close
commands remain in the source. Hooks are never installed in foreign processes or
threads. Foreign WebView2 subprocess HWNDs are deliberately not modified.

**Not yet compiled or visually tested on Windows in this delivery environment.**
A native renderer/compositor artifact outside these guarded windows may still need
an upstream WebView2 fix. The browser cannot reproduce or verify OS caption
painting. Five Windows-only tests are included and run by the existing cargo test
step; they exercise disposable native windows, not the real WebView2 compositor.

On the actual desktop, test first launch, dragging, resize, Alt+Tab away/back,
minimize/restore, fullscreen, and both background modes. Keep only one working row
visible while the controls are revealed, and no caption controls while hidden.
Make sure the running executable says 0.2.4, not an older installed copy.

## Deliberate limits

- Desktop mode captures one selected playback endpoint. Apps explicitly routed elsewhere are not captured unless their endpoint is selected. Process-specific selection and aggregating every output are not implemented.
- WASAPI shared loopback is subject to Windows/driver behavior, protected-content restrictions, and exclusive-mode applications. See [Microsoft loopback documentation](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording).
- Native formats supported: floating-point 32/64-bit and integer 8/16/24/32-bit PCM. Up to eight channels are analyzed. Unsupported formats produce an error instead of guessing.
- Default endpoint changes are polled approximately once per second. Explicitly selected unavailable devices retry until reconnected or changed.
- Microphone and desktop FFTs are combined as analysis features, not as clock-synchronized playable audio. Waveform comes from the stronger source.
- Beat detection is a basic adaptive onset/energy heuristic, not a tempo tracker. No BPM estimate is presented.
- Mandelbrot zoom uses forward-moving finite voyages with crossfades into the next voyage. It does not claim arbitrary-precision endless zoom.
- Visual thumbnails are stills rendered from the actual shaders. They are not separate simultaneously animated previews.
- Transparency reveals whatever is behind the window, not necessarily just wallpaper. It does not make the window click-through. Desktop refraction, desktop capture, and wallpaper attachment are not implemented.
- Windows opacity/graphics performance and frame pacing depend on WebView2, drivers, hardware, and desktop composition. The fps setting is a cap/target, not a benchmark guarantee.
- Render loops stop while document-hidden/native-minimized and when explicitly paused. Native audio analysis remains active until Stop capture or Quit.
- Start with Windows, per-effect custom settings/presets, automatic timed rotation, per-app capture, OBS export, video export, public plugins, signing, and updating are deferred.
- Linux/macOS native capture and packaging are not delivered. Shared UI architecture is not a portability guarantee.

## Collection-specific limits in 0.2.0

- All 22 additions are original interpretations. Reference research used VVavy catalog descriptions and still thumbnails, not live side-by-side animation analysis or extracted shader source. Pixel-identical geometry, timing, and camera motion are not promised.
- Acid Organism is a domain-warped procedural organic field, not a Physarum agent simulation or a numerical fluid solver.
- Dissolution uses a polar cellular corridor rather than duplicating a reference's full recursive 3D scene. Petal Resonance and Cosmic Kaleidoscope use layered/folded procedural geometry, while Iridescent Julia and Fractal Bloom use actual bounded Julia iteration.
- Groove Current uses real temporal framebuffer feedback, but it is not a physical fluid simulation. Trails reset when switching effect, changing background/palette/opacity, or resizing. Music-only silence now freezes the existing feedback image exactly. With ambient drift enabled, trails continue evolving. Pause stops rendering.
- Spectral Cascade reads the shared rolling spectrum history. That buffer holds 64 rows, targeting 24 history samples per second at the default Flow speed. Fractional scroll interpolates between rows. When a render step spans multiple samples, the latest available spectrum is repeated for those rows; this is not a timestamp-accurate audio recording.
- The heavy styles are marked GPU intensive. They have a lower resolution budget and some reduce loop counts at low quality. Native 4K/120 Hz performance and power consumption have not been benchmarked.
- All styles implement per-pixel alpha, but densely filled visuals can cover much of the desktop. Visual opacity controls the total contribution. There is a tiny nonzero alpha floor; alpha is not promised to be exactly zero in every dark region.
- Original four shaders keep their existing three-color palette interpolation. Full-spectrum rainbow mode is implemented in the new collection's shared shader helper.
- Favoriting is saved, but favorites/category selection is not a playlist or automatic timed rotation. Per-effect parameter presets and customization of simulation internals are not implemented.

## Recovery

Use the tray menu's Recover window / center command to restore a normal 640x600 window with taskbar visibility. It resets layer/taskbar preferences, not the selected visual or audio devices. Relaunching the same app should focus the existing instance rather than create duplicates.

Settings are stored in the local WebView profile. Window geometry is stored by the window-state plugin. The UI's Reset appearance action preserves audio and window-layer choices. No manual registry editing is required.
