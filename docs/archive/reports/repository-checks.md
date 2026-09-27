> Historical repository-preparation notes. Current checks are in TEST-REPORT.md for 0.2.5.

# Vsualize 0.2.1 repository preparation checks

## Run in the authoring container

- `npm test`: passed, 18 tests. This command rebuilt the TypeScript frontend and the single-file browser preview.
- `npm run check`: passed with TypeScript 5.8.3.
- Compared the composed GLSL fragment source for all 26 visualizers with the original Resonance 0.2.0 archive: exact matches.
- Compared all 26 embedded thumbnail data URLs with the original archive: exact matches.
- Parsed the project JSON and Cargo TOML metadata and checked the packaged file inventory.
- Checked the source for common credential token/private-key patterns. No matching secrets were found; this is a limited pattern check, not a security audit.

## Not passed or not run

The browser smoke test was attempted but stopped before its first graphics assertion: the available headless Chromium could not create a WebGL 2 context. A direct empty-canvas check also returned no WebGL 2 context. No browser render/screenshot passes are claimed for this renamed package. This does not replace testing in an accelerated browser or native webview.

Windows compilation, the NSIS installer, GitHub Actions, live WASAPI/microphone capture, and real Windows transparency have not been run or verified here. The Windows workflow is a configured test path, not an already successful build.

Preparing this archive did not push source to GitHub, create a release, or deploy the domain.
