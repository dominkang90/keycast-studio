import { platform, isDesktop, keyNameOf } from './lib/platform.js';
import { Recorder } from './lib/recorder.js';
import { buildKeyGroups, KEY_DEFAULTS } from './lib/keys.js';
import { clicksOf, CursorTrack, autoZoomRegions, newId } from './lib/zoom.js';
import {
  renderFrame, projectOutputSize, BACKGROUNDS, WALLPAPERS, KEY_THEMES, CURSOR_STYLES, NOTE_TYPES,
  defaultSettings, newNote, noteRect, drawKeys, getImage,
} from './lib/compositor.js';
import { Timeline, fmt, listOfKind } from './lib/timeline.js';
import { transcribe, MODELS, LANGUAGES } from './lib/transcribe.js';
import { toSRT } from './lib/subtitles.js';
import { exportVideo, exportFormats } from './lib/exporter.js';
import { withIcon, setLabel } from './lib/icons.js';
import { segments, outDuration, srcToOut, segIndexAt, mapCues, syncAudios } from './lib/timemap.js';

// ------------------------------------------------------------------ tiny DOM helper
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') {
      el.className = v;
      if (v === 'modal') { el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); }
    } else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) {
      el.addEventListener(k.slice(2).toLowerCase(), v);
      // Anything that can be clicked can also be reached and pressed from the keyboard.
      if (k === 'onclick' && tag === 'div' && !String(attrs.class || '').startsWith('cue')) {
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.addEventListener('keydown', (e) => { if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); } });
      }
    } else if (k === 'title') {
      el.title = v;
      // an icon-only button is named by its tooltip
      if (tag === 'button' || tag === 'div') el.setAttribute('aria-label', v);
    }
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    // (null/false children are skipped)
    if (c === null || c === undefined || c === false) continue;
    if (c instanceof Node) { el.append(c); continue; }
    // A leading mark such as a folder or a play sign is drawn as a line icon (not inside key caps).
    if (typeof c === 'string' && attrs?.class !== 'kbd') el.append(...withIcon(c));
    else el.append(document.createTextNode(String(c)));
  }
  return el;
}

function toast(msg, error = false) {
  const el = h('div', { class: `toast${error ? ' error' : ''}`, role: error ? 'alert' : 'status' }, msg);
  document.body.append(el);
  setTimeout(() => el.remove(), error ? 6000 : 3200);
}

const app = document.getElementById('app');
function mount(...nodes) {
  app.replaceChildren(...nodes.flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false));
}
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(`keycast.${key}`)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(`keycast.${key}`, JSON.stringify(value)); },
};

const state = {
  info: null,
  sources: [],
  sourceKind: 'screen',
  sourceId: null,
  mics: [],
  cams: [],
  options: store.get('options', { micId: 'default', systemAudio: true, webcamId: '', liveOverlay: true, countdown: true }),
  recorder: null,
  editor: null,
};

// ------------------------------------------------------------------ shared bits
function topbar(...right) {
  return h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }), h('span', {}, 'KeyCast', h('i', {}, ' Studio'))),
    h('div', { class: 'grow' }),
    ...right,
    h('button', { class: 'btn small ghost', title: '사용설명서 열기', onclick: openManual }, '❓ 사용법'));
}

function openManual() {
  // The desktop app ships the manual with its pages; the browser version sits next to it on disk.
  const url = isDesktop ? './manual.html' : '../사용설명서.html';
  window.open(url, '_blank', 'width=980,height=900');
}

function switchEl(checked, onChange) {
  const input = h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) });
  return h('label', { class: 'switch' }, input, h('span'));
}

function inlineSwitch(label, checked, onChange, note) {
  return h('div', { class: 'field inline' },
    h('label', {}, label, note ? h('div', { class: 'small muted' }, note) : null),
    switchEl(checked, onChange));
}

function rangeField(label, value, min, max, step, onInput, format = (v) => v) {
  const tag = h('span', { class: 'value-tag' }, format(value));
  return h('div', { class: 'field' },
    h('div', { class: 'row' }, h('span', { class: 'field-label grow' }, label), tag),
    h('input', { type: 'range', min, max, step, value, 'aria-label': label, oninput: (e) => { const v = Number(e.target.value); tag.textContent = format(v); onInput(v); } }));
}

function selectField(label, value, options, onChange) {
  return h('div', { class: 'field' },
    h('label', {}, label),
    h('select', { 'aria-label': label, onchange: (e) => onChange(e.target.value) },
      options.map((o) => h('option', { value: o.id, selected: o.id === value }, o.name))));
}

function segField(label, value, options, onChange) {
  const wrap = h('div', { class: 'seg' });
  const draw = (cur) => {
    wrap.replaceChildren(...options.map((o) => h('button', { class: o.id === cur ? 'on' : '', onclick: () => { onChange(o.id); draw(o.id); } }, o.name)));
  };
  draw(value);
  return h('div', { class: 'field' }, label ? h('label', {}, label) : null, wrap);
}

function colorField(label, value, onInput) {
  return h('div', { class: 'field inline' }, h('label', {}, label),
    h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000', oninput: (e) => onInput(e.target.value) }));
}

const ALL_POSITIONS = ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'];
function positionField(label, value, positions, onChange) {
  const names = { 'top-left': '↖', 'top-center': '↑', 'top-right': '↗', 'center-left': '←', center: '•', 'center-right': '→', 'bottom-left': '↙', 'bottom-center': '↓', 'bottom-right': '↘' };
  const grid = h('div', { class: 'pos-grid' });
  const cells = positions.some((p) => p.startsWith('center')) ? ALL_POSITIONS : ALL_POSITIONS.filter((p) => !p.startsWith('center'));
  const draw = (cur) => grid.replaceChildren(...cells.map((p) =>
    h('button', { class: p === cur ? 'on' : '', disabled: !positions.includes(p), style: positions.includes(p) ? null : { opacity: 0.25 }, onclick: () => { onChange(p); draw(p); } }, names[p])));
  draw(value);
  return h('div', { class: 'field' }, h('label', {}, label), grid);
}

function formatBytes(n) {
  if (!n) return '0 MB';
  return `${(n / 1048576).toFixed(n > 104857600 ? 0 : 1)} MB`;
}

// ------------------------------------------------------------------ saved preferences
const DEFAULT_SHORTCUTS = { stop: 'Alt+Shift+S', pause: 'Alt+Shift+P', keys: 'Alt+Shift+K' };
function shortcuts() { return { ...DEFAULT_SHORTCUTS, ...store.get('shortcuts', {}) }; }

/** The look used last time (new recordings start from it). */
function savedLook() {
  const d = defaultSettings();
  const saved = store.get('look', {});
  for (const k of Object.keys(d)) Object.assign(d[k], saved[k] || {});
  d.keys.custom = { ...KEY_DEFAULTS.custom, ...(saved.keys?.custom || {}) };
  return d;
}

function kbdLabel(accel) {
  return String(accel).split('+').flatMap((k, i) => [i ? ' + ' : null, h('span', { class: 'kbd' }, k === 'Super' ? 'Win' : k)]).filter(Boolean);
}

/** A global shortcut from a key press inside this window, or null when it cannot be one. */
function accelFromEvent(e) {
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  let key = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F([1-9]|1[0-2])$/.test(e.code)) key = e.code;
  if (!key || (!mods.length && !key.startsWith('F'))) return null;
  return [...mods, key].join('+');
}

/**
 * Everything about how keys look and which keys show. Shared by the editor and the
 * live-overlay settings. `change(rebuild)` is called after each edit; `redraw` after edits
 * that add or remove controls.
 */
function keyPanel(k, change, redraw) {
  k.custom = { ...KEY_DEFAULTS.custom, ...(k.custom || {}) };
  k.allowed = k.allowed || [...KEY_DEFAULTS.allowed];
  const c = k.custom;
  const names = { Click: '🖱 클릭', Drag: '🖱 드래그', Wheel: '🖱 휠' };
  const chips = h('div', { class: 'chips' }, k.allowed.map((name) => h('span', { class: 'chip' }, names[name] || name,
    h('button', { class: 'chip-x', title: '빼기', onclick: () => { k.allowed = k.allowed.filter((n) => n !== name); change(true); redraw(); } }, '✕'))));
  const addKey = h('button', { class: 'btn small' }, '+ 키 추가');
  addKey.onclick = () => {
    addKey.textContent = '추가할 키를 누르세요…';
    const grab = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener('keydown', grab, true);
      const name = keyNameOf(e);
      if (!k.allowed.includes(name)) k.allowed.push(name);
      change(true);
      redraw();
    };
    window.addEventListener('keydown', grab, true);
  };
  return [
    segField('무엇을 보여줄까요', k.mode, [{ id: 'all', name: '모든 키' }, { id: 'shortcuts', name: '단축키만' }, { id: 'custom', name: '고른 키만' }], (v) => { k.mode = v; change(true); redraw(); }),
    k.mode === 'custom' ? h('div', { class: 'field' },
      h('label', {}, '이 키로 시작하는 입력만 보여줍니다'),
      chips,
      h('div', { class: 'row', style: { flexWrap: 'wrap' } }, addKey,
        ['Click', 'Drag', 'Wheel'].filter((n) => !k.allowed.includes(n)).map((n) => h('button', { class: 'btn small', onclick: () => { k.allowed.push(n); change(true); redraw(); } }, `+ ${names[n]}`)))) : null,
    inlineSwitch('마우스 클릭·드래그·휠도 표시', k.showMouse, (v) => { k.showMouse = v; change(true); }),
    positionField('위치', k.position, ALL_POSITIONS, (v) => { k.position = v; change(); }),
    rangeField('가장자리 여백 (가로)', k.marginX ?? 36, 0, 300, 2, (v) => { k.marginX = v; change(); }, (v) => `${v}px`),
    rangeField('가장자리 여백 (세로)', k.marginY ?? 36, 0, 300, 2, (v) => { k.marginY = v; change(); }, (v) => `${v}px`),
    h('div', { class: 'field' }, h('label', {}, '모양'),
      h('div', { class: 'swatches' },
        Object.entries(KEY_THEMES).map(([id, th]) => h('div', {
          class: `swatch${k.theme === id ? ' on' : ''}`,
          style: { background: th.face, border: `2px solid ${th.edge}`, color: th.text, display: 'grid', placeItems: 'center', fontWeight: 700, boxShadow: th.glow ? `0 0 10px ${th.glow}` : null },
          onclick: () => { k.theme = id; change(); redraw(); },
        }, { dark: 'Ctrl', light: 'Shift', neon: 'Alt', key: 'Enter' }[id] || id)),
        h('div', { class: `swatch${k.theme === 'custom' ? ' on' : ''}`, style: { background: c.face, color: c.text, border: `2px solid ${c.borderColor}`, display: 'grid', placeItems: 'center', fontWeight: 700, gridColumn: 'span 2' }, onclick: () => { k.theme = 'custom'; change(); redraw(); } }, '직접 꾸미기'))),
    k.theme === 'custom' ? [
      segField('키 모양', c.capStyle, [{ id: 'raised', name: '입체' }, { id: 'flat', name: '납작' }, { id: 'outline', name: '테두리만' }], (v) => { c.capStyle = v; change(); }),
      colorField('키 색', c.face, (v) => { c.face = v; change(); }),
      inlineSwitch('키에 입체감(그라데이션)', !!c.gradient, (v) => { c.gradient = v; change(); }),
      colorField('글자 색', c.text, (v) => { c.text = v; change(); }),
      inlineSwitch('조합키(Ctrl·Alt…)는 다른 색', c.modHighlight, (v) => { c.modHighlight = v; change(); redraw(); }),
      c.modHighlight ? [colorField('조합키 색', c.modFace, (v) => { c.modFace = v; change(); }), colorField('조합키 글자 색', c.modText, (v) => { c.modText = v; change(); })] : null,
      inlineSwitch('테두리', c.border, (v) => { c.border = v; change(); redraw(); }),
      c.border ? [colorField('테두리 색', c.borderColor, (v) => { c.borderColor = v; change(); }),
        rangeField('테두리 두께', c.borderWidth, 1, 6, 0.5, (v) => { c.borderWidth = v; change(); }, (v) => `${v}px`)] : null,
      rangeField('모서리 둥글기', c.radius, 0, 23, 1, (v) => { c.radius = v; change(); }, (v) => `${v}px`),
      inlineSwitch('뒤에 바탕 깔기', c.panel, (v) => { c.panel = v; change(); redraw(); }),
      c.panel ? [colorField('바탕 색', c.panelColor, (v) => { c.panelColor = v; change(); }),
        rangeField('바탕 진하기', c.panelOpacity, 0.1, 1, 0.05, (v) => { c.panelOpacity = v; change(); }, (v) => `${Math.round(v * 100)}%`)] : null,
    ] : null,
    segField('조합키 표기', k.modLabel || 'text', [{ id: 'text', name: 'Ctrl' }, { id: 'symbol', name: '⌃ 기호' }, { id: 'both', name: '⌃ Ctrl' }], (v) => { k.modLabel = v; change(); }),
    segField('글자', k.caps || 'upper', [{ id: 'upper', name: '대문자 A' }, { id: 'lower', name: '소문자 a' }], (v) => { k.caps = v; change(); }),
    inlineSwitch('여러 번 누르면 ×3 처럼 세기', k.showCount !== false, (v) => { k.showCount = v; change(); }),
    rangeField('크기', k.size, 0.6, 1.8, 0.05, (v) => { k.size = v; change(); }, (v) => `${Math.round(v * 100)}%`),
    segField('나타나고 사라지는 방식', k.anim || 'fade', [{ id: 'none', name: '없음' }, { id: 'fade', name: '흐리게' }, { id: 'zoom', name: '커지며' }, { id: 'float', name: '떠오르며' }, { id: 'slide', name: '옆에서' }], (v) => { k.anim = v; change(); }),
    rangeField('움직임 길이', k.animDur ?? 0.25, 0.1, 0.8, 0.05, (v) => { k.animDur = v; change(); }, (v) => `${v.toFixed(2)}초`),
    rangeField('사라지기까지', k.hold, 0.5, 5, 0.1, (v) => { k.hold = v; change(); }, (v) => `${v.toFixed(1)}초`),
    rangeField('이전 입력 남겨 두기', k.maxGroups, 1, 5, 1, (v) => { k.maxGroups = v; change(); }, (v) => (v === 1 ? '안 함' : `${v}줄`)),
    h('div', { class: 'row', style: { marginTop: '6px' } },
      h('button', { class: 'btn small grow', title: '지금 키 모양을 파일로 저장', onclick: async () => {
        const { enabled: _on, ...style } = k;
        const file = await platform.saveText('키-모양.json', JSON.stringify({ keycastKeyStyle: 1, ...style }, null, 2), 'json');
        if (file) toast('키 모양을 저장했습니다.');
      } }, '⤓ 모양 저장'),
      h('button', { class: 'btn small grow', title: '저장해 둔 키 모양 파일 불러오기', onclick: () => {
        const input = h('input', { type: 'file', accept: '.json,application/json', onchange: async () => {
          try {
            const data = JSON.parse(await input.files[0].text());
            if (!data || data.keycastKeyStyle !== 1 || typeof data.theme !== 'string') throw new Error('키 모양 파일이 아닙니다.');
            const { keycastKeyStyle: _v, enabled: _on, ...style } = data;
            Object.assign(k, style);
            change(true);
            redraw();
            toast('키 모양을 불러왔습니다.');
          } catch (err) {
            toast(`불러오지 못했습니다: ${err.message}`, true);
          }
        } });
        input.click();
      } }, '⤒ 모양 불러오기')),
  ];
}

