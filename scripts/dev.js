/**
 * Development runner: starts the Vite dev server (HMR for chat.js/HTML)
 * and launches Electron against it. The main process honors
 * VITE_DEV_SERVER_URL only in unpackaged runs, so production behaviour is
 * untouched.
 *
 * Usage: npm run dev
 * Exit: closing the app (X / tray Quit) stops Vite and this process too.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const appRoot = path.join(__dirname, '..');

let server = null;
let child = null;
let shuttingDown = false;

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (child && !child.killed) child.kill();
  } catch {
    /* already gone */
  }
  try {
    if (server) await server.close();
  } catch {
    /* already closed */
  }
  process.exit(code);
}

async function main() {
  let createServer;
  try {
    // Vite 7 is ESM-only: a dynamic import works from this CJS file.
    ({ createServer } = await import('vite'));
  } catch (err) {
    console.error('[dev] Vite is not installed:', err.message);
    console.error('[dev] Run npm install first.');
    process.exit(1);
  }

  try {
    server = await createServer({
      configFile: path.join(appRoot, 'vite.config.js'),
      root: appRoot,
    });
    await server.listen();
  } catch (err) {
    console.error('[dev] failed to start the Vite dev server:', err.message);
    process.exit(1);
  }

  const url = server.resolvedUrls && server.resolvedUrls.local && server.resolvedUrls.local[0];
  if (!url) {
    console.error('[dev] Vite started but reported no local URL.');
    await shutdown(1);
    return;
  }
  console.log(`[dev] Vite ready at ${url}`);

  let electronExe;
  try {
    electronExe = require('electron');
  } catch (err) {
    console.error('[dev] Electron is not installed:', err.message);
    await shutdown(1);
    return;
  }

  const env = { ...process.env, VITE_DEV_SERVER_URL: url };
  // Electron treats a present ELECTRON_RUN_AS_NODE (even empty) as plain
  // Node; strip it exactly like electron/launch.js does.
  delete env.ELECTRON_RUN_AS_NODE;

  console.log('[dev] launching Electron...');
  child = spawn(electronExe, [appRoot], { stdio: 'inherit', env });

  child.on('error', (err) => {
    console.error('[dev] Electron process error:', err.message);
    shutdown(1);
  });
  child.on('close', (code, signal) => {
    if (signal && !shuttingDown) {
      console.error(`[dev] Electron terminated by signal ${signal}`);
      shutdown(1);
      return;
    }
    shutdown(code ?? 0);
  });

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
}

main().catch((err) => {
  console.error('[dev] unexpected failure:', err && (err.stack || err.message));
  shutdown(1);
});
