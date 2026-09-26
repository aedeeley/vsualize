# Vsualize 0.2.6 validation report

## Passed in this authoring environment

- TypeScript frontend compilation: passed. The source builds both dist/ and the
  standalone HTML using the same UI, response layer and shaders.
- Node unit suite: **82 passed, 0 failed, 1 skipped, 83 total**. The skipped test
  requires Windows PowerShell for the native external-command logging integration.
- New response tests cover logarithmic decoding, narrow-note preservation,
  frequency separation, no repeated attacks for held packets, silence/noise floors,
  numeric sanitation, response reset, structural impact under softer light flashes,
  and synthetic PCM-derived input sampled at 30, 60 and 120 rendering updates/second.
- **12 UI checks passed** using real production JavaScript in Chromium with
  explicitly mocked WebGL and native IPC. They cover the recommendation button,
  preservation of device/visual settings, exiting comparison mode, continued
  capture, small-window access, one HTML control row and the 4px CSS clip.
- **26 actual shaders compiled, linked and rendered** as their unmodified GLSL
  ES 300 strings using Mesa EGL/OpenGL ES 3.2, llvmpipe (LLVM 19.1.7, 256 bits).
  No shader syntax was rewritten for this test.
- For each effect, three controlled inputs have identical overall volume and
  different low/mid/high spectral distributions. Animation clocks, exposure,
  palette and positions are held fixed; attack accents are disabled. Unit-norm
  grayscale spatial fields remove a whole-image exposure multiplier. Every effect
  exceeds the test's 0.12 spatial L2 difference threshold for at least one pair.
  This measures visible spatial change, not a subjective musical-quality score.
- All 26 shaders also produced variable alpha and lower mean alpha when the
  opacity setting was reduced in the same offscreen harness.
- Native implementation, launchers, dependency lists and corner CSS hashes were
  compared with 0.2.5 plus the 4px patch. See unchanged-subsystems-0.2.6.json.

## Exact result files

- test-results/unit-0.2.6.txt
- test-results/spatial-0.2.6.json
- test-results/ui-mocked-0.2.6.json
- test-results/unchanged-subsystems-0.2.6.json

## Reproduce

```text
npm run build
node --test tests/*.test.mjs
```

The checked-in original synthetic PCM fixture is generated with Python/NumPy by
`tests/make-pcm-response-fixture.py`. It models the native FFT and display formulas
in Python; it does not execute Rust or WASAPI. Windows unit runs need the stored
JSON, not Python or NumPy.

Optional authoring-environment tests need separate Python test dependencies:

```text
node tests/export-response-cases.mjs
python tests/effect-response-gles.py
python tests/response-ui-mocked.py
```

The shader harness needs Mesa EGL/GL, NumPy and Pillow. The UI harness needs
Playwright and Chromium. These are not application/runtime or Windows-build
requirements and were not added to the app's dependency lists.

## Not verified

Native Rust compilation/linking/tests, Windows PowerShell execution, installation,
real WASAPI/microphone capture, WebView2 rendering, GPU performance, live end-to-end
latency, actual Windows transparent composition and native ghost-caption removal
were not executed. Chromium here could not create a WebGL2 context; real shader
validation used Mesa GLES3, while UI event validation used explicit graphics/IPC
mocks. Neither substitutes for the Windows runtime.

The synthetic audio and fixed-clock image tests show the implementation reacts to
frequency and transient input. They do not establish how compelling it feels with
all music genres, or that a particular user's selected endpoint is receiving audio.
Native source is unchanged, reducing the scope of this update, not proving a native
build. Historical reports for older releases are not current-release test results.
