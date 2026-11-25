// The home screen: what to record, recording options, recent recordings, opening a video file.

import { platform, isDesktop } from '../lib/platform.js';
import { fmt } from '../lib/timeline.js';
import { setLabel, withIcon } from '../lib/icons.js';
import { autoZoomRegions } from '../lib/zoom.js';
import { h, toast, mount, topbar, selectField, langMenu } from './dom.js';
import { state, store, shortcuts, savedLook, saveOptions, liveOverlaySettings, loadExtensions } from './state.js';
import { openKeyStyle, openShortcuts, openExtensions } from './dialogs.js';
import { startRecording } from './recording.js';
import { PRESETS, presetOf } from './presets.js';
import { stopEditor, openEditor } from './editor.js';
import { T } from '../lib/i18n.js';
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
    toast(T('화면 목록을 읽지 못했습니다: {0}', err.message), true);
  }
  if (!state.sources.find((s) => s.id === state.sourceId)) {
    state.sourceId = (state.sources.find((s) => s.kind === 'screen') || state.sources[0])?.id || null;
  }
}


export async function showHome() {
  loadExtensions().catch(() => {});
  stopEditor();
  mount(h('div', { class: 'home' }, h('div', { class: 'empty' }, T('불러오는 중…'))));
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
      sourcesGrid.replaceChildren(h('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, state.sourceKind === 'window' ? T('열려 있는 창이 없습니다.') : T('화면을 찾지 못했습니다.')));
      return;
    }
    // Chromium names screens in the Windows language; use the app language instead.
    const screenName = (s, all) => {
      if (s.kind !== 'screen' || !isDesktop) return s.name;
      const screens = all.filter((x) => x.kind === 'screen');
      return screens.length > 1 ? T('화면 {0}', screens.indexOf(s) + 1) : T('전체 화면');
    };
    sourcesGrid.replaceChildren(...list.map((s) => h('button', {
      class: `source${s.id === state.sourceId ? ' on' : ''}`,
      onclick: () => { state.sourceId = s.id; drawSources(); },
    },
    h('div', { class: 'thumb', style: s.thumbnail ? { backgroundImage: `url(${s.thumbnail})` } : null }, s.thumbnail ? '' : T('🖥  시작하면 고릅니다')),
    h('div', { class: 'name' }, s.icon ? h('img', { src: s.icon, alt: '' }) : null, h('span', {}, screenName(s, list))))));
  };
  drawSources();

  const kindTabs = h('div', { class: 'tabs' });
  const drawTabs = () => kindTabs.replaceChildren(
    ...[['screen', T('전체 화면')], ['window', T('창')]].map(([k, n]) => h('button', { class: state.sourceKind === k ? 'on' : '', onclick: () => {
      state.sourceKind = k;
      const first = state.sources.find((s) => s.kind === k);
      if (first) state.sourceId = first.id;
      drawTabs();
      drawSources();
    } }, n)));
  drawTabs();

  const micOptions = [{ id: '', name: T('사용 안 함') }, { id: 'default', name: T('기본 마이크') },
    ...state.mics.filter((m) => m.deviceId !== 'default' && m.deviceId !== 'communications').map((m, i) => ({ id: m.deviceId, name: m.label || T('마이크 {0}', i + 1) }))];
  const camOptions = [{ id: '', name: T('사용 안 함') },
    ...state.cams.map((c, i) => ({ id: c.deviceId, name: c.label || T('카메라 {0}', i + 1) }))];

  // ---- how to record: a purpose, then one line of chips (each one setting) instead of a long form
  const presetRow = h('div', { class: 'presets', role: 'radiogroup', 'aria-label': T('무엇을 녹화하나요?') });
  const chipRow = h('div', { class: 'opts' });
  const chipDetail = h('div', { class: 'opt-detail' });
  let openChip = null;
  const changed = () => { saveOptions(); drawPresets(); drawChips(); };
  function drawPresets() {
    const cur = presetOf(o);
    presetRow.replaceChildren(...PRESETS.map((p) => h('button', {
      class: `preset${cur?.id === p.id ? ' on' : ''}`, role: 'radio', 'aria-checked': String(cur?.id === p.id),
      onclick: () => { Object.assign(o, p.options); openChip = null; changed(); },
    }, h('span', { class: 'preset-icon' }, ...withIcon(p.icon)), h('b', {}, p.name), h('span', { class: 'preset-note' }, p.note))));
  }
  function drawChips() {
    const micName = (micOptions.find((m) => m.id === (o.micId || '')) || micOptions[1] || micOptions[0]).name;
    const camName = (camOptions.find((c) => c.id === (o.webcamId || '')) || camOptions[0]).name;
    const toggle = (key, on, label, title, invertDefault = false) => h('button', {
      class: `opt${on ? ' on' : ''}`, 'aria-pressed': String(on), title,
      onclick: () => { o[key] = invertDefault ? !(o[key] !== false) : !o[key]; openChip = null; changed(); },
    }, label);
    const picker = (id, on, label, title) => h('button', {
      class: `opt pick${on ? ' on' : ''}${openChip === id ? ' open' : ''}`, 'aria-expanded': String(openChip === id), title,
      onclick: () => { openChip = openChip === id ? null : id; drawChips(); },
    }, label, ' ▾');
    chipRow.replaceChildren(...[
      picker('mic', !!o.micId, `🎙 ${o.micId ? micName : T('마이크 끔')}`, T('마이크 (자막을 만들 목소리)')),
      state.info?.systemAudio === false ? null : toggle('systemAudio', !!o.systemAudio, o.systemAudio ? T('🔊 컴퓨터 소리') : T('🔇 컴퓨터 소리 끔'), T('컴퓨터 소리 함께 녹음')),
      state.cams.length ? picker('cam', !!o.webcamId, `📷 ${o.webcamId ? camName : T('웹캠 끔')}`, T('웹캠 (얼굴 말풍선)')) : null,
      toggle('recordTyping', !!o.recordTyping, o.recordTyping ? T('⌨ 타이핑까지 기록') : T('⌨ 단축키만 기록'), T('끄면 단축키만 저장합니다. 비밀번호 같은 입력이 녹화 파일에 남지 않습니다')),
      isDesktop ? toggle('liveOverlay', !!o.liveOverlay, o.liveOverlay ? T('👁 녹화 중 키 보기') : T('👁 녹화 중 키 숨김'), T('나에게만 보이고 녹화 파일에는 들어가지 않습니다')) : null,
      isDesktop && state.info?.ffmpeg ? toggle('hideCursor', o.hideCursor !== false, o.hideCursor !== false ? T('🖱 부드러운 커서') : T('🖱 실제 커서'), T('전체 화면 녹화에서만. 편집 화면에서 크고 부드러운 커서를 대신 그려 넣습니다'), true) : null,
      toggle('countdown', !!o.countdown, o.countdown ? T('⏱ 3초 뒤 시작') : T('⏱ 바로 시작'), T('3초 카운트다운')),
    ].filter(Boolean));
    chipDetail.replaceChildren(
      openChip === 'mic' ? selectField(T('마이크 (자막을 만들 목소리)'), o.micId, micOptions, (v) => { o.micId = v; openChip = null; changed(); }) : '',
      openChip === 'cam' ? selectField(T('웹캠 (얼굴 말풍선)'), o.webcamId, camOptions, (v) => { o.webcamId = v; openChip = null; changed(); }) : '',
    );
    chipDetail.hidden = !openChip;
    presetNote.textContent = presetOf(o) ? '' : T('직접 고른 설정');
  }
  const presetNote = h('span', { class: 'small muted' });

  const warnings = [
    !state.info?.inputHook && isDesktop ? h('div', { class: 'hint warn' }, T('키보드 기록 모듈을 불러오지 못했습니다. 키 표시 없이 녹화됩니다.')) : null,
    !isDesktop ? h('div', { class: 'hint warn' }, T('브라우저에서는 이 탭에 초점이 있을 때 누른 키만 기록됩니다. 모든 프로그램의 키를 표시하려면 데스크톱 앱을 실행하세요.')) : null,
    // macOS asks for Accessibility (keys) and Screen Recording before they work.
    state.info?.access && (!state.info.access.accessibility || state.info.access.screen !== 'granted')
      ? h('div', { class: 'hint warn' }, T('macOS에서는 손쉬운 사용(키 기록)과 화면 기록 권한이 필요합니다. 허용한 뒤 앱을 다시 여세요.'),
        h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn small', onclick: async () => { await platform.askAccess(); state.info = await platform.info(); showHome(); } }, T('권한 설정 열기'))))
      : null,
    state.info?.wayland ? h('div', { class: 'hint warn' }, T('Wayland 세션에서는 다른 프로그램의 키와 클릭을 기록하지 못하고 커서를 숨길 수 없습니다. 로그인 화면에서 X11(Xorg) 세션을 고르면 모두 쓸 수 있습니다.')) : null,
    isDesktop && state.info && !state.info.ffmpeg && !state.info.wayland ? h('div', { class: 'small muted' }, T('ffmpeg를 설치하면 실제 마우스 커서를 숨기고 녹화할 수 있습니다.')) : null,
  ].filter(Boolean);

  const sc = shortcuts();
  const startPanel = h('div', { class: 'start' },
    h('div', { class: 'row' }, h('h2', { class: 'grow' }, T('무엇을 녹화하나요?')), presetNote),
    presetRow,
    chipRow,
    chipDetail,
    ...warnings,
    h('button', { class: 'btn rec hero-rec', onclick: startRecording }, h('span', { class: 'recdot', style: { animation: 'none', background: '#fff' } }), T('녹화 시작')),
    isDesktop ? h('div', { class: 'keys-line' },
      [[T('멈추기'), sc.stop], [T('일시정지'), sc.pause], [T('키 기록 멈춤'), sc.keyRec]].map(([label, key]) => h('span', {}, label, ' ', h('code', {}, key.replace('Super', 'Win'))))) : null);
  drawPresets();
  drawChips();

  const keysOnlyCard = isDesktop ? h('div', { class: 'card keys-only' },
    h('b', {}, T('녹화 없이 키만 보여주기')),
    h('div', { class: 'small muted' }, T('발표·화상 회의·다른 녹화 프로그램을 쓸 때, 누른 키와 클릭을 화면 위에 띄웁니다.')),
    h('div', { class: 'row' },
      keysOnlyBtn(),
      h('button', { class: 'btn', title: T('키 표시 모양과 보여줄 키 고르기'), onclick: openKeyStyle }, T('🎨 꾸미기')))) : null;

  const recent = h('div', { class: 'recent' },
    h('div', { class: 'recent-head' },
      h('h2', { style: { fontSize: '16px' } }, T('최근 녹화')),
      isDesktop ? h('button', { class: 'btn small ghost', onclick: () => platform.openRecordingsFolder() }, T('📁 녹화 폴더 열기')) : null),
    portableNote(),
    projects.length
      ? h('div', { class: 'recent-list' }, projects.map((p) => h('div', { class: 'recent-item' },
        h('b', {}, p.name),
        h('div', { class: 'meta' },
          h('span', {}, `⏱ ${fmt((p.durationMs || 0) / 1000)}`),
          h('span', {}, T('⌨ 키 {0}', p.keyCount ?? 0)),
          h('span', {}, T('💬 자막 {0}', p.subtitles ?? 0)),
          p.source ? h('span', { class: 'chip' }, p.source.length > 28 ? `${p.source.slice(0, 27)}…` : p.source) : null),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: () => openEditor(p.id) }, T('편집하기')),
          h('div', { class: 'grow' }),
          h('button', { class: 'btn small ghost danger', title: T('삭제'), onclick: async () => {
            if (!confirm(T('\'{0}\' 녹화를 지울까요? 되돌릴 수 없습니다.', p.name))) return;
            try {
              await platform.deleteProject(p.id);
            } catch (err) {
              toast(T('녹화를 지우지 못했습니다: {0}', err.message), true);
            }
            showHome();
          } }, T('삭제'))))))
      : h('div', { class: 'features' },
        feature('⌨️', '', T('모든 키 표시'), T('어떤 프로그램에서 누른 키든 단축키와 타이핑을 말풍선으로')),
        feature('🔍', '', T('클릭하면 자동 확대'), T('클릭한 곳으로 부드럽게 줌, 커서를 따라 이동')),
        feature('💬', '', T('목소리로 자막'), T('내 컴퓨터에서 음성을 받아 적고 문장 단위로 자막 정리')),
        feature('🎬', '', T('완성된 영상 저장'), T('배경·키·자막을 입혀 MP4로, 자막은 SRT로도'))));

  // The screen list follows what is open: it is read again whenever the window comes back to front.
  if (isDesktop && !renderHome.focusHooked) {
    renderHome.focusHooked = true;
    window.addEventListener('focus', async () => {
      if (!document.querySelector('.sources, .sources-pick')) return;
      await refreshSources();
      renderHome.redrawSources?.();
    });
  }
  renderHome.redrawSources = drawSources;

  if (isCompact()) {
    renderCompact({ presetRow, presetNote, chipRow, chipDetail, warnings, projects });
    return;
  }
  document.body.classList.remove('compact');
  platform.setCompact(false);
  mount(
    topbar(
      h('button', { class: 'btn small', title: T('다른 프로그램으로 만든 영상을 불러와 편집합니다'), onclick: importVideo }, T('📂 영상 파일 열기')),
      isDesktop ? h('button', { class: 'btn small', title: T('녹화 버튼만 있는 작은 창으로 바꿉니다'), onclick: () => setCompactPref(true) }, T('▭ 작은 창')) : null,
      settingsMenu()),
    updateSlot(),
    !isDesktop ? h('div', { class: 'banner' }, T('브라우저 미리보기 모드: 녹화·편집·자막·내보내기를 모두 쓸 수 있지만, 키는 이 탭 안에서만 잡히고 녹화는 탭을 닫으면 사라집니다.')) : null,
    h('main', { class: 'home' },
      h('section', { class: 'card hero' },
        h('div', { class: 'hero-where' },
          h('div', { class: 'row', style: { marginBottom: '4px' } }, h('h2', { class: 'grow' }, T('어디를 녹화할까요?')), isDesktop ? kindTabs : null),
          h('div', { class: 'sub' }, isDesktop ? T('전체 화면을 고르면 클릭 위치에 맞춘 자동 확대와 클릭 효과도 쓸 수 있습니다') : T('녹화 시작을 누르면 브라우저가 녹화할 화면을 물어봅니다')),
          sourcesGrid),
        startPanel),
      h('div', { class: 'home-below' }, recent, keysOnlyCard)));
}

