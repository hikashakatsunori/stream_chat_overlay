/**
 * Hikasha Chat mobile URL rules.
 *
 * Kept dependency-free and dual-loadable (browser global + Node require) so
 * the Android WebView and the repo unit tests share exactly one validator.
 * Mirrors electron/state-utils.js: https + botrix.live hosts + ?bid= only.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HikashaUrl = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BOTRIX_WIDGET_HOSTS = ['botrix.live', 'www.botrix.live'];
  const MAX_WIDGET_URL_LEN = 2048;

  const MESSAGES = {
    missing: 'Paste the BotRix chat widget link to get started.',
    empty: 'The link field is empty.',
    'too-long': 'That link is too long. Copy the complete BotRix widget link again.',
    'bad-protocol': 'The link must start with https://.',
    'bad-port': 'Use the normal https link without a custom port.',
    'bad-host': 'That is not a BotRix link. Use a botrix.live chat widget link.',
    'no-bid': 'This link is missing the ?bid= session id. Copy the whole widget link.',
    'bad-bid': 'The ?bid= value looks invalid. Copy the widget link again from BotRix.',
    ok: '',
  };

  function isAllowedWidgetUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      if (BOTRIX_WIDGET_HOSTS.includes(host)) return true;
      return BOTRIX_WIDGET_HOSTS.some((h) => host.endsWith(`.${h}`));
    } catch {
      return false;
    }
  }

  function extractBotrixBid(url) {
    if (!url || !isAllowedWidgetUrl(url)) return null;
    const match = String(url).match(/[?&]bid=([^&#]+)/);
    if (!match) return null;
    let bid = match[1];
    try {
      bid = decodeURIComponent(bid);
    } catch {
      return null;
    }
    return /^[A-Za-z0-9_-]+$/.test(bid) ? bid : null;
  }

  function canonicalWidgetUrl(url, bid) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.endsWith('/')
        ? parsed.pathname
        : `${parsed.pathname}/`;
      const value = bid || extractBotrixBid(url) || '';
      return `${parsed.protocol}//${parsed.hostname}${path}?bid=${encodeURIComponent(value)}`;
    } catch {
      return url;
    }
  }

  function diagnoseWidgetUrl(raw) {
    if (raw === null || raw === undefined) {
      return { ok: false, code: 'missing', url: null, bid: null, message: MESSAGES.missing };
    }
    const value = String(raw).trim();
    if (!value) {
      return { ok: false, code: 'empty', url: null, bid: null, message: MESSAGES.empty };
    }
    if (value.length > MAX_WIDGET_URL_LEN) {
      return { ok: false, code: 'too-long', url: value, bid: null, message: MESSAGES['too-long'] };
    }
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return { ok: false, code: 'bad-protocol', url: value, bid: null, message: MESSAGES['bad-protocol'] };
    }
    if (parsed.protocol !== 'https:') {
      return { ok: false, code: 'bad-protocol', url: value, bid: null, message: MESSAGES['bad-protocol'] };
    }
    if (parsed.port && parsed.port !== '443') {
      return { ok: false, code: 'bad-port', url: value, bid: null, message: MESSAGES['bad-port'] };
    }
    if (!isAllowedWidgetUrl(value)) {
      return { ok: false, code: 'bad-host', url: value, bid: null, message: MESSAGES['bad-host'] };
    }
    const bid = extractBotrixBid(value);
    if (!/[?&]bid=/.test(value)) {
      return { ok: false, code: 'no-bid', url: value, bid: null, message: MESSAGES['no-bid'] };
    }
    if (!bid) {
      return { ok: false, code: 'bad-bid', url: value, bid: null, message: MESSAGES['bad-bid'] };
    }
    return {
      ok: true,
      code: 'ok',
      url: canonicalWidgetUrl(value, bid),
      bid,
      message: '',
    };
  }

  return {
    BOTRIX_WIDGET_HOSTS,
    MAX_WIDGET_URL_LEN,
    MESSAGES,
    isAllowedWidgetUrl,
    extractBotrixBid,
    canonicalWidgetUrl,
    diagnoseWidgetUrl,
  };
});