// ------------------------------------------------------------------ home
async function loadDevices() {
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

async function refreshSources() {
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

function saveOptions() { store.set('options', state.options); }

async function showHome() {
  stopEditor();
  mount(h('div', { class: 'home' }, h('div', { class: 'empty' }, '불러오는 중…')));
  if (!state.info) state.info = await platform.info();
  await Promise.all([refreshSources(), loadDevices()]);
  const projects = await platform.listProjects().catch(() => []);
  renderHome(projects);
}

function renderHome(projects) {
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
let keysOn = false;
let keysBtn = null;
function drawKeysBtn() {
  if (!keysBtn) return;
  setLabel(keysBtn, keysOn ? '■ 키 표시 끄기' : '⌨ 키 표시 켜기');
  keysBtn.classList.toggle('on', keysOn);
  keysBtn.setAttribute('aria-pressed', String(keysOn));
}
function liveOverlaySettings() {
  const look = savedLook();
  return { ...look.keys, mouse: { clicks: look.cursor.clicks, effect: look.cursor.effect, scrolls: look.cursor.scrolls !== false, highlight: look.cursor.highlight, color: look.cursor.color } };
}
function keysOnlyBtn() {
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

/** Settings for the live key display, with a moving sample. */
function openKeyStyle() {
  const look = savedLook();
  const sample = [
    { t: 0.3, type: 'kd', name: 'Ctrl', mods: { ctrl: true } }, { t: 0.4, type: 'kd', name: 'Shift', mods: { ctrl: true, shift: true } },
    { t: 0.5, type: 'kd', name: 'S', mods: { ctrl: true, shift: true } }, { t: 0.6, type: 'ku', name: 'S' }, { t: 0.65, type: 'ku', name: 'Shift' }, { t: 0.7, type: 'ku', name: 'Ctrl' },
    ...'HELLO'.split('').map((ch, i) => ({ t: 1.6 + i * 0.14, type: 'kd', name: ch, mods: {} })),
    { t: 2.6, type: 'kd', name: 'Enter', mods: {} },
    { t: 3.2, type: 'kd', name: 'Alt', mods: { alt: true } }, { t: 3.3, type: 'md', button: 1, x: 0.5, y: 0.5 }, { t: 3.4, type: 'mu', button: 1, x: 0.5, y: 0.5 }, { t: 3.5, type: 'ku', name: 'Alt' },
    { t: 4.0, type: 'wh', rotation: 1, x: 0.5, y: 0.5 },
  ];
  const canvas = h('canvas', { width: 800, height: 300, style: { width: '100%', borderRadius: '10px', background: '#2b2b2e' }, role: 'img', 'aria-label': '키 표시 미리보기' });
  const ctx = canvas.getContext('2d');
  let groups = buildKeyGroups(sample, look.keys);
  const body = h('div', { style: { maxHeight: '48vh', overflow: 'auto', marginTop: '14px', paddingRight: '6px' } });
  const save = (rebuild) => {
    if (rebuild) groups = buildKeyGroups(sample, look.keys);
    const all = store.get('look', {});
    all.keys = look.keys;
    store.set('look', all);
  };
  const draw = () => body.replaceChildren(...keyPanel(look.keys, save, draw).flat(Infinity).filter(Boolean));
  draw();
  const started = performance.now();
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    ctx.clearRect(0, 0, 800, 300);
    // Shown at the size it will have on a 1080p screen, in a strip of that screen.
    const t = ((performance.now() - started) / 1000) % 6.5;
    ctx.save();
    ctx.scale(800 / 1920, 800 / 1920);
    drawKeys(ctx, 1920, 720, t, groups, { ...look.keys, enabled: true }, 1, 0);
    ctx.restore();
  };
  loop();
  const bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal', style: { width: '560px' } },
    h('h2', {}, '키 표시 꾸미기'),
    canvas, body,
    h('div', { class: 'small muted', style: { marginTop: '10px' } }, '여기서 고른 모양은 화면 위 키 표시와 새 녹화에 쓰입니다. 켜져 있는 키 표시는 껐다 켜면 바뀝니다.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => { cancelAnimationFrame(raf); bg.remove(); } }, '닫기'))));
  document.body.append(bg);
}

/** Change the global shortcuts, and list the ones the editor uses. */
function openShortcuts() {
  const sc = shortcuts();
  const row = (key, label) => {
    const btn = h('button', { class: 'btn small', style: { minWidth: '150px' } }, sc[key].replace('Super', 'Win'));
    btn.onclick = () => {
      btn.textContent = '새 단축키를 누르세요…';
      const grab = (e) => {
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        window.removeEventListener('keydown', grab, true);
        const accel = e.key === 'Escape' ? null : accelFromEvent(e);
        if (accel && Object.entries(sc).some(([k, v]) => k !== key && v === accel)) toast('다른 기능이 이미 쓰는 단축키입니다.', true);
        else if (accel) { sc[key] = accel; store.set('shortcuts', sc); } else if (e.key !== 'Escape') toast('Ctrl·Alt·Shift 중 하나와 글자·숫자 키를 함께 누르세요.', true);
        btn.textContent = sc[key].replace('Super', 'Win');
      };
      window.addEventListener('keydown', grab, true);
    };
    return h('div', { class: 'field inline' }, h('label', {}, label), btn);
  };
  const ref = [['Space', '재생 / 정지'], ['← →', '한 프레임 이동 (Shift: 5초)'], ['Delete', '선택한 구간 지우기'], ['Ctrl+Z', '되돌리기'], ['Ctrl+Y', '다시 하기'], ['S', '여기서 영상 나누기(잘라낼 구간 만들기)']];
  const bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal' },
    h('h2', {}, '단축키'),
    h('div', { class: 'small muted', style: { marginBottom: '12px' } }, '녹화 중에는 어떤 프로그램에서든 듣는 단축키입니다. 버튼을 누르고 새 조합을 누르면 바뀝니다.'),
    row('stop', '녹화 멈추기'), row('pause', '일시정지 / 다시 시작'), row('keys', '키 표시 끄기'),
    h('button', { class: 'btn small', onclick: () => { store.set('shortcuts', {}); bg.remove(); openShortcuts(); } }, '처음 값으로'),
    h('div', { class: 'section' }, h('h3', { style: { fontSize: '14px', marginBottom: '10px' } }, '편집 화면에서'),
      ref.map(([k, d]) => h('div', { class: 'field inline', style: { marginBottom: '8px' } }, h('label', {}, d), h('span', {}, kbdLabel(k))))),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => { bg.remove(); if (!state.editor && !state.recorder) showHome(); } }, '닫기'))));
  document.body.append(bg);
}