/** ⚙ in the top bar: the things set once (shortcuts, extensions, language, the recordings folder). */
function settingsMenu() {
  const pop = h('div', { class: 'menu-pop', hidden: true, role: 'menu' });
  const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside, true); };
  const outside = (e) => { if (!wrap.contains(e.target)) close(); };
  const item = (label, fn) => h('button', { class: 'menu-item', role: 'menuitem', onclick: () => { close(); fn(); } }, label);
  pop.append(
    isDesktop ? item(T('⌨ 단축키'), openShortcuts) : '',
    isDesktop ? item(T('🧩 확장 기능'), openExtensions) : '',
    isDesktop ? item(store.get('updateCheck', true) ? T('🔔 새 버전 알림: 켬') : T('🔕 새 버전 알림: 끔'), () => { store.set('updateCheck', !store.get('updateCheck', true)); showHome(); }) : '',
    h('div', { class: 'menu-lang' }, h('span', {}, T('언어')), langMenu()));
  const btn = h('button', { class: 'btn small', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => {
    if (!pop.hidden) { close(); return; }
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
  } }, T('⚙ 설정'));
  const wrap = h('div', { class: 'menu-wrap' }, btn, pop);
  return wrap;
}

// ---- keys on screen without recording
export let keysOn = false;
export let keysBtn = null;
export function drawKeysBtn() {
  if (!keysBtn) return;
  setLabel(keysBtn, keysOn ? T('■ 키 표시 끄기') : T('⌨ 키 표시 켜기'));
  keysBtn.classList.toggle('on', keysOn);
  keysBtn.setAttribute('aria-pressed', String(keysOn));
}
export async function toggleKeysOnly() {
  keysOn = await platform.toggleKeys({ overlay: liveOverlaySettings(), shortcut: shortcuts().keys });
  drawKeysBtn();
  if (keysOn) toast(T('키 표시를 켰습니다. 끄려면 {0} 또는 이 버튼.', shortcuts().keys));
}
export function keysOnlyBtn() {
  keysBtn = h('button', { class: 'btn grow', onclick: toggleKeysOnly });
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
    await new Promise((resolve, reject) => { v.onloadedmetadata = resolve; v.onerror = () => reject(new Error(T('이 영상 형식은 열 수 없습니다 (MP4·WebM을 권장합니다).'))); });
    if (!Number.isFinite(v.duration)) {
      // Some files do not state their length: jump to the end to find it.
      v.currentTime = 1e7;
      await new Promise((r) => { v.onseeked = r; setTimeout(r, 5000); });
    }
    const duration = Number.isFinite(v.duration) ? v.duration : v.currentTime;
    const size = { width: v.videoWidth, height: v.videoHeight };
    v.removeAttribute('src');
    v.load();
    if (!(duration > 0) || !size.width) throw new Error(T('영상 길이나 크기를 읽지 못했습니다.'));
    const settings = savedLook();
    settings.frame.crop = { x: 0, y: 0, w: 1, h: 1 };
    settings.webcam.enabled = false;
    const createdAt = new Date().toISOString();
    // A pointer file saved next to the video (Recordly's .cursor.json) brings back the pointer,
    // its clicks and kinds: such recordings are made without the real pointer.
    const events = (picked.events || []).filter((e) => e.t <= duration);
    const pointer = events.some((e) => e.type === 'mm');
    if (pointer) settings.cursor.show = true;
    const project = {
      version: 1, id: picked.id, name: picked.label.replace(/\.[^.]+$/, ''), createdAt,
      source: { name: picked.label, kind: pointer ? 'screen' : 'file', ...size },
      files: { screen: picked.file, voice: null, audio: null, webcam: null },
      durationMs: Math.round(duration * 1000), inputHooked: pointer, cursorHidden: pointer, events, settings,
      zooms: pointer ? autoZoomRegions(events, duration, settings.zoom.scale) : [],
      subtitles: [], cuts: [], speeds: [], annotations: [], audios: [], trim: { start: 0, end: duration },
    };
    await platform.saveProject(project);
    openEditor(project.id, project);
  } catch (err) {
    if (picked) platform.deleteProject(picked.id).catch(() => {});
    toast(T('영상을 열지 못했습니다: {0}', err.message), true);
  }
}

