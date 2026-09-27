# Windows safety acceptance test

This is an interactive hardware check, not a visual endurance test. Do not repeatedly watch patterns that cause symptoms. Use a small window and look away for lifecycle tests. External flash analysis uses recordings, not your tolerance as a measuring instrument.

## Isolated test build

Build after `npm ci`:

```powershell
npm run build:windows -- --features safety-diagnostics --config src-tauri/tauri.safety-test.conf.json
New-Item -ItemType Directory -Force artifacts/safety/windows
Copy-Item src-tauri/target/release/vsualize.exe artifacts/safety/windows/vsualize.exe
powershell -ExecutionPolicy Bypass -File scripts/safety/start-windows-test.ps1
```

The prepared executable is `artifacts/safety/windows/vsualize.exe`. It has a separate application identifier, local settings and window-state directory, and no update checking/installing. It is unsigned and not a release installer. Close other safety-test instances first; the normal installed app need not be replaced. The visible title is “Vsualize Safety Test.” WebView2 must already be installed.

The launcher records local `native.jsonl` and `process.jsonl` in a timestamped run directory. It closes only the test process it launched at the selected collection limit (45 minutes by default; `-Minutes 150` covers the 120-minute case). Normal in-app deadlines remain unchanged. Do not change the system clock to simulate expiry. `VSUALIZE_SAFETY_LOG` enables logging only in a build with the `safety-diagnostics` Cargo feature. Existing log files are never overwritten. Native logs stop at 16 MiB or three hours. Production builds do not log even if that environment variable is set.

Logs contain counters, timestamps, process IDs, dimensions and session events. They contain no audio samples, spectrum, device names/IDs, media titles or credentials. `capture-stream-start`/`capture-resources-released` use `true` for desktop and `false` for microphone. Log review is still prudent before sharing.

## Record each result

Copy `docs/reports/windows-safety-results-template.md` into the run directory. Write the action time, observed result and any failure. Do not mark a row passed without performing it. Stop on a failure that leaves capture or animation running; quit the test app and preserve the logs.

| Action | Required observation |
| --- | --- |
| First launch; choose Keep stopped | Static notice precedes all animation/capture. Dismissing it leaves black. Keyboard reaches both choices. |
| Start with Desktop, Microphone, then Both separately | Each explicitly selected capture path starts. Stop releases that path; counters settle. Test microphone permission denial/device removal too. |
| Stop using button, Space outside an input, then tray | Opaque black even with transparency selected. Position/size unchanged. No continued draws/compiles/analysis; no stale frame on resize. |
| Wait 10 seconds after Stop | Subdued controls hide. Clicking/keyboard reveals controls without starting. Resume explicitly starts a new session. |
| Minimize while running; restore before deadline | Capture and rendering stop while minimized, then resume. Original deadline remains. |
| Minimize while already stopped; restore | Remains stopped and black. |
| Choose 15 minutes; interact and change effects during the session | Expires 15 minutes after Start, not after the last input. Run once minimized through the deadline. |
| Start at 30; after 15+ minutes choose 15 | Stops immediately. Increasing a duration measures from original session start. |
| Lock/unlock with Win+L; separately sleep/wake | Remains stopped on return; requires explicit Resume. Repeat with Unlimited. Do not automate lock/sleep while unsaved work is open. |
| Fullscreen, transparent, different monitors/DPI, tray Recover | Stop stays black without changing geometry. Recovery controls remain reachable; no stale bright frame on restore. |
| Unlimited, quit/reopen, reduced-motion preference | Acknowledged Unlimited persists; label says Automatic stop disabled. Reduced-motion startup remains stopped. |
| Real display sleep with app running/stopped | App does not inhibit the configured display sleep. Do not disable OLED maintenance. |

## Evidence and performance

```powershell
node scripts/safety/check-log.mjs artifacts/safety/windows/run-TIMESTAMP/native.jsonl
```

The checker detects advancing draw/compile/audio-tick counters during consecutive stopped/suspended samples and native packet/analysis activity after a one-second grace period. Native stop rows follow capture-worker joins. Source release events occur after the WASAPI client/device locals are dropped. Missing frontend samples during throttling are not proof of inactivity: corroborate with native samples, resume-time cumulative counters and observation. This instrumentation cannot inspect the display's physical pixels or certify driver behavior.

For Auto/60 versus Eco Auto/30, use the same effect, palette, audio, window dimensions, display and test duration. Let compilation settle, then record at least 60 seconds per setting and 30 seconds stopped. Note action timestamps in the results template. Record actual frame counter deltas/elapsed time and drawing-buffer dimensions (Auto may change them). Repeat for a heavier effect. Avoid other GPU workloads during comparison where practical.

The launcher captures Windows GPU-engine counters for the app and its descendant WebView2 processes. It does not sum overlapping engine percentages into a fictional total. Counters may be unavailable on localized systems; record Task Manager/vendor telemetry manually in that case. Shared GPU processes and measurement overhead limit attribution. Temperature and watts are not recorded unless separately measured. High utilization by itself is not a temperature or hardware-damage measurement.

## Native navigation probe

```powershell
node scripts/safety/navigation-probe.mjs
```

This opens the isolated test binary against a local HTTP probe, attempts three main-window native commands without capturing audio, saves their rejection results and terminates its own process. The test-only navigation override accepts only HTTP `127.0.0.1` `/probe` URLs and is absent from production builds. It does not replace the supervised lifecycle tests.
