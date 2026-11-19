// The home screen: what to record, recording options, recent recordings, opening a video file.

import { platform, isDesktop } from '../lib/platform.js';
import { fmt } from '../lib/timeline.js';
import { setLabel } from '../lib/icons.js';
import { h, toast, mount, topbar, inlineSwitch, selectField, kbdLabel } from './dom.js';
import { state, shortcuts, savedLook, saveOptions, liveOverlaySettings } from './state.js';
import { openKeyStyle, openShortcuts } from './dialogs.js';
import { startRecording } from './recording.js';
import { stopEditor, openEditor } from './editor.js';
// ------------------------------------------------------------------ home
export async function loadDevices() {
  try {
    if (isDesktop) {
      // Device names only appear after access was granted once.
      const s = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      s?.getTracks().forEach((t) => t.stop());
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.mics = devices.filter((d) => d.kind === 'audioinput');
    state.cams = devices.filter((d) => d.kind === 'videoinput');
  } catch {
    state.mics = [];
    state.cams = [];
  }
}

export async function refreshSources() {
  try {
    state.sources = await platform.listSources();
  } catch (err) {
    state.sources = [];
    toast(`화면 목록을 읽지 못했습니다: ${err.message}`, true);
  }
  if (!state.sources.find((s) => s.id === state.sourceId)) {
    state.sourceId = (state.sources.find((s) => s.kind === 'screen') || state.sources[0])?.id || null;
  }
}


export async function showHome() {
  stopEditor();
  mount(h('div', { class: 'home' }, h('div', { class: 'empty' }, '불러오는 중…')));
  if (!state.info) state.info = await platform.info();
  await Promise.all([refreshSources(), loadDevices()]);
  const projects = await platform.listProjects().catch(() => []);
  renderHome(projects);
}

export function renderHome(projects) {
  const o = state.options;
  const sourcesGrid = h('div', { class: 'sources' });
  const drawSources = () => {
    const list = state.sources.filter((s) => !isDesktop || s.kind === state.sourceKind);
    if (!list.length) {
      sourcesGrid.replaceChildren(h('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, state.sourceKind === 'window' ? '열려 있는 창이 없습니다.' : '화면을 찾지 못했습니다.'));
      return;
    }
    sourcesGrid.replaceChildren(...list.map((s) => h('button', {
      class: `source${s.id === state.sourceId ? ' on' : ''}`,
      onclick: () => { state.sourceId = s.id; drawSources(); },
    },
    h('div', { class: 'thumb', style: s.thumbnail ? { backgroundImage: `url(${s.thumbnail})` } : null }, s.thumbnail ? '' : '🖥  시작하면 고릅니다'),
    h('div', { class: 'name' }, s.icon ? h('img', { src: s.icon, alt: '' }) : null, h('span', {}, s.name)))));
  };
  drawSources();

  const kindTabs = h('div', { class: 'tabs' });
  const drawTabs = () => kindTabs.replaceChildren(
    ...[['screen', '전체 화면'], ['window', '창']].map(([k, n]) => h('button', { class: state.sourceKind === k ? 'on' : '', onclick: () => {
      state.sourceKind = k;
      const first = state.sources.find((s) => s.kind === k);
      if (first) state.sourceId = first.id;
      drawTabs();
      drawSources();
    } }, n)));
  drawTabs();

  const micOptions = [{ id: '', name: '사용 안 함' }, { id: 'default', name: '기본 마이크' },
    ...state.mics.filter((m) => m.deviceId !== 'default' && m.deviceId !== 'communications').map((m, i) => ({ id: m.deviceId, name: m.label || `마이크 ${i + 1}` }))];
  const camOptions = [{ id: '', name: '사용 안 함' },
    ...state.cams.map((c, i) => ({ id: c.deviceId, name: c.label || `카메라 ${i + 1}` }))];

  const recordCard = h('div', { class: 'card' },
    h('h2', {}, '녹화 옵션'),
    h('div', { class: 'sub' }, '누른 키와 클릭은 항상 함께 기록됩니다. 편집 화면에서 켜고 끌 수 있어요.'),
    !state.info?.inputHook && isDesktop ? h('div', { class: 'hint warn' }, '키보드 기록 모듈을 불러오지 못했습니다. 키 표시 없이 녹화됩니다.') : null,
    !isDesktop ? h('div', { class: 'hint warn' }, '브라우저에서는 이 탭에 초점이 있을 때 누른 키만 기록됩니다. 모든 프로그램의 키를 표시하려면 데스크톱 앱을 실행하세요.') : null,
    selectField('마이크 (자막을 만들 목소리)', o.micId, micOptions, (v) => { o.micId = v; saveOptions(); }),
    inlineSwitch('컴퓨터 소리 함께 녹음', o.systemAudio, (v) => { o.systemAudio = v; saveOptions(); }),
    selectField('웹캠 (얼굴 말풍선)', o.webcamId, camOptions, (v) => { o.webcamId = v; saveOptions(); }),
    inlineSwitch('타이핑한 글자도 기록', !!o.recordTyping, (v) => { o.recordTyping = v; saveOptions(); }, '끄면 단축키만 저장합니다. 비밀번호 같은 입력이 녹화 파일에 남지 않습니다'),
    isDesktop ? inlineSwitch('녹화 중 화면에 키 보여주기', o.liveOverlay, (v) => { o.liveOverlay = v; saveOptions(); }, '나에게만 보이고 녹화 파일에는 들어가지 않습니다') : null,
    isDesktop && state.info?.ffmpeg ? inlineSwitch('실제 마우스 커서 숨기고 녹화', o.hideCursor !== false, (v) => { o.hideCursor = v; saveOptions(); }, '전체 화면 녹화에서만. 편집 화면에서 크고 부드러운 커서를 대신 그려 넣습니다') : null,
    isDesktop && state.info && !state.info.ffmpeg ? h('div', { class: 'small muted', style: { marginBottom: '12px' } }, 'ffmpeg를 설치하면 실제 마우스 커서를 숨기고 녹화할 수 있습니다.') : null,
    inlineSwitch('3초 카운트다운', o.countdown, (v) => { o.countdown = v; saveOptions(); }),
    h('button', { class: 'btn rec wide', onclick: startRecording }, h('span', { class: 'recdot', style: { animation: 'none', background: '#fff' } }), '녹화 시작'),
    isDesktop ? h('div', { class: 'keys-ref' },
      h('span', {}, '멈추기'), h('span', {}, kbdLabel(shortcuts().stop)),
      h('span', {}, '일시정지'), h('span', {}, kbdLabel(shortcuts().pause))) : null,
    isDesktop ? h('div', { class: 'section' },
      h('h2', {}, '녹화 없이 키만 보여주기'),
      h('div', { class: 'sub' }, '발표·화상 회의·다른 녹화 프로그램을 쓸 때, 누른 키와 클릭을 화면 위에 띄웁니다.'),
      h('div', { class: 'row' },
        keysOnlyBtn(),
        h('button', { class: 'btn', title: '키 표시 모양과 보여줄 키 고르기', onclick: openKeyStyle }, '🎨 꾸미기')),
      h('div', { class: 'small muted', style: { marginTop: '8px' } }, '끄기 ', kbdLabel(shortcuts().keys))) : null);

  const features = h('div', { class: 'features' },
    feature('⌨️', '#6d5efc33', '모든 키 표시', '어떤 프로그램에서 누른 키든 단축키와 타이핑을 말풍선으로'),
    feature('🔍', '#a371f733', '클릭하면 자동 확대', '클릭한 곳으로 부드럽게 줌, 커서를 따라 이동'),
    feature('💬', '#3fb95033', '목소리로 자막', '내 컴퓨터에서 음성을 받아 적고 문장 단위로 자막 정리'),
    feature('🎬', '#f7797d33', '완성된 영상 저장', '배경·키·자막을 입혀 MP4로, 자막은 SRT로도'));

  const recent = h('div', { class: 'recent' },
    h('div', { class: 'recent-head' },
      h('h2', { style: { fontSize: '16px' } }, '최근 녹화'),
      isDesktop ? h('button', { class: 'btn small', onclick: () => platform.openRecordingsFolder() }, '📁 녹화 폴더 열기') : null),
    projects.length
      ? h('div', { class: 'recent-list' }, projects.map((p) => h('div', { class: 'recent-item' },
        h('b', {}, p.name),
        h('div', { class: 'meta' },
          h('span', {}, `⏱ ${fmt((p.durationMs || 0) / 1000)}`),
          h('span', {}, `⌨ 키 ${p.keyCount ?? 0}`),
          h('span', {}, `💬 자막 ${p.subtitles ?? 0}`),
          p.source ? h('span', { class: 'chip' }, p.source.length > 28 ? `${p.source.slice(0, 27)}…` : p.source) : null),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: () => openEditor(p.id) }, '편집하기'),
          h('div', { class: 'grow' }),
          h('button', { class: 'btn small ghost danger', title: '삭제', onclick: async () => {
            if (!confirm(`'${p.name}' 녹화를 지울까요? 되돌릴 수 없습니다.`)) return;
            try {
              await platform.deleteProject(p.id);
            } catch (err) {
              toast(`녹화를 지우지 못했습니다: ${err.message}`, true);
            }
            showHome();
          } }, '삭제')))))
      : h('div', { class: 'empty' }, '아직 녹화한 영상이 없습니다. 위에서 화면을 고르고 녹화를 시작하세요.'));

  mount(
    topbar(
      h('button', { class: 'btn small', title: '다른 프로그램으로 만든 영상을 불러와 편집합니다', onclick: importVideo }, '📂 영상 파일 열기'),
      isDesktop ? h('button', { class: 'btn small', onclick: openShortcuts }, '⌨ 단축키') : null,
      isDesktop ? h('button', { class: 'btn small', onclick: async () => { await refreshSources(); drawSources(); } }, '↻ 새로 고침') : null),
    !isDesktop ? h('div', { class: 'banner' }, '브라우저 미리보기 모드: 녹화·편집·자막·내보내기를 모두 쓸 수 있지만, 키는 이 탭 안에서만 잡히고 녹화는 탭을 닫으면 사라집니다.') : null,
    h('main', { class: 'home' },
      h('div', { class: 'home-grid' },
        // left: what to record and what was recorded before; right: how to record, always in view
        h('div', { class: 'home-main' },
          h('section', { class: 'card' },
            h('div', { class: 'row', style: { marginBottom: '4px' } }, h('h2', { class: 'grow' }, '어디를 녹화할까요?'), isDesktop ? kindTabs : null),
            h('div', { class: 'sub' }, isDesktop ? '전체 화면을 고르면 클릭 위치에 맞춘 자동 확대와 클릭 효과도 쓸 수 있습니다' : '녹화 시작을 누르면 브라우저가 녹화할 화면을 물어봅니다'),
            sourcesGrid),
          recent),
        h('aside', { class: 'home-side' }, recordCard)),
      features));
}