export function feature(mark, _tint, title, text) {
  return h('div', { class: 'feature' }, h('div', { class: 'feature-icon' }, mark), h('div', {}, h('b', {}, title), h('p', {}, text)));
}


// ------------------------------------------------------------------ small start window (desktop)
/** The home screen as a small window: purpose, where, options and the record button only. */
export function isCompact() { return isDesktop && !!store.get('compact', false); }
export function setCompactPref(on) {
  store.set('compact', !!on);
  if (document.querySelector('.home')) showHome();
}

function renderCompact({ presetRow, presetNote, chipRow, chipDetail, warnings, projects }) {
  document.body.classList.add('compact');
  platform.setCompact(true);
  // Where to record, as one list instead of thumbnails.
  const where = h('div', { class: 'sources-pick' });
  const drawWhere = () => {
    const screens = state.sources.filter((s) => s.kind === 'screen');
    const name = (s) => (s.kind === 'screen' ? (screens.length > 1 ? T('화면 {0}', screens.indexOf(s) + 1) : T('전체 화면')) : `${T('창')} · ${s.name.length > 34 ? `${s.name.slice(0, 33)}…` : s.name}`);
    const pick = h('select', { 'aria-label': T('어디를 녹화할까요?'), onchange: (e) => {
      state.sourceId = e.target.value;
      state.sourceKind = state.sources.find((s) => s.id === state.sourceId)?.kind || 'screen';
    } }, state.sources.map((s) => h('option', { value: s.id, selected: s.id === state.sourceId }, name(s))));
    where.replaceChildren(h('label', {}, T('어디를 녹화할까요?')), pick);
  };
  drawWhere();
  renderHome.redrawSources = drawWhere;
  const sc = shortcuts();
  mount(
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }), h('span', {}, 'KeyCast')),
      h('div', { class: 'grow' }),
      h('button', { class: 'btn small', title: T('최근 녹화와 모든 설정이 있는 큰 창으로 바꿉니다'), onclick: () => setCompactPref(false) }, T('⤢ 큰 창'))),
    updateSlot(true),
    h('main', { class: 'home compact-home' },
      h('div', { class: 'row' }, h('h2', { class: 'grow' }, T('무엇을 녹화하나요?')), presetNote),
      presetRow,
      where,
      chipRow,
      chipDetail,
      ...warnings,
      h('button', { class: 'btn rec hero-rec', onclick: startRecording }, h('span', { class: 'recdot', style: { animation: 'none', background: '#fff' } }), T('녹화 시작')),
      h('div', { class: 'keys-line' }, [[T('멈추기'), sc.stop], [T('일시정지'), sc.pause]].map(([label, key]) => h('span', {}, label, ' ', h('code', {}, key.replace('Super', 'Win'))))),
      h('div', { class: 'compact-foot' },
        keysOnlyBtn(),
        projects.length ? h('button', { class: 'btn ghost', title: T('최근 녹화'), onclick: () => setCompactPref(false) }, T('🎬 최근 녹화 {0}', projects.length)) : null),
      portableNote()));
}

