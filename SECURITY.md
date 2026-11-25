# Security and privacy

KeyCast Studio reads the keyboard and mouse of the whole computer, because that is how it shows your shortcuts in a video. This page says exactly what it records, where it keeps it and what it sends, so you can decide whether to trust it. Every statement points to the code that does it.

## What is recorded, and when

- **Only while you record.** The global keyboard and mouse hook starts when a recording begins and stops when it ends (`recording:begin` / `recording:end` in `electron/main.cjs`). The "show keys without recording" mode also starts it, but only draws the keys on screen and never stores them (`pushEvent`, `keysOnly`).
- **Typing is dropped by default.** While a recording runs, the app holds the key events in memory, as it must to draw them live. When the recording is saved, every key that can type text is removed before anything is written to disk: letters, digits, symbols, the number pad, AltGr characters and any key the app does not know. What stays is modifiers, Ctrl/Alt/Win shortcuts, F-keys, Esc, Enter, Tab, Backspace, the arrow and navigation keys (`keepWithoutTyping` in `src/lib/keys.js`, used in `src/lib/recorder.js`). This is an allowlist, so a key that is not on it is treated as typing. Turning on **타이핑한 글자도 기록** (also record typing) before a recording keeps everything.
- **Mouse:** clicks, drags, wheel turns and the pointer position (about 60 times a second) during a whole-screen recording, and which kind of pointer Windows shows (arrow, hand, text cursor; `electron/cursor-type.cjs`) so the editor can draw the matching shape. Clicks on the recording bar are ignored.
- **The stop, pause and key-display shortcuts** are removed from the recording.
- **Screen, sound and camera:** only what you chose on the home screen (screen or window, microphone, computer sound, webcam).

## Where it is kept

Everything stays on your computer in `Videos\KeyCast Studio\<recording>`:

- `project.json`: the kept key and click events with their times, the name of the recorded screen or window (a window name can be a browser tab title), your edits and subtitles.
- the screen, sound, microphone and webcam files.

Deleting a recording in the app deletes that whole folder. Uninstalling the app leaves your recordings in place.

## What it sends over the internet

- **The speech model download.** The first time you make subtitles, the Whisper model is downloaded from Hugging Face (`huggingface.co`) by Transformers.js. Your voice is processed on your computer and is never uploaded.
- **The new version notice** (since 2.6.0). At most once a day the desktop app asks `api.github.com` for this project's latest release number (`electron/main.cjs`, `update:check`). Nothing about you or your recordings is sent; GitHub sees an ordinary request from your IP address. Nothing is downloaded or installed: the app only shows a line with a button that opens the release page. Switch it off in ⚙ Settings → New version notice.
- No accounts, analytics, crash reports or automatic updates.
- The browser version (`KeyCast-Studio-web.zip`) may load the speech runtime from `cdn.jsdelivr.net` as well.

## Checking a download

Each release lists the SHA-256 value of every file and a VirusTotal scan. To check a file you downloaded:

```powershell
Get-FileHash .\KeyCast-Studio-Setup-1.1.0.exe -Algorithm SHA256
```

The installer is not code-signed yet, so Windows shows "Windows protected your PC" the first time. Some antivirus programs are suspicious of any program that reads the keyboard globally; the source of the hook is `uiohook-napi`, and everything the app does with it is in `electron/main.cjs`.

## How the app protects itself

- Pages run without Node.js access; the only bridge is `window.keycast` in `electron/preload.cjs`.
- Pages are served from the app's own `app://local/` protocol. It serves only the app's files and the recordings folder, and refuses paths that leave them (`inside()` in `electron/main.cjs`).
- Files are written inside the recordings folder with cleaned names (`projectDir()`, `safeName()`), except exports and SRT files, which go to the place you choose in the Windows save window.
- FFmpeg is started as a separate program with an argument list and no shell (`electron/capture.cjs`).

## Reporting a problem

If you find a security or privacy problem, please do not describe it in a public issue. Open an issue titled "Security contact" with no details, and the maintainer will reply with a private way to send them. Please allow a reasonable time for a fix before telling others.

Supported versions: the latest release only.
