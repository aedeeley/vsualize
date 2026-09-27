# Dependency advisory review — 2026-09-27

`npm audit --json` found zero known vulnerabilities across 13 dependencies, including development and optional packages. The first sandboxed request failed; the successful retry queried the live npm advisory service. This is a point-in-time advisory result, not proof of absence of vulnerabilities.

`cargo-audit 0.22.2` checked 533 locked packages against RustSec database commit `e2111519ba6d14a5da59a7b2e5c8083ae8a37c01` (updated 2026-09-25). It reported zero vulnerability entries and these informational warnings:

| Advisory | Package | Disposition |
| --- | --- | --- |
| RUSTSEC-2024-0370 | proc-macro-error 1.0.4 | Unmaintained; absent from the Windows target dependency tree. Retained in the cross-platform lockfile through upstream dependencies. |
| RUSTSEC-2024-0429 | glib 0.18.5 | Unsound VariantStrIter implementation; absent from the supported Windows target tree. A Linux release must resolve this before claiming support. |
| RUSTSEC-2025-0081 | unic-char-property 0.9.0 | Unmaintained upstream Unicode dependency through urlpattern / tauri-utils. |
| RUSTSEC-2025-0075 | unic-char-range 0.9.0 | Same upstream Unicode maintenance limitation. |
| RUSTSEC-2025-0080 | unic-common 0.9.0 | Same upstream Unicode maintenance limitation. |
| RUSTSEC-2025-0100 | unic-ucd-ident 0.9.0 | Same upstream Unicode maintenance limitation. |
| RUSTSEC-2025-0098 | unic-ucd-version 0.9.0 | Same upstream Unicode maintenance limitation. |

The Unicode crates are present in the Windows dependency tree. They are not presented as vulnerability findings merely because they are unmaintained. They remain visible upstream-maintenance risks; there is no blanket security exception and no ignored advisory ID. Review Tauri/urlpattern updates for a supported replacement, and re-evaluate these notices on each release and when platform support changes.

`.github/workflows/security.yml` checks pull requests, main pushes and a weekly schedule. npm advisories at low severity or above fail the check. RustSec vulnerability entries fail it; informational warnings remain visible and require maintainer review. Network or advisory-service failures are failures, not clean scans. The audit workflow receives read-only repository permissions and no signing secrets.

Local raw RustSec output is in the generated `artifacts/safety-rust-audit.json`. Tests and static review additionally cover profile parsing, session revocation, update version binding and release configuration. No dependency code has been rewritten or upgraded speculatively as part of these safeguards.
