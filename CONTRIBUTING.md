# Contributing to KeyCast Studio

[한국어](CONTRIBUTING.ko.md)

Thanks for helping. Bug reports, test reports from other computers, translations and code are all welcome. You do not need to know the whole codebase: most changes touch one file.

## Ways to help, from smallest to largest

| You have | You can |
|---|---|
| 5 minutes | Install it on your computer and send a [test report](https://github.com/dominkang90/keycast-studio/issues/new?template=test_report.yml). Every new graphics card, Windows version or monitor setup matters |
| Found a problem | Open a [bug report](https://github.com/dominkang90/keycast-studio/issues/new?template=bug_report.yml) |
| An idea | Open a [feature request](https://github.com/dominkang90/keycast-studio/issues/new?template=feature_request.yml) |
| An evening | Pick an issue labelled [`good first issue`](https://github.com/dominkang90/keycast-studio/labels/good%20first%20issue) |
| Another language | [Translate the app](#translating-the-app) or a README |

## Set up

Needs Windows 10 or 11 and Node.js 20 or newer.

```bash
git clone https://github.com/dominkang90/keycast-studio.git
```

```bash
cd keycast-studio
```

```bash
npm install
```

```bash
npm start
```

`npm start` builds the interface and opens the app with Electron. If no window appears (some computers block Electron inside `node_modules`), use the packaged copy instead:

```bash
npm run start:packaged
```

| Command | Does |
|---|---|
| `npm test` | Unit tests (key grouping, zoom, time mapping, subtitles, typing filter). Runs in a second |
| `npm run build` | Interface, browser version and the packaged app in `release\KeyCast Studio-win32-x64` |
| `npm run dist` | Installer and portable zip in `release\dist`. Bundles FFmpeg 8+ from your PATH (`winget install Gyan.FFmpeg`) |
| `npm run icon` | Redraws `build/icon.png` and `build/icon.ico` from `build/icon.svg` |

### The self-test

The packaged app can run a scripted check of almost everything: recording, the editor, every settings tab, the dialogs, MP4/WebM/GIF export, importing files and the speech model.

```powershell
$env:KEYCAST_SELFTEST = "$PWD\tests\out"; & ".\release\KeyCast Studio-win32-x64\KeyCast Studio.exe"; Remove-Item Env:KEYCAST_SELFTEST
```

It records your screen for about three seconds, writes `tests\out\selftest.log` with one `PASS` or `FAIL` line per check, and saves screenshots next to it. Please run it before sending a change to the recorder, editor or exporter, and mention the result in the pull request. The files in `tests\out` are ignored by git, because they contain pictures of your screen.

To keep your own recordings and settings out of the way while testing, point the app at another folder:

| Variable | Effect |
|---|---|
| `KEYCAST_MEDIA_ROOT` | Folder used instead of `Videos\KeyCast Studio` |
| `KEYCAST_SAVE_DIR` | Exports and SRT files are saved here without the save window |
| `KEYCAST_PICK_VIDEO`, `KEYCAST_PICK_IMAGE`, `KEYCAST_PICK_AUDIO` | Files used instead of the file window (only with the two variables above or the self-test) |

Add `--user-data-dir=<folder>` to the app's command line to use separate app settings as well.

## How the code is laid out

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first. In short:

- `electron/` runs outside the page: windows, the global key hook, screen capture with FFmpeg, file storage.
- `src/ui/` holds one file per screen or dialog (`home.js`, `editor.js`, `recording.js`, `dialogs.js`, …).
- `src/lib/` holds the logic that does not touch the DOM: drawing a frame, the timeline, zoom, key grouping, subtitles, export. Most of it can be unit-tested in Node.

## Making a change

1. Open an issue first for anything larger than a small fix, so the approach can be agreed before you spend time on it.
2. Branch from `main`, keep the change focused, and match the style around it (2-space indent, single quotes, semicolons, small functions with a comment saying *why*).
3. Add or update a test in `tests/run.mjs` when you change something in `src/lib/`.
4. Run `npm test`, and the self-test for anything that records, edits or exports.
5. Open a pull request. The template asks what changed, how you checked it and on which computer.

Interface text is Korean today. Keep new text short, plain and without a full stop at the end of buttons and labels; until the translation work below lands, add the Korean text and mention the English meaning in the pull request.

## Translating the app

The interface strings are still written directly in the code. The plan, tracked in [the roadmap](docs/ROADMAP.md):

1. Move every string into `src/i18n/ko.json` and read it through a small `t('key')` helper.
2. Add `en.json`, then other languages, and a language menu that follows the Windows language by default.
3. Translate the manual (`사용설명서.html`).

Step 1 is a good first larger contribution. If you want to translate, open an issue saying which language, and you will get the string file as soon as step 1 is in.

## Releases

Maintainers only: bump `version` in `package.json`, add an entry to `CHANGELOG.md`, run `npm run dist`, check the installer on a clean user account, then create a GitHub release with the installer, the portable zip and `KeyCast-Studio-web.zip`, their SHA-256 values and a VirusTotal link.

## Conduct

Be kind and assume good intent. Critique code, not people. Maintainers may remove comments or contributions that are hostile or off topic.

## License

By contributing you agree that your contribution is released under the [MIT license](LICENSE).