// ---- keys on screen without recording
export let keysOn = false;
export let keysBtn = null;
export function drawKeysBtn() {
  if (!keysBtn) return;
  setLabel(keysBtn, keysOn ? '■ 키 표시 끄기' : '⌨ 키 표시 켜기');
  keysBtn.classList.toggle('on', keysOn);
  keysBtn.setAttribute('aria-pressed', String(keysOn));
}
export function keysOnlyBtn() {
  keysBtn = h('button', { class: 'btn grow', onclick: async () => {
    keysOn = await platform.toggleKeys({ overlay: liveOverlaySettings(), shortcut: shortcuts().keys });
    drawKeysBtn();
    if (keysOn) toast(`키 표시를 켰습니다. 끄려면 ${shortcuts().keys} 또는 이 버튼.`);
  } });
  drawKeysBtn();
  platform.keysState().then((on) => { keysOn = on; drawKeysBtn(); });
  return keysBtn;
}
platform.onKeysState((on) => { keysOn = on; drawKeysBtn(); });

/** Open a video made with another program as a new recording. */
export async function importVideo() {
  let picked = null;
  try {
    picked = await platform.importProject();
    if (!picked) return;
    const url = platform.mediaUrl(picked.id, picked.file);
    const v = h('video', { preload: 'auto', muted: true, src: url });
    await new Promise((resolve, reject) => { v.onloadedmetadata = resolve; v.onerror = () => reject(new Error('이 영상 형식은 열 수 없습니다 (MP4·WebM을 권장합니다).')); });
    if (!Number.isFinite(v.duration)) {
      // Some files do not state their length: jump to the end to find it.
      v.currentTime = 1e7;
      await new Promise((r) => { v.onseeked = r; setTimeout(r, 5000); });
    }
    const duration = Number.isFinite(v.duration) ? v.duration : v.currentTime;
    const size = { width: v.videoWidth, height: v.videoHeight };
    v.removeAttribute('src');
    v.load();
    if (!(duration > 0) || !size.width) throw new Error('영상 길이나 크기를 읽지 못했습니다.');
    const settings = savedLook();
    settings.frame.crop = { x: 0, y: 0, w: 1, h: 1 };
    settings.webcam.enabled = false;
    const createdAt = new Date().toISOString();
    const project = {
      version: 1, id: picked.id, name: picked.label.replace(/\.[^.]+$/, ''), createdAt,
      source: { name: picked.label, kind: 'file', ...size },
      files: { screen: picked.file, voice: null, audio: null, webcam: null },
      durationMs: Math.round(duration * 1000), inputHooked: false, events: [], settings,
      zooms: [], subtitles: [], cuts: [], speeds: [], annotations: [], audios: [], trim: { start: 0, end: duration },
    };
    await platform.saveProject(project);
    openEditor(project.id, project);
  } catch (err) {
    if (picked) platform.deleteProject(picked.id).catch(() => {});
    toast(`영상을 열지 못했습니다: ${err.message}`, true);
  }
}

export function feature(mark, _tint, title, text) {
  return h('div', { class: 'feature' }, h('div', { class: 'feature-icon' }, mark), h('div', {}, h('b', {}, title), h('p', {}, text)));
}

