@echo off
title Shipshot setup
cd /d "%~dp0"
echo.
echo   Setting up Shipshot...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Shipshot needs Node.js 20 or newer, and it is not installed.
  echo   Opening the Node.js download page. Install the LTS version, then run Setup.bat again.
  start "" https://nodejs.org/en/download
  echo.
  pause
  exit /b 1
)

call npm install --silent --no-fund --no-audit
if errorlevel 1 (
  echo.
  echo   Could not install what Shipshot needs. Check your internet connection and run Setup.bat again.
  pause
  exit /b 1
)

node shipshot.mjs install
echo.
echo   Done. Shipshot is on your desktop and in the Start menu. Opening it now.
node shipshot.mjs app
timeout /t 3 >nul
