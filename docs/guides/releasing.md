# Release maintenance

The public update feed is `https://github.com/aedeeley/vsualize/releases/latest/download/latest.json`. It names an immutable tagged installer and includes its Tauri signature. The embedded public key and `requireSignedVersion` protect both content and version. Update signatures do not establish a Windows Authenticode publisher identity.

## Publish the next version

1. Update the same numeric version in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, and the Settings version label. Add `docs/releases/X.Y.Z.md`.
2. Run `npm ci`, `npm test`, `npm run check:desktop`, and `cargo test --locked --manifest-path src-tauri/Cargo.toml --release`. Check the installed app on Windows, especially live audio, heavy visuals and fullscreen.
3. Commit and push the source, then create and push the matching `vX.Y.Z` tag. **Publish Windows release** builds/tests the app, signs the installer, generates the feed and SHA-256 checksums, stages a draft, and publishes only after every step succeeds.
4. Check that the release contains exactly the intended installer, its `.sig`, `latest.json`, and `SHA256SUMS.txt`. Verify an older installed app can find and install it. Do not replace a published installer in place; fix forward with a higher version.

A failed publication can resume its existing draft. Published versions are immutable. Manual workflow dispatch must select a version tag. Branch/PR builds use a separate test config and do not require the signing key.

## Signing key

`TAURI_SIGNING_PRIVATE_KEY` is an encrypted GitHub Actions repository secret. The public key is in `src-tauri/tauri.conf.json`. The private key must never enter Git, release assets, screenshots or logs. Access to release workflows and this secret authorizes application updates, so restrict repository write access.

Keep an offline backup of the private key in secure storage. Losing it prevents installed copies from accepting future updates signed by a different key. A protected local backup was created during the initial release; it is deliberately outside the source repository. If a key password is introduced, store it separately as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

For a local official build, set `TAURI_SIGNING_PRIVATE_KEY` to the private key path, run `npm run installer -- --ci`, then `npm run release:manifest`. Do not bypass a failed signature or version check.

## Move to your own server

Serve the same manifest and signed installer over HTTPS. Give installers immutable versioned URLs, serve JSON as `application/json`, avoid caching the latest manifest for long periods, and retain older installers for rollback diagnostics. You can instead implement Tauri's dynamic endpoint contract (204 when current, or a signed update response).

Ship an app update with the new endpoint **while the existing GitHub endpoint still works**, then keep GitHub as a fallback during migration. Changing a server URL in a repository does not change already-installed applications. Reuse the same signing key, identifier, architecture and per-user installation mode.

The future `vsualize.app` website can advertise features and link to `https://github.com/aedeeley/vsualize/releases/latest`; it need not operate the update service on launch day.

References: [Tauri updater](https://v2.tauri.app/plugin/updater/), [Windows installer](https://v2.tauri.app/distribute/windows-installer/).
