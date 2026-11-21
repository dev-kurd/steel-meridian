@echo off
title Steel Meridian - tank demo
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js was not found on this PC. & pause & exit /b 1)
if not exist "..\source\sheets\tanks.json" (echo The packed sheets are missing: docs\tanks\source\sheets. Pack them first. & pause & exit /b 1)
rem An older copy of the demo server may still hold port 8765 (a window left open, or one running hidden). It would keep
rem serving with its old code, so stop it first. Only a node.exe that listens on this port is stopped.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":8765 .*LISTENING"') do (
  tasklist /fi "pid eq %%p" | findstr /i "node.exe" >nul && (echo Stopping the older demo server ^(process %%p^)... & taskkill /f /pid %%p >nul 2>nul)
)
start "" http://localhost:8765/demo/
echo The demo is open in your browser. Close this window to stop it.
node serve.cjs 8765
