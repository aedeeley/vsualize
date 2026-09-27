# Safety safeguards — verification and follow-up

Date: 2026-09-27. This record describes verification during development of 0.5.0. Earlier test artifacts retain their original 0.4.1 version labels. Safeguards reduce exposure and resource use; they are not health or hardware certification.

## Automated verification

- TypeScript check: passed.
- JavaScript unit/regression suite: 269 passed, zero failures, including evidence-checker regressions.
- Native Rust release tests: 32 passed, zero failures, in production and diagnostics feature configurations, including expiration, suspended sessions, duration changes, invalid commands, native stop epochs and diagnostic payload validation.
- Desktop configuration/schema preflight and unsigned Windows NSIS installer build: passed. The generated test installer has not been installed or published.
- Thirteen real Edge/WebGL browser integration scenarios: passed. They cover first-run no-animation/no-capture, Keep stopped, profile preservation, Eco, Unlimited acknowledgement/persistence, expiration with a transparent background, resizing without stale frames, visibility suspension, keyboard Stop, ten-second control hiding, reduced-motion startup, a deferred native Start invalidated by a native Stop, a native stop during initialization cancelling automatic startup, and keyboard access to the notice at the minimum 300 × 240 window size. The native IPC ordering scenarios use a mocked bridge; Rust state transitions are tested separately.
- Screenshots of first-run guidance, Safety & performance settings and the black stopped surface were inspected for readability/layout at 800 × 700.

Artifacts: `artifacts/safety-tests.log`, `artifacts/safety-rust-tests.log`, `artifacts/safety/ui-results.json`, `artifacts/safety/*.png`. Browser tests use Playwright and an installed Chromium/Edge executable supplied through `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`. Run `node tests/safety-ui.mjs` after `npm run build`.

## Flash screening: review required

216 RGB recordings cover 12 effects × 9 palettes × two joint control extremes. Each recording has 120 frames at 30 samples/second, 160 × 90 pixels, four seconds long, using Edge's SwiftShader software renderer. Alternating full-spectrum bursts and silence stress audio response; each sequence includes a transition away and back. There were no shader errors. The raw recordings are retained as gzip RGB24 in `artifacts/safety/flash/`; `results.json` specifies layout and per-recording results.

