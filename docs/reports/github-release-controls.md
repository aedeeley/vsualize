# GitHub release controls — 2026-09-27

Authenticated repository API inspection for `aedeeley/vsualize`; no secret values were retrieved or logged. Local evidence: `artifacts/safety/github-controls.json`.

| Check | Observed result |
| --- | --- |
| Private vulnerability reporting | Enabled; readback `enabled: true`. SECURITY.md points to GitHub's private report form. No test report was submitted. |
| Repository rulesets | Empty list. |
| Main branch protection endpoint | HTTP 404; protected-branch configuration was not verified. |
| Actions default token | Read-only; workflows cannot approve pull-request reviews. |
| Allowed actions | All actions allowed; repository-wide SHA pinning is not required. Current checked-in workflows pin their referenced actions. |
| Release environments | None. No environment approval gate was established. |
| Repository Actions secrets | One secret name: `TAURI_SIGNING_PRIVATE_KEY`. Value/backup/password protection was not inspected. |

The tagged release job explicitly elevates its token to `contents: write` and consumes the repository signing secret. Current source refuses to overwrite a published release, signs the installer and binds its version. Those controls do not replace GitHub-side restrictions on changing the workflow, pushing release tags, or using the signing secret in another workflow.

## Proposed configuration for maintainer review

Protect main and `v*` release tags against unintended updates/deletion, with explicit maintainer bypass rules appropriate to a solo-maintainer repository. Decide whether branch checks/review and a second release approver are operationally practical. Place signing authority behind a release environment with allowed tag rules and any chosen approval gate; moving the signing secret requires the owner to supply it through GitHub's secure UI, not chat or repository files. Restrict action sources and require commit pinning where supported. Verify offline signing-key backup access and recovery without printing the key.

Only private reporting was changed in this task. The protection proposals above were not applied: their account access and release-blocking consequences require choosing the maintainers/approvers and bypass policy first. These are known configuration gaps, not claims of an exploited vulnerability.
