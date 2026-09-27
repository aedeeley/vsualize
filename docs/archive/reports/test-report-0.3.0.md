# Validation — Vsualize 0.3.0

## Local automated checks

- TypeScript compilation and frontend build passed.
- 213 frontend tests passed, including r5 profile migration/import, audio buffers, frame pacing, adaptive resolution, Native buffer reporting, shader-buffer reuse, silence suspension and updater UI retries.
- 26 native release-mode tests passed, covering FFT/PCM/audio mixing, Windows corner/window lifecycle and updater operation exclusion.
- NSIS x64 installer built successfully. Silent per-user installation returned exit code 0. Windows uninstall registration, version 0.3.0, installed executable and Start menu shortcut were confirmed.
- Independent verification using the updater's minisign-verify 0.2.5 library accepted the final installer and its authenticated version 0.3.0, then rejected a byte-altered in-memory copy. The original artifact was unchanged.

## Real graphics and installed app

All twelve shaders compiled and rendered in Chrome using ANGLE / AMD Radeon RX 6800 XT / Direct3D 11. No WebGL or console errors were reported. Soundform Ripple and Topdown were visually inspected. Per-effect control persistence, reset and JSON export were exercised.

At the same browser display area (1874 × 1827 physical pixels), Soundform Auto rendered 1132 × 1104: 63.5% fewer shaded pixels than Native. Warm Auto GPU timer samples were approximately 2.49–4.49 ms for Soundform Ripple and 1.57 ms for Topdown. These are individual renderer samples with synthetic Demo audio, not total GPU utilization or a sustained benchmark. The automated background tab throttles frame callbacks, so no browser FPS claim is made. Native (100%) reported the exact 1874 × 1827 drawing buffer.

The installed Windows WebView2 app opened successfully, rendered its effects and reported LIVE · Desktop while receiving the user's real playback. Its native UI showed the twelve-effect collection and the four controls.

## Limits

Physical speaker-to-screen latency and sustained foreground FPS were not measured. Processing intervals (33 → 16 ms delivery and typical 20 → 10 ms analysis refresh) are code-level changes, not physical latency guarantees. Native 4K retains full resolution and can still be GPU-intensive. No FSR/DLSS integration is claimed.

Import parser, round-trip and invalid-input behavior passed automated tests; completing the browser file chooser was not verified. Future-version end-to-end update installation needs an older installed release; signature/tamper checks and retry behavior were tested. Windows Authenticode signing is not configured.
