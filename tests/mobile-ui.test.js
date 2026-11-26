/**
 * Mobile web UI test: runs the Android app's www/ shell inside a real
 * Chromium (Electron) at a phone-sized viewport against a local static
 * server. No Android emulator required; the Android wrapper itself is
 * verified separately via the signed APK manifest/signature checks.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');

let n = 0;
function t(name) {
  n += 1;
  console.log(`ok ${n} - ${name}`);
}

const www = path.join(__dirname, '..', 'mobile', 'www');
const tempApp = fs.mkdtempSync(path.join(os.tmpdir(), 'hikasha-mobile-app-'));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hikasha-mobile-data-'));
let server = null;
let app = null;

function startServer() {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };
  server = http.createServer((req, res) => {
    try {
      const parsed = new URL(req.url, 'http://127.0.0.1');
      let rel = decodeURIComponent(parsed.pathname);
      if (rel === '/') rel = '/index.html';
      const file = path.resolve(www, `.${rel}`);
      if (!file.startsWith(www + path.sep) && file !== path.join(www, 'index.html')) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      const body = fs.readFileSync(file);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function main() {
  fs.writeFileSync(
    path.join(tempApp, 'package.json'),
    JSON.stringify({ name: 'hikasha-mobile-ui-test', version: '1.0.0', main: 'main.js' }),
  );
  fs.writeFileSync(
    path.join(tempApp, 'main.js'),
    [
      "const { app, BrowserWindow } = require('electron');",
      "app.setPath('userData', process.env.MOBILE_TEST_USER_DATA);",
      'app.whenReady().then(() => {',
      '  const win = new BrowserWindow({',
      '    width: 390, height: 844, show: false,',
      '    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }',
      '  });',
      '  win.loadURL(process.env.MOBILE_TEST_URL);',
      '});',
      "app.on('window-all-closed', () => app.quit());",
    ].join('\n'),
  );

  const port = await startServer();
  const base = `http://127.0.0.1:${port}/`;
  app = await electron.launch({
    args: [tempApp],
    env: {
      ...process.env,
      MOBILE_TEST_URL: base,
      MOBILE_TEST_USER_DATA: userData,
    },
  });
  const page = await app.firstWindow();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.waitForSelector('#setup-view', { state: 'visible', timeout: 15000 });

  assert.equal(await page.isVisible('#chat-view'), false);
  assert.equal(await page.isVisible('#setup-view'), true);
  assert.match(await page.textContent('#tutorial'), /How to get your BotRix chat link/);
  assert.equal(await page.locator('#btn-pin').count(), 0);
  assert.equal(await page.locator('#btn-click-through').count(), 0);
  assert.equal(await page.locator('#chat-frame').count(), 1);
  t('first launch shows setup + tutorial with no desktop-only controls');

  await page.click('#connect-btn');
  assert.match(await page.textContent('#setup-msg'), /link field is empty/i);
  await page.fill('#widget-url', 'http://botrix.live/?bid=ABC');
  await page.click('#connect-btn');
  assert.match(await page.textContent('#setup-msg'), /https/);
  await page.fill('#widget-url', 'https://evil.example/?bid=ABC');
  await page.click('#connect-btn');
  assert.match(await page.textContent('#setup-msg'), /not a BotRix link/i);
  t('empty, non-https, and non-BotRix links are rejected with specific messages');

  await page.fill(
    '#widget-url',
    'https://botrix.live/widgets/chat/?bid=TESTBID1&theme=dark&messageSound=0',
  );
  await page.click('#connect-btn');
  await page.waitForSelector('#chat-view', { state: 'visible' });
  await page.waitForFunction(() => {
    const f = document.getElementById('chat-frame');
    return f && f.getAttribute('src') === 'https://botrix.live/widgets/chat/?bid=TESTBID1';
  });
  assert.equal(await page.isVisible('#setup-view'), false);
  assert.equal(
    await page.evaluate(() => localStorage.getItem('hikasha.mobile.widgetUrl.v1')),
    'https://botrix.live/widgets/chat/?bid=TESTBID1',
  );
  t('valid link opens the chat and stores the canonical bid-only URL');

  await page.reload();
  await page.waitForSelector('#chat-view', { state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => {
    const f = document.getElementById('chat-frame');
    return f && f.getAttribute('src') === 'https://botrix.live/widgets/chat/?bid=TESTBID1';
  });
  t('reload restores the saved chat without re-entering the link');

  await page.click('#settings-btn');
  await page.waitForSelector('#setup-view', { state: 'visible' });
  assert.equal(
    await page.inputValue('#widget-url'),
    'https://botrix.live/widgets/chat/?bid=TESTBID1',
  );
  assert.equal(await page.isVisible('#back-btn'), true);
  await page.click('#back-btn');
  await page.waitForSelector('#chat-view', { state: 'visible' });
  t('settings exposes the saved link and Back returns to chat');

  await page.click('#settings-btn');
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#clear-btn');
  await page.waitForSelector('#setup-view', { state: 'visible' });
  assert.equal(await page.evaluate(() => localStorage.getItem('hikasha.mobile.widgetUrl.v1')), null);
  assert.equal(await page.inputValue('#widget-url'), '');
  t('Disconnect clears the saved link and returns to setup');

  assert.deepEqual(pageErrors, []);
  await app.close();
  app = null;
  await new Promise((resolve) => server.close(resolve));
  server = null;
  fs.rmSync(tempApp, { recursive: true, force: true });
  fs.rmSync(userData, { recursive: true, force: true });
  console.log(`\n# mobile-ui pass ${n}`);
  process.exit(0);
}

main().catch(async (err) => {
  console.error('MOBILE UI TEST FAILED:', err && (err.stack || err.message));
  try {
    if (app) await app.close();
  } catch {}
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
  } catch {}
  try {
    fs.rmSync(tempApp, { recursive: true, force: true });
  } catch {}
  try {
    fs.rmSync(userData, { recursive: true, force: true });
  } catch {}
  process.exit(1);
});
