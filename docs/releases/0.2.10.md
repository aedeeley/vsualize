# Vsualize 0.2.10: Native-resolution rendering

## What this fixes

The old Detailed preset limited heavy effects such as Ripple to about 1.3 million
pixels. Fullscreen 3840 x 2160 therefore used a 1520 x 855 image enlarged to fit.
This was an application policy, not a fixed resolution of the shader artwork.

The saved `quality: "high"` choice is now **Native (100%)**. It requests the whole
physical-pixel area of the canvas, including Windows DPI scaling. No app pixel
budget, heavy-effect reduction, or 2x DPI ceiling applies in this mode. New
installations default to Native; existing Light/Balanced choices remain unchanged.

- Existing Detailed users get Native automatically after rebuilding.
- Main drawing buffer, shader resolution, viewport, and feedback targets agree.
- Hardware/implementation size limits are reported, not silently called Native.
- The Settings readout uses `drawingBufferWidth` and `drawingBufferHeight`.
- The context requests the high-performance GPU preference. This is a hint, not a
  guarantee that the operating system selects a particular adapter.
- Native keeps the existing high-detail geometry. No shaders, glow values,
  palettes, audio behavior, or native window/corner code changed.
- Pause still freezes the frame. A paused image resized to a larger window is
  reported as scaled until Resume redraws it at the new size.

## Apply to the desktop project

1. Quit Vsualize, including its tray instance, and let any running build finish.
2. Merge everything inside this ZIP's Vsualize folder into your source folder.
   Replace matching files. Keep node_modules, src-tauri/target, and your other files.
3. Run UPDATE-WINDOWS.cmd. No setup or tool reinstallation is required.
4. Confirm 0.2.10 in Settings. Select Native (100%) under Render quality.
5. On a 3840 x 2160 fullscreen desktop, the readout should say:
   Rendering: 3840 x 2160 | Native | 100% (the UI uses multiplication/dot symbols).

If it instead says Graphics limited or Reduced, the readout provides evidence of
what was actually allocated. Audio > Copy diagnostics also includes rendering
information. Lowering Glow is not required for this resolution fix.

This is source, not a precompiled installer. To update a separately installed
Start-menu executable, run BUILD-INSTALLER.cmd and install the new setup afterward.
A source-folder build does not replace a different installed executable.

## Performance

Native 4K requests 8,294,400 pixels, versus the old high-heavy 1,300,000-pixel budget.
That is about 6.4 times as many pixels, not a prediction of a particular frame rate.
Try a 30 fps frame limit while retaining Native before sacrificing resolution.
Light and Balanced remain the old reduced-resolution performance choices, labelled
as reduced in the menu. Native never silently switches to those choices.

## Verification and limits

See docs/archive/reports/test-report-0.2.10.md. Real offscreen GLSL renders at 3840 x 2160 were
produced here, but Windows compilation, WebView2, native device capture, and your
GPU's live frame rate have not been tested. No Windows execution is claimed.

The comparison image holds geometry, audio uniforms, palette, and Glow (20%) fixed.
The left crop is a 1520 x 855 shader render enlarged to 4K with bilinear sampling.
The right crop is the same shader rendered directly to 4K. Both crops are shown
at one image pixel per represented screen pixel before any viewer resizing.