/** Open a video made with another program as a new recording. */
async function importVideo() {
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

function feature(mark, _tint, title, text) {
  return h('div', { class: 'feature' }, h('div', { class: 'feature-icon' }, mark), h('div', {}, h('b', {}, title), h('p', {}, text)));
}

// ------------------------------------------------------------------ recording
async function countdown() {
  const el = h('div', { class: 'countdown' });
  document.body.append(el);
  for (const n of [3, 2, 1]) {
    el.replaceChildren(h('span', {}, n));
    await new Promise((r) => setTimeout(r, 850));
  }
  el.remove();
}

async function startRecording() {
  const source = state.sources.find((s) => s.id === state.sourceId);
  if (!source) { toast('녹화할 화면을 먼저 고르세요.', true); return; }
  const o = state.options;
  if (o.countdown && isDesktop) await countdown();
  const rec = new Recorder({
    source,
    micId: o.micId || null,
    systemAudio: o.systemAudio,
    webcamId: o.webcamId || null,
    liveOverlay: o.liveOverlay,
    hideCursor: o.hideCursor !== false && !!state.info?.ffmpeg,
    overlaySettings: liveOverlaySettings(),
    shortcuts: shortcuts(),
    settings: savedLook(),
    onStatus: (s) => updateRecBar(s),
    onEnded: (project) => finishRecording(project),
  });
  state.recorder = rec;
  try {
    if (!isDesktop) showRecBar();
    await rec.start();
  } catch (err) {
    console.error(err);
    state.recorder = null;
    try { await platform.endRecording(); } catch { /* nothing to undo */ }
    toast(`녹화를 시작하지 못했습니다: ${err.message || err}`, true);
    showHome();
  }
}

let recBarTime = null;
let recBarPause = null;
function showRecBar() {
  recBarTime = h('b', { style: { fontSize: '28px', fontVariantNumeric: 'tabular-nums' } }, '0:00');
  recBarPause = h('button', { class: 'btn', onclick: () => state.recorder?.togglePause() }, '일시정지');
  mount(topbar(), h('div', { class: 'recbar' },
    h('div', { class: 'recdot' }), recBarTime, recBarPause,
    h('button', { class: 'btn rec', style: { height: '36px', fontSize: '14px' }, onclick: stopRecording }, '■ 멈추고 편집')));
}
function updateRecBar(s) {
  if (recBarTime) recBarTime.textContent = fmt(s.elapsedMs / 1000);
  if (recBarPause) recBarPause.textContent = s.paused ? '다시 시작' : '일시정지';
}

async function stopRecording() {
  const rec = state.recorder;
  if (!rec) return;
  try {
    const project = await rec.stop();
    finishRecording(project);
  } catch (err) {
    console.error(err);
    toast(`녹화를 저장하지 못했습니다: ${err.message}`, true);
    state.recorder = null;
    // The recording bar, the live keys and the key listener must not stay behind.
    try { await platform.captureAbort(); await platform.endRecording(); } catch { /* nothing left to close */ }
    showHome();
  }
}

function finishRecording(project) {
  if (!state.recorder) return;
  state.recorder = null;
  recBarTime = null;
  recBarPause = null;
  const keys = project.events.filter((e) => e.type === 'kd' && !e.repeat).length;
  toast(`녹화 완료 · ${fmt(project.durationMs / 1000)} · 키 ${keys}개 기록`);
  openEditor(project.id, project);
}

platform.onCommand((cmd) => {
  if (!state.recorder) return;
  if (cmd === 'stop') stopRecording();
  if (cmd === 'toggle-pause') state.recorder.togglePause();
});

// ------------------------------------------------------------------ editor
function derive(project) {
  return {
    groups: buildKeyGroups(project.events, project.settings.keys),
    clicks: clicksOf(project.events),
    cursor: new CursorTrack(project.events),
    scrolls: project.events.filter((e) => e.type === 'wh' && e.x !== null && e.x !== undefined),
  };
}

function migrate(project) {
  const d = defaultSettings();
  project.settings = project.settings || d;
  for (const k of Object.keys(d)) project.settings[k] = { ...d[k], ...(project.settings[k] || {}) };
  project.settings.keys.custom = { ...KEY_DEFAULTS.custom, ...(project.settings.keys.custom || {}) };
  project.settings.frame.crop = { x: 0, y: 0, w: 1, h: 1, ...(project.settings.frame.crop || {}) };
  for (const k of ['cuts', 'speeds', 'annotations', 'audios']) project[k] = project[k] || [];
  project.zooms = project.zooms || [];
  project.subtitles = project.subtitles || [];
  project.trim = project.trim || { start: 0, end: project.durationMs / 1000 };
  return project;
}

function stopEditor() {
  const ed = state.editor;
  if (!ed) return;
  cancelAnimationFrame(ed.raf);
  // An edit made in the last moment is still waiting for its delayed save: write it now.
  clearTimeout(ed.saveTimer);
  if (ed.dirty) { ed.dirty = false; platform.saveProject(ed.project).catch(() => {}); }
  // Let go of the video files, otherwise the recording cannot be deleted while the app is open.
  for (const v of [ed.screen, ed.webcam, ...(ed.audioEls?.values() || [])]) {
    if (!v) continue;
    v.pause();
    v.removeAttribute('src');
    v.load();
  }
  ed.abort?.abort();
  window.removeEventListener('keydown', ed.onKey);
  state.editor = null;
}

async function openEditor(id, preloaded) {
  stopEditor();
  let project;
  try {
    project = migrate(preloaded || await platform.loadProject(id));
  } catch (err) {
    toast(`녹화를 열지 못했습니다: ${err.message}`, true);
    showHome();
    return;
  }
  const screenUrl = platform.mediaUrl(project.id, project.files.screen);
  const webcamUrl = platform.mediaUrl(project.id, project.files.webcam);
  const screen = h('video', { preload: 'auto', playsInline: true, src: screenUrl });
  const webcam = webcamUrl ? h('video', { preload: 'auto', playsInline: true, muted: true, src: webcamUrl }) : null;
  if (webcam) webcam.muted = true;

  const ed = {
    project,
    derived: derive(project),
    screen,
    webcam,
    screenUrl,
    webcamUrl,
    tab: 'frame',
    segs: segments(project),
    audioEls: new Map(),
    history: [],
    future: [],
    selected: null,
    playing: false,
    dirty: false,
    saveTimer: null,
    lastTimelineDraw: 0,
  };
  state.editor = ed;

  const preview = h('canvas');
  const pctx = preview.getContext('2d');
  const sizePreview = () => {
    const { width, height } = projectOutputSize(project, screen.videoWidth, screen.videoHeight, 1280);
    if (preview.width !== width || preview.height !== height) { preview.width = width; preview.height = height; }
  };
  sizePreview();
  screen.addEventListener('loadedmetadata', sizePreview);
  // Show the size of the recorded picture itself (a window is smaller than its screen).
  const sizeLabel = h('span', { class: 'small muted' });
  const drawSizeLabel = () => {
    sizeLabel.textContent = `${screen.videoWidth || project.source.width}×${screen.videoHeight || project.source.height} · ${{ window: '창', file: '불러온 영상' }[project.source.kind] || '전체 화면'}`;
  };
  drawSizeLabel();
  screen.addEventListener('loadedmetadata', drawSizeLabel);

  const playBtn = h('button', { class: 'play', title: '재생/정지 (Space)', onclick: () => togglePlay() }, '▶');
  const timeLabel = h('span', { class: 'time' }, '0:00.0 / 0:00.0');
  const timelineCanvas = h('canvas');
  const nameInput = h('input', { type: 'text', value: project.name, style: { width: '260px' }, onchange: (e) => { project.name = e.target.value || project.name; markDirty(); } });
  const saveTag = h('span', { class: 'small muted' }, '저장됨');
  const sideBody = h('div', { class: 'side-body' });
  const sideTabs = h('div', { class: 'side-tabs' });

  const tabs = [
    ['frame', '🖼', '화면'], ['clip', '✂', '자르기'], ['zoom', '🔍', '줌'], ['notes', '✏', '주석'], ['keys', '⌨', '키'],
    ['cursor', '🖱', '커서'], ['webcam', '🙂', '웹캠'], ['audio', '🔊', '소리'], ['subs', '💬', '자막'],
  ];
  const drawTabs = () => sideTabs.replaceChildren(...tabs.map(([k, ic, n]) =>
    h('button', { class: ed.tab === k ? 'on' : '', onclick: () => { ed.tab = k; drawTabs(); drawPanel(); } }, h('span', { class: 'ic' }, ic), n)));

  const url = (name) => platform.mediaUrl(project.id, name);
  // With the ffmpeg capture the webcam and microphone files begin a moment after the picture.
  const camOff = project.offsets?.webcam || 0;
  const duration = () => project.durationMs / 1000;

  /** One sound element per added sound file. */
  function syncAudioEls() {
    for (const a of project.audios) {
      if (ed.audioEls.has(a.id)) continue;
      const el = new Audio(url(a.file));
      el.preload = 'auto';
      ed.audioEls.set(a.id, el);
    }
    for (const [id, el] of ed.audioEls) {
      if (project.audios.some((a) => a.id === id)) continue;
      el.pause();
      el.removeAttribute('src');
      el.load();
      ed.audioEls.delete(id);
    }
  }
  syncAudioEls();

  // ---------------- undo / redo
  const SNAP = ['name', 'settings', 'zooms', 'subtitles', 'trim', 'cuts', 'speeds', 'annotations', 'audios'];
  const snapshot = () => JSON.stringify(Object.fromEntries(SNAP.map((k) => [k, project[k]])));
  ed.last = snapshot();
  function pushHistory() {
    clearTimeout(ed.histTimer);
    const now = snapshot();
    if (now === ed.last) return;
    ed.history.push(ed.last);
    if (ed.history.length > 80) ed.history.shift();
    ed.future.length = 0;
    ed.last = now;
  }
  function timeTravel(from, to) {
    pushHistory();
    if (!from.length) { toast(from === ed.history ? '더 되돌릴 것이 없습니다.' : '다시 할 것이 없습니다.'); return; }
    to.push(ed.last);
    ed.last = from.pop();
    Object.assign(project, JSON.parse(ed.last));
    nameInput.value = project.name;
    ed.selected = null;
    timeline.select(null);
    markDirty({ rederive: true, history: false });
    sizePreview();
    drawPanel();
  }

  function markDirty({ rederive = false, history = true } = {}) {
    if (rederive) ed.derived = derive(project);
    ed.segs = segments(project);
    syncAudioEls();
    timeline.setData(project, ed.derived);
    if (history) { clearTimeout(ed.histTimer); ed.histTimer = setTimeout(pushHistory, 350); }
    // Remember this look for the next recording (a picture kept inside this project cannot be reused).
    const look = structuredClone(project.settings);
    delete look.frame.crop;
    if (look.frame.background === 'image' && !String(look.frame.image || '').startsWith('/')) { delete look.frame.background; delete look.frame.image; }
    store.set('look', look);
    ed.dirty = true;
    saveTag.textContent = '저장 중…';
    clearTimeout(ed.saveTimer);
    ed.saveTimer = setTimeout(async () => {
      try {
        await platform.saveProject(project);
        ed.dirty = false;
        saveTag.textContent = '저장됨';
      } catch (err) {
        saveTag.textContent = '저장 실패';
        toast(`저장하지 못했습니다: ${err.message}`, true);
      }
    }, 600);
  }

  function seek(t) {
    const tt = Math.min(Math.max(0, t), project.durationMs / 1000);
    screen.currentTime = tt;
    if (webcam) webcam.currentTime = Math.max(0, tt - camOff);
    timeline.setTime(tt);
  }

  function togglePlay(force) {
    const play = force ?? screen.paused;
    if (play) {
      if (!ed.segs.length) { toast('재생할 구간이 없습니다. 잘라낸 부분을 확인하세요.', true); return; }
      if (segIndexAt(ed.segs, screen.currentTime + 0.05) < 0 || screen.currentTime < ed.segs[0].s0) seek(ed.segs[0].s0);
      screen.play().catch(() => {});
      webcam?.play().catch(() => {});
    } else {
      screen.pause();
      webcam?.pause();
    }
  }
  screen.addEventListener('play', () => { setLabel(playBtn, '❚❚'); });
  screen.addEventListener('pause', () => { setLabel(playBtn, '▶'); });
  screen.addEventListener('error', () => toast('영상 파일을 열지 못했습니다. 녹화가 비어 있을 수 있습니다.', true));

  const timeline = new Timeline(timelineCanvas, {
    onSeek: (t) => seek(t),
    onSelect: (sel) => {
      ed.selected = sel;
      if (sel) { ed.tab = { zoom: 'zoom', sub: 'subs', cut: 'clip', speed: 'clip', note: 'notes', audio: 'audio' }[sel.kind] || ed.tab; drawTabs(); }
      drawPanel();
    },
    onChange: () => { markDirty(); drawPanel(); },
    onAdd: (kind, t) => addItem(kind, t),
  });

  /** New cut-out part, speed region, note or sound at time t. */
  async function addItem(kind, t, extra = {}) {
    let item = null;
    if (kind === 'cut') item = { id: newId('c'), start: t, end: Math.min(duration(), t + 1) };
    else if (kind === 'speed') item = { id: newId('v'), start: t, end: Math.min(duration(), t + 3), speed: 2 };
    else if (kind === 'note') {
      item = { id: newId('n'), ...newNote(extra.type || 'text', t, duration()) };
      if (item.type === 'image') {
        const picked = await platform.importAsset(project.id, 'image', 'note');
        if (!picked) return;
        item.file = picked.name;
      }
    } else if (kind === 'audio') {
      const picked = await platform.importAsset(project.id, 'audio', 'sound');
      if (!picked) return;
      const el = new Audio(url(picked.name));
      const len = await new Promise((r) => { el.onloadedmetadata = () => r(el.duration); el.onerror = () => r(0); });
      if (!(len > 0) || !Number.isFinite(len)) { toast('이 소리 파일은 열 수 없습니다.', true); return; }
      item = { id: newId('a'), start: t, end: Math.min(duration(), t + len), file: picked.name, name: picked.label, volume: 1, offset: 0 };
    }
    if (!item || item.end - item.start < 0.05) return;
    const list = listOfKind(project, kind);
    list.push(item);
    list.sort((a, b) => a.start - b.start);
    ed.selected = { kind, id: item.id };
    timeline.select(ed.selected);
    ed.tab = { cut: 'clip', speed: 'clip', note: 'notes', audio: 'audio' }[kind];
    drawTabs();
    markDirty();
    drawPanel();
  }

  function removeSelected() {
    if (!ed.selected) return;
    const list = listOfKind(project, ed.selected.kind);
    const i = list ? list.findIndex((x) => x.id === ed.selected.id) : -1;
    if (i >= 0) list.splice(i, 1);
    ed.selected = null;
    timeline.select(null);
    markDirty();
    drawPanel();
  }
  const selectedOf = (kind) => (ed.selected?.kind === kind ? listOfKind(project, kind).find((x) => x.id === ed.selected.id) : null);

  // Drag a note on the picture to move it.
  preview.addEventListener('pointerdown', (e) => {
    const r = preview.getBoundingClientRect();
    const at = (ev) => ({ x: ((ev.clientX - r.left) / r.width) * preview.width, y: ((ev.clientY - r.top) / r.height) * preview.height });
    const p = at(e);
    const t = screen.currentTime || 0;
    const hit = [...project.annotations].reverse().find((a) => {
      if (t < a.start || t > a.end) return false;
      const b = noteRect(pctx, a, preview.width, preview.height, url);
      return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
    });
    if (!hit) return;
    ed.selected = { kind: 'note', id: hit.id };
    timeline.select(ed.selected);
    ed.tab = 'notes';
    drawTabs();
    drawPanel();
    const off = { x: p.x / preview.width - hit.x, y: p.y / preview.height - hit.y };
    preview.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const q = at(ev);
      hit.x = Math.min(1, Math.max(0, q.x / preview.width - off.x));
      hit.y = Math.min(1, Math.max(0, q.y / preview.height - off.y));
    };
    const up = () => {
      preview.removeEventListener('pointermove', move);
      preview.removeEventListener('pointerup', up);
      markDirty();
      drawPanel();
    };
    preview.addEventListener('pointermove', move);
    preview.addEventListener('pointerup', up);
  });

  const loop = () => {
    ed.raf = requestAnimationFrame(loop);
    const t = screen.currentTime || 0;
    const segs = ed.segs;
    if (!screen.paused) {
      // Jump over cut-out parts and play speed regions faster or slower.
      const i = segIndexAt(segs, t);
      if (i < 0) { togglePlay(false); if (segs.length) seek(segs[segs.length - 1].s1); } else {
        const g = segs[i];
        if (t < g.s0 - 0.03) { screen.currentTime = g.s0; if (webcam) webcam.currentTime = Math.max(0, g.s0 - camOff); }
        if (screen.playbackRate !== g.speed) { screen.playbackRate = g.speed; if (webcam) webcam.playbackRate = g.speed; }
      }
      if (webcam && Math.abs(webcam.currentTime - (t - camOff)) > 0.25) webcam.currentTime = Math.max(0, t - camOff);
    }
    screen.volume = Math.min(1, Math.max(0, project.settings.audio?.volume ?? 1));
    syncAudios(ed.audioEls, project, segs, t, !screen.paused);
    renderFrame(pctx, { W: preview.width, H: preview.height, t, screen, webcam, project, derived: ed.derived, url, selectedNote: ed.selected?.kind === 'note' ? ed.selected.id : null });
    const now = performance.now();
    if (now - ed.lastTimelineDraw > 50) {
      ed.lastTimelineDraw = now;
      timeline.setTime(t);
      timeLabel.textContent = `${fmt(srcToOut(segs, t), true)} / ${fmt(outDuration(segs), true)}`;
    }
  };

  ed.onKey = (e) => {
    if (e.target.closest?.('input, textarea, select') || document.querySelector('.modal-bg')) return;
    // a focused button or swatch takes Space and Enter itself
    if ((e.code === 'Space' || e.code === 'Enter') && e.target.closest?.('button, [role="button"]')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowLeft') seek(screen.currentTime - (e.shiftKey ? 5 : 1 / 30));
    if (e.code === 'ArrowRight') seek(screen.currentTime + (e.shiftKey ? 5 : 1 / 30));
    if ((e.code === 'Delete' || e.code === 'Backspace') && ed.selected) removeSelected();
    if (e.ctrlKey && e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); timeTravel(ed.history, ed.future); }
    if (e.ctrlKey && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) { e.preventDefault(); timeTravel(ed.future, ed.history); }
    if (e.code === 'KeyS' && !e.ctrlKey && !e.altKey) addItem('cut', screen.currentTime);
  };
  window.addEventListener('keydown', ed.onKey);

  function loadWallpapers() {
    platform.listWallpapers().then((list) => { ed.wallpapers = list; if (state.editor === ed && ed.tab === 'frame') drawPanel(); }).catch(() => {});
  }
  loadWallpapers();

  // ---------------- panels
  function drawPanel() {
    const s = project.settings;
    const panels = {
      frame: () => {
        const f = s.frame;
        const setBg = (id, image) => { f.background = id; if (image !== undefined) f.image = image; markDirty(); drawPanel(); };
        const wpCss = (w) => `${w.blobs.map(([x, y, r, c]) => `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${c}, transparent ${r * 100}%)`).join(', ')}, ${w.base}`;
        const isPicture = f.background === 'image' || WALLPAPERS.some((w) => w.id === f.background);
        const ownImage = f.background === 'image' && f.image && !f.image.startsWith('/');
        const c = f.crop;
        const edges = { l: c.x, t: c.y, r: 1 - c.x - c.w, b: 1 - c.y - c.h };
        const setCrop = () => {
          c.x = edges.l; c.y = edges.t;
          c.w = Math.max(0.1, 1 - edges.l - edges.r); c.h = Math.max(0.1, 1 - edges.t - edges.b);
          sizePreview();
          markDirty();
        };
        const cropField = (label, key) => rangeField(label, Math.round(edges[key] * 100), 0, 45, 1, (v) => { edges[key] = v / 100; setCrop(); }, (v) => `${v}%`);
        return [
          h('h3', {}, '화면 꾸미기'),
          segField('영상 비율', f.aspect, [{ id: '16:9', name: '16:9' }, { id: '9:16', name: '9:16' }, { id: '1:1', name: '1:1' }, { id: '4:3', name: '4:3' }, { id: 'source', name: '원본' }],
            (v) => { f.aspect = v; sizePreview(); markDirty(); }),
          h('div', { class: 'field' }, h('label', {}, '배경 색'),
            h('div', { class: 'swatches' },
              BACKGROUNDS.map((b) => h('div', { class: `swatch${f.background === b.id ? ' on' : ''}`, title: b.name, style: { background: `linear-gradient(135deg, ${b.stops.join(', ')})` }, onclick: () => setBg(b.id) }, h('small', {}, b.name))),
              h('div', { class: `swatch${f.background === 'none' ? ' on' : ''}`, style: { background: '#000', border: '1px dashed #484f58' }, onclick: () => setBg('none') }, h('small', {}, '없음')),
              h('label', { class: `swatch${f.background?.startsWith('#') ? ' on' : ''}`, style: { background: f.background?.startsWith('#') ? f.background : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' } },
                h('input', { type: 'color', style: { opacity: 0, width: '100%', height: '100%' }, value: f.background?.startsWith('#') ? f.background : '#334155', oninput: (e) => { f.background = e.target.value; markDirty(); }, onchange: () => drawPanel() }),
                h('small', {}, '단색')))),
          h('div', { class: 'field' }, h('label', {}, '배경 그림'),
            h('div', { class: 'swatches' },
              WALLPAPERS.map((w) => h('div', { class: `swatch${f.background === w.id ? ' on' : ''}`, title: w.name, style: { background: wpCss(w) }, onclick: () => setBg(w.id) }, h('small', {}, w.name))),
              (ed.wallpapers || []).map((p) => h('div', { class: `swatch${f.background === 'image' && f.image === p ? ' on' : ''}`, title: p.split('/').pop(), style: { background: `center / cover url("${platform.mediaUrl(null, p)}")` }, onclick: () => setBg('image', p) })),
              h('div', { class: `swatch${ownImage ? ' on' : ''}`, title: '내 컴퓨터의 그림을 배경으로', style: { background: ownImage ? `center / cover url("${url(f.image)}")` : '#21262d', border: '1px dashed rgba(255,255,255,0.28)', display: 'grid', placeItems: 'center', fontSize: '16px', paddingBottom: '14px', color: 'rgba(244,244,245,0.7)' }, onclick: async () => {
                const picked = await platform.importAsset(project.id, 'image', 'bg');
                if (picked) setBg('image', picked.name);
              } }, ownImage ? null : '＋', h('small', {}, '내 그림'))),
            isDesktop ? h('div', { class: 'row', style: { marginTop: '4px' } },
              h('button', { class: 'btn small', onclick: () => platform.openWallpapers() }, '📁 배경 그림 폴더'),
              h('button', { class: 'btn small ghost', title: '폴더에 넣은 그림 다시 읽기', onclick: loadWallpapers }, '↻')) : null,
            isDesktop ? h('div', { class: 'small muted' }, '이 폴더에 그림을 넣으면 여기에 나타납니다.') : null),
          isPicture ? rangeField('배경 흐림', f.blur || 0, 0, 40, 1, (v) => { f.blur = v; markDirty(); }, (v) => (v ? `${v}px` : '없음')) : null,
          f.background === 'none' ? h('div', { class: 'hint' }, '배경 없음: 녹화 화면을 꽉 채웁니다.') : [
            rangeField('여백', f.padding, 0, 20, 0.5, (v) => { f.padding = v; markDirty(); }, (v) => `${v}%`),
            rangeField('모서리 둥글기', f.radius, 0, 40, 1, (v) => { f.radius = v; markDirty(); }, (v) => `${v}px`),
            inlineSwitch('그림자', f.shadow, (v) => { f.shadow = v; markDirty(); drawPanel(); }),
            f.shadow ? rangeField('그림자 세기', f.shadowSize ?? 1, 0.2, 2, 0.1, (v) => { f.shadowSize = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`) : null,
          ],
          h('div', { class: 'section' },
            h('h3', {}, '화면 잘라내기 (크롭)'),
            h('div', { class: 'small muted', style: { marginBottom: '10px' } }, '녹화된 화면의 가장자리를 잘라 필요한 부분만 남깁니다.'),
            cropField('왼쪽', 'l'), cropField('오른쪽', 'r'), cropField('위', 't'), cropField('아래', 'b'),
            h('button', { class: 'btn small', onclick: () => { f.crop = { x: 0, y: 0, w: 1, h: 1 }; sizePreview(); markDirty(); drawPanel(); } }, '잘라내기 취소')),
        ];
      },
      clip: () => {
        const cut = selectedOf('cut');
        const sp = selectedOf('speed');
        const now = () => screen.currentTime || 0;
        const edge = (item, key) => h('button', { class: 'btn small grow', onclick: () => {
          if (key === 'start') item.start = Math.min(now(), item.end - 0.2); else item.end = Math.max(now(), item.start + 0.2);
          markDirty();
          drawPanel();
        } }, key === 'start' ? '시작을 여기로' : '끝을 여기로');
        return [
          h('h3', {}, '앞뒤 자르기'),
          h('div', { class: 'small muted', style: { marginBottom: '10px' } }, `${fmt(project.trim.start, true)} ~ ${fmt(project.trim.end, true)} · 타임라인 파란 막대의 양 끝을 끌어도 됩니다.`),
          h('div', { class: 'row' },
            h('button', { class: 'btn small grow', onclick: () => { project.trim.start = Math.min(now(), project.trim.end - 0.5); markDirty(); drawPanel(); } }, '여기서 시작'),
            h('button', { class: 'btn small grow', onclick: () => { project.trim.end = Math.max(now(), project.trim.start + 0.5); markDirty(); drawPanel(); } }, '여기서 끝'),
            h('button', { class: 'btn small', onclick: () => { project.trim = { start: 0, end: duration() }; markDirty(); drawPanel(); } }, '초기화')),
          h('div', { class: 'section' },
            h('h3', {}, '중간 잘라내기'),
            h('div', { class: 'small muted', style: { marginBottom: '10px' } }, `잘라낸 구간 ${project.cuts.length}개 · 완성 영상 길이 ${fmt(outDuration(ed.segs), true)}`),
            h('button', { class: 'btn wide', onclick: () => addItem('cut', now()) }, '✂ 여기서부터 잘라내기 (S)'),
            h('div', { class: 'small muted', style: { marginTop: '8px' } }, '영상 줄에 생긴 빨간 구간의 양 끝을 끌어 범위를 맞추세요. 빨간 구간은 재생과 내보내기에서 건너뜁니다.'),
            cut ? h('div', { style: { marginTop: '12px' } },
              h('div', { class: 'field-label', style: { marginBottom: '6px' } }, `선택한 구간 ${fmt(cut.start, true)} ~ ${fmt(cut.end, true)}`),
              h('div', { class: 'row' }, edge(cut, 'start'), edge(cut, 'end'), h('button', { class: 'btn small danger', onclick: removeSelected }, '되살리기'))) : null),
          h('div', { class: 'section' },
            h('h3', {}, '속도 바꾸기'),
            h('button', { class: 'btn wide', onclick: () => addItem('speed', now()) }, '⏩ 여기에 속도 구간 넣기'),
            h('div', { class: 'small muted', style: { marginTop: '8px' } }, `속도 구간 ${project.speeds.length}개 · 속도 줄을 더블클릭해도 됩니다. 소리도 같은 속도로 재생됩니다.`),
            sp ? h('div', { style: { marginTop: '12px' } },
              segField(`선택한 구간 ${fmt(sp.start, true)} ~ ${fmt(sp.end, true)}`, String(sp.speed),
                [0.25, 0.5, 0.75, 1.25, 1.5, 2, 3, 4].map((v) => ({ id: String(v), name: `${v}×` })), (v) => { sp.speed = Number(v); markDirty(); }),
              h('div', { class: 'row' }, edge(sp, 'start'), edge(sp, 'end'), h('button', { class: 'btn small danger', onclick: removeSelected }, '삭제'))) : null),
        ];
      },
      zoom: () => {
        const sel = ed.selected?.kind === 'zoom' ? project.zooms.find((z) => z.id === ed.selected.id) : null;
        const noCursor = !ed.derived.cursor.available;
        return [
          h('h3', {}, '클릭 자동 확대'),
          noCursor ? h('div', { class: 'hint warn' }, project.source.kind === 'window'
            ? '창을 녹화하면 클릭 위치를 알 수 없어 자동 확대가 만들어지지 않습니다. 타임라인 줌 줄을 더블클릭해 직접 넣을 수 있어요.'
            : '이 녹화에는 마우스 위치 기록이 없습니다. 줌 줄을 더블클릭해 직접 넣을 수 있어요.') : null,
          inlineSwitch('줌 효과 사용', s.zoom.enabled, (v) => { s.zoom.enabled = v; markDirty(); }),
          inlineSwitch('확대 중 커서 따라가기', s.zoom.follow, (v) => { s.zoom.follow = v; markDirty(); }),
          rangeField('확대 배율 (새로 만들 때)', s.zoom.scale, 1.2, 3, 0.1, (v) => { s.zoom.scale = v; markDirty(); }, (v) => `${v.toFixed(1)}×`),
          rangeField('확대 속도', s.zoom.ramp, 0.2, 1.2, 0.05, (v) => { s.zoom.ramp = v; markDirty(); }, (v) => `${v.toFixed(2)}초`),
          h('button', { class: 'btn wide', disabled: noCursor, onclick: () => {
            project.zooms = [...project.zooms.filter((z) => !z.auto), ...autoZoomRegions(project.events, project.durationMs / 1000, s.zoom.scale)].sort((a, b) => a.start - b.start);
            ed.selected = null;
            markDirty();
            drawPanel();
            toast(`클릭 기준 줌 ${project.zooms.length}개`);
          } }, '↻ 클릭 기준으로 다시 만들기'),
          h('div', { class: 'small muted', style: { marginTop: '8px' } }, `줌 구간 ${project.zooms.length}개 · 줌 줄을 더블클릭하면 추가, 끌어서 옮기기·늘리기, 선택 후 Delete로 삭제`),
          sel ? h('div', { class: 'section' },
            h('h3', {}, `선택한 줌 (${fmt(sel.start, true)} ~ ${fmt(sel.end, true)})`),
            rangeField('배율', sel.scale, 1.1, 4, 0.1, (v) => { sel.scale = v; sel.auto = false; markDirty(); }, (v) => `${v.toFixed(1)}×`),
            rangeField('가로 위치', sel.x, 0, 1, 0.01, (v) => { sel.x = v; sel.auto = false; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
            rangeField('세로 위치', sel.y, 0, 1, 0.01, (v) => { sel.y = v; sel.auto = false; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
            h('button', { class: 'btn wide danger', onclick: () => {
              project.zooms = project.zooms.filter((z) => z.id !== sel.id);
              ed.selected = null;
              timeline.select(null);
              markDirty();
              drawPanel();
            } }, '이 줌 삭제')) : null,
        ];
      },
      notes: () => {
        const a = selectedOf('note');
        const now = () => screen.currentTime || 0;
        const set = (key, redraw) => (v) => { a[key] = v; markDirty(); if (redraw) drawPanel(); };
        const pct = (v) => `${Math.round(v * 100)}%`;
        const typeName = (id) => NOTE_TYPES.find((n) => n.id === id)?.name || id;
        const byType = a ? {
          text: () => [
            h('div', { class: 'field' }, h('label', {}, '내용'), h('textarea', { value: a.text, rows: 2, oninput: (e) => { a.text = e.target.value; markDirty(); } })),
            rangeField('글자 크기', a.size, 20, 200, 2, set('size'), (v) => `${v}px`),
            colorField('글자 색', a.color, set('color')),
            inlineSwitch('굵게', a.bold !== false, set('bold')),
            inlineSwitch('뒤에 바탕', a.bgOn !== false, set('bgOn', true)),
            a.bgOn !== false ? colorField('바탕 색', a.bg, set('bg')) : null,
          ],
          arrow: () => [
            rangeField('길이', a.w, 0.04, 0.7, 0.01, set('w'), pct),
            rangeField('방향', a.angle, 0, 345, 15, set('angle'), (v) => `${v}°`),
            rangeField('두께', a.stroke, 3, 40, 1, set('stroke'), (v) => `${v}px`),
            colorField('색', a.color, set('color')),
          ],
          box: () => [
            rangeField('가로 크기', a.w, 0.03, 1, 0.01, set('w'), pct),
            rangeField('세로 크기', a.h, 0.03, 1, 0.01, set('h'), pct),
            rangeField('선 두께', a.stroke, 2, 30, 1, set('stroke'), (v) => `${v}px`),
            colorField('색', a.color, set('color')),
          ],
          image: () => [
            rangeField('크기', a.w, 0.03, 1, 0.01, set('w'), pct),
            h('button', { class: 'btn small', onclick: async () => {
              const picked = await platform.importAsset(project.id, 'image', 'note');
              if (picked) { a.file = picked.name; markDirty(); }
            } }, '그림 바꾸기'),
          ],
          blur: () => [
            h('div', { class: 'hint' }, '비밀번호나 개인 정보처럼 보이면 안 되는 곳을 흐리게 가립니다. 화면이 확대되거나 움직이면 가린 위치는 따라가지 않습니다.'),
            rangeField('가로 크기', a.w, 0.03, 1, 0.01, set('w'), pct),
            rangeField('세로 크기', a.h, 0.03, 1, 0.01, set('h'), pct),
            rangeField('흐림 세기', a.strength, 4, 50, 1, set('strength'), (v) => `${v}px`),
          ],
        }[a.type]() : null;
        return [
          h('h3', {}, '주석'),
          h('div', { class: 'small muted', style: { marginBottom: '10px' } }, '지금 보고 있는 시각에 넣습니다. 미리보기에서 끌어 옮기고, 타임라인 주석 줄에서 나오는 시간을 맞추세요.'),
          h('div', { class: 'row', style: { flexWrap: 'wrap' } }, NOTE_TYPES.map((n) => h('button', { class: 'btn small', onclick: () => addItem('note', now(), { type: n.id }) }, `+ ${n.name}`))),
          a ? h('div', { class: 'section' },
            h('h3', {}, `선택한 주석 · ${typeName(a.type)} (${fmt(a.start, true)} ~ ${fmt(a.end, true)})`),
            byType,
            rangeField('가로 위치', a.x, 0, 1, 0.005, set('x'), pct),
            rangeField('세로 위치', a.y, 0, 1, 0.005, set('y'), pct),
            h('button', { class: 'btn wide danger', onclick: removeSelected }, '이 주석 삭제'))
            : h('div', { class: 'small muted', style: { marginTop: '12px' } }, `주석 ${project.annotations.length}개 · 타임라인이나 미리보기에서 누르면 여기서 고칠 수 있습니다.`),
        ];
      },
      keys: () => {
        const keyCount = project.events.filter((e) => e.type === 'kd' && !e.repeat).length;
        return [
          h('h3', {}, '키 표시'),
          !project.inputHooked && !keyCount ? h('div', { class: 'hint warn' }, '이 녹화에는 키 기록이 없습니다.') : h('div', { class: 'hint' }, `기록된 키 ${keyCount}개 · 말풍선 ${ed.derived.groups.length}개`),
          inlineSwitch('영상에 키 보여주기', s.keys.enabled, (v) => { s.keys.enabled = v; markDirty(); }),
          keyPanel(s.keys, (rebuild) => markDirty({ rederive: !!rebuild }), drawPanel),
        ];
      },
      cursor: () => {
        const c = s.cursor;
        return [
          h('h3', {}, '커서와 클릭'),
          !ed.derived.cursor.available ? h('div', { class: 'hint warn' }, '이 녹화에는 마우스 위치 기록이 없어 커서와 클릭 효과를 그릴 수 없습니다 (전체 화면 녹화에서 사용 가능).') : null,
          inlineSwitch('클릭할 때 효과', c.clicks, (v) => { c.clicks = v; markDirty(); }),
          segField('효과 모양', c.effect || 'ripple', [{ id: 'ripple', name: '물결' }, { id: 'spotlight', name: '점' }], (v) => { c.effect = v; markDirty(); }),
          inlineSwitch('커서 주변 강조', c.highlight, (v) => { c.highlight = v; markDirty(); }),
          inlineSwitch('휠을 굴릴 때 표시', c.scrolls !== false, (v) => { c.scrolls = v; markDirty(); }),
          colorField('효과 색', c.color, (v) => { c.color = v; markDirty(); }),
          h('div', { class: 'section' },
            h('h3', {}, '커서 다시 그리기'),
            project.cursorHidden ? h('div', { class: 'hint' }, '이 녹화는 실제 커서 없이 찍었습니다. 여기서 끄면 영상에 커서가 보이지 않습니다.') : null,
            inlineSwitch(project.cursorHidden ? '커서 그리기' : '커서를 크게 다시 그리기', c.show, (v) => { c.show = v; markDirty(); drawPanel(); }),
            c.show ? [
              project.cursorHidden ? null : h('div', { class: 'hint' }, '녹화된 실제 커서 위에 겹쳐 그립니다. 실제 커서는 지워지지 않아서 "부드럽게"를 높이면 두 커서가 잠깐 떨어져 보일 수 있습니다.'),
              segField('모양', c.style || 'arrow', CURSOR_STYLES.map((x) => ({ id: x.id, name: x.name })), (v) => { c.style = v; markDirty(); }),
              rangeField('크기', c.size, 0.8, 4, 0.1, (v) => { c.size = v; markDirty(); }, (v) => `${v.toFixed(1)}×`),
              rangeField('부드럽게', c.smoothing, 0, 1, 0.05, (v) => { c.smoothing = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
              rangeField('빠르게 움직일 때 잔상', c.motionBlur, 0, 1, 0.05, (v) => { c.motionBlur = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
              rangeField('클릭할 때 눌리는 정도', c.bounce, 0, 1, 0.05, (v) => { c.bounce = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
              rangeField('움직이는 쪽으로 기울기', c.sway, 0, 1, 0.05, (v) => { c.sway = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
              inlineSwitch('끝날 때 처음 위치로 돌아가기', c.loop, (v) => { c.loop = v; markDirty(); }, '반복 재생하는 영상·GIF가 매끄럽게 이어집니다'),
            ] : null),
        ];
      },
      webcam: () => {
        const w = s.webcam;
        const swap = async (name) => {
          project.files.webcam = name;
          w.enabled = !!name;
          await platform.saveProject(project);
          openEditor(project.id, project);
        };
        return [
          h('h3', {}, '웹캠 말풍선'),
          !webcam ? h('div', { class: 'hint' }, '이 녹화에는 웹캠 영상이 없습니다. 녹화 옵션에서 웹캠을 고르거나, 따로 찍은 영상을 넣을 수 있습니다.') : null,
          h('div', { class: 'row', style: { marginBottom: '14px' } },
            h('button', { class: 'btn small grow', onclick: async () => {
              const picked = await platform.importAsset(project.id, 'video', 'webcam');
              if (picked) swap(picked.name);
            } }, webcam ? '📂 다른 영상으로 바꾸기' : '📂 웹캠 영상 넣기'),
            webcam ? h('button', { class: 'btn small danger', onclick: () => { if (confirm('웹캠 영상을 이 녹화에서 뺄까요?')) swap(null); } }, '빼기') : null),
          webcam ? [
            inlineSwitch('웹캠 보이기', w.enabled, (v) => { w.enabled = v; markDirty(); }),
            inlineSwitch('좌우 뒤집기 (거울처럼)', w.mirror !== false, (v) => { w.mirror = v; markDirty(); }),
            positionField('위치', w.position, ['top-left', 'top-right', 'bottom-left', 'bottom-right'], (v) => { w.position = v; markDirty(); drawPanel(); }),
            inlineSwitch('위치 직접 정하기', w.position === 'custom', (v) => { w.position = v ? 'custom' : 'bottom-left'; markDirty(); drawPanel(); }),
            w.position === 'custom' ? [
              rangeField('가로 위치', w.x ?? 0.9, 0, 1, 0.01, (v) => { w.x = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
              rangeField('세로 위치', w.y ?? 0.9, 0, 1, 0.01, (v) => { w.y = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
            ] : null,
            rangeField('크기', w.size, 8, 50, 1, (v) => { w.size = v; markDirty(); }, (v) => `${v}%`),
            rangeField('가장자리 여백', w.margin ?? 28, 0, 140, 2, (v) => { w.margin = v; markDirty(); }, (v) => `${v}px`),
            rangeField('둥글기', w.roundness ?? 100, 0, 100, 5, (v) => { w.roundness = v; markDirty(); }, (v) => (v === 100 ? '원' : `${v}%`)),
            rangeField('그림자', w.shadow ?? 0.45, 0, 1, 0.05, (v) => { w.shadow = v; markDirty(); }, (v) => (v ? `${Math.round(v * 100)}%` : '없음')),
            inlineSwitch('화면이 확대되면 작아지기', !!w.reactToZoom, (v) => { w.reactToZoom = v; markDirty(); }),
          ] : null,
        ];
      },
      audio: () => {
        const a = selectedOf('audio');
        const au = s.audio;
        return [
          h('h3', {}, '소리'),
          rangeField('녹화된 소리 크기', Math.round((au.volume ?? 1) * 100), 0, 100, 5, (v) => { au.volume = v / 100; markDirty(); }, (v) => (v ? `${v}%` : '끔')),
          h('div', { class: 'section' },
            h('h3', {}, '소리 파일 추가 (배경 음악·효과음)'),
            h('button', { class: 'btn wide', onclick: () => addItem('audio', screen.currentTime || 0) }, '♪ 여기에 소리 파일 넣기'),
            h('div', { class: 'small muted', style: { marginTop: '8px' } }, `추가한 소리 ${project.audios.length}개 · 타임라인 소리 줄에서 끌어 옮기고, 끝을 끌어 길이를 줄입니다.`),
            a ? h('div', { style: { marginTop: '14px' } },
              h('div', { class: 'field-label', style: { marginBottom: '8px', wordBreak: 'break-all' } }, `선택: ${a.name} (${fmt(a.start, true)} ~ ${fmt(a.end, true)})`),
              rangeField('크기', Math.round((a.volume ?? 1) * 100), 0, 100, 5, (v) => { a.volume = v / 100; markDirty(); }, (v) => `${v}%`),
              rangeField('파일의 몇 초부터 틀까요', a.offset || 0, 0, 120, 0.5, (v) => { a.offset = v; markDirty(); }, (v) => `${v}초`),
              h('button', { class: 'btn wide danger', onclick: removeSelected }, '이 소리 삭제')) : null),
        ];
      },
      subs: () => drawSubtitlePanel(),
    };
    sideBody.replaceChildren(...[panels[ed.tab]()].flat(Infinity).filter(Boolean));
  }

  function drawSubtitlePanel() {
    const s = project.settings;
    const prefs = store.get('asr', { model: MODELS[1].id, language: 'korean', gpu: true });
    const soundFile = project.files.voice || project.files.audio || project.files.screen;
    const hasAudio = !!soundFile;
    const progressBar = h('div', { class: 'progress hidden' }, h('div'));
    const progressText = h('div', { class: 'small muted', style: { marginTop: '6px' } });
    const runBtn = h('button', { class: 'btn primary wide', disabled: !hasAudio || ed.transcribing, onclick: async () => {
      if (project.subtitles.length && !confirm('지금 있는 자막을 새로 만든 자막으로 바꿀까요?')) return;
      ed.transcribing = true;
      runBtn.disabled = true;
      runBtn.textContent = '자막 만드는 중…';
      progressBar.classList.remove('hidden');
      progressBar.classList.add('indeterminate');
      const started = performance.now();
      try {
        const subs = await transcribe({
          url: platform.mediaUrl(project.id, soundFile),
          model: prefs.model,
          language: prefs.language,
          preferGpu: prefs.gpu,
          duration: project.durationMs / 1000,
          onProgress: (p) => {
            if (p.stage === 'downloading' && p.total) {
              progressBar.classList.remove('indeterminate');
              progressBar.firstChild.style.width = `${Math.round((p.loaded / p.total) * 100)}%`;
              progressText.textContent = `음성 인식 모델 내려받는 중 (처음 한 번만) · ${formatBytes(p.loaded)} / ${formatBytes(p.total)}`;
            } else {
              progressBar.classList.add('indeterminate');
              const labels = {
                decoding: '녹음된 소리를 읽는 중…',
                loading: `모델 준비 중 (${p.device === 'webgpu' ? '그래픽카드' : 'CPU'})…`,
                transcribing: `말을 글로 옮기는 중 (${p.device === 'webgpu' ? '그래픽카드' : 'CPU'}) · 영상 길이에 따라 시간이 걸립니다`,
                retry: '그래픽카드로 실패해 CPU로 다시 시도합니다…',
                shaping: '문장 단위로 자막 정리 중…',
              };
              progressText.textContent = labels[p.stage] || '';
            }
          },
        });
        // The microphone file may begin a moment after the picture: move the lines to match.
        const late = soundFile === project.files.voice ? (project.offsets?.voice || 0) : 0;
        if (late) for (const c of subs) { c.start += late; c.end += late; }
        project.subtitles = subs;
        markDirty();
        toast(`자막 ${subs.length}개를 만들었습니다 (${Math.round((performance.now() - started) / 1000)}초)`);
      } catch (err) {
        console.error(err);
        toast(`자막을 만들지 못했습니다: ${err.message}`, true);
      } finally {
        ed.transcribing = false;
        if (state.editor === ed) drawPanel();
      }
    } }, ed.transcribing ? '자막 만드는 중…' : project.subtitles.length ? '↻ 음성으로 자막 다시 만들기' : '🎙 음성으로 자막 만들기');

    const sel = ed.selected?.kind === 'sub' ? ed.selected.id : null;
    const cues = h('div', { class: 'cues' }, project.subtitles.map((c) => {
      const timeInput = (key) => h('input', { type: 'number', step: 0.1, min: 0, value: c[key].toFixed(2), onchange: (e) => {
        c[key] = Math.max(0, Number(e.target.value) || 0);
        if (c.end <= c.start) c.end = c.start + 0.3;
        project.subtitles.sort((a, b) => a.start - b.start);
        markDirty();
      } });
      return h('div', { class: `cue${sel === c.id ? ' on' : ''}`, onclick: (e) => {
        if (e.target.closest('input, textarea, button')) return;
        ed.selected = { kind: 'sub', id: c.id };
        timeline.select(ed.selected);
        seek(c.start + 0.01);
        drawPanel();
      } },
      h('div', { class: 'times' }, timeInput('start'), '→', timeInput('end'), h('span', { class: 'grow' }),
        h('button', { class: 'btn small ghost', title: '여기로 이동', onclick: () => seek(c.start + 0.01) }, '▶'),
        h('button', { class: 'btn small ghost danger', title: '삭제', onclick: () => { project.subtitles = project.subtitles.filter((x) => x.id !== c.id); markDirty(); drawPanel(); } }, '✕')),
      h('textarea', { value: c.text, rows: 2, oninput: (e) => { c.text = e.target.value; markDirty(); } }));
    }));

    return [
      h('h3', {}, '음성 자막'),
      !project.files.voice ? h('div', { class: 'hint' }, '마이크를 따로 녹음하지 않아 영상의 소리 전체로 자막을 만듭니다.') : null,
      selectField('정확도', prefs.model, MODELS, (v) => { prefs.model = v; store.set('asr', prefs); }),
      selectField('말한 언어', prefs.language, LANGUAGES, (v) => { prefs.language = v; store.set('asr', prefs); }),
      inlineSwitch('그래픽카드로 빠르게', prefs.gpu, (v) => { prefs.gpu = v; store.set('asr', prefs); }, '안 되면 자동으로 CPU를 씁니다'),
      runBtn,
      progressBar,
      progressText,
      h('div', { class: 'small muted', style: { marginTop: '8px' } }, '음성은 이 컴퓨터 안에서만 처리됩니다. 모델은 처음에 한 번 내려받습니다.'),
      h('div', { class: 'section' },
        h('h3', {}, '자막 모양'),
        inlineSwitch('영상에 자막 넣기', s.subtitles.enabled, (v) => { s.subtitles.enabled = v; markDirty(); }),
        segField('스타일', s.subtitles.style, [{ id: 'box', name: '상자' }, { id: 'outline', name: '테두리' }, { id: 'yellow', name: '노란 글씨' }], (v) => { s.subtitles.style = v; markDirty(); }),
        segField('위치', s.subtitles.position, [{ id: 'bottom', name: '아래' }, { id: 'top', name: '위' }], (v) => { s.subtitles.position = v; markDirty(); }),
        rangeField('글자 크기', s.subtitles.size, 0.6, 1.8, 0.05, (v) => { s.subtitles.size = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`)),
      h('div', { class: 'section' },
        h('div', { class: 'row', style: { marginBottom: '10px' } },
          h('h3', { class: 'grow', style: { margin: 0 } }, `자막 ${project.subtitles.length}개`),
          h('button', { class: 'btn small', onclick: () => {
            const t = screen.currentTime;
            const c = { id: newId('s'), start: t, end: Math.min(project.durationMs / 1000, t + 2.5), text: '새 자막' };
            project.subtitles.push(c);
            project.subtitles.sort((a, b) => a.start - b.start);
            ed.selected = { kind: 'sub', id: c.id };
            markDirty();
            drawPanel();
          } }, '+ 여기에 추가'),
          h('button', { class: 'btn small', disabled: !project.subtitles.length, onclick: saveSrt }, 'SRT 저장')),
        project.subtitles.length ? cues : h('div', { class: 'small muted' }, '아직 자막이 없습니다.')),
    ];
  }

  async function saveSrt() {
    const text = toSRT(mapCues(project.subtitles, ed.segs));
    const file = await platform.saveText(`${safeFileName(project.name)}.srt`, text, 'srt');
    if (file) toast('SRT 자막 파일을 저장했습니다.');
  }

  // ---------------- export
  function openExport() {
    togglePlay(false);
    const formats = exportFormats();
    if (!formats.length) { toast('이 컴퓨터에서는 영상을 저장할 수 없습니다.', true); return; }
    const prefs = { gifFps: 15, gifSide: 800, gifLoop: true, ...store.get('export', { format: formats[0].id, longSide: 1920, fps: 60, burn: true, srt: true }) };
    if (!formats.find((f) => f.id === prefs.format)) prefs.format = formats[0].id;
    const len = outDuration(ed.segs);
    if (!(len > 0)) { toast('내보낼 구간이 없습니다. 잘라낸 부분을 확인하세요.', true); return; }
    const body = h('div');
    const bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal' }, h('h2', {}, '영상 내보내기'), body));
    document.body.append(bg);
    const close = () => bg.remove();

    // replaceChildren would turn a nested list into text, so the list is flattened first
    const drawForm = () => body.replaceChildren(...[
      selectField('파일 형식', prefs.format, formats, (v) => { prefs.format = v; drawForm(); }),
      prefs.format === 'gif' ? [
        segField('크기 (긴 쪽)', String(prefs.gifSide), [{ id: '480', name: '480' }, { id: '640', name: '640' }, { id: '800', name: '800' }, { id: '1080', name: '1080' }], (v) => { prefs.gifSide = Number(v); }),
        segField('초당 프레임', String(prefs.gifFps), [{ id: '10', name: '10' }, { id: '15', name: '15' }, { id: '20', name: '20' }, { id: '25', name: '25' }], (v) => { prefs.gifFps = Number(v); }),
        inlineSwitch('계속 반복 재생', prefs.gifLoop, (v) => { prefs.gifLoop = v; }),
        inlineSwitch('자막을 그림에 넣기', prefs.burn, (v) => { prefs.burn = v; }),
        h('div', { class: 'hint' }, `길이 ${fmt(len)} · GIF는 소리가 없고 용량이 큽니다. 30초 이하의 짧은 구간에 알맞습니다.`),
      ] : [

      selectField('화질', String(prefs.longSide), [{ id: '1280', name: '720p (가벼움)' }, { id: '1920', name: '1080p (추천)' }, { id: '2560', name: '1440p' }, { id: '3840', name: '4K' }], (v) => { prefs.longSide = Number(v); }),
      segField('초당 프레임', String(prefs.fps), [{ id: '30', name: '30fps' }, { id: '60', name: '60fps' }], (v) => { prefs.fps = Number(v); }),
      inlineSwitch('자막을 영상에 넣기', prefs.burn, (v) => { prefs.burn = v; }),
      project.subtitles.length ? inlineSwitch('SRT 자막 파일도 저장', prefs.srt, (v) => { prefs.srt = v; }) : null,
      h('div', { class: 'hint' }, `길이 ${fmt(len)} · 내보내기는 영상 길이만큼, 컴퓨터가 바쁘면 조금 더 걸립니다. 그동안 이 창을 열어 두세요.`),
      ],
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: close }, '취소'),
        h('button', { class: 'btn primary', onclick: run }, '저장할 곳 고르기')),
    ].flat(Infinity).filter(Boolean));

    async function run() {
      store.set('export', prefs);
      const format = formats.find((f) => f.id === prefs.format);
      const gif = format.ext === 'gif';
      const srtText = toSRT(mapCues(project.subtitles, ed.segs));
      const name = `${safeFileName(project.name)}.${format.ext}`;
      const writer = await platform.exportWriter(name, format.ext, format.mime);
      if (!writer) return;
      const bar = h('div', { class: 'progress' }, h('div'));
      const label = h('div', { class: 'small muted', style: { marginTop: '8px' } }, '준비 중…');
      ed.abort = new AbortController();
      body.replaceChildren(bar, label, h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => ed.abort?.abort() }, '중지')));
      try {
        const file = await exportVideo({
          project, derived: ed.derived, screenUrl, webcamUrl, format, url,
          longSide: gif ? prefs.gifSide : prefs.longSide, fps: gif ? prefs.gifFps : prefs.fps, loop: prefs.gifLoop, burnSubtitles: prefs.burn, writer,
          signal: ed.abort.signal,
          onProgress: (k) => { bar.firstChild.style.width = `${Math.round(k * 100)}%`; label.textContent = `${Math.round(k * 100)}% · ${fmt(k * len)} / ${fmt(len)}`; },
        });
        ed.abort = null;
        if (!file) { close(); toast('내보내기를 중지했습니다.'); return; }
        let srtNote = '';
        if (gif) {
          // a GIF carries no separate subtitle file
        } else if (prefs.srt && project.subtitles.length && isDesktop && writer.path) {
          const srtPath = writer.path.replace(/\.[^.\\/]+$/, '.srt');
          await window.keycast.writeText(srtPath, srtText);
          srtNote = ' + SRT 자막';
        } else if (prefs.srt && project.subtitles.length && !isDesktop) {
          await saveSrt();
        }
        body.replaceChildren(
          h('div', { class: 'done' },
            h('span', {}, '✅'),
            h('b', {}, `영상을 저장했습니다${srtNote}`),
            h('span', { class: 'small muted', style: { wordBreak: 'break-all' } }, writer.path || '')),
          h('div', { class: 'actions' },
            isDesktop ? h('button', { class: 'btn', onclick: () => platform.reveal(writer.path) }, '폴더에서 보기') : null,
            h('button', { class: 'btn primary', onclick: close }, '닫기')));
      } catch (err) {
        console.error(err);
        ed.abort = null;
        close();
        toast(`내보내지 못했습니다: ${err.message || err}`, true);
      }
    }
    drawForm();
  }

  // ---------------- layout
  mount(
    topbar(
      h('button', { class: 'btn small ghost', onclick: async () => { if (ed.dirty) await platform.saveProject(project); showHome(); } }, '← 처음으로'),
      nameInput,
      saveTag,
      h('button', { class: 'btn small ghost', title: '되돌리기 (Ctrl+Z)', onclick: () => timeTravel(ed.history, ed.future) }, '↶'),
      h('button', { class: 'btn small ghost', title: '다시 하기 (Ctrl+Y)', onclick: () => timeTravel(ed.future, ed.history) }, '↷'),
      h('button', { class: 'btn small ghost', title: '단축키', onclick: openShortcuts }, '⌨'),
      h('button', { class: 'btn primary', onclick: openExport }, '⤓ 내보내기')),
    h('div', { class: 'editor' },
      h('div', { class: 'stage' },
        h('div', { class: 'preview-wrap' }, preview),
        h('div', { class: 'transport' },
          playBtn,
          timeLabel,
          h('div', { class: 'grow' }),
          sizeLabel),
        h('div', { class: 'timeline-wrap' }, timelineCanvas,
          h('div', { class: 'timeline-help' }, '클릭해서 이동 · 줄을 더블클릭하면 그 줄에 추가 · 블록을 끌어 옮기고 끝을 끌어 늘리기 · 선택 후 Delete로 삭제 · Space 재생 · Ctrl+Z 되돌리기'))),
      h('aside', { class: 'side' }, sideTabs, sideBody)));

  drawTabs();
  drawPanel();
  timeline.setData(project, ed.derived);
  seek(project.trim.start);
  loop();
}

