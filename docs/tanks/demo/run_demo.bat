@echo off
title Steel Meridian - Panzer tank demo
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js was not found on this PC. & pause & exit /b 1)
if not exist "..\source\sheets\tanks.json" (echo The packed sheets are missing: docs\tanks\source\sheets. Pack them first. & pause & exit /b 1)
start "" http://localhost:8765/demo/
echo The demo is open in your browser. Close this window to stop it.
node serve.cjs 8765
