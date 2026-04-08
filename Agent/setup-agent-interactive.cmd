@echo off
setlocal

cd /d "%~dp0"
echo ==========================================
echo AxiaFlex Print Agent - Setup dynamique
echo ==========================================
echo.
echo Lance en mode administrateur si possible.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-agent-interactive.ps1"

echo.
pause
