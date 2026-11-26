# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities through
[GitHub Security Advisories](https://github.com/hikashakatsunori/stream_chat_overlay/security/advisories/new)
rather than public issues. Include a description, reproduction steps, and the
affected version. You will get a response within a week.

## Supported Versions

| Version | Supported |
| --- | --- |
| 0.1.x | yes |

## Dependency Auditing

`npm run audit` fails on high/critical advisories and runs in CI on every
push/PR. Remaining moderate `minimatch` advisories live only in
electron-builder's build-time dependency chain (glob matching over trusted
project paths); the only fix is a breaking downgrade of the packager, so
the gate deliberately ignores moderate findings. Electron itself is pinned
to a release outside the certificate advisory range.

## Security Model

Hikasha Chat embeds the BotRix multistream widget (remote code) in a
tray-resident overlay. The controls:

- **Renderer sandbox** — every window runs with `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`; the renderer has no Node,
  filesystem, or shell access.
- **Three-layer URL allowlist** — widget URLs are restricted to
  `botrix.live` hosts in the main process (validation + canonicalization
  before persistence), the renderer (re-check before embed), and the page
  Content Security Policy (`frame-src https://*.botrix.live`).
- **IPC sender gating** — every IPC channel (including viewer reads,
  notices, and the reload action) is gated to the chat panel's main frame;
  sub-frames (the embedded widget) and other windows are rejected from
  privileged operations (state mutation, config writes, widget reload,
  process exit). Reload re-reads the validated settings db; it cannot be
  pointed at an arbitrary URL.
- **Preload bridge confined to the top frame** — preloads run in every
  frame; the bridge only exposes itself to the panel's top frame, never to
  the embedded widget frame.
- **Private session id** — the widget `?bid=` value stays in a local
  settings db (`%AppData%/Hikasha Chat/botrix-config.json`, atomic writes),
  is masked in the settings UI, and is query-stripped before any logging.
  It is never committed, synced, or logged.
- **No popups or permissions** — embedded content cannot open new windows
  and is granted no media, fullscreen, or device permissions; renderer- and
  frame-initiated navigation away from the fixed local pages is blocked.
- **Update feed** — auto-updates pull from this repository's GitHub
  Releases (tag-gated, published by the release workflow). Packaged,
  non-portable builds only; portable copies never write updater state
  outside their folder. In dev builds the update check is disabled and
  DevTools availability follows the packaged/unpackaged split.
