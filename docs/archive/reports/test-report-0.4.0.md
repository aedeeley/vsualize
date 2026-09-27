# Validation — Vsualize 0.4.0

- Frontend build and all 249 Node tests passed, including effect controls, rendering, motion, settings migration, now-playing state, update UI retries, and signed release manifests.
- Desktop configuration passed the released runtime and installed CLI compatibility checks.
- All 26 Windows native release-mode tests passed.
- `tests/desktop-menu-ui.mjs` passed in headless Microsoft Edge with real WebGL and explicitly mocked Windows IPC. It exercises the native menu path, audio device access, update discovery, explicit version-specific installation and retry, shader validation, and update-button access at 640×600 and 300×240.

The browser integration check does not verify actual WASAPI capture, native media sessions, or installation. The GitHub release workflow separately rebuilds and tests the tagged source, signs the installer with the existing key, and publishes the update feed only after those steps succeed.
