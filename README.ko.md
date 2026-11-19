<p align="center"><img src="build/icon.png" width="96" alt="KeyCast Studio 아이콘"></p>

<h1 align="center">KeyCast Studio</h1>

<p align="center">
  <a href="README.md">English</a> · <b>한국어</b> · <a href="README.ja.md">日本語</a> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  누른 단축키를 영상에 보여 주고, 클릭한 곳을 자동으로 확대하고, 실제 마우스 커서 대신 부드러운 커서를 그려 넣고,<br>
  목소리를 이 컴퓨터 안에서 자막으로 바꿔 주는 Windows용 화면 녹화·편집 프로그램입니다.
</p>

<p align="center">
  <a href="https://github.com/dominkang90/keycast-studio/releases/latest">내려받기</a> ·
  <a href="CHANGELOG.md">변경 내역</a> ·
  <a href="CONTRIBUTING.ko.md">기여하기</a> ·
  <a href="SECURITY.md">보안과 개인 정보</a> ·
  <a href="사용설명서.html">사용설명서</a>
</p>

<p align="center"><img src="https://img.shields.io/badge/status-beta-orange" alt="베타"> <img src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue" alt="Windows 10, 11"> <img src="https://img.shields.io/github/license/dominkang90/keycast-studio" alt="MIT 라이선스"> <a href="https://github.com/dominkang90/keycast-studio/actions/workflows/ci.yml"><img src="https://github.com/dominkang90/keycast-studio/actions/workflows/ci.yml/badge.svg" alt="CI"></a></p>

![키 표시, 클릭 확대, 자막이 들어간 결과 영상](docs/demo.gif)

> KeyCast Studio로 녹화하고 그대로 내보낸 결과입니다. 시연용 자막은 직접 입력했습니다.

## 키보드 기록에 대해

영상에 키를 보여 주려면 누른 키를 알아야 합니다. 설치하기 전에 읽어 주세요.

- **언제:** 녹화하는 동안에만 키와 클릭을 기록합니다. "녹화 없이 키만 보여주기"는 화면에 그리기만 하고 아무것도 저장하지 않습니다.
- **무엇을:** 기본으로는 혼자 입력한 글자·숫자·기호를 저장하기 전에 버립니다. 그래서 비밀번호 같은 입력은 녹화 파일에 남지 않습니다. 단축키(Ctrl·Alt·Win 조합, F키, Esc)와 Enter·방향키 같은 키만 남습니다. 타이핑도 영상에 보여 주려면 녹화 옵션의 **타이핑한 글자도 기록**을 켜세요.
- **어디에:** 모든 것이 이 컴퓨터의 `동영상\KeyCast Studio` 폴더에만 남습니다. 어디로도 보내지 않습니다. 인터넷은 자막을 처음 만들 때 음성 인식 모델을 내려받는 데만 씁니다.
- **직접 확인:** 소스 코드가 모두 여기 있고, 릴리즈마다 SHA-256 값과 VirusTotal 검사 결과를 붙입니다. 자세한 내용은 [SECURITY.md](SECURITY.md)에 있습니다.

## 주요 기능

**녹화**
- 전체 화면 또는 창 하나를 녹화하고, 마이크·컴퓨터 소리·웹캠을 함께 담습니다.
- 어떤 프로그램에서든 키·클릭·드래그·휠을 시각과 함께 기록합니다.
- 실제 마우스 커서를 빼고 녹화한 뒤, 편집할 때 크고 부드러운 커서를 다시 그려 넣습니다(설치 파일에 FFmpeg 포함).
- 녹화 중 화면 키 표시를 켜고 끕니다(녹화 막대의 키보드 버튼 또는 `Alt` + `Shift` + `K`).
- 멈추기·일시정지·키 표시 단축키를 바꿀 수 있습니다.

**편집**
- 키 표시: 단축키만(기본) / 모든 키 / 고른 키만, 위치 9곳, 테마 4종과 직접 꾸미기, 나타나는 방식 5종, `K` 한 번으로 영상에서 켜고 끄기
- 클릭한 곳으로 자동 확대하고 커서를 부드럽게 따라갑니다. 확대 구간은 직접 넣고 고칠 수 있습니다.
- 앞뒤 자르기, 중간 잘라내기, 구간별 속도(0.25×~4×), 되돌리기·다시 하기
- 글자·화살표·네모·그림 주석, 개인 정보를 흐리게 가리기
- 배경(색·그라데이션·배경 그림·내 그림), 여백, 둥근 모서리, 그림자, 크롭, 화면 비율(16:9, 9:16, 1:1, 4:3)
- 웹캠 말풍선, 배경 음악·효과음

**자막**
- 목소리를 이 컴퓨터 안에서 받아 적어(Whisper) 문장 단위 자막을 만듭니다. 한국어·영어·일본어·중국어·스페인어·독일어·프랑스어.
- 고치고, 영상에 넣거나 SRT 파일로 저장합니다.

**내보내기**
- MP4·WebM(30/60fps, 720p~4K)과 GIF. 잘라낸 구간, 속도 변경, 추가한 소리가 반영됩니다.

**녹화 없이 키만 보여주기**
- 발표·화상 회의·다른 녹화 프로그램을 쓸 때 단축키와 클릭만 화면 위에 띄웁니다.

| 녹화할 화면 고르기 | 키 표시 꾸미기 |
|---|---|
| ![처음 화면](docs/home.png) | ![편집 화면의 키 설정](docs/editor-keys.png) |

## 설치

**필요한 것:** Windows 10 또는 11 (64비트)

