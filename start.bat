@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Hikasha Chat - Stream Chat Overlay
set "FAILMSG="

echo ============================================
echo  Hikasha Chat - Stream Chat Overlay
echo ============================================
echo.

:: --- 1. Node.js and npm ---------------------------------------------------
echo [start] Step 1/5: checking Node.js and npm...
where node >nul 2>nul
if errorlevel 1 (
  set "FAILMSG=Node.js was not found on PATH. Install Node.js 22.12 or newer from https://nodejs.org and re-run start.bat."
  goto :fail
)
where npm >nul 2>nul
if errorlevel 1 (
  set "FAILMSG=npm was not found on PATH. Reinstall Node.js 22.12 or newer from https://nodejs.org."
  goto :fail
)
for /f %%v in ('node -p "process.versions.node"') do set "NODEV=%%v"
echo [start] Node v%NODEV% detected.
node -e "const p=process.versions.node.split('.').map(Number); const ok=p[0]>22||(p[0]===22&&(p[1]>12||(p[1]===12&&p[2]>=0))); if(!ok){console.error('Node 22.12.0 or newer is required, found '+process.versions.node);process.exit(1)}"
if errorlevel 1 (
  set "FAILMSG=Node.js 22.12 or newer is required. Install the current LTS from https://nodejs.org and re-run start.bat."
  goto :fail
)

:: --- 2. Dependencies ------------------------------------------------------
echo [start] Step 2/5: checking dependencies...
if not exist "package.json" (
  set "FAILMSG=package.json is missing. Run start.bat from the project folder that contains package.json."
  goto :fail
)
if not exist "node_modules\.package-lock.json" goto :repair
if not exist "node_modules\electron\package.json" goto :repair
if not exist "node_modules\vite\package.json" goto :repair
if not exist "node_modules\electron-updater\package.json" goto :repair
call npm ls --depth=0 >nul 2>nul
if errorlevel 1 goto :repair
goto :runtime

:repair
echo [start] Dependencies are missing or incomplete. Repairing now...
if exist "package-lock.json" (
  call npm ci --include=dev --no-audit --no-fund --loglevel=error
) else (
  call npm install --include=dev --no-audit --no-fund --loglevel=error
)
if errorlevel 1 (
  echo [start] Automatic repair failed. Retrying with npm install...
  call npm install --include=dev --no-audit --no-fund --loglevel=error
  if errorlevel 1 (
    set "FAILMSG=Dependency repair failed. Check your internet connection or proxy, then run install.bat."
    goto :fail
  )
)
if not exist "node_modules\electron\package.json" (
  set "FAILMSG=Electron is still missing after repair. Delete node_modules and run install.bat."
  goto :fail
)
if not exist "node_modules\vite\package.json" (
  set "FAILMSG=Vite is still missing after repair. Delete node_modules and run install.bat."
  goto :fail
)
if not exist "node_modules\electron-updater\package.json" (
  set "FAILMSG=electron-updater is still missing after repair. Delete node_modules and run install.bat."
  goto :fail
)
echo [start] Dependencies repaired.

:: --- 3. Electron runtime --------------------------------------------------
:runtime
echo [start] Step 3/5: preparing the Electron runtime...
if not exist "node_modules\electron\dist\electron.exe" (
  echo [start] First launch downloads the Electron runtime, about 150 MB once.
)
node -e "const p=require('electron'); require('fs').accessSync(p); console.log('[start] Electron runtime ready.')"
if errorlevel 1 (
  set "FAILMSG=The Electron runtime is not ready. Check your connection, delete node_modules\electron, then run install.bat."
  goto :fail
)

:: --- 4. Build -------------------------------------------------------------
echo [start] Step 4/5: building the panel...
call npm run build
if errorlevel 1 (
  set "FAILMSG=The panel build failed. Read the error above, then run install.bat."
  goto :fail
)
if not exist "dist\renderer\chat.html" (
  set "FAILMSG=The build finished but dist\renderer\chat.html is missing. Run install.bat."
  goto :fail
)

:: --- 5. Launch ------------------------------------------------------------
echo [start] Step 5/5: launching the overlay...
echo [start] Keep this window open while the overlay runs.
echo [start] Quit from the tray menu or the panel X button.
echo.
node electron\launch.js
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" goto :runfail
echo.
echo [start] Overlay closed cleanly.
echo [start] If another copy was already running, that window was focused.
echo [start] Run start.bat again to relaunch.
if not defined HIKASHA_NO_PAUSE pause
endlocal
exit /b 0

:runfail
echo.
echo [start] The app exited with code %CODE%.
set "FAILMSG=The overlay exited with code %CODE%. Read the error above, then run install.bat to repair dependencies."
goto :fail

:fail
echo.
echo [start] ERROR: %FAILMSG%
echo [start] Logs are usually in "%APPDATA%\Hikasha Chat\logs" or "%APPDATA%\chat-overlay-frontend\logs".
if not defined HIKASHA_NO_PAUSE pause
endlocal
exit /b 1