function safeFileName(name) {
  return String(name).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'keycast';
}

// ------------------------------------------------------------------ self-test (desktop, scripted)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await sleep(100);
  }
  return false;
}
function silentToneWav(seconds = 2, rate = 16000) {
  const n = seconds * rate;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 8) * 600), true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

async function selfTest() {
  const api = window.keycast;
  let failed = false;
  const ok = (name, cond, extra = '') => {
    if (!cond) failed = true;
    console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`);
  };
  let projectId = null;
  try {
    await waitFor(() => state.sources.length, 15000);
    ok('sources listed', state.sources.length > 0, `${state.sources.length} (${state.sources.filter((s) => s.kind === 'screen').length} screens)`);
    ok('input hook loaded', !!state.info?.inputHook);
    await api.selftestShot('home');
    const src = state.sources.find((s) => s.kind === 'screen');
    state.sourceId = src.id;
    state.options = { micId: '', systemAudio: false, webcamId: '', liveOverlay: true, countdown: false };
    await startRecording();
    ok('recording started', !!state.recorder?.startEpoch);
    await sleep(600);
    await api.selftestShot('toolbar');
    await sleep(3200);
    await stopRecording();
    await waitFor(() => state.editor, 15000);
    const ed = state.editor;
    const p = ed.project;
    projectId = p.id;
    ok('project saved', p.durationMs > 2500, { durationMs: p.durationMs, hooked: p.inputHooked, events: p.events.length });
    await waitFor(() => ed.screen.readyState >= 2, 15000);
    ok('video loads', ed.screen.readyState >= 2, `${ed.screen.videoWidth}x${ed.screen.videoHeight} duration=${ed.screen.duration}`);
    ok('duration written into file', Number.isFinite(ed.screen.duration) && Math.abs(ed.screen.duration - p.durationMs / 1000) < 0.6, String(ed.screen.duration));
    ed.screen.currentTime = 2.0;
    await new Promise((r) => { ed.screen.addEventListener('seeked', r, { once: true }); setTimeout(r, 5000); });
    ok('seek works', Math.abs(ed.screen.currentTime - 2.0) < 0.3, String(ed.screen.currentTime));

    // Synthetic input to check the overlays draw (real keys come from the global hook).
    const synth = [
      { t: 0.30, type: 'kd', name: 'Ctrl', modifier: true, mods: { ctrl: true } },
      { t: 0.35, type: 'kd', name: 'S', mods: { ctrl: true } },
      { t: 0.45, type: 'ku', name: 'S' },
      { t: 0.50, type: 'ku', name: 'Ctrl' },
      ...'HELLO'.split('').map((c, i) => ({ t: 1.0 + i * 0.12, type: 'kd', name: c, mods: {} })),
      { t: 0.70, type: 'mm', x: 0.4, y: 0.4 },
      { t: 0.80, type: 'md', button: 1, x: 0.45, y: 0.42 },
      { t: 1.60, type: 'mm', x: 0.55, y: 0.5 },
      // a second click far away: the camera has to travel from one zoom to the next
      { t: 2.30, type: 'mm', x: 0.85, y: 0.8 },
      { t: 2.40, type: 'md', button: 1, x: 0.85, y: 0.8 },
    ];
    p.events = [...p.events, ...synth].sort((a, b) => a.t - b.t);
    p.zooms = autoZoomRegions(p.events, p.durationMs / 1000, p.settings.zoom.scale);
    p.subtitles = [{ id: 's1', start: 0.5, end: 2.9, text: '안녕하세요, 키캐스트 스튜디오 자막 테스트입니다.' }];
    ed.derived = derive(p);
    ok('key bubbles', ed.derived.groups.length >= 2, ed.derived.groups.map((g) => g.items.map((i) => i.keys.join('+')).join(' ')).join(' | '));
    ok('auto zoom', p.zooms.length >= 1, p.zooms.map((z) => `${z.start.toFixed(2)}-${z.end.toFixed(2)}`).join(','));
    ed.screen.currentTime = 1.5;
    await sleep(700);
    await api.selftestShot('editor');

    const formats = exportFormats();
    ok('export formats', formats.length > 0, formats.map((f) => f.mime).join(' | '));
    for (const format of formats) {
      const writer = await platform.writerForPath(await api.selftestPath(`export.${format.ext}`));
      const started = performance.now();
      const file = await exportVideo({
        project: p, derived: ed.derived, screenUrl: ed.screenUrl, webcamUrl: ed.webcamUrl, format, url: (n) => platform.mediaUrl(p.id, n),
        longSide: format.ext === 'gif' ? 480 : 1280, fps: format.ext === 'gif' ? 10 : 30, burnSubtitles: true, writer, signal: new AbortController().signal,
      });
      ok(`export ${format.ext}`, !!file && writer.bytes > 20000, `${writer.bytes} bytes in ${Math.round(performance.now() - started)}ms`);
    }
    ok('srt', toSRT(p.subtitles).includes('00:00:00,500 --> 00:00:02,900'));

    // The newer editing tools together: cut-out part, speed region, notes, redrawn cursor, crop, wallpaper.
    const total = p.durationMs / 1000;
    p.cuts = [{ id: 'c1', start: 1.0, end: 2.0 }];
    p.speeds = [{ id: 'v1', start: 2.5, end: Math.min(total, 4.5), speed: 2 }];
    p.annotations = [
      { id: 'n1', ...newNote('text', 0, total), y: 0.2 },
      { id: 'n2', ...newNote('arrow', 0, total), x: 0.3, y: 0.4 },
      { id: 'n3', ...newNote('box', 0, total), x: 0.7, y: 0.4 },
      { id: 'n4', ...newNote('blur', 0, total), x: 0.5, y: 0.7 },
    ];
    Object.assign(p.settings.cursor, { show: true, size: 2.5 });
    Object.assign(p.settings.frame, { background: 'wp-dawn', blur: 10, crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } });
    Object.assign(p.settings.keys, { theme: 'custom', anim: 'zoom', position: 'top-right', showMouse: true });
    ed.derived = derive(p);
    const segs = segments(p);
    const expected = outDuration(segs);
    ok('time map', Math.abs(expected - (total - 1 - (Math.min(total, 4.5) - 2.5) / 2)) < 0.01, `${expected.toFixed(2)}s from ${total.toFixed(2)}s`);
    ed.screen.currentTime = 0.9;
    await sleep(700);
    await api.selftestShot('editor2');
    {
      const format = formats[0];
      const writer = await platform.writerForPath(await api.selftestPath(`edited.${format.ext}`));
      const file = await exportVideo({
        project: p, derived: ed.derived, screenUrl: ed.screenUrl, webcamUrl: ed.webcamUrl, format, url: (n) => platform.mediaUrl(p.id, n),
        longSide: 1280, fps: 30, burnSubtitles: true, writer, signal: new AbortController().signal,
      });
      ok('export with cuts and speed', !!file && writer.bytes > 20000, `${writer.bytes} bytes, expected ${expected.toFixed(2)}s`);
    }

    // Files brought in from outside: a sound, a picture (as background and as a note) and a webcam video.
    {
      const sound = await platform.importAsset(p.id, 'audio', 'sound');
      const pic = await platform.importAsset(p.id, 'image', 'bg');
      const cam = await platform.importAsset(p.id, 'video', 'webcam');
      ok('files copied into the project', !!sound && !!pic && !!cam, [sound?.name, pic?.name, cam?.name].join(' '));
      if (sound && pic && cam) {
        p.cuts = [];
        p.speeds = [];
        p.audios = [{ id: 'a1', start: 0.5, end: 2.5, file: sound.name, name: sound.label, volume: 1, offset: 0 }];
        p.annotations = [{ id: 'n5', ...newNote('image', 0, total), file: pic.name, x: 0.2, y: 0.25, w: 0.2 }];
        Object.assign(p.settings.frame, { background: 'image', image: pic.name, blur: 6, crop: { x: 0, y: 0, w: 1, h: 1 } });
        p.files.webcam = cam.name;
        Object.assign(p.settings.webcam, { enabled: true, position: 'custom', x: 0.95, y: 0.1, roundness: 40, mirror: false });
        const format = formats[0];
        const writer = await platform.writerForPath(await api.selftestPath(`media.${format.ext}`));
        const file = await exportVideo({
          project: p, derived: ed.derived, screenUrl: ed.screenUrl, webcamUrl: platform.mediaUrl(p.id, cam.name), format, url: (n) => platform.mediaUrl(p.id, n),
          longSide: 1280, fps: 30, burnSubtitles: false, writer, signal: new AbortController().signal,
        });
        ok('export with added sound, picture and webcam', !!file && writer.bytes > 20000, `${writer.bytes} bytes`);
        p.files.webcam = null;
        p.audios = [];
      }
    }

    // Every settings tab must draw, with and without something selected.
    {
      const errors = [];
      const onErr = (e) => errors.push(e.message || String(e.reason));
      window.addEventListener('error', onErr);
      window.addEventListener('unhandledrejection', onErr);
      p.audios = [];
      const picks = { '자르기': [{ kind: 'cut', id: 'c1' }, { kind: 'speed', id: 'v1' }], '주석': ['n1', 'n2', 'n3', 'n4'].map((id) => ({ kind: 'note', id })), '줌': [{ kind: 'zoom', id: p.zooms[0]?.id }] };
      const drawn = [];
      for (const btn of [...document.querySelectorAll('.side-tabs button')]) {
        const name = btn.textContent.replace(/[^가-힣]/g, '');
        for (const sel of [null, ...(picks[name] || [])]) {
          ed.selected = sel;
          btn.click();
          await sleep(30);
          if (sel === (picks[name] || [null]).slice(-1)[0]) await api.selftestShot(`panel-${drawn.length}`);
          drawn.push(`${name}:${document.querySelector('.side-body').children.length}`);
        }
      }
      ed.selected = null;
      ok('all panels draw', !errors.length && drawn.every((d) => Number(d.split(':')[1]) > 1), errors.length ? errors.join(' | ') : drawn.join(' '));
      openKeyStyle();
      openShortcuts();
      await sleep(400);
      const modals = document.querySelectorAll('.modal-bg').length;
      await api.selftestShot('modals');
      document.querySelectorAll('.modal-bg .btn.primary').forEach((b) => b.click());
      ok('settings windows open', modals === 2 && !errors.length, errors.join(' | '));
      // the export window draws real controls for every file type
      [...document.querySelectorAll('.topbar button')].find((b) => b.textContent.includes('내보내기')).click();
      await sleep(300);
      const shown = [];
      for (const id of ['mp4', 'webm', 'gif']) {
        const s = document.querySelector('.modal select');
        s.value = id;
        s.dispatchEvent(new Event('change'));
        await sleep(100);
        const m = document.querySelector('.modal');
        shown.push(`${id}:${m.querySelectorAll('select, .seg, .switch').length}${m.innerText.includes('[object') ? '!' : ''}`);
      }
      document.querySelector('.modal-bg .actions .btn').click();
      ok('export window controls', shown.every((x) => !x.includes('!') && Number(x.split(':')[1]) >= 3), shown.join(' '));
      const on = await platform.toggleKeys({ overlay: liveOverlaySettings(), shortcut: shortcuts().keys });
      await sleep(800);
      const off = await platform.toggleKeys({});
      ok('keys-only overlay turns on and off', on === true && off === false && !errors.length, errors.join(' | '));
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onErr);
    }

    console.log(`webgpu available: ${!!navigator.gpu}`);
    const subs = await transcribe({
      url: silentToneWav(), model: 'onnx-community/whisper-tiny', language: 'english', preferGpu: false, duration: 2,
      onProgress: (s) => { if (s.stage !== 'downloading') console.log(`asr ${s.stage} ${s.device || ''} ${s.message || ''}`); },
    });
    ok('speech model runs', Array.isArray(subs), JSON.stringify(subs).slice(0, 200));
  } catch (err) {
    ok('no exceptions', false, err?.stack || String(err));
  }
  if (projectId) {
    stopEditor();
    await platform.deleteProject(projectId).catch(() => {});
  }
  // Opening a video made elsewhere as a new recording.
  try {
    await importVideo();
    await waitFor(() => state.editor?.project.source.kind === 'file', 15000);
    const ed2 = state.editor;
    await waitFor(() => ed2?.screen.readyState >= 2, 15000);
    ok('outside video opens in the editor', !!ed2 && ed2.project.source.kind === 'file' && ed2.screen.readyState >= 2 && ed2.project.durationMs > 1000,
      ed2 ? `${ed2.project.name} ${ed2.screen.videoWidth}x${ed2.screen.videoHeight} ${ed2.project.durationMs}ms` : 'no editor');
    await api.selftestShot('imported');
    const importedId = ed2?.project.id;
    stopEditor();
    if (importedId) await platform.deleteProject(importedId).catch(() => {});
  } catch (err) {
    ok('outside video opens in the editor', false, err?.stack || String(err));
  }
  console.log(`SELFTEST_DONE ${failed ? 'FAIL' : 'OK'}`);
}

if (location.hash === '#selftest') window.__keycastSelfTest = selfTest;

// Windows over the page behave like dialogs: focus moves in, Tab stays inside, Esc closes,
// and focus returns to the button that opened them.
const topModal = () => [...document.querySelectorAll('.modal-bg')].pop();
new MutationObserver((changes) => {
  for (const c of changes) {
    for (const n of c.addedNodes) {
      if (!n.classList?.contains('modal-bg')) continue;
      n.returnTo = document.activeElement;
      requestAnimationFrame(() => n.querySelector('.modal select, .modal input, .modal button')?.focus({ preventScroll: true }));
    }
    for (const n of c.removedNodes) if (n.classList?.contains('modal-bg') && n.returnTo?.isConnected) n.returnTo.focus({ preventScroll: true });
  }
}).observe(document.body, { childList: true });
window.addEventListener('keydown', (e) => {
  const bg = topModal();
  if (!bg) return;
  if (e.key === 'Escape') {
    const close = [...bg.querySelectorAll('.actions button')].find((b) => /닫기|취소|중지/.test(b.textContent));
    if (close) { e.preventDefault(); close.click(); }
  } else if (e.key === 'Tab') {
    const stops = [...bg.querySelectorAll('button, select, input, textarea, [tabindex="0"]')].filter((el) => !el.disabled && el.offsetParent !== null);
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!bg.contains(document.activeElement)) { e.preventDefault(); first.focus(); } else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// Closing the window right after an edit must not lose it.
window.addEventListener('beforeunload', () => {
  const ed = state.editor;
  if (ed?.dirty) { ed.dirty = false; platform.saveProject(ed.project).catch(() => {}); }
});

showHome();
