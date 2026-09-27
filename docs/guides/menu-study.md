# Shared desktop and browser menu

The bottom filmstrip, popovers, and additional shader controls ship in the Windows
app starting with 0.4.0. For a browser preview, run `npm run dev`, then open
http://127.0.0.1:1420/. `?layout=classic` retains the previous menu for comparison.

Click a thumbnail to switch visuals. Click its cog to select and tune it. The
first card opens Audio / App settings, with Audio selected on each opening.
Audio contains source choices and sensitivity; diagnostics and meters are omitted.
Cards and toolbar controls float directly over the canvas with no surrounding
surface. Settings has the same dimensions as a visual card; each visual has a
top-right cog and a full-width translucent title overlay at the bottom.
Drag the strip, swipe on touchscreens, scroll with a wheel/trackpad, or use its
arrow buttons. Dragging does not select a visual; a normal click still does.
Escape closes a popover first, then hides the strip. Click the canvas to dismiss
the controls. Open popovers stay visible while adjusting.

The four existing per-effect controls and palettes reuse the existing settings
and export format. Labels describe the actual effect (wave height, contour width,
flow speed, highlight width, etc.). New browser controls are stored independently
under `vsualize-menu-study-tuning-v1` on each device and are not yet included in profile exports:

- Cosmic Kaleidoscope: signed spin rate and pattern variety.
- Energy Mandala: signed spin rate and ornament detail.
- Dissolution: signed spin rate and surface detail.
- Acid Organism: cell variety.
- Neon Overdrive: shape variety.
- Lava Forms: blending.

Spin is a rate multiplier on the effect's rotation transport, with a continuous
integrated offset so changing the slider does not jump orientation. Flight speed
still sets the overall motion transport. Default new-control values are 1, which
preserves the existing appearance. Shader variants are generated only for this
shared menu; the original shader strings are not mutated.

Implementation: `src/preview-menu.ts`, `static/preview-menu.css`, and
`src/preview-tuning.ts`. The standalone HTML build embeds the study stylesheet.
