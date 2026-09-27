# Vsualize identity

Approved direction: concentric circular ripples around a filled center, a cyan-to-violet-to-magenta vertical gradient, and a thin lowercase `vsualize` wordmark. This package reconstructs the approved concept as clean geometry rather than cropping the presentation-board image.

## Source and regeneration

`assets/brand/identity.json` is the geometry and palette source. `scripts/branding/generate-branding.mjs` produces the vector marks, path-based wordmarks, Windows icons and browser icons using Node alone. No font files, image service, network calls or added npm dependencies are required.

```sh
npm run brand:generate
npm run test:branding
```

The normal `npm run build` regenerates these assets before copying `static/` to `dist/`. The dev server uses the same build. Unchanged assets are not rewritten, preserving incremental native builds. Generated assets should remain committed so direct native builds and desktop preflight checks can find them before the frontend runs.

Transparent PNG wordmark exports and social-preview PNGs are delivery exports rendered from the SVGs. The Node generator regenerates the icons and SVG wordmarks, not those supplementary PNG exports. Re-export a matching SVG when changing wordmark geometry.

## Files and intended use

| Surface | Asset |
| --- | --- |
| Primary standalone ripple | `assets/brand/mark.svg` |
| Wordmark on light backgrounds | `assets/brand/logo-horizontal-dark.svg` |
| Wordmark on dark backgrounds | `assets/brand/logo-horizontal-light.svg` |
| Stacked lockups | `assets/brand/logo-stacked-*.svg` |
| Single-color reproduction | `mark-black.svg`, `mark-white.svg`, and `logo-*-black.svg` / `logo-*-white.svg` |
| Windows executable, taskbar, shortcuts | `src-tauri/icons/icon.ico` |
| Native default bitmap | `src-tauri/icons/icon.png` |
| System tray | `src-tauri/icons/tray-icon.png` |
| In-app drag-toolbar identity | `static/brand-logo.svg` and `static/brand.css` |
| Browser tab | `static/favicon.svg` and multi-size `static/favicon.ico` |
| Apple home-screen icon | `static/apple-touch-icon.png` |
| Installable web-app icons | `static/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` |
| Website link previews | `static/social-card.png` |
| GitHub repository social preview | `assets/brand/github-social-preview.png` |

The large mark has four rings. Small icons have three, and micro/tray artwork has two with wider gaps. This is intentional optical sizing, not a different logo. The Windows ICO includes 16, 24, 32, 48, 64 and 256px layers, with 32px first. PNG icon files use 8-bit RGBA. Maskable artwork has an opaque background and keeps the mark inside the central safe region.

Use the icon without the wordmark for taskbar, tray and favicon sizes. Preserve the ring spacing, circle proportions and clear space. Use the solid black or white versions when gradients are inappropriate. Do not add glows, shadows, outlines, additional colors or distort the circles.

## Application integration

The patch changes only branding assets, a few HTML/build integration points and the native tray image path. It preserves `app.vsualize.desktop`, updater keys/endpoints, version, window configuration, audio code, settings storage and release workflow.

`static/index.html` references the favicon, manifest and wordmark. `scripts/branding/brand-preview.mjs` embeds SVGs and branding CSS in the standalone `artifacts/preview/vsualize.html` and removes install-only links there, preserving the existing zero-network preview. Development serving includes MIME types for `.ico` and `.webmanifest`.

The GitHub README uses a `<picture>` element to switch between light and dark wordmark variants.

## Website and repository preview

At the inspected repository revision, the website is documented as a separate, planned project. These assets are prepared for it, not deployed to it. Copy the relevant files from `static/` to the site's public directory and keep manifest/icon URLs relative to its deployment base. Use the light or dark horizontal SVG for the site header.

For a site hosted at `https://vsualize.app`, the link-preview image can be wired after deployment with:

```html
<meta property="og:site_name" content="Vsualize">
<meta property="og:title" content="Vsualize | Your sound, in motion">
<meta property="og:image" content="https://vsualize.app/social-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

The manifest is supplied without a service worker and does not add offline audio capture or native Windows capabilities to the browser preview. GitHub's repository-level social preview is a separate repository setting; committing a PNG does not set that image automatically.

## Validation and release

```sh
npm run test:branding
npm test
npm run check:desktop
```

Then use the repository's existing Windows build/release process. The installed app and its pinned shortcuts will not be updated merely by editing source files. No release tag, package version or updater identity is changed by this branding patch. Do not publish an unsigned development build to the production updater feed.

References: [Tauri app icons](https://v2.tauri.app/develop/icons/), [Tauri system tray](https://v2.tauri.app/learn/system-tray/).
