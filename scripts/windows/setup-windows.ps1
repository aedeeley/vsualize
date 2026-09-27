$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location -LiteralPath $root
. (Join-Path $PSScriptRoot 'windows-common.ps1')
$exitCode = 0
try {
    Open-VsualizeLog -Path (Join-Path $root 'artifacts/logs/setup.log')
    Write-VsualizeLog @'
Vsualize build prerequisites

This OPTIONAL helper installs developer tools through Microsoft's winget:
  * Node.js LTS
  * Rustup / Rust stable
  * Microsoft Visual Studio 2022 C++ Build Tools and a Windows SDK
  * Microsoft Edge WebView2 Runtime

The C++ tools can require several gigabytes and administrator approval.
If the frontend tests already pass and the launcher reaches the native build,
start with vsualize.cmd rebuild. A source error is not fixed
by reinstalling developer tools.

Review scripts/windows/setup-windows.ps1 before approving. No app data is uploaded.
'@
    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) { throw 'winget was not found. See the official Tauri prerequisites documentation.' }
    $answer = Read-Host 'Install/check these prerequisites? Type YES to continue'
    if ($answer -cne 'YES') {
        Write-VsualizeLog 'No changes made.'
    } else {
        $packages = @(
            @{ Id = 'OpenJS.NodeJS.LTS'; Extra = '' },
            @{ Id = 'Rustlang.Rustup'; Extra = '' },
            @{ Id = 'Microsoft.VisualStudio.2022.BuildTools'; Extra = ' --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"' },
            @{ Id = 'Microsoft.EdgeWebView2Runtime'; Extra = '' }
        )
        # Only documented "already installed/no applicable update" codes are
        # nonfatal. Hash failures, downloads, cancellations, etc. STOP the helper.
        $noUpdate = [BitConverter]::ToInt32([BitConverter]::GetBytes([uint32]2316632107), 0) # 0x8A15002B
        $installed = [BitConverter]::ToInt32([BitConverter]::GetBytes([uint32]2316632161), 0) # 0x8A150061
        foreach ($package in $packages) {
            Write-VsualizeLog ("`nInstalling/checking " + $package.Id)
            $command = 'winget.exe install --id ' + $package.Id + ' --exact --source winget --accept-source-agreements --accept-package-agreements' + $package.Extra
            $null = Invoke-VsualizeCommand -Command $command -AllowedExitCodes @(0, $noUpdate, $installed)
        }
        Write-VsualizeLog @'

Setup completed. Open a new terminal and run vsualize.cmd rebuild.
Restart Windows first if an installer requests it. If Rustup needs its first
initialization, run: rustup default stable-msvc
'@
    }
} catch {
    $exitCode = 1
    Write-VsualizeLog ("`nSETUP STOPPED: " + $_.Exception.Message)
    if ($_.InvocationInfo.PositionMessage) { Write-VsualizeLog $_.InvocationInfo.PositionMessage }
    Write-VsualizeLog 'See artifacts/logs/setup.log. No assumption is made that a failed install succeeded.'
} finally {
    Write-VsualizeLog ('Finished: ' + (Get-Date -Format o) + ' | Exit code: ' + $exitCode)
    Close-VsualizeLog
}
exit $exitCode