/** Portable copies say where everything is kept, and where the recordings made before are. */
function portableNote() {
  const p = state.info?.portable;
  if (!p) return null;
  return h('div', { class: 'portable-note small muted' },
    h('span', { title: p.root }, T('💾 포터블: 설정·녹화·저장한 영상이 프로그램 옆 \'KeyCast Data\' 폴더에 있습니다.')),
    p.oldRecordings ? h('button', { class: 'btn small ghost', title: p.oldRecordings, onclick: () => platform.openOldRecordings() }, T('📁 이전 녹화 폴더')) : null);
}

// ------------------------------------------------------------------ tray menu
platform.trayWords({ open: T('KeyCast Studio 열기'), record: T('녹화 시작'), keysOn: T('키 표시 켜기'), keysOff: T('키 표시 끄기'), small: T('작은 창'), quit: T('종료') });
platform.onTray(async (action) => {
  if (action === 'small' || action === 'big') {
    store.set('compact', action === 'small');
    if (document.querySelector('.home')) showHome();
    else if (action === 'small') toast(T('처음 화면으로 돌아가면 작은 창이 됩니다.'));
    return;
  }
  if (action === 'keys') { toggleKeysOnly(); return; }
  if (action === 'record' && !state.recorder) {
    // From the editor: keep its changes, then start from the home screen.
    if (!document.querySelector('.home .hero-rec')) {
      const ed = state.editor;
      if (ed?.dirty) { ed.dirty = false; await platform.saveProject(ed.project).catch(() => {}); }
      await showHome();
    }
    startRecording();
  }
});

