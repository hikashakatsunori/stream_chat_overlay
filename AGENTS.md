# AGENTS.md

Guidance for AI agents and contributors working in this repository.

## What this project is

Hikasha Chat: a Windows tray-resident, frameless, transparent, always-on-top
multistream chat overlay. It embeds the official BotRix widget (Twitch,
YouTube, Kick) in an Electron `BrowserWindow` and adds native window chrome
(pin, glass/solid theme, settings, viewer counts, tray, auto-update).

Target platform is Windows 10/11 only. The app is distributed as an NSIS
installer via GitHub Releases; a `portable.flag` next to the exe switches all
app data into `<exe dir>/app-data`.

## Toolchain

- Node.js **>= 22.12.0** (enforced by `engines`, `install.bat`, `start.bat`).
- npm (lockfile v3; `npm ci` is the reproducible install).
- Electron 44 (lazy-downloads its binary on first `require('electron')`),
  Vite 7, electron-builder 26, Playwright (Electron E2E), fast-check.
- On Windows PowerShell where `npm.ps1` is blocked by execution policy, call
  `npm.cmd` instead of `npm`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Clean lockfile-exact install (delete `node_modules` first for a true clean setup). |
| `npm run dev` | Vite dev server + Electron with HMR; honors `VITE_DEV_SERVER_URL` in unpackaged runs only. |
| `npm start` | Production build (`dist/renderer`) then launch Electron. |
| `npm run build` | Vite renderer build only. |
| `npm run lint` | Syntax checks + unit + property + behavioral tests (no build/E2E). |
| `npm test` | Full gate: lint layers + production build + Playwright Electron E2E. |
| `npm run audit` | Dependency gate: fails on high/critical advisories. |
| `npm run mobile:test` | Mobile URL rules + phone-viewport UI flow. |
| `npm run mobile:apk` | Build/sign/verify the standalone Android APK (JDK 21 + SDK 36). |
| `npm run dist:win` | Windows NSIS installer into `release/`. |

Definition of done for any change: `npm run lint` and `npm test` both pass;
public behavior changes update `README.md` and `CHANGELOG.md`.

## Architecture

| Path | Responsibility |
| --- | --- |
| `electron/main.js` | Windows, tray, splash, viewer polling, widget theming, mouse pass-through/global shortcuts, IPC, settings db, auto-update, crash reporting. |
| `electron/state-utils.js` | Pure, Electron-free helpers: state/config sanitizers, URL allowlist, bid extraction/diagnosis/canonicalization, viewer parsing. Never import Electron here. |
| `electron/chat-preload.js` | Minimal contextBridge API; exposes the bridge ONLY to the panel's top frame. |
| `electron/launch.js` | Launcher that strips `ELECTRON_RUN_AS_NODE`. |
| `scripts/dev.js` | Dev runner: Vite server + Electron, no extra dependencies. |
| `mobile/` | Standalone Capacitor 8 Android app: setup/tutorial/chat UI, local link storage, release-signed APK. |
| `mobile/www/url.js` | Mobile BotRix URL allowlist/canonicalization; browser + Node dual module. |
| `mobile/android/` | Generated Capacitor Android project (icons, cookies, manifest, signing). |
| `src/chat.js` | Panel renderer: header chrome, settings card, viewer pills, error/notice display, iframe load watch. |
| `chat.html`, `splash.html` | Static pages with CSPs; Vite multi-page build inputs. |
| `tests/state-utils.test.js` | Unit tests + cross-layer wiring assertions. |
| `tests/property.test.js` | fast-check whole-domain properties. |
| `tests/main-process.test.js` | Real `main.js` against a stubbed Electron + real temp userData. |
| `tests/e2e.test.js` | Playwright drives the real app against an isolated userData dir. |
| `public/` | Runtime images copied by Vite; tray/logo assets are also packaged explicitly. |

Runtime data (`%AppData%/Hikasha Chat` by default):

- `overlay-state.json` — bounds/pin/theme, atomic write, debounced.
- `botrix-config.json` — canonical widget URL (contains the private bid).
- `logs/main.log` + rotated `main.old.log`.
- `persist:botrix-chat` session partition for the widget.

## Invariants — do not regress

1. **BotRix-only embedding.** https + `botrix.live` / `www.botrix.live` /
   `*.botrix.live`, enforced in `state-utils`, mirrored in `src/chat.js`, and
   in both page CSPs. Never substring-match hosts.
2. **One source of truth for the bid.** The canonical saved widget URL carries
   `?bid=`; viewer requests are derived from it. Query strings are stripped
   from anything logged.
3. **Poller/iframe agreement.** The viewer poller is frozen to the URL the
   visible iframe embeds. Saving a URL does not hot-swap it. `chat:reload-widget`
   (settings Reload / tray Reload) restarts BOTH; hide/show resumes the same
   URL; a restart reads the db for both.
