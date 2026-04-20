@echo off
setlocal

cd /d "%~dp0"
echo ==========================================
echo Axia Desktop POS - One Click Setup
echo ==========================================
echo.
echo Lance ce script en mode Administrateur.
echo Il installera Node.js et PostgreSQL puis preparera DesktopPOS.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-desktoppos-oneclick.ps1"

echo.
pause