[최신 릴리즈](https://github.com/dominkang90/keycast-studio/releases/latest)에서 받으세요.

| 파일 | 용도 |
|---|---|
| **KeyCast-Studio-Setup-x.y.z.exe** | 추천. FFmpeg까지 모두 설치하고 시작 메뉴·바탕화면 바로가기와 제거 프로그램을 만듭니다 |
| KeyCast-Studio-x.y.z-win-x64.zip | 설치 없이 쓰는 버전. 압축을 풀고 `KeyCast Studio.exe`를 실행합니다. FFmpeg 포함 |
| KeyCast-Studio-web.zip | Chrome·Edge에서 설치 없이 맛보기. 그 탭 안에서 누른 키만 기록합니다 |

> 처음 실행할 때 **Windows의 PC 보호** 창이 뜨면 **추가 정보 → 실행**을 누르세요. 아직 코드 서명 인증서가 없어서 나오는 안내입니다. 릴리즈 페이지의 SHA-256 값과 VirusTotal 결과로 파일을 확인할 수 있습니다.

자막을 처음 만들 때 음성 인식 모델(정확도에 따라 약 40MB~600MB)을 Hugging Face에서 한 번 내려받습니다.

## 사용법

1. **어디를 녹화할까요?**에서 전체 화면이나 창을 고르고 오른쪽 녹화 옵션을 정한 뒤 **녹화 시작**을 누릅니다.
2. 평소처럼 작업합니다. 화면 위쪽 녹화 막대나 단축키로 멈추면 편집 화면이 열립니다.
3. 오른쪽 탭에서 다듬고 **내보내기**로 저장합니다.

| 단축키 | 하는 일 |
|---|---|
| `Alt` + `Shift` + `S` | 녹화 멈추고 편집으로 (어느 프로그램에서든, 바꿀 수 있음) |
| `Alt` + `Shift` + `P` | 녹화 일시정지 / 다시 시작 (바꿀 수 있음) |
| `Alt` + `Shift` + `K` | 화면 키 표시 켜기 / 끄기 (바꿀 수 있음) |
| `Space` | 편집 화면에서 재생 / 정지 |
| `←` `→` | 한 프레임 이동, `Shift`와 함께 5초 |
| `K` | 영상의 키 표시 켜기 / 끄기 |
| `S` | 지금 위치에 잘라낼 구간 만들기 |
| `Delete` | 타임라인에서 고른 구간 지우기 |
| `Ctrl` + `Z` / `Ctrl` + `Y` | 되돌리기 / 다시 하기 |

## 시험한 환경

베타 버전입니다. 지금까지 Windows 11, Intel Arc 그래픽, 2880×1800 화면, 모니터 한 대인 컴퓨터 한 대에서 확인했습니다.

아직 확인하지 못한 것: Windows 10, NVIDIA·AMD 그래픽, 모니터 여러 대, 실제 마이크·웹캠과 커서 숨김 녹화를 함께 쓰는 경우. 써 보셨다면 [테스트 결과 보내기](https://github.com/dominkang90/keycast-studio/issues/new?template=test_report.yml)가 2분이면 되고 큰 도움이 됩니다.

## 알려진 제한

- Windows 전용입니다.
- 한글로 타이핑해도 키 표시는 자판의 영문 글자(예: `ㅎ` 대신 `G`)로 나옵니다. 키 표시는 단축키를 보여 주는 용도입니다.
- 실제 커서 숨기기는 전체 화면 녹화에서만 됩니다.
- 음성 인식에 쓸 수 있는 그래픽카드가 없으면 CPU를 써서 영상 길이보다 오래 걸릴 수 있습니다.

## 직접 빌드하기

Windows와 Node.js 20 이상이 필요합니다.

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

`npm test`는 단위 테스트, `npm run build`는 `release\KeyCast Studio-win32-x64` 폴더, `npm run dist`는 설치 파일과 휴대용 zip을 만듭니다(함께 넣을 FFmpeg 8 이상이 PATH에 있어야 함). [CONTRIBUTING.ko.md](CONTRIBUTING.ko.md)와 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)를 보세요.

## 참고한 프로젝트와 오픈소스

기능 구성은 [Recordly](https://github.com/webadderallorg/Recordly)(화면 녹화·편집)와 [keyviz](https://github.com/mulaRahul/keyviz)(키 표시)를 참고했습니다. 두 프로젝트의 코드는 가져오지 않았습니다.

| 이름 | 용도 | 라이선스 |
|---|---|---|
| [Electron](https://www.electronjs.org/) | 데스크톱 앱 | MIT |
| [uiohook-napi](https://github.com/SnosMe/uiohook-napi) | 모든 프로그램의 키·클릭 기록 | MIT |
| [Transformers.js](https://github.com/huggingface/transformers.js) / ONNX Runtime Web | 음성 인식(Whisper) | Apache-2.0 / MIT |
| [mp4-muxer](https://github.com/Vanilagy/mp4-muxer), [webm-muxer](https://github.com/Vanilagy/webm-muxer) | 영상 파일 만들기 | MIT |
| [gifenc](https://github.com/mattdesl/gifenc) | GIF 만들기 | MIT |
| [FFmpeg](https://ffmpeg.org/) | 커서 없는 화면 캡처. 설치 파일과 zip에 고치지 않은 상태로 들어 있고 별도 프로그램으로 실행됩니다 | GPL-3.0 ([소스](https://ffmpeg.org/download.html)) |

## 라이선스

[MIT](LICENSE). 함께 배포하는 FFmpeg는 자체 라이선스를 따릅니다. 설치된 앱의 `resources\app\bin\FFMPEG-LICENSE.txt`를 보세요.
