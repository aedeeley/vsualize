# Vsualize 0.2.7 validation

## Delivery boundary

This is an updated source package, not a precompiled Windows executable or tested
installer. Windows native compilation, WebView2 composition/performance, caption
behavior and WASAPI/microphone capture were **not** executed in this environment.
The changes do not install anything on the user's computer.

## Results from this delivery

- `npm test`: **100 tests, 99 passed, 0 failed, 1 skipped**. The skipped test requires
  Windows PowerShell 5.1 to execute the launcher's native process logging path.
  TypeScript and both frontend forms compiled successfully. New tests exercise
  elapsed-time damping, no overshoot, sustained response, smoothing settings,
  silence/resume, event-slot persistence, and shader source contracts.
- Production UI in headless Chromium: **14 checks passed**, including the new
  smoothing slider/default, reset preserving devices/gains/visuals, no capture
  restart, comparison handling, one control row, 4px clipping and small layouts.
  **Native IPC and WebGL were explicitly mocked in this UI run.**
- Actual GLSL in Mesa OpenGL ES: **all 26 shaders compiled and passed** fixed-camera,
  equal-volume low/mid/high spatial-response and opacity checks. There were no
  graphics errors. This tests shader code, not WebView2.
- Actual temporal rendering: **90 consecutive frames per effect, all 26 effects**,
  with an independent synthetic multiband/attack timeline. All compiled, moved and
  completed without graphics errors. The report records frame-change measurements;
  these are diagnostics, not a perceptual guarantee that every effect is equally
  smooth with every song.
- Five targeted checks passed: Julia and Bloom retained their alpha geometry when
  only frequency input changed at a fixed camera; Julia, Bloom and Mandelbrot
  journey seams were checked against adjacent equal-size camera steps using visible
  premultiplied light, including alpha, rather than irrelevant RGB under transparent
  pixels. Detailed fractals can legitimately change under very small camera steps.
- All 26 picker thumbnails were regenerated from the new shaders. Ripple and Julia
  were also rendered into 150-frame sequences for a labelled, silent motion sample.
  The sample uses synthetic input; it is not a live music/capture demonstration.

Backend: `OpenGL ES 3.2 Mesa 25.0.7-2`, llvmpipe software renderer. Actual
headless Chromium WebGL2 initialization was unavailable here, so browser graphics
and GPU performance are **not** claimed. The TypeScript compiler was supplied from
a local compiler installation; no dependency lockfile was fabricated.

## Preserved behavior

The existing outer 4px stylesheet, native window guard and capture APIs were left
in place. Native edits are package/config version labels and a test-only import
cleanup. No dependencies were added. This does not establish that the previously
unverified Windows caption workaround is effective on the user's machine.

## Reproduce

```sh
npm install
npm test
node tests/export-response-cases.mjs
python tests/effect-response-gles.py
node tests/export-motion-scenes.mjs
python tests/motion-render-gles.py
python tests/response-ui-mocked.py
```

Python tests require the packages imported by the scripts (NumPy, Pillow and
Playwright), system Chromium for the UI checks, and a working EGL/GLES backend for
the graphics checks. They are developer tests, not runtime dependencies of the app.

Run `UPDATE-WINDOWS.cmd` on Windows for the actual native build and native tests.
For an installed copy, build and run its installer afterward. Keep the resulting
`build.log` if the native build fails. The local build cache need not be deleted.

Exact output is in `test-results/unit-0.2.7.txt`, `spatial-0.2.7.json`,
`temporal-0.2.7.json`, and `ui-mocked-0.2.7.json` in that same folder.
