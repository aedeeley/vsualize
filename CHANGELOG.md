# Changelog

## 0.5.0 — safety and performance controls

- New and existing installations default to a 30-minute session; 15/60/120-minute limits and acknowledged, remembered Unlimited are available.
- Stop replaces freeze-frame Pause: clear the window to black, stop capture and drawing, and keep the window in place. Resume is explicit after expiry, sleep or lock. Hidden/minimized sessions suspend capture as well as rendering.
- Add a first-run/upgrade health notice, Safety & performance settings, a non-destructive Gentler overlay and Eco: Auto/30. Existing presets and the Auto/60 default remain.
- Add native deadline and stop-generation guards, regression tests, dependency advisory checks, README guidance and prepared website safety copy.
- Private vulnerability reporting is enabled. Verification results and remaining follow-up work are documented in docs/reports/safety-verification.md. No health or hardware-protection certification is claimed.

## 0.3.0 — Windows installer and signed updates

See [release notes](docs/releases/0.3.0.md). Ports the twelve r5 effects and four controls, adds adaptive GPU workload, reduces audio delivery intervals, provides a per-user NSIS installer, and publishes version-bound signed updates through GitHub Releases.

# 0.2.11 - Curated effect defaults

- Remove ten requested visuals, leaving eleven. Remove source modules, imports, thumbnails and picker entries.
- Add independent per-effect defaults from the supplied screenshots, including palette.
- Adopt these defaults once; preserve later customizations per effect across navigation and restarts.
- Rename the response reset to Reset this effect; restore all five sliders and palette for this effect only.
- Prune exact retired source filenames during in-place updates and sanitize retired selections/favorites.
- Preserve native 4K, evolving palettes, retained shaders, audio/native-window code and build dependencies.
- See docs/archive/patches/curated-defaults-update.md and docs/archive/reports/test-report-0.2.11.md.

# 0.2.10 - Native 4K

- Detailed now means true Native (100%), with no app pixel budget or heavy-effect penalty.
- Settings and copied diagnostics report the actual drawing buffer, including size limits.
- No changes to effect shaders, audio, colors, window code or glow.
- See docs/archive/patches/native-4k-update.md and docs/archive/reports/test-report-0.2.10.md.

# 0.2.9: native + client corner clipping

See docs/archive/patches/clean-corners-update.md. Includes all prior palette/corner patches.

# Changelog

## 0.2.8 - Focused library

- Remove Orbital Vortex, Chromatic Vortex, Pulse Tunnel, Chromatic Chaos and Silk Weaver; 21 effects remain.
- Remove their shaders, thumbnails and picker/search entries; safely sanitize saved selections/favorites.
- Prune only those five retired modules before compilation when updating an existing source folder.
- Keep remaining effects, smoothing, audio, 4px corners and native window behavior unchanged.
- No new effects or dependencies; no native Windows execution claimed.

## 0.2.7 - Smooth progressive motion

- Review and adjust all 26 existing effects; keep all IDs, favorites and palettes.
- Separate critically damped geometry/spectrum from fast local onset accents.
- Add persisted Motion smoothing, default 75%, and Use smooth music response reset.
- Rebuild Ripple Classic as raised, history-driven contours with low/mid/high layers.
- Make Julia and Bloom stable inward fractal flights; remove live-audio changes to their chaotic parameters and camera orientation.
- Correct several tunnel depth signs, soften global rotation and preserve accumulated travel.
- Replace arbitrary PCM-phase geometry with smooth spectral detail; retain capture/diagnostics.
- Give events fading lifetimes without overwriting still-visible waves; add outward local cube particles.
- Refresh all 26 embedded thumbnails from the updated shaders.
- Invoke TypeScript through Node without shell argument concatenation; gate the unused native WAVE import to tests.
- Retain the 4px corners, native caption workaround and dependency list.
- Validate unit tests, mocked native/browser UI, real Mesa GLES spatial checks and multi-frame sequences; Windows execution remains unverified.

## 0.2.6 - Structural music response

