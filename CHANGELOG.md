# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versioning follows
[SemVer](https://semver.org/).

## [Unreleased]

## [0.1.5] — 2026-11-26

### Added

- Header download button that opens the latest GitHub release page in the
  default browser (fixed URL, main-process owned).

### Changed

- Minimum panel width reduced from 460px to 380px — the width that wraps the
  logo, viewer icons, and all six controls tightly with no fixed empty band
  on the right.
- The header icon group is centered horizontally; widening the panel adds
  space equally on both sides instead of leaving it all on the right.
- Viewer count text may ellipsize when space is tight; the three viewer icons
  and all control icons remain visible at every allowed size.

## [0.1.4] — 2026-11-26

### Fixed

- Transparent-mode notifications now use the same translucent glass surface
  as the panel instead of a solid black background.

### Changed

- Header icon groups are compact: the control icons sit directly after the
  viewer pills with the normal 5px gap instead of being pushed to the far
  right, removing the wide empty band in larger panels.

## [0.1.3] — 2026-11-26

### Changed

- Removed the connection dot from the header entirely. There is no status
  text or dot in the top bar; errors, notices, and action feedback are
  in-panel toast notifications only.
- All header icons are always visible: the logo/title, Twitch/YouTube/Kick
  viewer pills (showing 0 before the first poll), and every control button.
  Resize breakpoints that hid them were removed.

### Fixed

- The panel now has a 460px minimum width (and is created at that width when
  restoring an older, narrower size), so the window cannot be resized small
  enough to hide or clip the left-side header content.

## [0.1.2] — 2026-11-26

### Changed

- Header status is now a single dot (green live, amber connecting, red
  failure, grey idle). Status text no longer appears in the header; errors,
  update notices, and action feedback use in-panel toast notifications.
- Header controls are right-anchored, so hiding the title/viewer pills while
  resizing no longer makes the icon row jump left.

### Fixed

- Status dot remains visible at the 240px minimum width, and the setup/
  settings cards scroll and wrap long widget URLs instead of clipping.

## [0.1.1] — 2026-11-26

### Added

- In-app Reload: the settings panel's Reload button and the tray's Reload
  chat panel apply the saved widget URL to the running session — poller and
  iframe restart together on the same bid, without quitting the app.
- Mouse pass-through mode: a header pointer button, the OS-global Ctrl+Win+I
  shortcut, and a tray fallback toggle a persisted mode where the panel
  ignores mouse input and keyboard focus, so gameplay receives every click
  and hover. Re-applied on show and restart.
- Standalone Android app (`mobile/`): Capacitor 8 WebView APK with a mobile
  setup/tutorial and chat screen, local link persistence, change/reload/
  disconnect, strict BotRix URL validation, no desktop overlay/pin/tray/
  pass-through features. Release-signed APK plus SHA-256 and install/Play
  Protect guidance.
- Viewer-count hydration: the latest payload is cached and exposed via
  `chat:get-viewers`, so the header is correct immediately after load,
  reload, or a tray show instead of waiting up to 30 s.
- Real tray hide/show: hiding keeps the widget session, messages, and scroll
  position alive and pauses viewer polling; showing resumes polling on the
  same frozen URL and repaints the cached counts.
- Non-error notice channel (`chat:notice`): update-ready events now appear as
  informational status text instead of being reported as errors.
- `npm run dev`: Vite dev server + Electron with HMR, no new dependencies.
- Settings accessibility: Escape closes the settings card and focus returns
  to the gear button; `aria-expanded` reflects the open state.
- `AGENTS.md`: architecture, invariants, test expectations, and release
  lifecycle for contributors and agents.
- Settings db: the BotRix widget URL is stored in
  `%AppData%/Hikasha Chat/botrix-config.json` (atomic writes) and managed
  through a gear-icon settings panel (Enter/Change buttons, themed input,
  masked bid display) — replacing the `.env` mechanism entirely.
- One-time migration: a pre-upgrade legacy config file's widget URL is
  imported into the settings db on the first boot after upgrading.
- First-launch guidance: the setup card points at the gear icon; every
  config failure mode gets an actionable per-code card (missing, empty,
  bad protocol/host/port, too long, no bid, invalid bid).
- End-to-end test layer (Playwright Electron): boot, full settings flow,
  in-app reload, restart-load, pin/theme persistence, and close-path
  verified in the real app.
- Property-based tests (fast-check): whole-input-domain properties for the
  URL/state helpers (allowlist, canonicalization, caps, viewer parsing).
- Behavioral main-process tests: settings-db IPC handlers driven against a
  real temp db (save, unchanged, rejections, sender gating, reload,
  pin/theme persistence, corrupt-db fallback).
- Auto-update: packaged builds check GitHub Releases on boot and apply on
  the next start; the tag-gated release workflow publishes installers.

### Fixed

- Auto-update "downloaded" events are no longer surfaced as errors; the
  updater's `error` event always has a listener, so an offline check cannot
  throw out of the emitter.
- Windows `AppUserModelId` now matches `build.appId`, so notifications,
  taskbar identity, and installer identity agree.
- A failed legacy `.env` migration write (read-only folder, full disk) can no
  longer abort boot; migration is best-effort and logged.
- Viewer results that belong to a previous URL/session are discarded after
  reload/hide/close (`viewerPollGen` check), so old counts cannot overwrite
  the new bid's counts.
- Widget theming is re-applied after every panel load, so Reload no longer
  loses the injected stylesheet.
- Reopening a closed panel no longer replays viewer counts cached from a
  previous bid; the first poll for the fresh window repopulates them.
- Minimum-size windows keep every header button reachable, and the settings
  action row wraps instead of clipping the new Reload button.
- Windows release artifacts now use the URL-safe
  `Hikasha-Chat-Setup-<version>.exe` name, matching `latest.yml` and the
  release workflow upload paths; packaged auto-update URLs no longer 404.
- Node version guidance is consistent everywhere (>= 22.12.0), and
  `start.bat` verifies the version before launching.
- Removed dead code (`RESOURCE_ROOTS`, unused bid getter).

### Changed

- Tray "Hide" now hides the panel instead of destroying it; the X button
  remains the explicit full-quit action.
- Saving a URL keeps the no-hot-swap guarantee, but the settings card now
  points at the explicit Reload action instead of requiring a restart.
- `install.bat` and `start.bat` are reworked for the double-click path:
  Node/npm preflight, clean lockfile install, automatic repair, Electron
  runtime preparation, build verification, clear failure guidance, and no
  E2E suite during installation.

### Security

- Applied non-breaking dependency fixes: Electron 44.11.6 (certificate
  advisory), fast-uri 3.1.9, undici 6.29.1 / 7.30.2, and the
  electron-builder 26.18.1 toolchain update.
- Added `npm run audit` (fails on high/critical) and wired it into CI. The
  remaining moderate `minimatch` advisories are confined to electron-builder's
  build-only chain and have no non-breaking fix; they are tracked as a known
  exception.
- IPC sender gating: every channel is restricted to the panel's main frame
  (sub-frames and foreign windows rejected).
- Preload bridge confined to the top frame (the embedded widget frame can
  never reach the privileged bridge).
- `will-navigate` blocked on all windows; frame-navigate monitoring
  surfaces a widget frame leaving botrix.live.
- Widget frame targeting uses proper hostname validation (never substring
  matching).
- DevTools disabled in packaged builds; the dev-server URL is ignored in
  packaged builds.
- The viewer poller refuses redirects and is frozen to the boot-time URL;
  failed-load logging strips the bid; the settings UI masks the bid.
- Length caps on saved URLs (2048) and ports (standard https only).
- Atomic writes for the settings db and window state (crash-safe).
- CI hardening: SHA-pinned actions, least-privilege token, no credential
  persistence, job timeouts, concurrency groups; Node 22 engine alignment.

## [0.1.0] — initial public release

- Tray-resident, frameless, transparent multistream chat overlay
  (Twitch/YouTube/Kick via the BotRix widget).
- BotRix viewer counts in the header with exponential-backoff polling.
- Pin and glass/solid theme toggles; splash intro; error reporting in-panel.
