@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\manage.ps1" %*
set "VSUALIZE_EXIT=%ERRORLEVEL%"
if not "%VSUALIZE_EXIT%"=="0" (
  echo.
  echo Command stopped. See the error above and artifacts\logs for build or setup details.
  pause
)
exit /b %VSUALIZE_EXIT%