// ------------------------------------------------------------------ new version notice
// Once a day at most, the app asks GitHub for the latest version number and only says so here.
let updateInfo;
async function latestUpdate() {
  if (!isDesktop || store.get('updateCheck', true) === false) return null;
  if (updateInfo !== undefined) return updateInfo;
  const now = state.info?.version || '';
  const seen = store.get('updateSeen', null);
  if (seen && seen.from === now && Date.now() - seen.at < 24 * 3600 * 1000) {
    updateInfo = seen.version ? { version: seen.version } : null;
  } else {
    updateInfo = await platform.checkUpdate().catch(() => null);
    store.set('updateSeen', { at: Date.now(), from: now, version: updateInfo?.version || null });
  }
  return updateInfo;
}

/** A place for the notice; filled when the answer comes, so the screen never waits for it. */
function updateSlot(short = false) {
  const slot = h('div', { class: 'update-slot' });
  latestUpdate().then((u) => {
    if (!u || store.get('updateSkip', '') === u.version) return;
    slot.replaceChildren(h('div', { class: 'banner update', role: 'status' },
      h('span', { class: 'grow' }, T('🎉 새 버전 {0}이 나왔습니다.', u.version),
        !short && state.info?.portable ? ` ${T('포터블은 새 exe로 바꾸기만 하면 KeyCast Data가 그대로 이어집니다.')}` : ''),
      h('button', { class: 'btn small primary', onclick: () => platform.openUpdate() }, T('받으러 가기')),
      h('button', { class: 'btn small ghost', title: T('이 버전은 다시 알리지 않습니다'), onclick: () => { store.set('updateSkip', u.version); slot.replaceChildren(); } }, short ? '✕' : T('건너뛰기'))));
  });
  return slot;
}
