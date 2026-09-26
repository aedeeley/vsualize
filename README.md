<!-- VSUALIZE BRAND START -->
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-horizontal-light.svg">
    <img src="assets/brand/logo-horizontal-dark.svg" alt="vsualize" width="480" height="126">
  </picture>
</p>
<!-- VSUALIZE BRAND END -->

# Vsualize

A borderless, audio-reactive Windows widget. Play music in your usual player and let Vsualize respond to the desktop audio. Audio stays on your device.

## Install

Download **Vsualize_0.3.1_x64-setup.exe** from [GitHub Releases](https://github.com/aedeeley/vsualize/releases/latest). Run the installer, then launch Vsualize from the Start menu. It installs for your Windows account, provides shortcuts and an uninstaller, and installs WebView2 if needed. Users do not need Node, Rust, or development tools.

The installer has a cryptographic **update signature**. It does not yet have a Windows Authenticode publisher certificate, so Windows may show an unknown-publisher or SmartScreen prompt. These are separate signing systems.

## Use

Click the visual to reveal controls. Drag the top area to move the window; resize at its edges. Open **Audio** and choose Desktop, Microphone, or Both. Desktop captures the selected Windows playback device, so M4A and other music formats work through the player that already plays them.

The library has twelve effects, with **Soundform Ripple** first and selected by default. Each effect remembers its Intensity, Line thickness, Speed, Glow and palette. Soundform Topdown looks directly down at the same audio-driven surface. Cosmic Kaleidoscope and Energy Mandala retain the richer r5 tunnel motion. Ripple Classic and Tri-Band Globes are retired.

Use **Export settings / Import settings** to transfer Browser Studio r5 effect profiles into the installed app. Browser and native storage are separate. Old desktop settings migrate on first launch; existing explicit display-quality choices are retained.

## Performance

New installations start at **Auto / 60 fps**. Auto stays native in small windows and uses a capped, adaptive rendering resolution in larger ones. Settings shows the actual drawing-buffer dimensions. **Native (100%)** remains available for full-resolution rendering, including 4K; it can cost substantially more GPU time. Light, Balanced and a 30 fps limit provide other workload choices.

Shader programs are cached and prewarmed, render buffers are reused, hidden/minimized windows stop drawing, and audio analysis reuses buffers. Soundform history uses hardware interpolation to reduce texture lookups. Native audio delivery now targets 16 ms instead of 33 ms; the FFT window remains 2048 samples for bass resolution. Physical end-to-end latency and total GPU utilization depend on your hardware, display, drivers and selected effect.

## Updates

Open **Settings → Check for updates**. The app also checks after startup and every six hours while visible. Downloads and installation happen only after you choose **Install update and restart**. The native updater verifies the installer signature and signed version before installation. Settings and window preferences use the existing `app.vsualize.desktop` identity.

Updates are served by GitHub Releases. [Release maintenance](docs/RELEASING.md) covers automated publication and moving the feed to your own HTTPS server. The planned website at **vsualize.app** can link to the stable installer and release notes; website work is separate.

## Build from source

Requires Windows x64, Node 22+, Rust stable MSVC, Microsoft C++ Build Tools with a Windows SDK, and WebView2. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
npm ci
npm test
npm run check:desktop
cargo test --locked --manifest-path src-tauri/Cargo.toml --release
npm run installer -- --ci --config src-tauri/tauri.test.conf.json
```

The last command builds a development installer without an update signature. Official releases require the private signing key and must use the release workflow. Never commit the key or put it in a browser build.

`npm run build` creates `dist/` and a standalone `Vsualize-Preview.html`. That preview supports microphone and synthetic Demo mode; native desktop capture and updates require the installed app.

Source lives in `src/` (TypeScript/WebGL), `src-tauri/` (Rust/Windows/WASAPI), and `static/` (UI). Historical 0.2.x notes and fixtures document previous iterations; [0.3.1 release notes](docs/RELEASE-0.3.1.md) describe the current release.

## Branding

The ripple identity includes scalable logos, monochrome variants, Windows app/tray icons and browser favicons. See [branding assets and regeneration](docs/BRANDING.md).
