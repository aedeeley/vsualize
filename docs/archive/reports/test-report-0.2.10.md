# Vsualize 0.2.10 test report

## Executed here

- TypeScript 5.8.3 build and type checking: passed.
- Node test runner: **159 passed, 0 failed, 1 skipped** (160 total). The skipped
  test needs Windows PowerShell 5.1; no Windows native compilation was performed.
- 30 production-UI checks in Chromium with **mocked WebGL sizing**: passed. These
  cover the quality selector, readout, multiple DPI scales, resize, and reporting
  of smaller-than-requested buffers. They do NOT validate browser graphics.
- Real offscreen OpenGL ES 3.2 on Mesa llvmpipe: all 21 unchanged shaders compiled.
- Actual 3840 x 2160 EGL surface dimensions were queried and verified.
- Ripple, Iridescent Julia, Spectrum Field, and Groove Current each produced a
  non-uniform 3840 x 2160 RGBA render with no GL error. Groove uses feedback.
- Ripple transparent output was checked at 4K. No desktop compositing is claimed.
- Real GLES checks: 27 passed. Input was a fixed synthetic multi-band snapshot,
  not live audio. This is not a target-GPU frame-rate benchmark.
- Regression hashes confirm all visual shader bodies, thumbnails, evolving palette
  logic, motion/inertia, audio capture, CSS, native corners and launchers are unchanged.

## Not verified here

Chromium's real WebGL2 context was unavailable in this environment, including with
several software-renderer startup options. Therefore the UI checks use an explicit
mock; the separate GLES checks exercise real shader code and real 4K pixel output.
This is NOT equivalent to a Windows WebView2 run.

The Rust application was not compiled or launched on Windows. Real desktop audio,
Windows fullscreen/DPI behavior, native transparency, and the user's GPU frame rate
still need validation in the actual application. No claim of a precompiled binary.

## Reproduce

- `npm test`
- `python tests/native-resolution-ui.py` (Python Playwright and Chromium)
- `node tests/export-motion-scenes.mjs artifacts/native4k`
- `python tests/native-4k-gles.py` (Mesa EGL/GL, NumPy and Pillow)

The packaged reports are historical records from this environment, not evidence
that a later build on the user's machine has passed.
