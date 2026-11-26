# Hikasha Chat for Android

A standalone Android app for the same BotRix multistream chat widget used by
the Windows overlay. It has a mobile-only UI: enter your BotRix chat link once,
then the app opens your chat. There is **no** overlay dragging, pinning, mouse
pass-through, tray, or other desktop-only behavior.

## APK

```text
release/Hikasha-Chat-0.1.1.apk
release/Hikasha-Chat-0.1.1.apk.sha256
```

- Package: `com.hikasha.chat`
- Version: `0.1.1` (versionCode 1)
- Min Android: 7.0 (API 24)
- Target/compile SDK: 36 (Android 16)
- Permissions: Internet + network state only
- Signed with the project's release key (v2 + v3 APK signatures; minSdk 24)

The APK is fully self-contained. The phone does not need Node.js, a PC, or a
local server; it only needs internet access for the BotRix widget.

## Install on Android

1. Copy `Hikasha-Chat-0.1.1.apk` to the phone (USB, Google Drive, etc.).
2. Open the APK with the phone's Files app.
3. If Android asks, allow **Install unknown apps** for the Files/browser app
   you are using. This is normal for any app installed outside the Play Store.
4. Tap **Install**, then **Open**.

### About Play Protect / "unknown developer"

The APK is signed with a valid self-signed release certificate, which Android
accepts. A sideloaded app can still show Play Protect's "unknown app" warning
because Google only removes that warning for apps distributed through the Play
Store. That warning is not a sign that the APK is unsigned or corrupt.

- Tap **More details** → **Install anyway** if Play Protect shows a warning.
- Verify the SHA-256 against `Hikasha-Chat-0.1.1.apk.sha256` before installing.
- Do not disable Play Protect permanently; there is no legitimate way for a
  locally built app to bypass Play Protect's reputation checks. Publishing to
  Google Play is the only way to remove the unknown-developer warning entirely.

If installation is blocked, check that **Install unknown apps** is enabled for
the file manager/browser and that the phone has enough storage. If an older
build was signed with a different key, uninstall it first.

## BotRix setup tutorial

1. Open **botrix.live** in the phone's browser and sign in to your BotRix
   account.
2. In the BotRix dashboard, connect/link the platforms you stream to:
   **Twitch**, **YouTube**, and/or **Kick**.
3. Open the **Widgets** section and choose the **Chat** widget
   (multistream chat).
4. Copy the chat widget link. It must contain a `?bid=...` value.
5. Open Hikasha Chat, paste the link into the field, and tap **Connect**.

The same steps are available inside the app under
**How to get your BotRix chat link**.

> The `?bid=` value is a private session identifier. Anyone with the widget
> link can read that widget. Do not share it or post it publicly.

## Using the app

- **Connect** validates and stores the link on this device.
- **Change link** (gear button in chat) lets you paste a new BotRix link.
- **Reload** (refresh button) reloads the chat if it gets stuck.
- **Disconnect** removes the saved link from the device.
- **Back** returns from the link editor to the chat.
- The link survives app restarts via Android WebView local storage.

The app only accepts `https://` BotRix hosts (`botrix.live`,
`www.botrix.live`, and `*.botrix.live`) with a valid `?bid=`. It strips extra
query parameters, matching the Windows app's saved URL rules.

## Privacy and security

- The link is stored only in the app's local WebView storage.
- Android cloud backup is disabled for this app (`allowBackup=false`), so the
  private bid is not included in normal Android backups.
- No analytics, ads, accounts, or third-party SDKs are included.
- Only the `INTERNET` and `ACCESS_NETWORK_STATE` permissions are requested.
- Cleartext HTTP is disabled; BotRix is embedded only over HTTPS.
- Third-party cookies are enabled for the BotRix iframe because Android
  WebView drops them by default, which can otherwise leave the widget blank.

## Build from source

Requirements:

- Node.js 22+
- JDK 21
- Android SDK Platform 36 + Build-Tools 36 + Platform-Tools
- `ANDROID_HOME` (or `%LOCALAPPDATA%\Android\Sdk`) and `JAVA_HOME`

First-time setup:

```powershell
npm --prefix mobile ci
```

Build/sign/verify the APK:

```powershell
npm run mobile:apk
```

The script performs `npm ci`, `cap sync android`, Gradle `assembleRelease`,
`zipalign`, `apksigner`, signature verification, and writes the APK plus a
SHA-256 file into `release/`.

Manual equivalent:

```powershell
cd mobile
npx cap sync android
cd android
.\gradlew assembleRelease
# zipalign + apksigner with mobile/keystore.properties
```

### Signing key — back this up

The release identity lives in:

```text
mobile/keystore/hikasha-release.jks
mobile/keystore.properties
```

Both are git-ignored and must not be committed or shared. Back them up in a
secure place. Losing the key means future APKs cannot be installed over this
one without uninstalling the app first.

Certificate SHA-256:

```text
A1:E8:2A:B7:AC:9C:11:AA:4F:3E:6C:F0:72:F9:2A:2B:E2:A6:60:14:18:4B:4F:41:78:AB:6B:0E:B9:08:C3:AB
```

## Tests

```powershell
npm run mobile:test       # URL rules + full mobile UI flow in a phone viewport
npm test                  # Windows + mobile gates (also runs the mobile UI test)
```

The APK wrapper itself is verified with:

```powershell
aapt2 dump badging release/Hikasha-Chat-0.1.1.apk
apksigner verify --verbose --print-certs release/Hikasha-Chat-0.1.1.apk
zipalign -c -v 4 release/Hikasha-Chat-0.1.1.apk
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "App not installed" | Enable Install unknown apps for the file manager; uninstall an older build signed with a different key. |
| Play Protect warning | Tap More details → Install anyway after verifying the SHA-256. |
| Chat is blank | Check internet; confirm the BotRix link still contains `?bid=`; use Change link to paste a fresh widget link; tap Reload. |
| Link rejected | Copy the whole BotRix chat widget link, not the dashboard URL or a truncated link. |
| Chrome/BotRix page opens instead | The tutorial uses your browser; return to Hikasha Chat and paste the link there. |
| Clipboard paste blocked | Long-press the link field and choose Paste. |

## What this app intentionally does not have

- No always-on-top overlay or draggable window
- No pin button
- No mouse pass-through / Ctrl+Win+I shortcut
- No tray icon, autostart, or desktop updater

Those are Windows overlay features and are not useful on a phone.
