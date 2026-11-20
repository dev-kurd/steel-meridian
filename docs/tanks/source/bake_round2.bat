@echo off
setlocal
title State of War - round 2 tank bake (Artillery, Anti-Air, Flamer, Special)
cd /d "%~dp0"

rem  If Blender is not found, put the full path of blender.exe in the next line and remove the word "rem":
rem  set "BL=C:\Program Files\Blender Foundation\Blender 5.3\blender.exe"

if not defined BL for /d %%D in ("%ProgramFiles%\Blender Foundation\Blender 5*") do if exist "%%D\blender.exe" set "BL=%%D\blender.exe"
if not defined BL for /f "delims=" %%P in ('where blender 2^>nul') do if not defined BL set "BL=%%P"
if not defined BL goto :noblender

echo Blender: %BL%
echo Baking the round 2 turrets, their shadows and the wrecks into "%~dp0bake" (the hulls come from the Panzer bake).
echo You can close this window at any time. Start the file again and the bake continues where it stopped.
echo.
for %%W in (artillery antiair flamer special) do (
  echo ---- %%W
  "%BL%" -b --python "%~dp0bake_tanks.py" -- --weapon %%W --only turret,shadow,wreck %* 2>&1 | findstr /r /c:"^BAKE" /c:"^Traceback" /c:"^  File" /c:"Error"
)
echo.
if exist "%~dp0bake\progress.txt" type "%~dp0bake\progress.txt"
pause
exit /b 0

:noblender
echo Blender 5 was not found on this PC.
echo Open this file in Notepad and put the path of blender.exe in the line that starts with:  set "BL=
pause
exit /b 1
