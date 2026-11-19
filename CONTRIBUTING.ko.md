# KeyCast Studio에 기여하기

[English](CONTRIBUTING.md)

도와주셔서 고맙습니다. 버그 신고, 다른 컴퓨터에서의 테스트 결과, 번역, 코드 모두 환영합니다. 코드 전체를 알 필요는 없습니다. 대부분의 변경은 파일 하나만 건드립니다.

## 할 수 있는 일 (작은 것부터)

| 가진 것 | 할 수 있는 일 |
|---|---|
| 5분 | 내 컴퓨터에 설치해 보고 [테스트 결과](https://github.com/dominkang90/keycast-studio/issues/new?template=test_report.yml)를 보내기. 그래픽카드·Windows 버전·모니터 구성이 다를수록 도움이 됩니다 |
| 문제를 발견함 | [버그 신고](https://github.com/dominkang90/keycast-studio/issues/new?template=bug_report.yml) |
| 아이디어 | [기능 제안](https://github.com/dominkang90/keycast-studio/issues/new?template=feature_request.yml) |
| 저녁 한나절 | [`good first issue`](https://github.com/dominkang90/keycast-studio/labels/good%20first%20issue) 라벨이 붙은 이슈 하나 맡기 |
| 다른 언어 | [앱 번역](CONTRIBUTING.md#translating-the-app)이나 README 번역 |

## 준비

Windows 10 또는 11, Node.js 20 이상이 필요합니다.

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

`npm start`는 화면을 빌드하고 Electron으로 앱을 엽니다. 창이 뜨지 않으면(`node_modules` 안의 Electron을 막는 컴퓨터가 있습니다) 패키지된 앱으로 실행하세요.

```bash
npm run start:packaged
```

| 명령 | 하는 일 |
|---|---|
| `npm test` | 단위 테스트(키 묶기, 줌, 시간 계산, 자막, 타이핑 제외). 1초 안에 끝납니다 |
| `npm run build` | 화면, 브라우저 버전, `release\KeyCast Studio-win32-x64` 패키지 |
| `npm run dist` | `release\dist`에 설치 파일과 휴대용 zip. PATH의 FFmpeg 8 이상을 함께 넣습니다(`winget install Gyan.FFmpeg`) |
| `npm run icon` | `build/icon.svg`로 `build/icon.png`, `build/icon.ico`를 다시 만듭니다 |

### 자체 점검

패키지된 앱은 녹화, 편집 화면, 모든 설정 탭, 설정 창, MP4·WebM·GIF 내보내기, 파일 가져오기, 음성 모델까지 거의 모든 기능을 자동으로 점검할 수 있습니다.

```powershell
$env:KEYCAST_SELFTEST = "$PWD\tests\out"; & ".\release\KeyCast Studio-win32-x64\KeyCast Studio.exe"; Remove-Item Env:KEYCAST_SELFTEST
```

약 3초 동안 화면을 녹화하고, 점검마다 `PASS`나 `FAIL` 한 줄씩 `tests\out\selftest.log`에 쓰고, 화면 캡처를 옆에 저장합니다. 녹화·편집·내보내기를 고쳤다면 풀 리퀘스트를 보내기 전에 돌리고 결과를 적어 주세요. `tests\out`에는 내 화면 사진이 들어가므로 git에 올라가지 않게 되어 있습니다.

테스트하는 동안 내 녹화와 설정을 건드리지 않으려면 다른 폴더를 쓰게 할 수 있습니다.

| 환경 변수 | 효과 |
|---|---|
| `KEYCAST_MEDIA_ROOT` | `동영상\KeyCast Studio` 대신 쓸 폴더 |
| `KEYCAST_SAVE_DIR` | 저장 창 없이 내보내기·SRT 파일을 여기에 저장 |
| `KEYCAST_PICK_VIDEO`, `KEYCAST_PICK_IMAGE`, `KEYCAST_PICK_AUDIO` | 파일 선택 창 대신 쓸 파일 (위 두 변수나 자체 점검과 함께일 때만) |

앱 설정까지 따로 쓰려면 실행할 때 `--user-data-dir=<폴더>`를 붙이세요.

## 코드 구성

먼저 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)를 읽어 주세요. 요약하면:

- `electron/`은 페이지 밖에서 도는 부분입니다. 창, 전역 키 기록, FFmpeg 화면 캡처, 파일 저장.
- `src/ui/`에는 화면이나 창마다 파일이 하나씩 있습니다(`home.js`, `editor.js`, `recording.js`, `dialogs.js` 등).
- `src/lib/`에는 DOM을 건드리지 않는 로직이 있습니다. 한 장면 그리기, 타임라인, 줌, 키 묶기, 자막, 내보내기. 대부분 Node에서 단위 테스트할 수 있습니다.

## 변경 보내기

1. 작은 수정보다 큰 변경은 먼저 이슈를 열어 방향을 맞춰 주세요. 시간을 들이기 전에 합의하는 편이 좋습니다.
2. `main`에서 브랜치를 만들고, 한 가지만 바꾸고, 주변 스타일을 따라 주세요(들여쓰기 2칸, 작은따옴표, 세미콜론, *왜*를 적은 주석이 붙은 작은 함수).
3. `src/lib/`을 바꿨다면 `tests/run.mjs`에 테스트를 추가하거나 고쳐 주세요.
4. `npm test`를 돌리고, 녹화·편집·내보내기를 건드렸다면 자체 점검도 돌려 주세요.
5. 풀 리퀘스트를 엽니다. 양식이 무엇을 바꿨는지, 어떻게 확인했는지, 어떤 컴퓨터였는지 묻습니다.

화면 문구는 지금 한국어입니다. 짧고 쉽게 쓰고, 버튼과 이름표 끝에는 마침표를 찍지 않습니다. 아래 번역 작업이 들어가기 전까지는 한국어 문구를 넣고 풀 리퀘스트에 영어 뜻을 적어 주세요.

## 앱 번역 계획

화면 문구가 아직 코드 안에 직접 적혀 있습니다. 계획은 [로드맵](docs/ROADMAP.md)에서 관리합니다.

1. 모든 문구를 `src/i18n/ko.json`으로 옮기고 작은 `t('key')` 함수로 읽기
2. `en.json`과 다른 언어를 추가하고, 기본은 Windows 언어를 따르는 언어 메뉴 만들기
3. 사용설명서(`사용설명서.html`) 번역

1단계는 처음 맡기 좋은 큰 작업입니다. 번역하고 싶으시면 어떤 언어인지 이슈로 알려 주세요. 1단계가 들어가는 대로 문구 파일을 드리겠습니다.

## 릴리즈

관리자용: `package.json`의 `version`을 올리고, `CHANGELOG.md`에 항목을 추가하고, `npm run dist`를 돌리고, 새 사용자 계정에서 설치 파일을 확인한 뒤 GitHub 릴리즈를 만듭니다. 설치 파일, 휴대용 zip, `KeyCast-Studio-web.zip`과 각 SHA-256 값, VirusTotal 링크를 붙입니다.

## 행동 규칙

친절하게, 좋은 뜻이라고 생각하고 대해 주세요. 사람이 아니라 코드를 비평해 주세요. 적대적이거나 주제와 무관한 글과 기여는 관리자가 지울 수 있습니다.

## 라이선스

기여하신 내용은 [MIT 라이선스](LICENSE)로 공개되는 것에 동의하시는 것으로 봅니다.
