# Vsualize: 8px outer corners

Source patch for Vsualize 0.2.8. The app version remains 0.2.8.
This supersedes the older 4PX-CORNER-PATCH.txt instructions.

## Result

- All four outer corners use an 8 CSS-pixel radius in windowed mode.
- The existing root clip covers the canvas, background, and top drag gradient.
- Fullscreen uses square corners (0px); leaving fullscreen restores 8px.
- Solid and transparent modes use the same outer clip.
- Menu and button radii are unchanged.
- No visualizers, audio processing, preferences, native Rust code, or build launchers changed.

## Apply

1. Let any running build finish, then quit Vsualize, including its tray instance.
2. Extract this ZIP. Copy EVERYTHING INSIDE its Vsualize folder into your existing
   Vsualize 0.2.8 source folder, replacing matching files. Merge the folders;
   do not delete the existing project.
3. Keep node_modules and src-tauri/target. Run your existing UPDATE-WINDOWS.cmd.
   Do not rerun SETUP-WINDOWS.cmd.

Copy all the included files, not just the stylesheet: the patch also updates the
fullscreen state binding and the regression tests that previously expected 4px.
The launcher's existing source fingerprint will notice these changes.

This is a source patch, not an executable or installer. A copy already installed
through an installer will not be replaced by a source rebuild. For that copy,
run BUILD-INSTALLER.cmd in the patched project and install the generated setup.

## Implementation

The original whole-body clip is retained, with only the default radius changed.
Browser fullscreen also has a :fullscreen CSS override. The native interface reads
the actual fullscreen state after fullscreen commands, startup, focus, resize,
and window recovery, rather than guessing from screen dimensions.

A single read-only permission, core:window:allow-is-fullscreen, is added. No shell,
filesystem, network, or broad default permission is added. Failed cosmetic state
queries do not interrupt the controls or audio.

The existing library-preservation test still compares the 21 retained shaders,
audio processing, native Rust, and thumbnails against their original baseline.
It normalizes only the explicitly approved corner CSS before comparing the
remaining stylesheet, so unrelated appearance changes are still caught.

## Validation

- Frontend TypeScript build: passed.
- Node test suite: 120 passed, 0 failed, 1 Windows-only logging test skipped.
- CSS compositing: 153 checks passed at 300x240, 640x600, and 1024x360,
  with display scale factors 1, 1.5, and 2. Both backgrounds and control states
  were checked, including corner alpha, straight-edge preservation, resize
  targets, square fullscreen clipping, and restoration to 8px.
- Native fullscreen getter behavior is unit-tested with mocks.
- Native Windows compilation, live audio, and Windows/WebView2 fullscreen
  behavior were NOT exercised here. The layout test uses a 2D canvas fixture,
  not production WebGL rendering.

The stored test reports describe this patch only.

## API references

Tauri Window API and withGlobalTauri:
https://v2.tauri.app/reference/javascript/api/namespacewindow/

Read-only fullscreen permission:
https://v2.tauri.app/reference/acl/core-permissions/
