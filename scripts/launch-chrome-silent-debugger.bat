@echo off
REM Launch Chrome without the "started debugging this browser" infobar.
REM Fully quit Chrome first, then run this script.

set FLAG=--silent-debugger-extension-api
set CHROME=

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
  set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
)

if "%CHROME%"=="" (
  echo Chrome not found.
  pause
  exit /b 1
)

echo Starting Chrome with %FLAG%
start "" "%CHROME%" %FLAG%
