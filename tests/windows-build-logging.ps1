# Integration test: Windows PowerShell parsing, logging and exit-code behavior.
# Does not install anything, invoke Rust, or modify the user's project.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('Vsualize logger test ' + [Guid]::NewGuid().ToString('N'))
$code = 0
try {
    foreach ($script in Get-ChildItem -LiteralPath (Join-Path $root 'scripts') -Filter '*.ps1' -Recurse) {
        $tokens = $null; $errors = $null
        $null = [Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$tokens, [ref]$errors)
        if ($errors.Count -ne 0) { throw ($script.Name + ': ' + ($errors | Out-String)) }
    }
    $null = New-Item -ItemType Directory -Path $temporary
    . (Join-Path $root 'scripts/windows/windows-common.ps1')
    $log = Join-Path $temporary 'test.log'
    Open-VsualizeLog -Path $log
    $result = Invoke-VsualizeCommand 'cmd.exe /d /c "(echo STDOUT_TOKEN) & (echo STDERR_TOKEN 1>&2) & exit /b 0"'
    if ($result -ne 0) { throw 'Successful stderr output should not abort the script.' }
    $caught = $false
    try { $null = Invoke-VsualizeCommand 'cmd.exe /d /c "echo FAILURE_TOKEN 1>&2 & exit /b 23"' }
    catch { $caught = $_.Exception.Message -match 'exit code 23' }
    if (-not $caught) { throw 'Expected failed exit code 23 to propagate.' }
    $result = Invoke-VsualizeCommand 'cmd.exe /d /c "exit /b 23"' -AllowedExitCodes @(0, 23)
    if ($result -ne 23) { throw 'An allowed nonzero exit code must be preserved.' }
    Close-VsualizeLog
    $text = Get-Content -LiteralPath $log -Raw
    foreach ($token in @('STDOUT_TOKEN', 'STDERR_TOKEN', 'FAILURE_TOKEN', 'Exit code: 23')) {
        if ($text -notmatch [regex]::Escape($token)) { throw ('Missing log output: ' + $token) }
    }
    Open-VsualizeLog -Path $log
    Write-VsualizeLog 'SECOND_RUN_TOKEN'
    Close-VsualizeLog
    if ((Get-Content -LiteralPath (Join-Path $temporary 'test.previous.log') -Raw) -ne $text) { throw 'Previous log was not preserved.' }
    Write-Host 'Windows logging integration test passed.'
} catch {
    $code = 1
    Write-Host ($_ | Out-String)
} finally {
    if (Get-Command Close-VsualizeLog -ErrorAction SilentlyContinue) { Close-VsualizeLog }
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
}
exit $code
