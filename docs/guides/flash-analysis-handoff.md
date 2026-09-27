# Flash and pattern analysis handoff

The 160 × 90 preliminary screen flagged 126/216 recordings. It cannot establish WCAG compliance or prove failure. No effects have been redesigned on the basis of those flags.

## Lossless recordings

Run `npm run build` first. The tool requires Playwright plus a Chromium/Edge executable; set `PLAYWRIGHT_MODULE` to an installed Playwright module and `CHROMIUM_PATH` to the browser executable if not on its default paths.

```powershell
node scripts/safety/record.mjs --plan-only
node scripts/safety/record.mjs --case soundform-topdown-iris-default-original --seconds 20 --out artifacts/safety/recording-batch-1
```

Defaults: 1920 × 1080, 60 frames/second, 20 seconds per case, one case per invocation, five-minute wall-clock cutoff. There are 648 planned combinations: twelve effects, nine palettes, default/minimum/maximum joint controls, Gentler off/on. Select exact IDs from `plan.json`, use `--limit` for bounded batches, and specify `--fps 30` for a separate Eco sample set. Default real browser renderer is recorded; `--software` explicitly selects SwiftShader. Software-rendered clips do not replace real-device screen captures or GPU benchmarks.

Each frame is a lossless sRGB SDR PNG, with its SHA-256 in `recording.json`. The record includes actual renderer, full starting settings, deterministic random seed, dimensions, cadence and a hash of built source files. Fixed simulation time prevents capture overhead from dropping frames. Silence, smooth synthetic audio, rapidly varying full-spectrum bursts, and an effect/palette transition are included. These are constructed stress inputs, not audio from a user's device. Inspect `complete` and `capturedFrames`; aborted clips must never be represented as completed tests. Existing case directories are never overwritten.

The plan is broader than the completed captures. Full resolution and hundreds of cases can require substantial storage and time. Use small bounded batches, reserve free disk space and retain failed cases. Tests at 1080p do not cover larger supported fullscreen displays, HDR, every individual control combination, all transition pairs, or every possible audio signal. Extend the matrix based on reviewer guidance and actual supported displays.

If the reviewer accepts lossless video, convert with an installed FFmpeg:

```powershell
ffmpeg -framerate 60 -i frame-%06d.png -c:v ffv1 -level 3 -pix_fmt bgr0 -color_primaries bt709 -color_trc iec61966-2-1 -colorspace gbr recording.mkv
```

Run inside the case directory. Do not rescale, interpolate, drop frames, convert cadence or apply lossy encoding. Confirm the analysis tool's supported codec/color handling first; do not assume FFV1/MKV is accepted. Preserve the PNG originals and metadata. PEAT's published version has legacy format limitations and restrictions for commercially produced home-entertainment/gaming material; obtain clarification before using it for this product.

## Reviewer request

Evaluate general flash, saturated-red flash, simultaneous flashing area and spatial patterns under the applicable criteria. Record tool/version/profile, input hash, color handling, display/field-of-view assumptions, flagged timestamps and frame numbers. Assess fullscreen at the largest supported viewing size and include real-device captures. Explain whether each preliminary candidate is a confirmed failure, false positive or unresolved. Do not describe a sampled pass as proof of medical safety or all possible generated output.

For confirmed failures, propose targeted changes (for example limiting fast luminance excursions or particular transitions). Preserve ordinary artwork unless the remediation decision justifies a change. Retest each fix and a representative unaffected set. Warning acceptance, a session cutoff and Gentler are not substitutes for flash-threshold remediation.

References: [W3C flash criteria](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html), [HardingFPA](https://www.hardingfpa.com/), [PEAT requirements and restrictions](https://trace.umd.edu/peat/).
