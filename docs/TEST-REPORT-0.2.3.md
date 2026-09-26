# Vsualize 0.2.3 test report

Run in this delivery environment using Node 22.16.0, TypeScript 5.8.3 and
Chromium with real WebGL 2 through software SwiftShader and an Xvfb display.
The first headless GPU probe failed without a display; providing Xvfb made real
WebGL available. Graphics checks below were then executed, not stubbed. One repeat of the UI smoke
test timed out when slow software rendering allowed controls to auto-hide during
a screenshot sequence. The harness now disables auto-hide for layout checks and
tests auto-hide separately; the complete final 59-check run passed.

| Check | Result | What was actually exercised |
| --- | --- | --- |
| TypeScript strict check and frontend build | Passed | Native-bound frontend and generated preview |
| Node unit tests | 52 passed | Settings, migration, signal states, numeric safety, native IPC contract mocks, restart serialization, motion and onset logic |
| Existing browser regression | 59 passed | Real UI, previews, source controls, layouts, search, favorites, interactions and graphics |
| Desktop-frontend integration | 25 passed | Real UI and WebGL with an explicitly mocked native channel; status, raw meters, error/recovery, comparison and diagnostic copy |
| Shader audio/alpha checks | 26/26 passed | Each actual shader rendered under controlled synthetic input, opaque/transparent and reduced-alpha conditions |
| Silence and resumption rendering | 26/26 passed | Each shader settled to pixel-identical frames in music-only silence; integrated travel resumed after input returned |

Evidence: docs/test-results/*-0.2.3.json and unit-0.2.3.txt.
Commands: npm test, npm run check, python tests/browser-smoke.py,
python tests/live-desktop-ui.py, python tests/collection-behavior.py,
python tests/silence-render.py. Python graphics tests require Playwright, Chromium
and usable WebGL. In this environment they used DISPLAY=:99 and
CHROMIUM_PATH=/usr/bin/chromium.

## Not tested

Rust compilation and its native tests; the Windows executable/installer; real
WASAPI or microphone hardware; Windows/WebView2 alpha and window operations;
the existing duplicate-caption workaround; the PowerShell launcher in Windows;
Windows-specific sleep/wake and device changes. Native endpoint diagnostics and
two new Rust tests are included but could not be executed here.

No live music was captured in these tests. Controlled synthetic feature frames
and mock IPC test correctness, not the user's device or subjective musicality.
No executable has been installed on the user's computer, and no source has been
pushed to GitHub. This package requires a Windows build and acceptance run.