4. **No stale poll results.** `viewerPollGen` invalidates in-flight results
   after stop/reload; `viewerPollingActive` makes start idempotent.
5. **Viewer hydration.** `lastViewerPayload` is replayed on load/show and
   available via `chat:get-viewers` so the header never waits 30 s or blanks.
6. **IPC is privileged.** Every handler goes through `guarded()` and is gated
   to the panel MAIN frame. The preload never exposes the bridge to the
   embedded widget frame.
7. **No popups/navigation/permissions.** `setWindowOpenHandler` denies,
   `will-navigate` is blocked on all windows, every permission request is
   denied, sub-frame escapes from botrix.live are surfaced.
8. **X means quit.** `chat:close` destroys the panel + tray and quits with a
   force-exit fallback. Tray "Hide" only hides; the widget session survives.
9. **Crash safety.** Config/state writes are atomic (tmp + rename). Corrupt
   JSON falls back to safe defaults. Migration/reporting/logging are
   best-effort and must never block boot.
10. **No secrets in logs.** Bid-bearing URLs are query-stripped; errors are
    capped; the settings UI masks the bid.
11. **Updater is non-intrusive.** Packaged, non-portable builds only. Update
    events are notices, never errors; `error` events are always handled.
12. **Window identity.** `APP_ID` in `main.js` must equal `build.appId` in
    `package.json`; a unit test asserts it.
13. **Release artifact naming.** `build.win.artifactName` stays URL-safe
    (`Hikasha-Chat-Setup-<version>.exe`, no spaces) and must match the release
    workflow's upload paths. electron-builder writes that safe name into
    `latest.yml`; a mismatch makes packaged auto-update 404.
14. **Mouse pass-through is recoverable.** `clickThrough` persists in
    `overlay-state.json`. ON calls `setIgnoreMouseEvents(true)` and
    `setFocusable(false)` (and blurs); OFF restores both. The OS-global
    `Control+Super+I` (= Ctrl+Win+I) shortcut is registered on ready and
    released on `will-quit`; the tray checkbox is the permanent fallback
    because the panel cannot be clicked while ON. Re-apply on create/show.
15. **Android is a separate, mobile-only surface.** `mobile/www` must not
    contain desktop-only features (overlay dragging, pin, tray, mouse
    pass-through) or a second URL allowlist. `mobile/www/url.js` is the
    mobile validator and is covered by Node tests. The release keystore and
    `keystore.properties` are git-ignored, never committed, and must be
    backed up for future APK updates.
16. **Full header is always visible.** No header control or viewer icon may
    be hidden by a resize breakpoint. The panel minimum width
    (`MIN_PANEL_WIDTH`, 380) wraps the logo, all viewer pills, and all six
    controls tightly; wider panels center the group. Oversized viewer counts
    may ellipsize, but icons never disappear; feedback lives in toasts, not a
    header status dot/text.

## Testing expectations

- Pure logic goes in `state-utils.js` and gets unit + property tests.
- New IPC channels need: `guarded()` registration, preload exposure,
  sender-gating rejection coverage in `main-process.test.js`, and a wiring
  assertion in `state-utils.test.js`.
- New UI flows need E2E coverage in `tests/e2e.test.js` (first-run, reload,
  persistence, close-path patterns already exist).
- E2E and behavioral tests must use an isolated `OVERLAY_USER_DATA` /
  temp dir; never touch the real user profile.
- Mobile changes run `npm run mobile:test`; APK changes also require
  `npm run mobile:apk` (signature + checksum verification). The mobile URL
  rules and Android `versionName` have their own unit assertions.

## Release / development lifecycle

1. Implement + tests + docs.
2. `npm run lint`, `npm test`, `npm run audit`.
3. Update `CHANGELOG.md` (Keep a Changelog) and bump `version` when releasing.
4. Commit (only when explicitly asked).
5. Tag `vX.Y.Z` → `.github/workflows/release.yml` builds and publishes the
   NSIS installer as `Hikasha-Chat-Setup-<version>.exe`, its blockmap, and
   `latest.yml` to GitHub Releases.
6. CI (`ci.yml`) runs the full suite and `npm run audit` on every push/PR.

Known audit exception: moderate `minimatch` advisories in electron-builder's
build-only dependency chain have no non-breaking fix; `npm run audit`
deliberately gates on high/critical. Revisit when electron-builder ships an
updated minimatch.

## Code conventions

- CommonJS in `electron/`, `scripts/`, and tests; browser JS in `src/`.
- No new runtime dependencies without strong justification; the Electron main
  process and tests should stay dependency-light.
- Errors are surfaced in the panel (`chat:error`) or as notices
  (`chat:notice`); never leave a silent blank window.
- Follow the existing comment style: explain *why* a guard exists, especially
  security and lifecycle invariants.
