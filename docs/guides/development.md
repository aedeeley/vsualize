# Development

Run commands from the repository root unless using `vsualize.cmd`, which also works when launched from another directory. Windows development requires Node 22+, Rust stable MSVC, the Microsoft C++ Build Tools with a Windows SDK, and WebView2.

## Windows entry point

Double-click `vsualize.cmd` to choose an action, or use it from a terminal:

| Command | Purpose |
| --- | --- |
| `./vsualize.cmd setup` | Check/install missing developer tools through winget, after confirmation |
| `./vsualize.cmd start` | Verify and build changed source, then launch; reuse an unchanged verified build |
| `./vsualize.cmd rebuild` | Run checks, rebuild and launch (`update` is an alias) |
| `./vsualize.cmd installer` | Run checks and create an unsigned development installer |
| `./vsualize.cmd help` | Show usage without installing or building anything |

Build and setup output goes to `artifacts/logs/`. Each helper preserves its previous log before starting a new one. The build fingerprint lives in `artifacts/cache/`.

The development installer uses `src-tauri/tauri.test.conf.json`. Official signed builds use the [release workflow](releasing.md).

## Individual commands

`package.json` is the command index for frontend work, native builds, asset generation and release preparation. Install frontend dependencies with `npm ci` first.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build and serve the browser preview on localhost:1420 |
| `npm run build` | Compile `dist/` and generate `artifacts/preview/vsualize.html` |
| `npm run check` | Type-check the frontend |
| `npm test` | Build and run the Node test suite, including Windows logging checks on Windows |
| `npm run check:desktop` | Validate desktop configuration and matching versions |
| `npm run desktop` | Run the Tauri development app |
| `npm run build:windows` | Build the native executable without an installer |
| `npm run installer -- --ci --config src-tauri/tauri.test.conf.json` | Build a development installer |
| `npm run brand:generate` | Regenerate deterministic branding assets |
| `npm run release:manifest` | Prepare update metadata for an existing signed installer |

Run native tests with `cargo test --locked --manifest-path src-tauri/Cargo.toml --release`. Browser and rendering harnesses in `tests/` have their own runtime requirements; see their file headers.

## Repository layout

```text
src/                    TypeScript application and WebGL rendering
  visuals/              Shader effects and visual library
src-tauri/              Rust desktop host, native audio and Tauri configuration
static/                 HTML, CSS and browser assets copied into dist/
assets/brand/           Brand identity and generated image assets
scripts/
  build.mjs             Frontend build entry point
  dev.mjs               Local preview server
  branding/             Brand generation and preview embedding
  maintenance/          Thumbnail generation and retired-effect cleanup
  release/              Signed update manifest generation
  windows/              Setup, launcher, logging and desktop validation
tests/                  Automated tests and browser/rendering harnesses
  fixtures/             Reference inputs and historical snapshots
docs/
  guides/               Development, release and design documentation
  releases/             Versioned release notes (X.Y.Z.md)
  archive/              Historical patches, reports, manifests and data
  test-results/         Recorded historical test output
references/             Reference designs and local reference packages
artifacts/              Ignored local previews, logs and build cache
dist/                   Ignored compiled frontend used by Tauri
.github/workflows/      Windows CI and signed release publication
```

The npm manifest and lockfile, plus `tsconfig.json`, stay at the root so standard npm and TypeScript commands work. Cargo and Tauri configuration stay together in `src-tauri/`. They are separate tool formats and should not be merged into a custom JSON file.

Use lowercase kebab-case for new scripts and guide filenames, and version-only filenames for release notes. Keep generated output under `artifacts/`, `dist/`, or the native `src-tauri/target/` directory. Runtime defaults belong in source; archived JSON records are historical evidence, not application configuration.
