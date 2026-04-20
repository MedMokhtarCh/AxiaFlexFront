@echo off
setlocal

cd /d "%~dp0"
echo ==========================================
echo AxiaFlex Desktop Bridge - One Click Setup
echo ==========================================
echo.
echo Lance en mode administrateur si possible.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-desktop-bridge-oneclick.ps1"

echo.
pause