The screening follows the idea of paired opposing luminance excursions and a one-second flash count from [W3C's flash guidance](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html). It flags any sampled pixel with more than three detected flashes, using a conservative saturated-red proxy in addition to relative luminance. **It is not a conformant flash/area analyzer.** It does not calculate the actual angular area, full red chromaticity criteria, HDR luminance or user viewing distance. Low resolution, sampling, limited duration and chosen inputs can miss issues. A flag does not prove failure, and an unflagged recording does not prove safety.

| Effect | Flagged / 18 recordings |
| --- | ---: |
| Soundform Ripple | 9 |
| Soundform Topdown | 0 |
| Glass | 9 |
| Mandelbrot | 18 |
| Spectrum | 9 |
| Organism | 9 |
| Overdrive | 9 |
| Dissolution | 9 |
| Energy Mandala | 10 |
| Cosmic Kaleidoscope | 16 |
| Groove | 9 |
| Lava | 10 |

Total: **126/216 candidate flags**. Pixel fractions in the raw results count pixels flagged at any time across a recording; they are not simultaneous visual-field area and must not be compared directly to WCAG's area threshold. Short transitional frames can contribute. Gentler mode was not certified by this run. No shader or preset was changed in response to this approximate screening.

Before making accessibility/safety claims or treating the visual review as complete, analyze representative full-resolution, normal and extreme recordings with an appropriate flash-and-pattern analysis tool and qualified reviewer. Confirmed failures require a targeted remediation decision before release; preserve the evidence and retest those changes. Do not ask a symptom-sensitive person to repeatedly watch sequences for testing.

Reproduce with `node tests/visual-safety-assessment.mjs`. It has a five-minute workload cutoff and preserves partial results on failure. Recordings are generated artifacts, not repository assets.

## Performance and physical-device limits

Initial Auto/60 and Auto/30 tests explicitly used SwiftShader; their severely throttled timing is retained in `results.json` and `performance.json`. Those numbers cannot establish physical GPU load, wattage, temperature or energy savings.

A subsequent hardware-backed Edge run used the AMD Radeon RX 6800 XT (ANGLE/D3D11), Kaleidoscope, Iris, synthetic audio and an unchanged 640 × 600 buffer. Over 30.0045 seconds each, Auto/60 submitted 1,769 frames (58.96 fps) and Auto/30 submitted 901 (30.03 fps). Total CPU submission time was 410.0 ms and 183.9 ms respectively. Final reported GPU timer samples were 0.54448 ms and 0.51952 ms; these are point samples, not mean GPU frame cost or utilization. Both maintained adaptive scale 1. Raw evidence: `artifacts/safety/flash/performance-hardware.json`; reproduce with `node tests/visual-safety-assessment.mjs --performance-only --hardware`. Another installed Vsualize process was present; background workloads were not isolated. No external utilization, temperature or power measurement was collected in this run. These results demonstrate requested cadence on one scene, not a universal performance or hardware-protection guarantee.

Still required on a physical Windows machine: measure the same scene/window/audio at Auto/60 and Auto/30 with vendor/OS GPU telemetry; confirm capture devices are released when minimized, expired, manually stopped and locked; confirm real sleep/wake, tray Stop/recovery, fullscreen and multi-monitor behavior. Native callback compilation and unit tests are not a substitute for these hardware checks. Do not disable sleep or OLED maintenance to run them.

## Security and release status

Read-only independent review covered native IPC, input parsing, audio buffers/lifecycle, local UI metadata, WebView configuration, updater verification, release/signing workflows and development-server containment. No pre-existing exploitable vulnerability was confirmed in those reviewed paths. It was a focused boundary review, not an exhaustive certification of every shader, historical fixture, dependency or generated artifact.

Codex Security completed scan `80db6b3c-3ffe-40b9-896b-c1d53e6b1084` with partial coverage recorded. It warned that directory contents changed during the scan and results are registered against the original snapshot; this is not an immutable audit of the final installer or the later diagnostic instrumentation. The locked Tauri 2.11.6 source was checked for remote-origin custom-command rejection, and the app grants no remote capabilities. A subsequent live WebView2 probe in the isolated diagnostic build received explicit ACL rejection for `session_status`, `session_control` and `window_action` from a loopback HTTP page in the main window. This tests one remote-origin path, not all navigation schemes. Tool-reported aggregate usage across four task threads was 14,585,695 tokens, including 14,076,544 cached input tokens; this is cumulative thread accounting, not a measurement attributable only to security review.

Review of the new session code caught a concrete ordering bug: an in-flight Start could reopen the lease after a native Stop or lock event. The fix adds a native-owned stop epoch so all commands authored before that stop are rejected. Frontend/native regression tests exercise multiple pending revisions and deferred responses. This was corrected before release.

The startup continuation also checks its generation after asynchronous native initialization: a Stop received during startup cancels automatic Resume. Its regression test defers the native status response and delivers the stop first.

See [dependency advisory results](dependency-security.md). No npm vulnerability or RustSec vulnerability entry was reported; informational Rust notices remain documented and visible.

Private vulnerability reporting is now enabled and verified by authenticated API readback. `SECURITY.md` links to the private GitHub form. [GitHub release-control inspection](github-release-controls.md) records the remaining protection gaps and proposed configuration; no signing-secret values were retrieved.

## Prepared follow-up evidence

- [Windows acceptance guide](../guides/windows-safety-acceptance.md), isolated diagnostic executable, local log collector/checker and [blank results template](windows-safety-results-template.md). Human-operated lock/sleep/tray/fullscreen/capture checks remain unexecuted.
- [Flash-analysis handoff](../guides/flash-analysis-handoff.md), deterministic lossless recorder and a 648-case plan. Two 10-second 1080p/60 recordings were completed on the RX 6800 XT: Soundform Topdown / Iris / default and Mandelbrot / Ember / maximum, both with Gentler off. Each has 600 PNG frames with hashes and a source binding in `artifacts/safety/recording-validated/`. They are pilot evidence, not a completed matrix or an analyzer pass. Earlier files under `recording-pilot/` are superseded: the recorder now compiles before the timeline and retains the last presented image when the renderer skips an unchanged frame, avoiding false black-frame flashes from reading a discarded WebGL buffer.
- Diagnostic logging is opt-in, bounded and local; typed payloads reject additional fields. Production logging is disabled. The diagnostic binary uses a separate application identifier and disables updater networking/installation. The test navigation override is compiled only with the diagnostic feature. Regression checks cover counter violations and payload shape; this source review does not extend the previous sealed security scan automatically.

Release decision: the maintainer requested a stable 0.5.0 release with the implemented safeguards and these documented limitations. Supervised Windows testing was deferred. One approximately 90-second user-run diagnostic session recorded capture source starts/releases with no checker violations; it did not establish expiry, sleep/lock or Stop-after-running behavior. The preliminary flash flags are candidates, not a confirmed formal failure or pass.

Remaining follow-up: complete physical-device checks and qualified flash assessment; review any confirmed failures for targeted remediation; decide appropriate release-access protections; review legal terms and product claims with qualified counsel; integrate the prepared website copy. These items remain documented rather than being represented as completed release validation.
