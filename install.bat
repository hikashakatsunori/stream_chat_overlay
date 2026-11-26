@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Hikasha Chat - Installer
set "FAILMSG="

echo ============================================
echo  Hikasha Chat - Stream Chat Overlay
echo  First-time installer
echo ============================================
echo.

:: --- 1. Node.js and npm ---------------------------------------------------
echo [install] Step 1/6: checking Node.js and npm...
where node >nul 2>nul
if errorlevel 1 (
  set "FAILMSG=Node.js was not found on PATH. Install Node.js 22.12 or newer from https://nodejs.org and re-run install.bat."
  goto :fail
)
where npm >nul 2>nul
if errorlevel 1 (
  set "FAILMSG=npm was not found on PATH. Reinstall Node.js 22.12 or newer from https://nodejs.org."
  goto :fail
)
for /f %%v in ('node -p "process.versions.node"') do set "NODEV=%%v"
echo [install] Node v%NODEV% detected.
node -e "const p=process.versions.node.split('.').map(Number); const ok=p[0]>22||(p[0]===22&&(p[1]>12||(p[1]===12&&p[2]>=0))); if(!ok){console.error('Node 22.12.0 or newer is required, found '+process.versions.node);process.exit(1)}"
if errorlevel 1 (
  set "FAILMSG=Node.js 22.12 or newer is required. Install the current LTS from https://nodejs.org and re-run install.bat."
  goto :fail
)

:: --- 2. Project files -----------------------------------------------------
echo [install] Step 2/6: checking project files...
if not exist "package.json" (
  set "FAILMSG=package.json is missing. Run install.bat from the project folder that contains package.json."
  goto :fail
)
if not exist "package-lock.json" (
  echo [install] WARNING: package-lock.json is missing. Falling back to npm install.
)

:: --- 3. Dependencies ------------------------------------------------------
echo [install] Step 3/6: installing dependencies.
if exist "package-lock.json" (
  echo [install] Running npm ci, a clean lockfile-exact install...
  call npm ci --include=dev --no-audit --no-fund --loglevel=error
) else (
  echo [install] package-lock.json is missing. Running npm install...
  call npm install --include=dev --no-audit --no-fund --loglevel=error
)
if errorlevel 1 (
  echo [install] That install attempt failed. Retrying with npm install...
  call npm install --include=dev --no-audit --no-fund --loglevel=error
  if errorlevel 1 (
    set "FAILMSG=Dependency install failed. Check your internet connection or proxy, delete node_modules, then re-run install.bat."
    goto :fail
  )
)

if not exist "node_modules\electron\package.json" (
  set "FAILMSG=Electron is missing after install. Delete node_modules and re-run install.bat."
  goto :fail
)
if not exist "node_modules\vite\package.json" (
  set "FAILMSG=Vite is missing after install. Delete node_modules and re-run install.bat."
  goto :fail
)
if not exist "node_modules\electron-updater\package.json" (
  set "FAILMSG=electron-updater is missing after install. Delete node_modules and re-run install.bat."
  goto :fail
)
echo [install] Dependencies installed.

:: --- 4. Electron runtime --------------------------------------------------
echo [install] Step 4/6: preparing the Electron runtime.
echo [install] The first setup may download about 150 MB once. Later runs use the local cache.
node -e "const p=require('electron'); require('fs').accessSync(p); console.log('[install] Electron runtime ready.')"
if errorlevel 1 (
  set "FAILMSG=The Electron runtime could not be prepared. Check your connection, delete node_modules\electron, then re-run install.bat."
  goto :fail
)

:: --- 5. Build -------------------------------------------------------------
echo [install] Step 5/6: building the panel...
call npm run build
if errorlevel 1 (
  set "FAILMSG=The panel build failed. Read the error above, then re-run install.bat."
  goto :fail
)
if not exist "dist\renderer\chat.html" (
  set "FAILMSG=The build finished but dist\renderer\chat.html is missing. Delete dist and re-run install.bat."
  goto :fail
)
if not exist "dist\renderer\splash.html" (
  set "FAILMSG=The build finished but dist\renderer\splash.html is missing. Delete dist and re-run install.bat."
  goto :fail
)
if not exist "public\chat-logo.png" (
  echo [install] WARNING: public\chat-logo.png is missing. The splash logo will be blank.
)
if not exist "public\tray-icon.png" (
  echo [install] WARNING: public\tray-icon.png is missing. The tray will use a fallback dot.
)

:: --- 6. Done --------------------------------------------------------------
echo [install] Step 6/6: setup verified.
echo.
echo ============================================
echo  Install complete.
echo.
echo  1. Run start.bat to launch the overlay.
echo  2. Click the gear icon in the panel.
echo  3. Paste your BotRix widget URL and press Enter.
echo  4. Click Reload in the settings panel.
echo ============================================
echo.
echo [install] For developers: npm run lint, npm test, npm run audit
if not defined HIKASHA_NO_PAUSE pause
endlocal
exit /b 0

:fail
echo.
echo [install] ERROR: %FAILMSG%
echo [install] Fix the issue above, then run install.bat again.
if not defined HIKASHA_NO_PAUSE pause
endlocal
exit /b 1
