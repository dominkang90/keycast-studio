# KeyCast Studio

누른 키와 클릭을 영상에 보여 주고, 클릭한 곳을 자동으로 확대하고, 목소리를 자막으로 바꿔 주는 Windows용 화면 녹화·편집 프로그램입니다. 코딩 강의, 단축키 소개, 프로그램 사용법 영상을 녹화부터 편집·저장까지 한 프로그램 안에서 만들 수 있습니다.

![녹화한 화면에 키 표시, 자동 확대, 자막이 들어간 결과 영상](docs/demo.gif)

> 위 영상은 KeyCast Studio로 녹화하고 그대로 내보낸 결과를 GIF로 줄인 것입니다. 시연용 자막은 직접 입력했습니다.

[최신 버전 내려받기](https://github.com/dominkang90/keycast-studio/releases/latest) · [변경 내역](CHANGELOG.md) · [사용설명서](사용설명서.html)

## 주요 기능

**녹화**
- 전체 화면 또는 창 하나를 녹화하고, 마이크와 컴퓨터 소리를 함께 담습니다.
- 어떤 프로그램에서 누른 키든, 마우스 클릭·드래그·휠까지 시각과 함께 기록합니다.
- 실제 마우스 커서를 빼고 녹화한 뒤, 편집할 때 크고 부드러운 커서를 다시 그려 넣을 수 있습니다 (ffmpeg 8 이상 필요).
- 웹캠을 함께 녹화해 얼굴을 말풍선으로 넣을 수 있습니다.
- 일시정지·멈추기 단축키는 원하는 조합으로 바꿀 수 있습니다.

**편집**
- 키 표시: 모든 키 / 단축키만 / 고른 키만, 위치 9곳, 테마 4종과 직접 꾸미기, 나타나는 방식 5종.
- 클릭한 곳으로 자동 확대하고 커서를 따라 부드럽게 움직입니다. 확대 구간은 직접 넣고 고칠 수 있습니다.
- 앞뒤 자르기, 중간 잘라내기, 구간별 속도(0.25×~4×), 되돌리기·다시 하기.
- 글자·화살표·네모·그림 주석과 개인 정보를 흐리게 가리는 기능.
- 배경 색·그라데이션·배경 그림·내 그림, 여백, 둥근 모서리, 그림자, 화면 잘라내기(크롭), 화면 비율(16:9, 9:16, 1:1, 4:3).
- 배경 음악·효과음 추가, 녹화 소리 크기 조절.

**자막**
- 녹음된 목소리를 이 컴퓨터 안에서 받아 적어(Whisper) 문장 단위 자막으로 만듭니다. 한국어·영어·일본어 등을 지원합니다.
- 자막 내용과 시간을 고치고, 영상에 넣거나 SRT 파일로 저장할 수 있습니다.

**내보내기**
- MP4·WebM(30/60fps, 720p~4K)과 GIF로 저장합니다. 잘라낸 구간과 속도 변경이 그대로 반영됩니다.

**녹화 없이 키만 보여주기**
- 발표나 화상 회의, 다른 녹화 프로그램을 쓸 때 누른 키와 클릭만 화면 위에 띄울 수 있습니다.

| 녹화할 화면 고르기 | 키 표시 꾸미기 |
|---|---|
| ![처음 화면](docs/home.png) | ![편집 화면의 키 설정](docs/editor-keys.png) |

## 내려받기와 실행

**필요한 것**: Windows 10 또는 11 (64비트)

1. [릴리즈 페이지](https://github.com/dominkang90/keycast-studio/releases/latest)에서 `KeyCast-Studio-win-x64.zip`을 내려받습니다.
2. zip 파일을 마우스 오른쪽 버튼으로 누르고 **모두 압축 풀기**를 고릅니다. zip 안에서 바로 실행하면 제대로 동작하지 않습니다.
3. 압축을 푼 폴더의 **KeyCast Studio.exe**를 실행합니다. 설치 과정은 없습니다.

> 처음 실행할 때 **Windows의 PC 보호** 창이 뜨면 **추가 정보 → 실행**을 누르세요. 코드 서명 인증서가 없는 프로그램이라 나오는 안내입니다.

**실제 마우스 커서를 숨기고 녹화하려면** ffmpeg 8 이상이 필요합니다. 아래 명령으로 설치한 뒤 KeyCast Studio를 다시 켜면 녹화 옵션에 나타납니다.

```bash
winget install Gyan.FFmpeg
```

**자막 만들기**를 처음 쓸 때는 음성 인식 모델(정확도에 따라 약 40MB~600MB)을 Hugging Face에서 한 번 내려받습니다.

## 사용법

1. **어디를 녹화할까요?**에서 전체 화면이나 창을 고르고, 오른쪽 녹화 옵션을 정한 뒤 **녹화 시작**을 누릅니다.
2. 평소처럼 작업합니다. 화면 위쪽 녹화 막대나 단축키로 멈추면 바로 편집 화면이 열립니다.
3. 오른쪽 탭(화면·자르기·줌·주석·키·커서·웹캠·소리·자막)에서 다듬고, **내보내기**로 저장합니다.

자세한 내용은 앱의 **사용법** 버튼이나 [사용설명서](사용설명서.html)를 보세요.

| 단축키 | 하는 일 |
|---|---|
| `Alt` + `Shift` + `S` | 녹화 멈추고 편집으로 (어느 프로그램에서든, 바꿀 수 있음) |
| `Alt` + `Shift` + `P` | 녹화 일시정지 / 다시 시작 (바꿀 수 있음) |
| `Alt` + `Shift` + `K` | 녹화 없이 띄운 키 표시 끄기 (바꿀 수 있음) |
| `Space` | 편집 화면에서 재생 / 정지 |
| `←` `→` | 한 프레임 이동, `Shift`와 함께 5초 |
| `S` | 지금 위치에 잘라낼 구간 만들기 |
| `Delete` | 타임라인에서 고른 구간 지우기 |
| `Ctrl` + `Z` / `Ctrl` + `Y` | 되돌리기 / 다시 하기 |

## 개인 정보

- 녹화, 키 기록, 음성 인식, 내보내기는 모두 이 컴퓨터 안에서 처리합니다. 녹화한 내용을 어디로도 보내지 않습니다.
- 인터넷은 음성 인식 모델을 처음 내려받을 때만 씁니다.
- 녹화는 `동영상\KeyCast Studio` 폴더에 저장되고, 앱의 **삭제** 버튼으로 지울 수 있습니다.
- 키 기록은 녹화하는 동안에만 켜집니다. "녹화 없이 키만 보여주기"를 켠 동안에는 화면에 표시만 하고 저장하지 않습니다.

## 알려진 제한

- Windows 전용입니다.
- 한글로 타이핑해도 키 표시는 자판의 영문 글자(예: `ㅎ` 대신 `G`)로 나옵니다. 키 표시는 단축키를 보여 주는 용도입니다.
- 실제 커서 숨기기는 전체 화면 녹화에서만 되고, 모니터가 여러 대인 환경에서는 충분히 시험하지 못했습니다.
- 그래픽카드로 음성 인식이 안 되는 컴퓨터에서는 자동으로 CPU를 쓰며, 이때 영상 길이보다 오래 걸릴 수 있습니다.

## 직접 빌드하기

Node.js 20 이상이 필요합니다.

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
npm run build
```

빌드가 끝나면 `release\KeyCast Studio-win32-x64\KeyCast Studio.exe`가 생깁니다. `npm test`로 단위 테스트를 돌릴 수 있습니다.

| 폴더 | 내용 |
|---|---|
| `electron/` | 창, 전역 키·마우스 기록, ffmpeg 화면 캡처, 파일 저장 |
| `src/` | 화면(홈·편집·녹화 막대·실시간 키 표시) |
| `src/lib/` | 녹화, 합성, 타임라인, 자동 확대, 자막, 내보내기 |
| `tests/` | 단위 테스트와 패키지 점검 |

## 참고한 프로젝트

기능 구성은 [Recordly](https://github.com/webadderallorg/Recordly)(화면 녹화·편집)와 [keyviz](https://github.com/mulaRahul/keyviz)(키 표시)를 참고했습니다. 두 프로젝트의 코드는 가져오지 않았고 모두 새로 작성했습니다.

## 사용한 오픈소스

| 이름 | 용도 | 라이선스 |
|---|---|---|
| [Electron](https://www.electronjs.org/) | 데스크톱 앱 | MIT |
| [uiohook-napi](https://github.com/SnosMe/uiohook-napi) | 전역 키·마우스 기록 | MIT |
| [Transformers.js](https://github.com/huggingface/transformers.js) / ONNX Runtime Web | 음성 인식(Whisper) | Apache-2.0 / MIT |
| [mp4-muxer](https://github.com/Vanilagy/mp4-muxer), [webm-muxer](https://github.com/Vanilagy/webm-muxer) | 영상 파일 만들기 | MIT |
| [gifenc](https://github.com/mattdesl/gifenc) | GIF 만들기 | MIT |
| [FFmpeg](https://ffmpeg.org/) (함께 배포하지 않음, 설치 시에만 사용) | 커서 없는 화면 캡처 | LGPL/GPL |

## 라이선스

[MIT](LICENSE)

---

### English

KeyCast Studio is a Windows screen recorder and editor. It records every key and click you make, zooms into where you click, can hide the real mouse pointer and draw a smooth one instead, and turns your voice into subtitles on your own computer (Whisper). Edit with cuts, speed ranges, annotations, backgrounds and a webcam bubble, then export MP4, WebM or GIF. Download the zip from [Releases](https://github.com/dominkang90/keycast-studio/releases/latest), extract it and run `KeyCast Studio.exe`. The interface is in Korean.
