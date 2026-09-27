param([string]$Executable = "$PSScriptRoot/../../artifacts/safety/windows/vsualize.exe", [ValidateRange(1,180)][int]$Minutes = 45)
$ErrorActionPreference='Stop'
$binary=(Resolve-Path -LiteralPath $Executable).Path
$out=Join-Path $PSScriptRoot ('../../artifacts/safety/windows/run-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $out | Out-Null
$out=(Resolve-Path -LiteralPath $out).Path
$previousLog=$env:VSUALIZE_SAFETY_LOG
$env:VSUALIZE_SAFETY_LOG=Join-Path $out 'native.jsonl'
try { $app=Start-Process -FilePath $binary -PassThru -WindowStyle Normal } finally {
  if ($null -eq $previousLog) { Remove-Item Env:VSUALIZE_SAFETY_LOG } else { $env:VSUALIZE_SAFETY_LOG=$previousLog }
}
Write-Host "Interactive safety test PID $($app.Id). Logs: $out"
Write-Host 'Follow docs/guides/windows-safety-acceptance.md. Close the test app when finished.'
$start=Get-Date
$cpu=0
while (!$app.HasExited -and ((Get-Date)-$start).TotalMinutes -lt $Minutes) {
  $app.Refresh()
  try {
    $processes=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId
    $appPids=[System.Collections.Generic.HashSet[int]]::new()
    [void]$appPids.Add($app.Id)
    do { $added=$false; foreach ($child in $processes) { if ($appPids.Contains([int]$child.ParentProcessId) -and $appPids.Add([int]$child.ProcessId)) { $added=$true } } } while ($added)
    $gpu=Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction Stop
    $engines=@($gpu.CounterSamples | Where-Object { $_.InstanceName -match '^pid_(\d+)_' -and $appPids.Contains([int]$Matches[1]) } | ForEach-Object { @{engine=$_.InstanceName;percent=$_.CookedValue} })
    $gpuStatus='available'
  } catch { $engines=@();$gpuStatus='unavailable (counter names may be localized)' }
  $row=@{unixMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();cpuSeconds=$app.TotalProcessorTime.TotalSeconds;workingSetBytes=$app.WorkingSet64;gpuStatus=$gpuStatus;engines=$engines}
  $row | ConvertTo-Json -Depth 5 -Compress | Add-Content -LiteralPath (Join-Path $out 'process.jsonl') -Encoding utf8
  Start-Sleep -Seconds 1
}
if (!$app.HasExited) {
  Write-Host 'Test time limit reached. Closing only the test process launched by this script.'
  [void]$app.CloseMainWindow()
  if (!$app.WaitForExit(5000)) { $app.Kill() }
}
Write-Host "Analyze: node scripts/safety/check-log.mjs `"$out/native.jsonl`""
