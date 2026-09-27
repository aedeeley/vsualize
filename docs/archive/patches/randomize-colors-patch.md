# Vsualize 0.2.8: evolving multicolor palettes

This replaces the earlier Randomize implementation. Randomize remains the first
color option and the default. It is no longer a three-color hue-wheel loop.

## Behavior

- Five distinct colors are available together. The shared color sampler places
  those colors in different contours, regions, particles and layers instead of
  averaging the whole palette into one tint everywhere.
- A new target palette is generated every 7 to 12 active seconds. Its hue
  spacing, saturation and brightness change, not merely a common hue offset.
- Ordered hue interpolation keeps distinct colors during transitions. There is
  no short repeating preset playlist or one-minute reset.
- Colors also flow gradually through each effect's existing color coordinates.
  Geometry, motion smoothing, onsets, FFT and native audio capture are untouched.
- The menu shows five small live chips of the palette actually sent to the
  renderer. The chips disappear when a fixed palette is selected.
- Pause, minimization and settled music-only silence still freeze the palette.
  Resuming or changing effects does not restart the journey.
- Fixed palettes and Visual default retain their previous rendering. Existing
  manual color choices are preserved after the earlier migration marker.
- The 21-effect library and 8px windowed / 0px fullscreen corner patch remain.

## Apply to your existing Vsualize 0.2.8 project

1. Let any current build finish. Quit Vsualize completely, including its tray icon.
2. Copy EVERYTHING inside this archive's `Vsualize` folder into your existing
   project folder, alongside `package.json`. Replace matching files. This is an
   overlay, not a complete project. Do not delete other project files.
3. Keep `node_modules` and `src-tauri/target`. Do not run setup or reinstall tools.
4. Run `UPDATE-WINDOWS.cmd`. Select Randomize in Visuals if you selected a fixed
   palette previously. The five live chips identify this patch; version is 0.2.8.

This cumulative patch includes the previous color and 8px-corner patch files.
Copy all included files: the renderer, shared shader, interface and regression
checks must agree. The installed Start-menu app is not replaced by rebuilding a
source folder. For an installed copy, build and run the new installer afterward.

## Validation in this environment

- Frontend compiled with TypeScript 5.8.3.
- 134 unit tests passed; one Windows-only logging test was skipped.
- 34 interface checks passed with explicitly mocked native IPC and WebGL.
- All 21 real effect shaders compiled and rendered in Mesa GLES 3.2/llvmpipe.
- Each effect showed at least three substantial hue sectors simultaneously at
  every sampled palette. Colors changed with geometry/audio held fixed.
- Every sampled fixed-palette frame was pixel-identical to the prior shared
  shader in that offscreen comparison.
- Transparency and opacity checks passed for all 21 effects.
- Generator tests covered hundreds of palettes, transition continuity, ten
  minutes of evolution, frame-rate independence, pause and silence behavior.

Windows compilation, WebView2 graphics, GPU performance and live device capture
were NOT tested here. Browser WebGL2 initialization was unavailable here, so
real pixels were tested in Mesa GLES separately from the mocked browser UI.
This archive is source code, not a compiled executable or installer.

The optional separate MP4 shows the real shaders with FIXED geometry and
synthetic input, intentionally isolating the palette change. It is silent and
is not a live-capture demonstration.
