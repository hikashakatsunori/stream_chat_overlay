/**
 * End-to-end tests: boot the REAL app (Electron + built renderer) under
 * Playwright, against an isolated userData dir, and drive the actual UI
 * through the settings flow and the close path.
 * Runner: plain Node — `npm test` executes this after the production build.
 * Convention: fail fast with non-zero exit + named assertion.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hikasha-e2e-'));
let app = null;
let n = 0;
function t(name) {
  n += 1;
  console.log(`ok ${n} - ${name}`);
}

async function launch() {
  return electron.launch({
    args: [path.join(__dirname, '..')],
    env: { ...process.env, OVERLAY_USER_DATA: userData },
  });
}

/** The panel is the SECOND window (the splash opens first, is dismissible
 * by a 2.5s timer, and the panel is created hidden behind it) — poll for
 * the chat.html window. */
async function panelWindow(electronApp, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    for (const w of electronApp.windows()) {
      if (w.url().includes('chat.html')) return w;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('panel window never opened');
}

/** The panel appears after the splash period; give the UI a beat before
 * interacting (the window is created hidden behind the splash intro). */
async function panelReady(win) {
  await win.waitForLoadState('domcontentloaded');
  await win.waitForSelector('#chat-panel', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 3000)); // splash dismissal (2.5s) + reveal
}

