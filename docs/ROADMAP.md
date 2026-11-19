# Roadmap

What comes next, roughly in order. Items marked **good first issue** are self-contained and a good way to start; comment on the matching issue before you begin so two people do not do the same work.

## Making it easier to contribute

| Item | Why | Size |
|---|---|---|
| Move interface strings to `src/i18n/ko.json` with a `t()` helper | Lets people translate the app; today all text is Korean in the code | Medium · **good first issue** |
| English interface (`en.json`) and a language menu | Most visitors cannot read the interface | Medium |
| Split `src/ui/editor.js` into one file per settings tab and the export dialog | It is still about 900 lines | Medium · **good first issue** |
| Add Prettier and ESLint with a `npm run lint` step in CI | One style without discussion in reviews | Small · **good first issue** |
| Unit tests for `compositor.js` drawing (render to a canvas in Node) and `exporter.js` timing | The drawing code has no unit tests yet | Medium |
| Release workflow: build the installer in GitHub Actions on a version tag | Releases should not depend on one computer | Medium |

## Trust and safety

| Item | Why | Size |
|---|---|---|
| Code-sign the installer | Removes the "Windows protected your PC" warning; needs a certificate | Small once a certificate exists |
| Show a small "keys are being recorded" indicator in the recording bar | Makes recording state obvious at a glance | Small · **good first issue** |
| "Pause key recording" button while recording | Lets you type a password mid-recording even with typing recorded | Small |

## Features

| Item | Why |
|---|---|
| Show Hangul and other typed text as entered, not as Latin key letters | Requested for Korean tutorials |
| Pointer hiding for window recordings and for more than one monitor | Today it works for whole-screen recordings and has been checked with one monitor |
| Optional bundled speech model for fully offline subtitles | Today the model is downloaded on first use |
| macOS build | The key hook and Electron work there; capture and pointer hiding need another route |

## Needs testing on other computers

Windows 10, NVIDIA and AMD graphics, two or more monitors, a real microphone and webcam with pointer hiding, high-contrast mode and 125–200 % display scaling. A [test report](https://github.com/dominkang90/keycast-studio/issues/new?template=test_report.yml) for any of these helps.
