# Security policy

## Supported versions

Security fixes target the latest stable release and the development main branch. Older releases receive no promised backports; upgrade to the latest stable version. Unreleased safeguards on main are not present in previously published installers. There is no guaranteed response or remediation time.

## Reporting a vulnerability privately

Use [GitHub's private vulnerability report form](https://github.com/aedeeley/vsualize/security/advisories/new). Private vulnerability reporting was enabled and verified through GitHub's repository API on 2026-09-27. Sign in to GitHub to submit a report. Do not post vulnerabilities, exploit steps, audio/device diagnostics or secrets in public issues. Include affected versions, reproduction steps and impact; omit private audio and credentials. There is no promised response time.

## Security boundaries

The Windows app runs with the current user's privileges. Bundled local UI communicates with a limited set of native commands; there is no generic frontend shell or filesystem plugin. Native code intentionally performs audio capture, update networking, signed installer execution and constrained release-note browser opening. Audio remains local; update and installation network requests are separate.

Profile imports accept bounded JSON appearance settings. They cannot enable capture, disable the session timer or acknowledge safety notices. Native capture requires an active session; native expiry and workstation-lock/sleep events revoke it independently of the frontend timer.

Signed updates authenticate the installer and version against the embedded update key. This is separate from Windows Authenticode publisher identity. Download from the project's official GitHub Releases and keep Windows/WebView2 current.

## Maintainer checks

Run `npm audit` and `cargo audit --file src-tauri/Cargo.lock`; scheduled and pull-request dependency checks are in `.github/workflows/security.yml`. Review informational notices as well as vulnerability entries. No vulnerability IDs are silently ignored. Current platform-specific limitations are recorded in [dependency security notes](docs/reports/dependency-security.md).

Report scope includes IPC, navigation, untrusted imports/metadata, audio privacy, native lifecycle, updates and release integrity. The application does not claim isolation against a process already running with the same user's full OS privileges. Health and hardware guidance is in [Safety](docs/guides/safety.md).
