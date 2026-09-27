# Vsualize 0.2.11: curated effects and personal defaults

This is a complete desktop-source update based on 0.2.10 Native 4K, not a compiled installer.

## What changed

11 effects remain. Removed Prism Triangles, Luminous Lattice, Neural Constellation,
Starflight, Nocturne Cube, Petal Resonance, Iridescent Julia, Fractal Bloom,
Spectral Cascade and Prismatic Highway. The user's “starlight” matches the existing
Starflight entry; “nureal constellation” matches Neural Constellation.

Their shader source modules, imports, thumbnails and runtime catalog entries are gone.
The build safely removes these exact obsolete source filenames if you merge folders.
The five effects retired in 0.2.8 remain retired. Surviving favorites keep their order.
A removed saved visual falls back to Ripple Classic, with Ripple's profile.
The unused Space category is removed. Nothing new was added to the visual library.

## Screenshot defaults

Values below are transcribed from the eleven supplied screenshots. All eleven
start with **Randomize**: the existing evolving multicolor-palette generator.
The generated color swatches themselves are not frozen into presets.

| Effect | Amplitude | Music response | Flow speed | Motion smoothing | Glow |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ripple Classic | 1.85× | 1.85× | 0.65× | 0% | 0% |
| Liquid Glass | 1.95× | 1.15× | 0.60× | 70% | 30% |
| Mandelbrot Dive | 1.85× | 1.60× | 0.90× | 85% | 30% |
| Spectrum Field | 1.50× | 1.70× | 0.80× | 85% | 100% |
| Acid Organism | 0.90× | 1.40× | 0.55× | 80% | 80% |
| Neon Overdrive | 1.95× | 1.85× | 1.00× | 75% | 20% |
| Dissolution | 2.00× | 1.85× | 1.00× | 80% | 85% |
| Energy Mandala | 1.60× | 1.75× | 1.00× | 30% | 70% |
| Cosmic Kaleidoscope | 1.85× | 1.20× | 2.00× | 80% | 50% |
| Groove Current | 2.20× | 1.80× | 0.85× | 0% | 0% |
| Lava Forms | 1.80× | 1.85× | 0.20× | 75% | 85% |

## Per-effect settings

- First launch of this update adopts the screenshot defaults for every effect,
  including the currently selected effect. You do not have to reset every visual manually.
- The five sliders and palette are now remembered individually for each effect.
  Changing Glass no longer changes Ripple. Edits survive switching and restarting.
- **Reset this effect** replaces **Use smooth music response**. It restores only
  the selected effect's five sliders and palette, including exact zero values.
- The existing appearance reset in Settings deliberately resets the whole collection.
- Audio devices, capture gains, sensitivity, display quality, frame limit, background,
  opacity, window preferences, favorites that remain, idle drift and softer flashes
  are not reset by the one-time per-effect migration.
- The pre-update shared settings are backed up once in local browser/WebView storage
  under `vsualize.settings.before-effect-defaults.v1` where storage is writable.
  That backup stays on the local device; it is not uploaded or included in this ZIP.

Native 4K sizing, the 8px/native-corner implementation, evolving palette generator,
audio engine and the eleven retained shader bodies are unchanged from 0.2.10.
There are no new application dependencies.

## Update the Windows application

1. Wait for any current build to finish. Quit Vsualize, including its tray instance.
2. Merge everything inside this `Vsualize` folder into the existing project folder,
   replacing matching files. Keep `node_modules` and `src-tauri/target`.
3. Run `UPDATE-WINDOWS.cmd`. No setup or developer-tool reinstall is required.
4. Confirm **0.2.11** in Settings and **11 / 11** with search and filters cleared.

For a separately installed Start-menu copy, use `BUILD-INSTALLER.cmd` and run the
new setup executable. Rebuilding source alone does not replace that installed copy.

## Verification and limitations

See `docs/archive/reports/test-report-0.2.11.md`. Browser interaction checks use explicit WebGL/native
IPC mocks. Real offscreen GLES checks are separate. No Windows compilation, WASAPI
device test, Windows-corner test or target-GPU performance claim is made here.
