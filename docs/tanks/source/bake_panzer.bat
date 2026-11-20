@echo off
setlocal
title State of War - Panzer tank bake
cd /d "%~dp0"

rem  If Blender is not found, put the full path of blender.exe in the next line and remove the word "rem":
rem  set "BL=C:\Program Files\Blender Foundation\Blender 5.3\blender.exe"

if not defined BL for /d %%D in ("%ProgramFiles%\Blender Foundation\Blender 5*") do if exist "%%D\blender.exe" set "BL=%%D\blender.exe"
if not defined BL for /f "delims=" %%P in ('where blender 2^>nul') do if not defined BL set "BL=%%P"
if not defined BL if exist "%ProgramFiles(x86)%\Steam\steamapps\common\Blender\blender.exe" set "BL=%ProgramFiles(x86)%\Steam\steamapps\common\Blender\blender.exe"
if not defined BL goto :noblender

echo Blender: %BL%
echo Baking the Panzer tank sprites into "%~dp0bake".
echo You can close this window at any time. Start the file again and the bake continues where it stopped.
echo.
"%BL%" -b --python "%~dp0bake_tanks.py" -- %* 2>&1 | findstr /r /c:"^BAKE" /c:"^Traceback" /c:"^  File" /c:"Error"
echo.
if exist "%~dp0bake\progress.txt" type "%~dp0bake\progress.txt"
if exist "%~dp0bake\BAKE_DONE" (echo. & echo ALL DONE.) else (echo. & echo Not finished yet. Start this file again to continue.)
pause
exit /b 0

:noblender
echo Blender 5 was not found on this PC.
echo Open this file in Notepad and put the path of blender.exe in the line that starts with:  set "BL=
pause
exit /b 1
