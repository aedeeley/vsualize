param([switch]$Rebuild, [switch]$Installer)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location -LiteralPath $root
. (Join-Path $PSScriptRoot 'windows-common.ps1')

function Get-SourceFingerprint {
    $paths = @('package.json','package-lock.json','tsconfig.json','src-tauri/Cargo.toml','src-tauri/Cargo.lock','src-tauri/tauri.conf.json','src-tauri/build.rs')
    foreach ($folder in @('src','static','scripts','tests','src-tauri/src','src-tauri/capabilities','src-tauri/icons')) {
        $directory = Join-Path $root $folder
        if (Test-Path -LiteralPath $directory) {
            $paths += Get-ChildItem -LiteralPath $directory -File -Recurse | ForEach-Object { $_.FullName.Substring($root.Length + 1) }
        }
    }
    $lines = foreach ($relative in ($paths | Sort-Object -Unique)) {
        $file = Join-Path $root $relative
        if (Test-Path -LiteralPath $file -PathType Leaf) { $relative + ':' + (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash }
    }
    $hash = [System.Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))))).Replace('-','') }
    finally { $hash.Dispose() }
}

$exitCode = 0
try {
    Open-VsualizeLog -Path (Join-Path $root 'artifacts/logs/build.log')
    $version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
    Write-VsualizeLog ("`nVsualize " + $version + ' | Windows build repair')
    Write-VsualizeLog ('Project: ' + $root)
    Write-VsualizeLog ('Rebuild: ' + $Rebuild + ' | Installer: ' + $Installer)
    $binary = Join-Path $root 'src-tauri\target\release\vsualize.exe'
    $running = Get-Process -Name 'vsualize' -ErrorAction SilentlyContinue
    if ($running) { throw 'Vsualize is still running. Quit it from its tray icon, then run this launcher again.' }
    $stamp = Join-Path $root 'artifacts/cache/windows-build.sha256'
    $matchesSource = (Test-Path -LiteralPath $stamp) -and ((Get-Content -LiteralPath $stamp -Raw).Trim() -eq (Get-SourceFingerprint))
    if ((Test-Path -LiteralPath $binary) -and $matchesSource -and -not $Rebuild -and -not $Installer) {
        Write-VsualizeLog ('Launching the build verified against this source: ' + $binary)
        Start-Process -FilePath $binary -WorkingDirectory $root
    } else {
        if (Test-Path -LiteralPath $stamp) { Remove-Item -LiteralPath $stamp -Force }
        $missing = @()
        foreach ($tool in @('node.exe', 'npm.cmd', 'cargo.exe', 'rustc.exe')) {
            if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { $missing += $tool }
        }
        if ($missing.Count -gt 0) {
            throw ('Missing tools: ' + ($missing -join ', ') + '. Reopen the terminal after installation. Only run vsualize.cmd setup if tools are actually missing.')
        }
        Write-VsualizeLog "`nTool versions:"
        $null = Invoke-VsualizeCommand 'node.exe --version'
        $null = Invoke-VsualizeCommand 'npm.cmd --version'
        $null = Invoke-VsualizeCommand 'rustc.exe -vV'
        $null = Invoke-VsualizeCommand 'cargo.exe --version'
        $nodeMajor = [int](((& node.exe --version).TrimStart('v') -split '\.')[0])
        if ($nodeMajor -lt 20) { throw 'Node.js 20 or later is required. Install Node.js LTS, then reopen this launcher.' }
        $rustInfo = (& rustc.exe -vV | Out-String)
        if ($LASTEXITCODE -ne 0 -or $rustInfo -notmatch 'host: (x86_64|aarch64)-pc-windows-msvc') {
            throw 'Rust must use a Windows MSVC toolchain. GNU/MinGW is not supported by this launcher.'
        }
        $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
        if (-not (Test-Path -LiteralPath $vswhere)) { throw 'Microsoft C++ Build Tools are missing. Install the Desktop development with C++ workload.' }
        $vs = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Out-String).Trim()
        if (-not $vs) { throw 'The Visual Studio C++ toolchain is missing. Add Desktop development with C++, including a Windows SDK.' }
        Write-VsualizeLog ('C++ toolchain: ' + $vs)
        $sdk = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\Lib'
        if (-not (Test-Path -LiteralPath $sdk)) { throw 'A Windows SDK is missing. Add it through Visual Studio Installer.' }
        if ($env:CARGO_BUILD_TARGET -or $env:CARGO_TARGET_DIR) {
            throw 'CARGO_BUILD_TARGET or CARGO_TARGET_DIR overrides the expected output path. Use the npm commands directly for a custom target, or unset these variables for this launcher.'
        }
        Write-VsualizeLog "`nChecking frontend dependencies..."
        if (-not (Test-Path 'node_modules\typescript\bin\tsc') -or -not (Test-Path 'node_modules\@tauri-apps\cli\config.schema.json')) {
            $null = Invoke-VsualizeCommand 'npm.cmd install'
        }
        $null = Invoke-VsualizeCommand 'npm.cmd run tauri -- --version'
        Write-VsualizeLog "`nChecking window keys against the released runtime and installed CLI..."
        $null = Invoke-VsualizeCommand 'npm.cmd run check:desktop'
        Write-VsualizeLog "`nBuilding the frontend and running its tests..."
        $null = Invoke-VsualizeCommand 'npm.cmd test'
        Write-VsualizeLog "`nBuilding the Windows app. Native output is now captured, including stderr."
        $null = Invoke-VsualizeCommand 'npm.cmd run build:windows -- --verbose'
        Write-VsualizeLog "`nRunning native audio-analysis and window-guard tests..."
        $null = Invoke-VsualizeCommand 'cargo.exe test --manifest-path src-tauri/Cargo.toml --release'
        if (-not (Test-Path -LiteralPath $binary)) { throw 'Build completed but vsualize.exe was not found in the expected output folder.' }
        $null = New-Item -ItemType Directory -Path (Split-Path $stamp -Parent) -Force
        (Get-SourceFingerprint) | Set-Content -LiteralPath $stamp -Encoding ASCII
        if ($Installer) {
            Write-VsualizeLog "`nBuilding an unsigned Windows installer..."
            $null = Invoke-VsualizeCommand 'npm.cmd run installer -- --verbose --config src-tauri/tauri.test.conf.json'
            $installerDirectory = Join-Path $root 'src-tauri\target\release\bundle\nsis'
            Write-VsualizeLog ('Run the new ' + $version + ' setup executable from: ' + $installerDirectory)
            Start-Process explorer.exe -ArgumentList ('"' + $installerDirectory + '"')
        } else {
            Write-VsualizeLog ("`nLaunching: " + $binary)
            Start-Process -FilePath $binary -WorkingDirectory $root
        }
    }
} catch {
    $exitCode = 1
    Write-VsualizeLog ("`nBUILD STOPPED: " + $_.Exception.Message)
    if ($_.InvocationInfo.PositionMessage) { Write-VsualizeLog $_.InvocationInfo.PositionMessage }
    if ($_.ScriptStackTrace) { Write-VsualizeLog $_.ScriptStackTrace }
    Write-VsualizeLog 'Do not reinstall the toolchain for an ordinary compiler/configuration error. See artifacts/logs/build.log.'
} finally {
    Write-VsualizeLog ('Finished: ' + (Get-Date -Format o) + ' | Exit code: ' + $exitCode)
    Close-VsualizeLog
}
exit $exitCode
