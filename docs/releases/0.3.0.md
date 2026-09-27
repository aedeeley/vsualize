# Vsualize 0.3.0

The first installer release brings Browser Studio r5's twelve effects to the Windows desktop app, adds lighter rendering and faster audio processing, and enables signed updates.

- Soundform Ripple is the default, with Soundform Topdown alongside it. Cosmic Kaleidoscope and Energy Mandala have the expanded r5 motion. Ripple Classic and Tri-Band Globes are removed.
- Four controls per effect: Intensity, Line thickness, Speed and Glow. Structural motion stays smooth, with faster musical attacks. Existing desktop settings migrate; Browser Studio profiles can be imported.
- Auto quality and a 60 fps default reduce work for a widget-sized experience. Shader caching/prewarming, reused render/audio buffers and cheaper Soundform history sampling reduce unnecessary work. Native 100% remains available with an honest resolution readout.
- Native capture delivery targets 16 ms, down from 33 ms; typical 48 kHz capture packets are analyzed every 10 ms instead of 20 ms. The 2048-sample FFT retains bass resolution. These are processing intervals, not a measured physical latency guarantee.
- A per-user Windows x64 installer adds Start menu integration and an uninstaller. WebView2 is installed if necessary.
- Settings can check, download and install cryptographically signed updates from GitHub Releases. Updates require a user click and verify the signed version before replacing the app.

Download `Vsualize_0.3.0_x64-setup.exe`. The `.sig`, `latest.json` and `SHA256SUMS.txt` files support verified updates and downloads; users do not need to open them.

The installer is update-signed but does not yet have a Windows Authenticode certificate. Windows may show an unknown-publisher/SmartScreen prompt. Actual performance depends on the effect, render mode, display and hardware. Native 4K intentionally retains its full GPU cost.