async function main() {
  // 1. first run: setup card with the gear-icon guidance
  app = await launch();
  const win = await panelWindow(app);
  await panelReady(win);
  await win.waitForSelector('#setup-card.show', { timeout: 10000 });
  assert.equal(await win.textContent('#setup-card .t'), 'No widget URL saved');
  t('first run shows the setup card pointing at the gear icon');

  // 2. no status dot; all header icons are visible; notices use toasts.
  assert.equal(await win.locator('#chat-status').count(), 0);
  assert.equal(await win.isVisible('#chat-header .title .label'), true);
  assert.equal(await win.isVisible('#viewer-counts'), true);
  await app.evaluate(({ BrowserWindow }) => {
    const panel = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('chat.html'),
    );
    if (panel) {
      panel.webContents.send('chat:notice', {
        where: 'e2e',
        message: 'Test notification',
      });
    }
  });
  await win.waitForSelector('.toast.show', { timeout: 5000 });
  assert.equal((await win.textContent('.toast .toast-text')).trim(), 'Test notification');
  await win.click('.toast .toast-close');
  await win.waitForFunction(() => !document.querySelector('.toast'));
  t('no status dot; header icons stay visible; notices use in-panel toasts');

  // 3. mouse pass-through control exists and is off on a fresh profile.
  // (The OS-global registration itself is covered by the behavioral test;
  // asserting it here would make E2E depend on the host's hotkey table.)
  assert.equal(await win.isVisible('#btn-click-through'), true);
  assert.equal(await win.getAttribute('#btn-click-through', 'aria-pressed'), 'false');
  assert.equal(await win.isVisible('#btn-download'), true);
  t('mouse pass-through button is present and off by default');

  // 4. the window cannot shrink below the width that wraps the header
  // tightly; wide panels center the group and no icon is ever hidden.
  await app.evaluate(({ BrowserWindow }) => {
    const panel = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('chat.html'),
    );
    if (panel) {
      // Worst-case counts: icons must survive even when the numbers are
      // wider than the available pills.
      panel.webContents.send('chat:viewers', {
        total: 1234567,
        twitch: 1234567,
        youtube: 7654321,
        kick: 9999999,
        error: false,
        stale: false,
      });
      panel.setSize(240, 320); // must be clamped to the minimum
    }
  });
  await new Promise((r) => setTimeout(r, 500));
  const layout = await win.evaluate(() => {
    const panel = document.getElementById('chat-panel').getBoundingClientRect();
    const actions = document.querySelector('.header-actions').getBoundingClientRect();
    const label = document.querySelector('#chat-header .title .label');
    const viewer = document.getElementById('viewer-counts');
    const pills = [...document.querySelectorAll('#viewer-counts .vc')].map((el) => {
      const r = el.getBoundingClientRect();
      const icon = el.querySelector('svg').getBoundingClientRect();
      return { width: r.width, right: r.right, iconWidth: icon.width };
    });
    const buttons = ['btn-transparent', 'btn-pin', 'btn-click-through', 'btn-download', 'btn-settings', 'btn-close'].map((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { id, right: r.right };
    });
    const close = document.getElementById('btn-close').getBoundingClientRect();
    const title = document.querySelector('#chat-header .title').getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      panelLeft: panel.left,
      panelRight: panel.right,
      actionsLeft: actions.left,
      titleLeft: title.left,
      closeRight: close.right,
      labelVisible: getComputedStyle(label).display !== 'none',
      viewerVisible: getComputedStyle(viewer).display !== 'none',
      pills,
      buttons,
      hasStatusDot: Boolean(document.getElementById('chat-status')),
    };
  });
  assert.ok(layout.innerWidth >= 370, `window did not clamp to the minimum: ${layout.innerWidth}`);
  assert.equal(layout.hasStatusDot, false);
  assert.equal(layout.labelVisible, true);
  assert.equal(layout.viewerVisible, true);
  assert.equal(layout.pills.length, 3);
  for (const p of layout.pills) {
    assert.ok(p.width > 0, 'viewer pill hidden');
    assert.ok(p.iconWidth > 0, 'viewer icon hidden');
    assert.ok(p.right <= layout.actionsLeft + 0.5, 'viewer pill overlaps controls');
  }
  assert.ok(layout.titleLeft >= layout.panelLeft, 'title clipped on the left');
  for (const b of layout.buttons) {
    assert.ok(b.right <= layout.panelRight + 0.5, `${b.id} clipped at minimum width`);
  }
  const lastPillRight = layout.pills[layout.pills.length - 1].right;
  assert.ok(
    layout.actionsLeft - lastPillRight <= 12,
    `control group gap is too wide: ${layout.actionsLeft - lastPillRight}px`,
  );
  assert.ok(
    Math.abs((layout.titleLeft - layout.panelLeft) - (layout.panelRight - layout.closeRight)) <= 2.5,
    'header group is not centered at minimum width',
  );
  await win.click('#btn-settings');
  await win.waitForSelector('#settings-panel.show', { timeout: 5000 });
  const buttonLayout = await win.evaluate(() => {
    const panel = document.getElementById('settings-panel').getBoundingClientRect();
    return ['btn-save-url', 'btn-change-url', 'btn-reload-widget'].map((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { right: r.right, bottom: r.bottom, panelRight: panel.right, panelBottom: panel.bottom };
    });
  });
  for (const b of buttonLayout) {
    assert.ok(b.right <= b.panelRight + 0.5, 'settings button clipped horizontally');
    assert.ok(b.bottom <= b.panelBottom + 0.5, 'settings button clipped vertically');
  }
  await win.press('#settings-url', 'Escape');
  await app.evaluate(({ BrowserWindow }) => {
    const panel = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('chat.html'),
    );
    if (panel) panel.setSize(520, 480);
  });
  await new Promise((r) => setTimeout(r, 400));
  const wideLayout = await win.evaluate(() => {
    const label = document.querySelector('#chat-header .title .label');
    const viewer = document.getElementById('viewer-counts');
    const panel = document.getElementById('chat-panel').getBoundingClientRect();
    const actions = document.querySelector('.header-actions').getBoundingClientRect();
    const title = document.querySelector('#chat-header .title').getBoundingClientRect();
    const close = document.getElementById('btn-close').getBoundingClientRect();
    const pills = [...document.querySelectorAll('#viewer-counts .vc')];
    const lastPill = pills[pills.length - 1].getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      labelVisible: getComputedStyle(label).display !== 'none',
      viewerVisible: getComputedStyle(viewer).display !== 'none',
      panelLeft: panel.left,
      panelRight: panel.right,
      titleLeft: title.left,
      closeRight: close.right,
      actionsLeft: actions.left,
      lastPillRight: lastPill.right,
      hasStatusDot: Boolean(document.getElementById('chat-status')),
    };
  });
  assert.ok(wideLayout.innerWidth >= 500);
  assert.equal(wideLayout.labelVisible, true);
  assert.equal(wideLayout.viewerVisible, true);
  assert.equal(wideLayout.hasStatusDot, false);
  assert.ok(
    wideLayout.actionsLeft - wideLayout.lastPillRight <= 12,
    'wide window gap between icon groups is too large',
  );
  assert.ok(
    Math.abs(
      (wideLayout.titleLeft - wideLayout.panelLeft) -
        (wideLayout.panelRight - wideLayout.closeRight),
    ) <= 2.5,
    'header group is not centered when the panel is widened',
  );
  t('minimum width wraps the header; wider panels center the icon group');

  // 5. pin + theme toggles update the UI and persist to disk
  assert.equal(
    await win.evaluate(() =>
      document.getElementById('btn-pin').classList.contains('active'),
    ),
    true,
  );
  await win.click('#btn-pin');
  await win.click('#btn-transparent');
  assert.equal(
    await win.evaluate(() =>
      document.getElementById('btn-pin').classList.contains('active'),
    ),
    false,
  );
  assert.equal(
    await win.evaluate(() => document.body.classList.contains('opaque')),
    true,
  );
  const statePath = path.join(userData, 'overlay-state.json');
  let savedState = null;
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(statePath)) {
      try {
        const s = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        if (s.chat && s.chat.pinned === false && s.chat.transparent === false) {
          savedState = s;
          break;
        }
      } catch {
        /* mid-write / not yet complete: retry */
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(savedState, 'pin/theme state was never persisted');
  assert.equal(savedState.chat.pinned, false);
  assert.equal(savedState.chat.transparent, false);
  t('pin/theme toggles update the panel and persist to overlay-state.json');

  // 6. gear opens the settings panel; Escape closes it and restores focus
  await win.click('#btn-settings');
  await win.waitForSelector('#settings-panel.show', { timeout: 5000 });
  await win.press('#settings-url', 'Escape');
  await win.waitForFunction(
    () => !document.getElementById('settings-panel').classList.contains('show'),
  );
  assert.equal(
    await win.evaluate(() => document.activeElement && document.activeElement.id),
    'btn-settings',
  );
  t('gear opens the settings panel; Escape closes it and restores focus');

  // 7. reopen; empty field + Enter → the exact first-run error
  await win.click('#btn-settings');
  await win.waitForSelector('#settings-panel.show', { timeout: 5000 });
  await win.click('#btn-save-url');
  assert.match(await win.textContent('#settings-msg'), /Enter a BotRix widget URL first/);
  t('saving an empty field shows the exact error');

  // 8. invalid URL + Enter → per-code rejection
  await win.fill('#settings-url', 'http://botrix.live/?bid=X');
  await win.click('#btn-save-url');
  assert.match(await win.textContent('#settings-msg'), /not saved/i);
  t('invalid URL is rejected with its code message');

  // 9. valid URL + Enter → canonicalized + persisted to the settings db
  await win.fill('#settings-url', 'https://botrix.live/widgets/chat/?bid=E2EBID1&theme=default');
  await win.press('#settings-url', 'Enter');
  assert.match(await win.textContent('#settings-msg'), /Saved/);
  const cfgPath = path.join(userData, 'botrix-config.json');
  for (let i = 0; i < 30 && !fs.existsSync(cfgPath); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  assert.equal(cfg.widgetUrl, 'https://botrix.live/widgets/chat/?bid=E2EBID1');
  t('valid URL is canonicalized and persisted to the settings db');

  // 10. Reload applies the saved URL immediately — no app restart
  await win.evaluate(() => document.getElementById('btn-reload-widget').click());
  await win.waitForFunction(
    () => {
      const f = document.getElementById('chat-frame');
      return (
        f &&
        f.getAttribute('src') === 'https://botrix.live/widgets/chat/?bid=E2EBID1'
      );
    },
    { timeout: 15000 },
  );
  assert.equal(await win.isVisible('#settings-panel'), false);
  assert.equal(await win.isVisible('#setup-card'), false);
  t('Reload applies the saved URL and reloads the widget without a restart');

  // 11. Change loads the saved URL back into the field
  await win.click('#btn-settings');
  await win.waitForSelector('#settings-panel.show', { timeout: 5000 });
  await win.fill('#settings-url', '');
  await win.click('#btn-change-url');
  assert.equal(
    await win.inputValue('#settings-url'),
    'https://botrix.live/widgets/chat/?bid=E2EBID1',
  );
  t('Change button loads the saved URL into the field');

  // 12. Escape closes the settings panel
  await win.press('#settings-url', 'Escape');
  await win.waitForFunction(
    () => !document.getElementById('settings-panel').classList.contains('show'),
  );
  t('Escape closes the settings panel');

  await app.close();
  app = null;

  // 13. restart: saved URL and persisted pin/theme are restored
  app = await launch();
  const win2 = await panelWindow(app);
  await panelReady(win2);
  await win2.waitForFunction(
    () => {
      const f = document.getElementById('chat-frame');
      return (
        f &&
        f.getAttribute('src') === 'https://botrix.live/widgets/chat/?bid=E2EBID1'
      );
    },
    { timeout: 15000 },
  );
  assert.equal(
    await win2.evaluate(() => document.body.classList.contains('opaque')),
    true,
  );
  assert.equal(
    await win2.evaluate(() =>
      document.getElementById('btn-pin').classList.contains('active'),
    ),
    false,
  );
  t('restart restores the saved URL, theme, and pin state');

  // 14. the X button quits the ENTIRE app (no survivors)
  let exited = false;
  app.process().once('exit', () => {
    exited = true;
  });
  await win2.click('#btn-close');
  for (let i = 0; i < 60 && !exited; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(exited, 'X button terminates the whole process');
  t('X button terminates the app completely');
  app = null;

  fs.rmSync(userData, { recursive: true, force: true });
  console.log(`\n# e2e pass ${n}`);
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[e2e] FAILED:', err && (err.stack || err.message));
  if (app) await app.close().catch(() => {});
  process.exit(1);
});
