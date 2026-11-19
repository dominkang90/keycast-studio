@echo off
rem Starts KeyCast Studio (desktop app).
set "EXE=%~dp0release\KeyCast Studio-win32-x64\KeyCast Studio.exe"
if exist "%EXE%" (
  start "" "%EXE%"
  exit /b 0
)
echo KeyCast Studio.exe was not found. Run "npm run build" in this folder first.
pause