- Keep all 26 effects and expand frequency-driven geometry, waveform detail and attack accents.
- Decode log-display spectra before RMS band analysis and bounded adaptive scaling.
- Separate sustained levels, positive spectral changes, structural impact and softer light flashes.
- Preserve monotonic travel and music-only silence behavior.
- Add recommended-response reset without changing capture devices, gains, visual choice or palette.
- Integrate the existing 4px corner CSS without modifying native code or build dependencies.
- Pass 82 unit tests (one Windows-only test skipped), 12 mocked graphics/IPC UI checks, and actual GLES3 spatial/alpha checks for all 26 shaders.
- Windows compilation, WebView2 and live device capture remain unverified in this environment.

## 0.2.5 - Build configuration and diagnostic repair

- Remove unsupported noRedirectionBitmap from the released-runtime configuration.
- Add a focused window-key preflight using the released Rust baseline and installed CLI schema.
- Capture native stdout, stderr, commands and exit codes; preserve the previous log.
- Use setup.log for prerequisite installation and propagate real setup failures.
- Keep build windows open on failure and retain failure status across CMD wrappers.
- Add regression tests and a Windows-only PowerShell 5.1 logging integration test.
- Keep the audio, effects and native window-guard implementations unchanged.
- Windows compilation, installer and native caption behavior remain unverified here.

## 0.2.4 - Native caption paint guard

- Replace the caption-flag-only workaround with a persistent Win32 subclass.
- Suppress non-client caption painting/activation; retain normal client painting, input, dragging and resizing.
- Disable DWM non-client rendering for the app host, without disabling composition or desktop transparency.
- Install before first show; refresh after focus, style/theme changes and child creation.
- Restrict hooks to the main window and its same-process, same-thread descendants; remove them on destruction.
- Preserve the lower app-drawn controls and all audio/visualizer code.
- Add five Windows-only native regression tests (not executed here), six source-contract checks, and three mocked IPC button checks.
- Windows compilation and visual validation are still required.

## 0.2.3

Live input diagnostics; music-only silence behavior; explicit demo selection;
A/B scene-response comparison; faster transients and bounded exposure accents;
serialized capture restarts and stale data clearing; source-aware Windows update
launcher. See docs/releases/0.2.3.md. Windows build/device validation remains pending.


## 0.2.2 - Continuous musical motion

- Integrate audio-driven travel, rotation, shape evolution and palette phases instead of transient-only positional wobble.
- Add Music response separately from Flow speed, Amplitude and capture gain.
- Preserve quick attacks with slower releases, per-band accents, and native/spectral onsets.
- Update all 26 effects, including forward/crossfaded Mandelbrot dives and fractional spectrum scrolling.
- Keep gentle flash reduction separate from momentum and ripple propagation.
- Add a Windows caption-style guard and no-redirection-bitmap host setting for the faint duplicate titlebar. This native workaround is not yet Windows-verified.
- Pass 34 unit tests, 57 browser checks and actual shader/alpha/progression tests for all 26 presets.
- Preserve the existing native application ID, saved visual choices and audio settings.

## 0.2.1 - Vsualize repository preparation

- Rebrand the app, tray labels, build outputs, package metadata, and documentation to Vsualize.
- Add the vsualize.app website and aedeeley/vsualize repository to project metadata.
- Use app.vsualize.desktop as the native application ID; old native settings may start fresh.
- Preserve the 26 visualizer implementations, thumbnails, and audio backend.
- Add same-origin legacy preference migration tests.
- Prepare a manual Windows executable/NSIS build workflow. It has not been run.
- Exclude generated builds, logs, and common credential-file patterns from source control.

## 0.2.0 · September 25, 2026

- Added 22 original reference-inspired visualizer styles, for 26 in total.
- Added library search, category filters, favorite toggles/filter, filtered next/previous, and no-repeat shuffle.
- Added Prismatic and Neon palettes, with automatic palette choice per effect.
- Added lazy shader compilation/caching, GPU-cost metadata and bounded pixel budgets.
- Added a reusable ping-pong feedback path for Groove Current.
- Generated embedded still thumbnails from all 26 actual shaders.
- Preserved the native app identifier and settings key; existing four visual IDs stay valid.
- Added collection rendering, synthetic-audio/alpha checks, and expanded UI/unit regression coverage.

Native Windows audio and window integration are unchanged and remain unvalidated in this environment. No precompiled executable is included.
