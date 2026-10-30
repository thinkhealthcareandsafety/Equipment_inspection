@echo off
title Think Inspect
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed. Opening the download page...
  echo  Install the "LTS" version, then double-click this file again.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo  First run: installing components. This takes a few minutes...
  call npm install
  if errorlevel 1 goto failed
)

if not exist client\dist\index.html (
  echo.
  echo  Building the app...
  call npm run build
  if errorlevel 1 goto failed
)

echo.
echo  Starting Think Inspect. Your browser will open at http://localhost:4000
echo  Keep this window open while you use the app. Close it to stop.
echo.
start "" cmd /c "timeout /t 25 >nul & start http://localhost:4000"
call npm start
goto end

:failed
echo.
echo  Something went wrong. Please send a screenshot of this window.
pause

:end
