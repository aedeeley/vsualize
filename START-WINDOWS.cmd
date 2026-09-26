@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-windows.ps1"
set "VSUALIZE_EXIT=%ERRORLEVEL%"
if not "%VSUALIZE_EXIT%"=="0" (
  echo.
  echo Build stopped. The full error is in build.log in this folder.
  echo Keep this window open to read the error. Reinstalling tools is not the next step.
  pause
)
exit /b %VSUALIZE_EXIT%
