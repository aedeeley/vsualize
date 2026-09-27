# Vsualize 0.2.8 validation

## Scope

Remove exactly five requested effects and preserve the remaining 21. No re-tuning,
new effects, native API changes or dependency changes. Source, not a built installer.

## Executed in this Linux environment

- Frontend build and strict TypeScript compilation using **TypeScript 5.8.3** and
  Node.js 22.16.0: passed. The existing local TypeScript installation was used;
  an online dependency-install attempt timed out. No dependencies are bundled.
- `npm test`: **110 passed, 0 failed, 1 skipped** (111 total). The skipped check
  requires Windows PowerShell 5.1. See `test-results/unit-0.2.8.txt`.
- Chromium production-UI integration: **54 checks passed**, using explicitly
  **mocked WebGL and native IPC**. Actual UI JavaScript/DOM/settings were executed.
  No Windows, audio hardware or rendered-shader validation is claimed by this test.
  See `test-results/library-ui-0.2.8.json`.
- Baseline SHA-256 checks: **42 files** unchanged, including all 21 retained effect
  modules, shared GLSL, renderer, settings/audio/motion, CSS and native code;
  **21 thumbnail data URLs** unchanged from 0.2.7.
- Exact active library order/size, absence of retired shaders/modules/thumbnails,
  alias removal, default fallback, favorites cleanup and all other settings retained.
- Both current and legacy settings load/save paths tested with removed selections.
- In-place update cleanup tested for all five old shader files, repeated calls,
  preserving unrelated sources/caches/settings, and refusing directory recursion.
- Full in-place merge check: restored the five original 0.2.7 modules, then ran
  `npm test`. The build removed all five before compilation and again passed
  110 tests with the same one Windows-only skip. See `test-results/overlay-unit-0.2.8.txt`.
- UI tests cover each removed active selection at startup, all remaining cards,
  embedded thumbnails, empty removed-name/alias searches, retained aliases,
  favorites/filter behavior, full navigation/wrapping and 100 shuffle operations.

## Not executed or not available

Chromium returned no WebGL 2 context in this environment. No browser pixel-render
or GPU/performance claims are made. Retained graphics are byte-for-byte unchanged;
0.2.7 rendering reports are historical, not a new pass for this delivery.

Windows compilation, Windows PowerShell execution, live WASAPI/microphone capture,
window-button behavior, desktop alpha composition, installation and code signing
were not executed. No precompiled executable, installer or GitHub commit is provided.
