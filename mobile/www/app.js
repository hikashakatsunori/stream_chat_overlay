(function () {
  'use strict';

  const U = window.HikashaUrl;
  const STORAGE_KEY = 'hikasha.mobile.widgetUrl.v1';
  const LOAD_TIMEOUT_MS = 15000;

  const $ = (id) => document.getElementById(id);
  const setupView = $('setup-view');
  const chatView = $('chat-view');
  const form = $('link-form');
  const input = $('widget-url');
  const pasteBtn = $('paste-btn');
  const connectBtn = $('connect-btn');
  const clearBtn = $('clear-btn');
  const backBtn = $('back-btn');
  const setupMsg = $('setup-msg');
  const tutorialMsg = $('tutorial-msg');
  const copyBotrixBtn = $('copy-botrix');
  const frame = $('chat-frame');
  const chatError = $('chat-error');
  const chatErrorText = $('chat-error-text');
  const retryBtn = $('retry-btn');
  const changeBtn = $('change-btn');
  const reloadBtn = $('reload-btn');
  const settingsBtn = $('settings-btn');
  const chatState = $('chat-state');
  const chatStateText = $('chat-state-text');

  let savedUrl = null;
  let currentUrl = null;
  let loadToken = 0;
  let loadTimer = null;

  function setMessage(element, text, kind) {
    element.textContent = text || '';
    element.className = 'message' + (kind ? ' ' + kind : '');
  }

  function setupMessage(text, kind) {
    setMessage(setupMsg, text, kind);
  }

  function tutorialMessage(text, kind) {
    setMessage(tutorialMsg, text, kind);
  }

  function setState(text, kind) {
    chatStateText.textContent = text;
    chatState.className = 'state' + (kind ? ' ' + kind : '');
  }

  function readStored() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function writeStored(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
      return true;
    } catch {
      return false;
    }
  }

  function clearStored() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage disabled */
    }
  }

  function showSetup(options) {
    const opts = options || {};
    setupView.hidden = false;
    chatView.hidden = true;
    backBtn.hidden = !(opts.editing && savedUrl);
    clearBtn.hidden = !savedUrl;
    input.value = savedUrl || '';
    setupMessage(opts.message || '', opts.kind || '');
    if (opts.editing) {
      window.requestAnimationFrame(() => {
        input.focus();
        try {
          input.setSelectionRange(input.value.length, input.value.length);
        } catch {
          /* selection unsupported */
        }
      });
    }
    window.scrollTo(0, 0);
  }

  function clearLoadTimer() {
    if (loadTimer !== null) {
      window.clearTimeout(loadTimer);
      loadTimer = null;
    }
  }

  function hideChatError() {
    chatError.hidden = true;
  }

  function showChatError(text) {
    clearLoadTimer();
    chatErrorText.textContent = text;
    chatError.hidden = false;
    setState('offline', 'offline');
  }

  function loadFrame(url) {
    currentUrl = url;
    const token = ++loadToken;
    clearLoadTimer();
    hideChatError();
    setState('connecting', '');

    if (navigator.onLine === false) {
      showChatError('You are offline. Reconnect to the internet, then tap Retry.');
      return;
    }

    try {
      frame.src = 'about:blank';
    } catch {
      /* ignore */
    }

    window.setTimeout(() => {
      if (token !== loadToken || currentUrl !== url) return;
      try {
        frame.src = url;
      } catch {
        showChatError('That link could not be loaded. Tap Change link and paste it again.');
        return;
      }
      loadTimer = window.setTimeout(() => {
        if (token !== loadToken) return;
        showChatError(
          navigator.onLine === false
            ? 'You are offline. Reconnect to the internet, then tap Retry.'
            : 'Chat is taking too long to load. Check your connection or the BotRix link.',
        );
      }, LOAD_TIMEOUT_MS);
    }, 40);
  }

  function showChat(url) {
    setupView.hidden = true;
    chatView.hidden = false;
    if (url !== currentUrl) loadFrame(url);
  }

  function connect(raw) {
    const diagnosis = U.diagnoseWidgetUrl(raw);
    if (!diagnosis.ok) {
      setupMessage(diagnosis.message, 'error');
      input.focus();
      return;
    }
    savedUrl = diagnosis.url;
    input.value = diagnosis.url;
    writeStored(diagnosis.url);
    currentUrl = null;
    showChat(diagnosis.url);
  }

  function openSettings() {
    showSetup({
      editing: true,
      message: savedUrl
        ? 'Change the link below, or go back to keep the current chat.'
        : '',
      kind: 'info',
    });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    connect(input.value);
  });

  input.addEventListener('input', () => {
    if (setupMsg.classList.contains('error')) setupMessage('', '');
  });

  backBtn.addEventListener('click', () => {
    if (savedUrl) showChat(savedUrl);
    else showSetup({});
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
        throw new Error('clipboard unavailable');
      }
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setupMessage('Clipboard is empty. Copy the BotRix widget link first.', 'error');
        return;
      }
      input.value = text;
      setupMessage('Link pasted. Tap Connect.', 'ok');
    } catch {
      setupMessage(
        'Clipboard access was blocked. Long-press the link field and paste manually.',
        'error',
      );
    }
  });

  copyBotrixBtn.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('clipboard unavailable');
      }
      await navigator.clipboard.writeText('https://botrix.live');
      tutorialMessage('Copied botrix.live. Open it in your phone browser.', 'ok');
    } catch {
      tutorialMessage('Open botrix.live manually in your phone browser.', 'error');
    }
  });

  clearBtn.addEventListener('click', () => {
    if (!window.confirm('Remove the saved BotRix link from this device?')) return;
    clearStored();
    savedUrl = null;
    currentUrl = null;
    loadToken += 1;
    clearLoadTimer();
    try {
      frame.src = 'about:blank';
    } catch {
      /* ignore */
    }
    hideChatError();
    input.value = '';
    showSetup({ message: 'Link removed. Paste a BotRix widget link to reconnect.', kind: 'info' });
  });

  reloadBtn.addEventListener('click', () => {
    if (savedUrl) loadFrame(savedUrl);
  });

  retryBtn.addEventListener('click', () => {
    if (savedUrl) loadFrame(savedUrl);
  });

  changeBtn.addEventListener('click', openSettings);
  settingsBtn.addEventListener('click', openSettings);

  frame.addEventListener('load', () => {
    if (!currentUrl) return;
    const src = frame.getAttribute('src');
    if (!src || src === 'about:blank') return;
    if (frame.src !== currentUrl) return;
    clearLoadTimer();
    hideChatError();
    setState('live', 'ok');
  });

  frame.addEventListener('error', () => {
    if (!currentUrl) return;
    showChatError('The chat page could not load. Check the link or your internet connection.');
  });

  window.addEventListener('offline', () => {
    if (currentUrl) showChatError('You are offline. Reconnect to the internet, then tap Retry.');
  });

  window.addEventListener('online', () => {
    if (currentUrl) loadFrame(currentUrl);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUrl && !chatView.hidden && !chatError.hidden) {
      loadFrame(currentUrl);
    }
  });

  window.addEventListener('beforeunload', clearLoadTimer);

  // Boot: restore the locally saved link or show the setup/tutorial.
  const stored = readStored();
  if (stored) {
    const diagnosis = U.diagnoseWidgetUrl(stored);
    if (diagnosis.ok) {
      savedUrl = diagnosis.url;
      input.value = diagnosis.url;
      writeStored(diagnosis.url);
      currentUrl = null;
      showChat(diagnosis.url);
    } else {
      clearStored();
      showSetup({
        message: 'The saved link is no longer valid. Paste the BotRix widget link again.',
        kind: 'error',
      });
    }
  } else {
    showSetup({});
  }
})();
