/**
 * Behavioral tests for the main-process settings-db feature (chat:save-url,
 * config diagnosis) — runs the REAL electron/main.js against a stubbed
 * Electron module and a real temp settings db on disk.
 * Runner: plain Node (no deps) — part of `npm test`.
 * Convention: fail fast with non-zero exit + named assertion.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

let n = 0;
function t(name, fn) {
  fn();
  n += 1;
  console.log(`ok ${n} - ${name}`);
}

// --- Electron stub (must be in require.cache BEFORE main.js loads) ---

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hikasha-test-'));
const ipcHandlers = new Map();
const ipcListeners = new Map();
const createdChatWindows = [];
const registeredShortcuts = [];
const shortcutCallbacks = new Map();
const openedExternal = [];

const stubElectron = {
  app: {
    isPackaged: false,
    // electron-updater's app adapter calls these at import time
    getVersion: () => '0.0.0',
    getAppPath: () => path.join(__dirname, '..'),
    name: 'chat-overlay-frontend',
    getPath: (name) => (name === 'userData' ? userDataDir : path.join(os.tmpdir(), 'hikasha-fake-' + name)),
    requestSingleInstanceLock: () => true,
    on: () => {},
    whenReady: () => Promise.resolve(),
    setAppUserModelId: () => {},
    quit: () => {},
    exit: () => {},
  },
  ipcMain: {
    handle: (ch, fn) => ipcHandlers.set(ch, fn),
    on: (ch, fn) => ipcListeners.set(ch, fn),
  },
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
  net: { fetch: () => Promise.reject(new Error('no network under test')) },
  Tray: class {
    setToolTip() {}
    setContextMenu() {}
    destroy() {}
  },
  Menu: { buildFromTemplate: () => ({}) },
  shell: {
    openExternal: async (url) => {
      openedExternal.push(url);
    },
  },
  globalShortcut: {
    register: (accelerator, callback) => {
      registeredShortcuts.push(accelerator);
      shortcutCallbacks.set(accelerator, callback);
      return true;
    },
    unregisterAll: () => {},
  },
  nativeImage: {
    createFromPath: () => ({ isEmpty: () => true, resize: () => ({}) }),
    createFromBitmap: () => ({}),
    createEmpty: () => ({}),
  },
};

class FakeWebContents {
  constructor() {
    this._handlers = {};
    this.reloadCount = 0;
    // STABLE main-frame identity: real sender-gating compares the IPC
    // event's senderFrame against this exact object.
    this.mainFrame = { url: 'file:///test/chat.html', frames: [] };
  }
  on(ev, fn) {
    this._handlers[ev] = fn;
  }
  once(ev, fn) {
    this._handlers[ev] = fn;
  }
  send() {}
  reload() {
    this.reloadCount += 1;
  }
  setWindowOpenHandler() {}
  get session() {
    return { setPermissionRequestHandler() {} };
  }
  executeJavaScript() {
    return Promise.resolve(undefined);
  }
}

class FakeBrowserWindow {
  constructor(opts) {
    this.webContents = new FakeWebContents();
    this.opts = opts;
    this.destroyed = false;
    this.visible = false;
    // only the panel window carries the preload bridge (it lives under
    // webPreferences, not at the top level)
    if (opts && opts.webPreferences && opts.webPreferences.preload) {
      createdChatWindows.push(this);
    }
  }
  on() {}
  once() {}
  setAlwaysOnTop() {}
  isDestroyed() {
    return this.destroyed;
  }
  isVisible() {
    return this.visible;
  }
  hide() {
    this.visible = false;
  }
  show() {
    this.visible = true;
  }
  setIgnoreMouseEvents(value) {
    this.ignoreMouseEvents = value;
  }
  setFocusable(value) {
    this.focusable = value;
  }
  blur() {
    this.blurred = true;
  }
  destroy() {
    this.destroyed = true;
  }
  close() {}
  focus() {}
  restore() {}
  isMinimized() {
    return false;
  }
  getPosition() {
    return [0, 0];
  }
  getSize() {
    return [340, 480];
  }
  loadFile() {
    return Promise.resolve(true);
  }
  loadURL() {
    return Promise.resolve(true);
  }
  setSkipTaskbar() {}
}
stubElectron.BrowserWindow = FakeBrowserWindow;

// A realistic IPC event from the panel's main frame (what the real
// ipcMain.handle contract passes as the first argument).
function panelEvent() {
  const win = createdChatWindows[createdChatWindows.length - 1];
  return { senderFrame: win ? win.webContents.mainFrame : null };
}

const electronPath = require.resolve('electron');
const fakeModule = new Module('electron-stub', null);
fakeModule.filename = electronPath;
fakeModule.loaded = true;
fakeModule.exports = stubElectron;
require.cache[electronPath] = fakeModule;

// --- load the REAL main process ---

const mainPath = path.join(__dirname, '..', 'electron', 'main.js');
require(mainPath);

// Drain microtasks + a macrotask so whenReady().then (boot) has run and
// registerIpc() has registered the handlers.
async function settle(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
    await new Promise((r) => setImmediate(r));
  }
}

const configFile = path.join(userDataDir, 'botrix-config.json');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await settle();

  t('boot registers the settings-db IPC handlers', () => {
    assert.equal(typeof ipcHandlers.get('chat:get-config-status'), 'function');
    assert.equal(typeof ipcHandlers.get('chat:save-url'), 'function');
    assert.equal(typeof ipcHandlers.get('chat:get-widget-url'), 'function');
    assert.equal(typeof ipcHandlers.get('chat:get-viewers'), 'function');
    assert.equal(typeof ipcHandlers.get('chat:reload-widget'), 'function');
    assert.equal(typeof ipcHandlers.get('chat:get-state'), 'function');
    assert.equal(typeof ipcHandlers.get('chat:toggle-click-through'), 'function');
    assert.equal(typeof ipcHandlers.get('chat:open-releases'), 'function');
    // Ctrl+Win+I is Electron's Control+Super+I; registration is required
    // for the mode to be recoverable while the mouse is ignored.
    assert.ok(registeredShortcuts.includes('Control+Super+I'));
    assert.equal(typeof shortcutCallbacks.get('Control+Super+I'), 'function');
    // The header must never hide its logo/viewer/action icons: the window
    // is created at (and cannot shrink below) the minimum fitting width.
    const win = createdChatWindows[0];
    assert.ok(win, 'panel window created');
    assert.equal(win.opts.minWidth, 380);
    assert.ok(win.opts.width >= 380);
  });

  // Download button: the main process (not the renderer) owns the URL.
  await (async () => {
    openedExternal.length = 0;
    const ok = await ipcHandlers.get('chat:open-releases')(panelEvent());
    assert.equal(ok, true);
    assert.deepEqual(openedExternal, [
      'https://github.com/hikashakatsunori/stream_chat_overlay/releases/latest',
    ]);
  })();
  n += 1;
  console.log(`ok ${n} - download button opens the fixed GitHub releases URL`);

  await (async () => {
    await settle();
    const status = await ipcHandlers.get('chat:get-config-status')(panelEvent());
    assert.equal(status.code, 'missing');
    assert.equal(status.url, null);
    assert.equal(await ipcHandlers.get('chat:get-widget-url')(panelEvent()), null);
    // no poll has produced a payload yet -> null, never a fabricated 0s row
    assert.equal(await ipcHandlers.get('chat:get-viewers')(panelEvent()), null);
    const st = await ipcHandlers.get('chat:get-state')(panelEvent());
    assert.deepEqual(st, { pinned: true, transparent: true, clickThrough: false });
  })();
  n += 1;
  console.log(`ok ${n} - empty db diagnoses as 'missing' (silent poller)`);

  await (async () => {
    const res = await ipcHandlers.get('chat:save-url')(
      panelEvent(),
      'https://botrix.live/widgets/chat/?bid=TESTBID1&theme=default&messageSound=0',
    );
    assert.equal(res.ok, true);
    assert.equal(res.code, 'ok');
    assert.equal(res.bid, 'TESTBID1');
    assert.equal(res.url, 'https://botrix.live/widgets/chat/?bid=TESTBID1');
    // the db holds the CANONICAL url only (theme/sound dropped at save time)
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    assert.deepEqual(cfg, { widgetUrl: 'https://botrix.live/widgets/chat/?bid=TESTBID1' });
  })();
  n += 1;
  console.log(`ok ${n} - save validates, canonicalizes, and persists to the db`);

  await (async () => {
    const unchanged = await ipcHandlers.get('chat:save-url')(
      panelEvent(),
      'https://botrix.live/widgets/chat/?bid=TESTBID1',
    );
    assert.equal(unchanged.ok, true);
    assert.equal(unchanged.code, 'unchanged');
    const status = await ipcHandlers.get('chat:get-config-status')(panelEvent());
    assert.equal(status.code, 'ok');
    assert.equal(status.bid, 'TESTBID1');
    assert.equal(
      await ipcHandlers.get('chat:get-widget-url')(panelEvent()),
      'https://botrix.live/widgets/chat/?bid=TESTBID1',
    );
  })();
  n += 1;
  console.log(`ok ${n} - re-saving the same URL is 'unchanged'; every-run read returns it`);

  // chat:reload-widget applies the saved URL to the RUNNING session:
  // it restarts the poller and reloads the panel page together.
  await (async () => {
    const win = createdChatWindows[createdChatWindows.length - 1];
    assert.ok(win, 'panel window exists');
    assert.equal(win.webContents.reloadCount, 0);
    const res = await ipcHandlers.get('chat:reload-widget')(panelEvent());
    assert.deepEqual(res, {
      ok: true,
      code: 'ok',
      url: 'https://botrix.live/widgets/chat/?bid=TESTBID1',
      bid: 'TESTBID1',
    });
    await wait(200); // reload is deferred so the IPC reply can land first
    assert.equal(win.webContents.reloadCount, 1);
  })();
  n += 1;
  console.log(`ok ${n} - reload-widget restarts polling and reloads the panel`);

  await (async () => {
    const save = ipcHandlers.get('chat:save-url');
    const cases = [
      ['http://botrix.live/?bid=X', 'bad-protocol'],
      ['not a url', 'bad-protocol'],
      ['https://evil.com/?bid=X', 'bad-host'],
      ['https://botrix.live:8443/x?bid=X', 'bad-port'],
      [`https://botrix.live/x?bid=${'a'.repeat(2100)}`, 'too-long'],
      ['https://botrix.live/widgets/chat/', 'no-bid'],
      ['https://botrix.live/?bid=%ZZ', 'bad-bid'],
      ['https://botrix.live/?bid=a b', 'bad-bid'],
      ['   ', 'empty'],
      [null, 'missing'],
      [undefined, 'missing'],
      [42, 'missing'],
    ];
    for (const [raw, want] of cases) {
      const res = await save(panelEvent(), raw);
      assert.equal(res.ok, false, JSON.stringify(raw));
      assert.equal(res.code, want, JSON.stringify(raw));
    }
    // a rejected save never touches the db
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    assert.equal(cfg.widgetUrl, 'https://botrix.live/widgets/chat/?bid=TESTBID1');
  })();
  n += 1;
  console.log(`ok ${n} - every invalid input is rejected with its code; db untouched`);

  // Non-panel senders (the remote widget iframe, other windows) must be
  // REJECTED from every privileged channel — guarded() rethrows, so the
  // invocation rejects.
  await (async () => {
    const save = ipcHandlers.get('chat:save-url');
    await assert.rejects(() => save({ senderFrame: null }, 'https://botrix.live/?bid=X'));
    await assert.rejects(() => save({ senderFrame: { url: 'https://evil.com/' } }, 'https://botrix.live/?bid=X'));
    await assert.rejects(() => save({}, 'https://botrix.live/?bid=X'));
    await assert.rejects(() => ipcHandlers.get('chat:get-config-status')({ senderFrame: null }));
    await assert.rejects(() => ipcHandlers.get('chat:get-viewers')({ senderFrame: null }));
    await assert.rejects(() => ipcHandlers.get('chat:reload-widget')({ senderFrame: null }));
    await assert.rejects(() => ipcHandlers.get('chat:toggle-click-through')({ senderFrame: null }));
    await assert.rejects(() => ipcHandlers.get('chat:open-releases')({ senderFrame: null }));
    await assert.rejects(() => ipcHandlers.get('chat:get-state')({ senderFrame: null }));
  })();
  n += 1;
  console.log(`ok ${n} - non-panel frames are rejected from privileged IPC`);

  // pin/theme toggles mutate the real state file (debounced atomic write)
  await (async () => {
    assert.equal(await ipcHandlers.get('chat:toggle-pin')(panelEvent()), false);
    assert.equal(
      await ipcHandlers.get('chat:toggle-transparent')(panelEvent()),
      true, // true = now OPAQUE (transparent off)
    );
    assert.deepEqual(await ipcHandlers.get('chat:get-state')(panelEvent()), {
      pinned: false,
      transparent: false,
      clickThrough: false,
    });
    await wait(400); // saveState debounce (250ms)
    const state = JSON.parse(
      fs.readFileSync(path.join(userDataDir, 'overlay-state.json'), 'utf8'),
    );
    assert.equal(state.chat.pinned, false);
    assert.equal(state.chat.transparent, false);
    assert.equal(state.chat.w, 340);
    assert.equal(state.chat.h, 480);
  })();
  n += 1;
  console.log(`ok ${n} - pin/theme toggles persist to overlay-state.json`);

  // mouse pass-through: shortcut/button/tray share one persisted flag and
  // the window really switches to ignore-mouse + non-focusable.
  await (async () => {
    const win = createdChatWindows[createdChatWindows.length - 1];
    assert.equal(win.ignoreMouseEvents, false);
    assert.equal(win.focusable, true);

    shortcutCallbacks.get('Control+Super+I')(); // the OS-global path
    assert.equal(
      (await ipcHandlers.get('chat:get-state')(panelEvent())).clickThrough,
      true,
    );
    assert.equal(win.ignoreMouseEvents, true);
    assert.equal(win.focusable, false);
    assert.equal(win.blurred, true);
    await wait(400);
    let state = JSON.parse(
      fs.readFileSync(path.join(userDataDir, 'overlay-state.json'), 'utf8'),
    );
    assert.equal(state.chat.clickThrough, true);

    assert.equal(
      await ipcHandlers.get('chat:toggle-click-through')(panelEvent()),
      false,
    );
    assert.equal(win.ignoreMouseEvents, false);
    assert.equal(win.focusable, true);
    await wait(400);
    state = JSON.parse(
      fs.readFileSync(path.join(userDataDir, 'overlay-state.json'), 'utf8'),
    );
    assert.equal(state.chat.clickThrough, false);
  })();
  n += 1;
  console.log(`ok ${n} - mouse pass-through persists and toggles window hit-testing`);

  // corrupt db -> sanitize to "no URL saved", never a crash
  fs.writeFileSync(configFile, '{ broken json!!');
  delete require.cache[mainPath];
  await (async () => {
    require(mainPath);
    await settle();
    const status = await ipcHandlers.get('chat:get-config-status')(panelEvent());
    assert.equal(status.code, 'missing');
    assert.equal(await ipcHandlers.get('chat:get-widget-url')(panelEvent()), null);
  })();
  n += 1;
  console.log(`ok ${n} - corrupt db file falls back to 'missing' (boot never crashes)`);

  fs.rmSync(userDataDir, { recursive: true, force: true });
  console.log(`\n# pass ${n}`);
  process.exit(0); // stubbed boot timers would otherwise hold the event loop
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
