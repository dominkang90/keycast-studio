# Roadmap

What comes next, roughly in order. Items marked **good first issue** are self-contained and a good way to start; comment on the matching issue before you begin so two people do not do the same work.

## Making it easier to contribute

| Item | Why | Size |
|---|---|---|
| Native-speaker review of the 10 machine-assisted translations (`src/i18n/*.js`) | Done in v1.4.0 without native checks | Small per language · **good first issue** |
| Share extensions (an `extensions/` folder or a list in the README) | Extensions exist since v1.4.0 (docs/EXTENSIONS.md) | Small |
| English user manual | The manual is Korean only; English opens the README | Medium |
| Split `src/ui/editor.js` into one file per settings tab and the export dialog | It is still about 900 lines | Medium · **good first issue** ([#2](https://github.com/dominkang90/keycast-studio/issues/2)) |
| Add Prettier and ESLint with a `npm run lint` step in CI | One style without discussion in reviews | Small · **good first issue** ([#3](https://github.com/dominkang90/keycast-studio/issues/3)) |
| Unit tests for `compositor.js` drawing (render to a canvas in Node) and `exporter.js` timing | The drawing code has no unit tests yet | Medium |
| Build the Windows installer in GitHub Actions too | macOS and Linux are built there since v2.0; Windows still depends on one computer (FFmpeg essentials and wgc-capture are bundled locally) | Medium |

## Trust and safety

| Item | Why | Size |
|---|---|---|
| Code-sign the installer | Removes the "Windows protected your PC" warning; needs a certificate | Small once a certificate exists |
| Show a small "keys are being recorded" indicator in the recording bar | Makes recording state obvious at a glance | Small · **good first issue** ([#4](https://github.com/dominkang90/keycast-studio/issues/4)) |
| "Pause key recording" button while recording | Lets you type a password mid-recording even with typing recorded | Small |

## Features

| Item | Why |
|---|---|
| Show Hangul and other typed text as entered, not as Latin key letters | Requested for Korean tutorials |
| Pointer hiding for window recordings and for more than one monitor | Today it works for whole-screen recordings and has been checked with one monitor |
| Optional bundled speech model for fully offline subtitles | Today the model is downloaded on first use |
| Real-world checks on macOS and Linux | Built and smoke-tested since v2.0 but never recorded on a real Mac or Linux desktop |
| Computer sound on macOS and Linux | Electron records it on Windows only; macOS needs ScreenCaptureKit audio, Linux PipeWire |
| Pointer kinds on macOS and Linux | Recorded on Windows only (GetCursorInfo); elsewhere the arrow is drawn |
| Apple notarization and Windows code signing | Removes the first-start warnings; needs paid certificates |

## Needs testing on other computers

Windows 10, NVIDIA and AMD graphics, two or more monitors, a real microphone and webcam with pointer hiding, high-contrast mode and 125–200 % display scaling. A [test report](https://github.com/dominkang90/keycast-studio/issues/new?template=test_report.yml) for any of these helps.
