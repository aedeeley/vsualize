# Vsualize 0.2.5 validation report

## Executed in the authoring environment

- TypeScript 5.8.3: frontend build and no-emit type check passed.
- Node 22.16.0 tests: 65 passed, 0 failed, 1 Windows-only test explicitly skipped.
- The window-key check rejects the exact incompatible 0.2.4 option and accepts
  the corrected configuration against the released-runtime baseline.
- Unit tests of CLI-schema compatibility use labelled synthetic fixtures, not
  a claim that an installed Tauri CLI or Rust build ran here.
- Compared source to the 0.2.4 ZIP: all audio, motion, renderer, visualizer and
  native caption-guard implementation files are unchanged. The only change to
  main.ts is the diagnostics version label.
- Parsed JSON/Cargo metadata and verified version consistency.

## Not executed

- Windows PowerShell 5.1 parsing/execution and native stdout/stderr integration.
  The test is included and runs automatically as part of npm test on Windows.
- Native Rust/Windows compilation, linking, native tests, or an NSIS installer.
- Live audio capture, real desktop transparency, or removal of duplicate buttons.
- Rendering/browser tests, because there are no rendering changes in this repair.
- Installed Tauri CLI schema validation on this host: the CLI is not installed.
  Desktop build commands require that check on the Windows host before compiling.

The authoring environment could not download missing compiler packages. The test
results above do not establish a successfully compiled Windows application.
This archive fixes an identified configuration blocker and improves diagnostics;
additional native errors are possible and should be visible in the new build.log.

The prior user-supplied log is not bundled, because it contains machine details.
Historical reports for earlier versions are retained under docs/test-results.
