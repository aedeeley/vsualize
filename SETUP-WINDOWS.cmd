@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-windows.ps1"
set "VSUALIZE_EXIT=%ERRORLEVEL%"
echo.
echo Setup details are in setup.log in this folder.
pause
exit /b %VSUALIZE_EXIT%
