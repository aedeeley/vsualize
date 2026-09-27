# Vsualize 0.2.11 verification

## Passed in this environment

- `npm run check`: TypeScript 5.8.3 strict no-emit check.
- `npm test`: frontend ES-module build, self-contained HTML build, and 186 test cases: **185 passed, 0 failed, 1 skipped**. The skipped test requires Windows PowerShell native-process logging.
- `node scripts/windows/check-desktop-config.mjs`: config matches the released runtime baseline. **Installed Tauri CLI schema was not checked here** because the CLI was unavailable in this environment.
- `python tests/curated-defaults-ui.py`: **192 passing Chromium interface checks** using explicit WebGL/native IPC mocks. Actual production compiled HTML/JS, DOM controls, decoded thumbnails, and settings code were tested.
- Existing real offscreen GLES spatial/alpha suite: **all 11 retained shaders compiled and rendered**, with low/mid/high controlled inputs and alpha response checks. Mesa GLES 3.2 / llvmpipe at 256x192, not WebGL or Windows, and not a target-GPU benchmark.

## What the new tests cover

The independent screenshot fixture covers all five numeric settings and Randomize
for all 11 effects. Tests include the exact zero smoothing/glow for Ripple and Groove,
Spectrum's 100% glow, and Kaleidoscope's 2.00x flow.

Every selection path loads the target profile: thumbnail, previous/next, filtered
shuffle and hidden-menu arrow keys. Values displayed by the controls are compared
to the screenshot fixture. Edits remain local to the selected visual and survive
save/reload. Reset-this-effect preserves the other profiles and global input,
quality and window preferences. Palette selection is part of the profile.

Migration tests cover an old retained selection, all removed selections, favorites,
first-run adoption, malformed data, zero values, one-time local backup, unavailable
storage, and preventing a removed effect's flat sliders from overwriting Ripple.

Removal tests assert the complete 11-item registry, metadata, decoded thumbnails,
no runtime/preview modules for the 15 cumulative retired effects, empty retired
search results, useful category filters, and repeatable path-scoped cleanup.

Hash checks prove the retained shader bodies and individual thumbnail data are
unchanged from the 0.2.10 source archive. Renderer/resolution, audio, colors, motion,
CSS, native window/audio code and Windows launchers are also unchanged. Native
package metadata is bumped to 0.2.11, without changing dependency constraints.

## Actual folder-merge rehearsal

Extracted the supplied 0.2.10 ZIP, overlaid the complete 0.2.11 package without deleting
old files first, and ran `npm test`. The build removed the ten obsolete modules,
built the frontend/preview, and again passed 185 tests with one Windows-only test
skipped. Dependencies and native build caches were not removed by cleanup.
See `test-results/folder-merge-0.2.11.txt`. This was a Linux frontend rehearsal, not
a Windows `.cmd`/native executable build.

## Not verified

No Windows compiler/linker, real WASAPI device, real Windows transparent window,
WebView2 graphics, installer execution or public GitHub workflow was run here.
Headless Chromium did not expose WebGL in this environment, so its interface
checks intentionally use a graphics API mock and are labelled accordingly.
Software offscreen GLES tests do not replace WebView2 or real-GPU acceptance.

The Node/TypeScript build used the existing local TypeScript 5.8.3 installation;
network npm dependency installation was unavailable. That local development
symlink is not included in the source ZIP. No dependencies were added or upgraded.

## Reports

- `test-results/unit-0.2.11.txt`
- `test-results/curated-defaults-ui-0.2.11.json`
- `test-results/curated-defaults-ui-mocked-0.2.11.png` (layout only; no shader rendering)
- `test-results/curated-spatial-0.2.11.json`
