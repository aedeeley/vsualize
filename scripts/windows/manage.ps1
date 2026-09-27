# One entry point for source builds. Compatible with Windows PowerShell 5.1.
param(
    [ValidateSet('menu', 'help', 'setup', 'start', 'rebuild', 'update', 'installer')]
    [string]$Action = 'menu'
)
$ErrorActionPreference = 'Stop'
$interactive = $Action -eq 'menu'
if ($interactive) {
    Write-Host @'
Vsualize development tools

  1. Start (build first if source changed)
  2. Rebuild and start
  3. Build a development installer
  4. Set up missing developer tools
  5. Help
  Q. Quit
'@
    $choice = Read-Host 'Choose an action'
    switch ($choice) {
        '1' { $Action = 'start' }
        '2' { $Action = 'rebuild' }
        '3' { $Action = 'installer' }
        '4' { $Action = 'setup' }
        '5' { $Action = 'help' }
        'q' { exit 0 }
        default { Write-Host 'No action selected.'; exit 0 }
    }
}
if ($Action -eq 'help') {
    Write-Host @'
Usage: vsualize.cmd [setup | start | rebuild | installer | help]

With no arguments, opens the development menu.
setup      Install/check Windows development prerequisites (asks first).
start      Build if needed and launch the app.
rebuild    Verify, rebuild and launch the app (update is an alias).
installer  Verify and build an unsigned development installer.

Build and setup logs: artifacts/logs/
Browser preview: npm run dev
Developer guide: docs/guides/development.md
Official signed releases: docs/guides/releasing.md
'@
    if ($interactive) { $null = Read-Host 'Press Enter to close' }
    exit 0
}
switch ($Action) {
    'setup' { & (Join-Path $PSScriptRoot 'setup-windows.ps1') }
    'start' { & (Join-Path $PSScriptRoot 'start-windows.ps1') }
    'rebuild' { & (Join-Path $PSScriptRoot 'start-windows.ps1') -Rebuild }
    'update' { & (Join-Path $PSScriptRoot 'start-windows.ps1') -Rebuild }
    'installer' { & (Join-Path $PSScriptRoot 'start-windows.ps1') -Rebuild -Installer }
}
$result = $LASTEXITCODE
if ($interactive -and $result -eq 0) { $null = Read-Host 'Press Enter to close' }
exit $result
