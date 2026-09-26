# PowerShell 5.1 compatible. All commands are fixed by our scripts, not user input.
# Native stderr is merged by cmd.exe BEFORE PowerShell reads it. This avoids the
# Windows PowerShell NativeCommandError/Stop trap and logs both native streams.
$script:VsualizeLogWriter = $null
$script:VsualizeLogPath = $null

function Open-VsualizeLog {
    param([Parameter(Mandatory=$true)][string]$Path)
    $script:VsualizeLogPath = $Path
    if (Test-Path -LiteralPath $Path) {
        $previous = [IO.Path]::ChangeExtension($Path, 'previous.log')
        Copy-Item -LiteralPath $Path -Destination $previous -Force
    }
    $encoding = New-Object System.Text.UTF8Encoding($false)
    $script:VsualizeLogWriter = New-Object System.IO.StreamWriter($Path, $false, $encoding)
    $script:VsualizeLogWriter.AutoFlush = $true
    Write-VsualizeLog ('Started: ' + (Get-Date -Format o))
    Write-VsualizeLog ('PowerShell: ' + $PSVersionTable.PSVersion.ToString())
}

function Write-VsualizeLog {
    param([AllowEmptyString()][string]$Text = '')
    if ($null -ne $script:VsualizeLogWriter) { $script:VsualizeLogWriter.WriteLine($Text) }
    Write-Host $Text
}

function Close-VsualizeLog {
    if ($null -ne $script:VsualizeLogWriter) {
        $script:VsualizeLogWriter.Dispose()
        $script:VsualizeLogWriter = $null
    }
}

function Invoke-VsualizeCommand {
    param(
        [Parameter(Mandatory=$true)][string]$Command,
        [int[]]$AllowedExitCodes = @(0)
    )
    Write-VsualizeLog ("`n> " + $Command)
    $clock = [Diagnostics.Stopwatch]::StartNew()
    if (-not $env:ComSpec) { throw 'The Windows command interpreter (ComSpec) was not found.' }
    # Merge in CMD, not `& native.exe 2>&1` in PowerShell 5.1.
    # These command strings are authored here; never insert untrusted arguments.
    & $env:ComSpec /d /s /c ($Command + ' 2>&1') | ForEach-Object {
        Write-VsualizeLog ([string]$_)
    }
    $code = $LASTEXITCODE
    $clock.Stop()
    if ($null -eq $code) { throw "No exit status was returned by: $Command" }
    Write-VsualizeLog ('Exit code: {0} | {1:n1}s' -f $code, $clock.Elapsed.TotalSeconds)
    if ($AllowedExitCodes -notcontains $code) {
        throw ('Command failed with exit code {0}: {1}. The actual output is above and in {2}.' -f $code, $Command, $script:VsualizeLogPath)
    }
    return [int]$code
}
