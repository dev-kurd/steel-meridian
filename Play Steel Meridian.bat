@echo off
rem Opens Steel Meridian in its own window (Microsoft Edge app mode). Works from wherever this folder is.
rem The game reads its art from the assets folder. A page opened from disk may only do that with the
rem --allow-file-access-from-files switch, and the switch only takes effect in a browser profile of its own,
rem so the game uses %LOCALAPPDATA%\SteelMeridian\profile (the same profile, and the same saves, as the exe).
setlocal enabledelayedexpansion
set "P=%~dp0index.html"
set "P=!P:\=/!"
set "P=!P: =%%20!"
start "" msedge --app="file:///!P!" --user-data-dir="%LOCALAPPDATA%\SteelMeridian\profile" --allow-file-access-from-files --no-first-run --no-default-browser-check --window-size=1600,900
