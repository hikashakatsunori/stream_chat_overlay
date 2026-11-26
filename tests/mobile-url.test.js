/**
 * Mobile URL validation tests: the Android WebView must enforce the same
 * BotRix-only rules as the desktop app. Runner: plain Node.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const U = require('../mobile/www/url.js');

let n = 0;
function t(name, fn) {
  fn();
  n += 1;
  console.log(`ok ${n} - ${name}`);
}

t('accepts botrix.live, www and subdomains over https', () => {
  for (const url of [
    'https://botrix.live/widgets/chat/?bid=ABC_-123',
    'https://www.botrix.live/widgets/chat/?bid=ABC_-123',
    'https://widgets.botrix.live/chat/?bid=ABC_-123',
  ]) {
    const d = U.diagnoseWidgetUrl(url);
    assert.equal(d.ok, true, url);
    assert.equal(d.bid, 'ABC_-123');
    assert.equal(d.code, 'ok');
  }
});

t('canonicalizes to path + ?bid= only and drops extra params', () => {
  const d = U.diagnoseWidgetUrl(
    'https://botrix.live/widgets/chat/?bid=ABC123&theme=dark&messageSound=0',
  );
  assert.equal(d.url, 'https://botrix.live/widgets/chat/?bid=ABC123');
  assert.deepEqual(U.diagnoseWidgetUrl('https://botrix.live?bid=ABC123').url, 'https://botrix.live/?bid=ABC123');
});

t('all failure modes get distinct codes and messages', () => {
  const cases = [
    [null, 'missing'],
    ['   ', 'empty'],
    [`https://botrix.live/?bid=${'x'.repeat(2100)}`, 'too-long'],
    ['http://botrix.live/?bid=ABC', 'bad-protocol'],
    ['not a url', 'bad-protocol'],
    ['https://botrix.live:8443/?bid=ABC', 'bad-port'],
    ['https://evil.com/?bid=ABC', 'bad-host'],
    ['https://evilbotrix.live/?bid=ABC', 'bad-host'],
    ['https://botrix.live/widgets/chat/', 'no-bid'],
    ['https://botrix.live/?bid=', 'bad-bid'],
    ['https://botrix.live/?bid=bad%20id', 'bad-bid'],
  ];
  for (const [raw, code] of cases) {
    const d = U.diagnoseWidgetUrl(raw);
    assert.equal(d.ok, false, String(raw));
    assert.equal(d.code, code, String(raw));
    assert.ok(d.message.length > 0);
    assert.equal(U.MESSAGES[code], d.message);
  }
});

t('bid extraction decodes and validates', () => {
  assert.equal(U.extractBotrixBid('https://botrix.live/?bid=A%2DB'), 'A-B');
  assert.equal(U.extractBotrixBid('https://botrix.live/?bid=nope%20bad'), null);
  assert.equal(U.extractBotrixBid('https://evil.com/?bid=abc'), null);
});

t('mobile shell has CSP, tutorial, and no desktop-only controls', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'mobile', 'www', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'mobile', 'www', 'app.js'), 'utf8');
  assert.ok(html.includes('frame-src https://botrix.live'));
  assert.ok(html.includes('How to get your BotRix chat link'));
  assert.ok(html.includes('id="widget-url"'));
  assert.ok(html.includes('id="chat-frame"'));
  assert.ok(html.includes('id="settings-btn"'));
  for (const forbidden of ['btn-pin', 'btn-click-through', 'setIgnoreMouseEvents']) {
    assert.equal(html.includes(forbidden), false, `desktop-only control leaked: ${forbidden}`);
  }
  assert.ok(app.includes('localStorage'));
  assert.ok(app.includes('diagnoseWidgetUrl'));
  assert.ok(app.includes('loadFrame'));
});

t('mobile package version matches the Android versionName', () => {
  const root = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'mobile', 'package.json'), 'utf8'));
  const gradle = fs.readFileSync(
    path.join(root, 'mobile', 'android', 'app', 'build.gradle'),
    'utf8',
  );
  assert.match(gradle, new RegExp(`versionName "${pkg.version.replace(/\./g, '\\.')}"`));
});
