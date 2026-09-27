# Validation — Vsualize 0.4.1

- Frontend build and 255 Node tests passed, including startup scheduling, the 12-hour interval, sleep catch-up, hidden-window prompts, Later/Escape, changelog selection, quiet network failures, and install progress/retry behavior.
- All 27 Windows native release-mode tests passed, including restricting changelog links to this application's stable GitHub release pages.
- The Edge/WebGL integration test passed with explicitly mocked native IPC. It verified the startup dialog, default focus on Later, changelog command, Escape returning to the app, explicit installation/retry, and reachable dialog actions at 640×600 and 300×240. Screenshots were inspected at both sizes.
- The GitHub release workflow independently tests and builds the tagged source, signs the Windows installer with the existing update key, and publishes the release and update feed.

Browser tests use simulated update responses; they do not install a future release or open a real system browser. Native compilation and tests cover the Windows integration separately.
