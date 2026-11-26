// The editor: preview, timeline, settings tabs and export.

import { platform, isDesktop } from '../lib/platform.js';
import { buildKeyGroups, KEY_DEFAULTS } from '../lib/keys.js';
import { clicksOf, CursorTrack, autoZoomRegions, newId } from '../lib/zoom.js';
import { renderFrame, projectOutputSize, BACKGROUNDS, WALLPAPERS, CURSOR_STYLES, CLICK_EFFECTS, MOTION_PRESETS, NOTE_TYPES, CUT_TRANSITIONS, defaultSettings, newNote, noteRect } from '../lib/compositor.js';
import { Timeline, fmt, listOfKind } from '../lib/timeline.js';
import { transcribe, decodeAudio, MODELS, LANGUAGES } from '../lib/transcribe.js';
import { findSilences, busyTimes } from '../lib/silence.js';
import { toSRT, SUBTITLE_STYLES } from '../lib/subtitles.js';
import { exportVideo, exportFormats } from '../lib/exporter.js';
import { setLabel } from '../lib/icons.js';
import { segments, outDuration, srcToOut, segIndexAt, mapCues, syncAudios } from '../lib/timemap.js';
import { h, toast, app, mount, topbar, inlineSwitch, rangeField, selectField, segField, colorField, positionField, formatBytes, safeFileName, more } from './dom.js';
import { store, state, loadExtensions, extensionItems } from './state.js';
import { applyBackground, readExtension } from '../lib/extensions.js';
import { keyPanel } from './key-panel.js';
import { showHome } from './home.js';
import { openShortcuts } from './dialogs.js';
import { OFFICIAL_EXTENSIONS } from '../lib/official-extensions.js';
import { T } from '../lib/i18n.js';
// ------------------------------------------------------------------ editor
export function derive(project) {
  return {
    groups: buildKeyGroups(project.events, project.settings.keys),
    clicks: clicksOf(project.events),
    cursor: new CursorTrack(project.events),
    scrolls: project.events.filter((e) => e.type === 'wh' && e.x !== null && e.x !== undefined),
  };
}

export function migrate(project) {
  const d = defaultSettings();
  // Projects from before v1.3 keep their averaging smoothing instead of the new spring.
  const oldCursor = project.settings?.cursor && !('motion' in project.settings.cursor);
  project.settings = project.settings || d;
  if (oldCursor) project.settings.cursor.motion = null;
  for (const k of Object.keys(d)) project.settings[k] = { ...d[k], ...(project.settings[k] || {}) };
  project.settings.keys.custom = { ...KEY_DEFAULTS.custom, ...(project.settings.keys.custom || {}) };
  project.settings.frame.crop = { x: 0, y: 0, w: 1, h: 1, ...(project.settings.frame.crop || {}) };
  for (const k of ['cuts', 'speeds', 'annotations', 'audios']) project[k] = project[k] || [];
  project.zooms = project.zooms || [];
  project.subtitles = project.subtitles || [];
  project.trim = project.trim || { start: 0, end: project.durationMs / 1000 };
  return project;
}

export function stopEditor() {
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

export async function openEditor(id, preloaded) {
  stopEditor();
  // The small start window is for the home screen only: editing always gets the full window.
  document.body.classList.remove('compact');
  platform.setCompact(false);
  let project;
  try {
    project = migrate(preloaded || await platform.loadProject(id));
  } catch (err) {
    toast(T('녹화를 열지 못했습니다: {0}', err.message), true);
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
    sizeLabel.textContent = `${screen.videoWidth || project.source.width}×${screen.videoHeight || project.source.height} · ${{ window: T('창'), file: T('불러온 영상') }[project.source.kind] || T('전체 화면')}`;
  };
  drawSizeLabel();
  screen.addEventListener('loadedmetadata', drawSizeLabel);

  const playBtn = h('button', { class: 'play', title: T('재생/정지 (Space)'), onclick: () => togglePlay() }, '▶');
  const timeLabel = h('span', { class: 'time' }, '0:00.0 / 0:00.0');
  const timelineCanvas = h('canvas');
  const nameInput = h('input', { type: 'text', value: project.name, style: { width: '260px' }, onchange: (e) => { project.name = e.target.value || project.name; markDirty(); } });
  const saveTag = h('span', { class: 'small muted' }, T('저장됨'));
  const sideBody = h('div', { class: 'side-body' });
  const sideTabs = h('div', { class: 'side-tabs' });
  const sideSub = h('div', { class: 'side-sub', role: 'tablist' });

  // Nine panels in three groups: how it looks, what is in it, what is heard and read.
  const tabs = [
    ['frame', '🖼', T('화면')], ['clip', '✂', T('자르기')], ['zoom', '🔍', T('줌')], ['notes', '✏', T('주석')], ['keys', '⌨', T('키')],
    ['cursor', '🖱', T('커서')], ['webcam', '🙂', T('웹캠')], ['audio', '🔊', T('소리')], ['subs', '💬', T('자막')],
  ];
  const groups = [
    ['look', '🎨', T('꾸미기'), ['frame', 'cursor', 'keys', 'webcam']],
    ['edit', '✂', T('편집'), ['clip', 'zoom', 'notes']],
    ['sound', '💬', T('소리·자막'), ['subs', 'audio']],
  ];
  const groupOf = (tab) => groups.find((g) => g[3].includes(tab)) || groups[0];
  ed.lastTab = ed.lastTab || {};
  const openTab = (k) => { ed.tab = k; ed.lastTab[groupOf(k)[0]] = k; drawTabs(); drawPanel(); };
  const drawTabs = () => {
    const cur = groupOf(ed.tab);
    ed.lastTab[cur[0]] = ed.tab;
    sideTabs.replaceChildren(...groups.map(([id, ic, n, list]) =>
      h('button', { class: cur[0] === id ? 'on' : '', title: n, onclick: () => openTab(ed.lastTab[id] || list[0]) }, h('span', { class: 'ic' }, ic), h('span', {}, n))));
    sideSub.replaceChildren(...cur[3].map((k) => {
      const [, ic, n] = tabs.find((x) => x[0] === k);
      return h('button', { class: ed.tab === k ? 'on' : '', role: 'tab', 'aria-selected': String(ed.tab === k), onclick: () => openTab(k) }, `${ic} ${n}`);
    }));
    // The timeline shows the rows in use, and the one this panel works on.
    // (the timeline exists once the editor is built)
    try { timeline.setFocus({ clip: 'speed', zoom: 'zoom', notes: 'notes', audio: 'audio', keys: 'keys', subs: 'subs' }[ed.tab] || null); } catch { /* not built yet */ }
  };

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
    if (!from.length) { toast(from === ed.history ? T('더 되돌릴 것이 없습니다.') : T('다시 할 것이 없습니다.')); return; }
    to.push(ed.last);
    ed.last = from.pop();
    Object.assign(project, JSON.parse(ed.last));
    nameInput.value = project.name;
    ed.selected = null;
    timeline.select(null);
    markDirty({ rederive: true, history: false });
    sizePreview();
    drawPanel();
    drawKeysToggle();
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
    saveTag.textContent = T('저장 중…');
    clearTimeout(ed.saveTimer);
    ed.saveTimer = setTimeout(async () => {
      try {
        await platform.saveProject(project);
        ed.dirty = false;
        saveTag.textContent = T('저장됨');
      } catch (err) {
        saveTag.textContent = T('저장 실패');
        toast(T('저장하지 못했습니다: {0}', err.message), true);
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
      if (!ed.segs.length) { toast(T('재생할 구간이 없습니다. 잘라낸 부분을 확인하세요.'), true); return; }
      if (segIndexAt(ed.segs, screen.currentTime + 0.05) < 0 || screen.currentTime < ed.segs[0].s0) seek(ed.segs[0].s0);
      screen.play().catch(() => {});
      webcam?.play().catch(() => {});
    } else {
      screen.pause();
      webcam?.pause();
    }
  }
  // One switch for the key bubbles in the video, always in reach next to the time.
  const keysToggle = h('button', { class: 'btn small toggle', title: T('영상에 키 표시 켜기 / 끄기 (K)'), onclick: () => setKeysShown(!project.settings.keys.enabled) });
  function drawKeysToggle() {
    const on = !!project.settings.keys.enabled;
    setLabel(keysToggle, on ? T('⌨ 키 표시 켬') : T('⌨ 키 표시 끔'));
    keysToggle.setAttribute('aria-pressed', String(on));
    keysToggle.classList.toggle('on', on);
  }
  function setKeysShown(on) {
    project.settings.keys.enabled = on;
    drawKeysToggle();
    if (state.editor === ed) { markDirty(); if (ed.tab === 'keys') drawPanel(); }
  }
  drawKeysToggle();
  screen.addEventListener('play', () => { setLabel(playBtn, '❚❚'); });
  screen.addEventListener('pause', () => { setLabel(playBtn, '▶'); });
  screen.addEventListener('error', () => toast(T('영상 파일을 열지 못했습니다. 녹화가 비어 있을 수 있습니다.'), true));

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
      if (!(len > 0) || !Number.isFinite(len)) { toast(T('이 소리 파일은 열 수 없습니다.'), true); return; }
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
    renderFrame(pctx, { W: preview.width, H: preview.height, t, screen, webcam, project, derived: ed.derived, url, segs: ed.segs, selectedNote: ed.selected?.kind === 'note' ? ed.selected.id : null });
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
    if (e.code === 'KeyK' && !e.ctrlKey && !e.altKey) setKeysShown(!project.settings.keys.enabled);
  };
  window.addEventListener('keydown', ed.onKey);

  function loadWallpapers() {
    platform.listWallpapers().then((list) => { ed.wallpapers = list; if (state.editor === ed && ed.tab === 'frame') drawPanel(); }).catch(() => {});
    loadExtensions().then(() => { if (state.editor === ed) drawPanel(); }).catch(() => {});
    ed.redrawPanel = () => drawPanel();
  }
  loadWallpapers();

  // ---------------- panels
  /** Buttons for items from extensions; picking one copies its values into the project. */
  function extRow(title, items, apply) {
    if (!items.length) return null;
    return h('div', { class: 'section' }, h('h3', {}, title),
      h('div', { class: 'ext-row' }, items.map((it) => h('button', { class: 'btn small', title: T('{0}에서', it.from), onclick: () => { apply(it); markDirty(); drawPanel(); } }, it.name))));
  }

  /** A whole look in one click: background, key theme, pointer, click effect and subtitle style. */
  function styleStrip() {
    const s = project.settings;
    const packs = OFFICIAL_EXTENSIONS.map((o) => readExtension(o.folder, o.json)).filter((e) => e.count);
    const d = defaultSettings();
    const apply = (e) => {
      const f = s.frame;
      if (!e) {
        Object.assign(f, { background: d.frame.background, image: null, custom: null });
        s.keys.theme = d.keys.theme;
        Object.assign(s.cursor, { style: d.cursor.style, look: null, lookName: null, effect: d.cursor.effect, color: d.cursor.color, clickSize: d.cursor.clickSize, clickDur: d.cursor.clickDur, clickOpacity: d.cursor.clickOpacity });
        Object.assign(s.subtitles, { style: d.subtitles.style, textColor: d.subtitles.textColor, highlight: d.subtitles.highlight, bgOpacity: d.subtitles.bgOpacity, anim: d.subtitles.anim });
        project.styleName = null;
      } else {
        if (e.backgrounds[0]) applyBackground(f, e.backgrounds[0]);
        if (e.keyThemes[0]) { s.keys.theme = 'custom'; s.keys.custom = { ...s.keys.custom, ...e.keyThemes[0].custom }; }
        if (e.cursorPacks[0]) { s.cursor.style = 'custom'; s.cursor.look = { ...e.cursorPacks[0].look }; s.cursor.lookName = e.cursorPacks[0].name; }
        if (e.clickEffects[0]) Object.assign(s.cursor, e.clickEffects[0].values);
        if (e.subtitleStyles[0]) Object.assign(s.subtitles, e.subtitleStyles[0].values);
        project.styleName = e.id;
      }
      markDirty();
      drawPanel();
    };
    const swatch = (e) => {
      const b = e?.backgrounds[0];
      const bg = !b ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : b.kind === 'gradient' ? `linear-gradient(${b.angle}deg, ${b.stops.join(', ')})`
        : b.kind === 'blobs' ? `${b.blobs.map(([x, y, r, c]) => `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${c}, transparent ${r * 100}%)`).join(', ')}, ${b.base}` : '#333';
      const key = e?.keyThemes[0]?.custom;
      return h('span', { class: 'style-swatch', style: { background: bg } },
        h('span', { class: 'style-key', style: key ? { background: key.face, color: key.text, borderColor: key.borderColor } : {} }, 'Ctrl'));
    };
    return h('div', { class: 'styles' },
      h('div', { class: 'field-label' }, T('추천 스타일')),
      h('div', { class: 'style-row' },
        h('button', { class: `style-card${!project.styleName ? ' on' : ''}`, title: T('처음 모양으로'), onclick: () => apply(null) }, swatch(null), h('span', {}, T('기본'))),
        packs.map((e) => h('button', { class: `style-card${project.styleName === e.id ? ' on' : ''}`, title: e.description || e.name, onclick: () => apply(e) }, swatch(e), h('span', {}, e.name)))),
      h('div', { class: 'small muted' }, T('배경·키·커서·클릭 효과·자막 모양을 한 번에 바꿉니다. 하나씩은 아래와 다른 탭에서 고칠 수 있습니다.')));
  }

  function drawPanel() {
    const s = project.settings;
    const panels = {
      frame: () => {
        const f = s.frame;
        const setBg = (id, image) => { f.background = id; if (image !== undefined) f.image = image; markDirty(); drawPanel(); };
        const wpCss = (w) => `${w.blobs.map(([x, y, r, c]) => `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${c}, transparent ${r * 100}%)`).join(', ')}, ${w.base}`;
        const isPicture = f.background === 'image' || f.background === 'custom' || WALLPAPERS.some((w) => w.id === f.background);
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
          h('h3', {}, T('화면 꾸미기')),
          styleStrip(),
          segField(T('영상 비율'), f.aspect, [{ id: '16:9', name: '16:9' }, { id: '9:16', name: '9:16' }, { id: '1:1', name: '1:1' }, { id: '4:3', name: '4:3' }, { id: 'source', name: T('원본') }],
            (v) => { f.aspect = v; sizePreview(); markDirty(); }),
          h('div', { class: 'field' }, h('label', {}, T('배경 색')),
            h('div', { class: 'swatches' },
              BACKGROUNDS.map((b) => h('div', { class: `swatch${f.background === b.id ? ' on' : ''}`, title: b.name, style: { background: `linear-gradient(135deg, ${b.stops.join(', ')})` }, onclick: () => setBg(b.id) }, h('small', {}, b.name))),
              h('div', { class: `swatch${f.background === 'none' ? ' on' : ''}`, style: { background: '#000', border: '1px dashed #484f58' }, onclick: () => setBg('none') }, h('small', {}, T('없음'))),
              h('label', { class: `swatch${f.background?.startsWith('#') ? ' on' : ''}`, style: { background: f.background?.startsWith('#') ? f.background : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' } },
                h('input', { type: 'color', style: { opacity: 0, width: '100%', height: '100%' }, value: f.background?.startsWith('#') ? f.background : '#334155', oninput: (e) => { f.background = e.target.value; markDirty(); }, onchange: () => drawPanel() }),
                h('small', {}, T('단색'))))),
          h('div', { class: 'field' }, h('label', {}, T('배경 그림')),
            h('div', { class: 'swatches' },
              WALLPAPERS.map((w) => h('div', { class: `swatch${f.background === w.id ? ' on' : ''}`, title: w.name, style: { background: wpCss(w) }, onclick: () => setBg(w.id) }, h('small', {}, w.name))),
              extensionItems('backgrounds').map((b) => {
                const on = b.kind === 'image' ? f.background === 'image' && f.image === b.image
                  : f.background === 'custom' && JSON.stringify(f.custom) === JSON.stringify(b.kind === 'gradient' ? { kind: 'gradient', stops: b.stops, angle: b.angle } : { kind: 'blobs', base: b.base, blobs: b.blobs });
                const css = b.kind === 'image' ? `center / cover url("${platform.mediaUrl(null, b.image)}")`
                  : b.kind === 'gradient' ? `linear-gradient(${b.angle}deg, ${b.stops.join(', ')})` : wpCss(b);
                return h('div', { class: `swatch${on ? ' on' : ''}`, title: T('{0} ({1}에서)', b.name, b.from), style: { background: css }, onclick: () => { applyBackground(f, b); markDirty(); drawPanel(); } }, h('small', {}, b.name));
              }),
              (ed.wallpapers || []).map((p) => h('div', { class: `swatch${f.background === 'image' && f.image === p ? ' on' : ''}`, title: p.split('/').pop(), style: { background: `center / cover url("${platform.mediaUrl(null, p)}")` }, onclick: () => setBg('image', p) })),
              h('div', { class: `swatch${ownImage ? ' on' : ''}`, title: T('내 컴퓨터의 그림을 배경으로'), style: { background: ownImage ? `center / cover url("${url(f.image)}")` : '#21262d', border: '1px dashed rgba(255,255,255,0.28)', display: 'grid', placeItems: 'center', fontSize: '16px', paddingBottom: '14px', color: 'rgba(244,244,245,0.7)' }, onclick: async () => {
                const picked = await platform.importAsset(project.id, 'image', 'bg');
                if (picked) setBg('image', picked.name);
              } }, ownImage ? null : '＋', h('small', {}, T('내 그림')))),
          ),
          more('frame', [
            isDesktop ? h('div', { class: 'row', style: { marginBottom: '4px' } },
              h('button', { class: 'btn small', onclick: () => platform.openWallpapers() }, T('📁 배경 그림 폴더')),
              h('button', { class: 'btn small ghost', title: T('폴더에 넣은 그림 다시 읽기'), onclick: loadWallpapers }, '↻')) : null,
            isDesktop ? h('div', { class: 'small muted', style: { marginBottom: '12px' } }, T('이 폴더에 그림을 넣으면 여기에 나타납니다.')) : null,
          isPicture ? rangeField(T('배경 흐림'), f.blur || 0, 0, 40, 1, (v) => { f.blur = v; markDirty(); }, (v) => (v ? `${v}px` : T('없음'))) : null,
          f.background === 'none' ? h('div', { class: 'hint' }, T('배경 없음: 녹화 화면을 꽉 채웁니다.')) : [
            rangeField(T('여백'), f.padding, 0, 20, 0.5, (v) => { f.padding = v; markDirty(); }, (v) => `${v}%`),
            rangeField(T('모서리 둥글기'), f.radius, 0, 40, 1, (v) => { f.radius = v; markDirty(); }, (v) => `${v}px`),
            inlineSwitch(T('그림자'), f.shadow, (v) => { f.shadow = v; markDirty(); drawPanel(); }),
            f.shadow ? rangeField(T('그림자 세기'), f.shadowSize ?? 1, 0.2, 2, 0.1, (v) => { f.shadowSize = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`) : null,
          ],
          h('div', { class: 'section' },
            h('h3', {}, T('화면 잘라내기 (크롭)')),
            h('div', { class: 'small muted', style: { marginBottom: '10px' } }, T('녹화된 화면의 가장자리를 잘라 필요한 부분만 남깁니다.')),
            cropField(T('왼쪽'), 'l'), cropField(T('오른쪽'), 'r'), cropField(T('위'), 't'), cropField(T('아래'), 'b'),
            h('button', { class: 'btn small', onclick: () => { f.crop = { x: 0, y: 0, w: 1, h: 1 }; sizePreview(); markDirty(); drawPanel(); } }, T('잘라내기 취소'))),
          ]),
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
        } }, key === 'start' ? T('시작을 여기로') : T('끝을 여기로'));
        return [
          h('h3', {}, T('앞뒤 자르기')),
          h('div', { class: 'small muted', style: { marginBottom: '10px' } }, T('{0} ~ {1} · 타임라인 파란 막대의 양 끝을 끌어도 됩니다.', fmt(project.trim.start, true), fmt(project.trim.end, true))),
          h('div', { class: 'row' },
            h('button', { class: 'btn small grow', onclick: () => { project.trim.start = Math.min(now(), project.trim.end - 0.5); markDirty(); drawPanel(); } }, T('여기서 시작')),
            h('button', { class: 'btn small grow', onclick: () => { project.trim.end = Math.max(now(), project.trim.start + 0.5); markDirty(); drawPanel(); } }, T('여기서 끝')),
            h('button', { class: 'btn small', onclick: () => { project.trim = { start: 0, end: duration() }; markDirty(); drawPanel(); } }, T('초기화'))),
          h('div', { class: 'section' },
            h('h3', {}, T('중간 잘라내기')),
            h('div', { class: 'small muted', style: { marginBottom: '10px' } }, T('잘라낸 구간 {0}개 · 완성 영상 길이 {1}', project.cuts.length, fmt(outDuration(ed.segs), true))),
            h('button', { class: 'btn wide', onclick: () => addItem('cut', now()) }, T('✂ 여기서부터 잘라내기 (S)')),
            h('div', { class: 'small muted', style: { marginTop: '8px' } }, T('영상 줄에 생긴 빨간 구간의 양 끝을 끌어 범위를 맞추세요. 빨간 구간은 재생과 내보내기에서 건너뜁니다.')),
            cut ? h('div', { style: { marginTop: '12px' } },
              h('div', { class: 'field-label', style: { marginBottom: '6px' } }, T('선택한 구간 {0} ~ {1}', fmt(cut.start, true), fmt(cut.end, true))),
              h('div', { class: 'row' }, edge(cut, 'start'), edge(cut, 'end'), h('button', { class: 'btn small danger', onclick: removeSelected }, T('되살리기')))) : null),
          h('div', { class: 'section' },
            h('h3', {}, T('자른 곳 전환')),
            h('div', { class: 'small muted', style: { marginBottom: '10px' } }, T('잘라낸 곳에서 화면이 툭 끊기지 않게 넘깁니다. 소리도 이음새에서 부드럽게 줄였다 키웁니다.')),
            segField('', s.cut.transition, CUT_TRANSITIONS, (v) => { s.cut.transition = v; markDirty(); drawPanel(); }, 2),
            s.cut.transition !== 'none' ? rangeField(T('전환 길이'), s.cut.duration, 0.15, 0.8, 0.05, (v) => { s.cut.duration = v; markDirty(); }, (v) => T('{0}초', v.toFixed(2))) : null),
          silenceSection(),
          h('div', { class: 'section' },
            h('h3', {}, T('속도 바꾸기')),
            h('button', { class: 'btn wide', onclick: () => addItem('speed', now()) }, T('⏩ 여기에 속도 구간 넣기')),
            h('div', { class: 'small muted', style: { marginTop: '8px' } }, T('속도 구간 {0}개 · 속도 줄을 더블클릭해도 됩니다. 소리도 같은 속도로 재생됩니다.', project.speeds.length)),
            sp ? h('div', { style: { marginTop: '12px' } },
              segField(T('선택한 구간 {0} ~ {1}', fmt(sp.start, true), fmt(sp.end, true)), String(sp.speed),
                [0.25, 0.5, 0.75, 1.25, 1.5, 2, 3, 4].map((v) => ({ id: String(v), name: `${v}×` })), (v) => { sp.speed = Number(v); markDirty(); }),
              h('div', { class: 'row' }, edge(sp, 'start'), edge(sp, 'end'), h('button', { class: 'btn small danger', onclick: removeSelected }, T('삭제')))) : null),
        ];
      },
      zoom: () => {
        const sel = ed.selected?.kind === 'zoom' ? project.zooms.find((z) => z.id === ed.selected.id) : null;
        const noCursor = !ed.derived.cursor.available;
        return [
          h('h3', {}, T('클릭 자동 확대')),
          noCursor ? h('div', { class: 'hint warn' }, project.source.kind === 'window'
            ? T('창을 녹화하면 클릭 위치를 알 수 없어 자동 확대가 만들어지지 않습니다. 타임라인 줌 줄을 더블클릭해 직접 넣을 수 있어요.')
            : T('이 녹화에는 마우스 위치 기록이 없습니다. 줌 줄을 더블클릭해 직접 넣을 수 있어요.')) : null,
          inlineSwitch(T('줌 효과 사용'), s.zoom.enabled, (v) => { s.zoom.enabled = v; markDirty(); }),
          segField(T('움직임 느낌'), s.zoom.feel || 'smooth', [{ id: 'smooth', name: T('부드럽게') }, { id: 'quick', name: T('빠르게') }, { id: 'spring', name: T('탄력 있게') }, { id: 'classic', name: T('예전 방식') }], (v) => { s.zoom.feel = v; markDirty(); }),
          rangeField(T('움직임 잔상'), s.zoom.motionBlur ?? 0.5, 0, 1, 0.05, (v) => { s.zoom.motionBlur = v; markDirty(); }, (v) => (v ? `${Math.round(v * 100)}%` : T('끔'))),
          h('button', { class: 'btn wide', disabled: noCursor, onclick: () => {
            project.zooms = [...project.zooms.filter((z) => !z.auto), ...autoZoomRegions(project.events, project.durationMs / 1000, s.zoom.scale)].sort((a, b) => a.start - b.start);
            ed.selected = null;
            markDirty();
            drawPanel();
            toast(T('클릭 기준 줌 {0}개', project.zooms.length));
          } }, T('↻ 클릭 기준으로 다시 만들기')),
          h('div', { class: 'small muted', style: { marginTop: '8px' } }, T('줌 구간 {0}개 · 줌 줄을 더블클릭하면 추가, 끌어서 옮기기·늘리기, 선택 후 Delete로 삭제', project.zooms.length)),
          more('zoom', [
            inlineSwitch(T('확대 중 커서 따라가기'), s.zoom.follow, (v) => { s.zoom.follow = v; markDirty(); }),
            rangeField(T('확대 배율 (새로 만들 때)'), s.zoom.scale, 1.2, 3, 0.1, (v) => { s.zoom.scale = v; markDirty(); }, (v) => `${v.toFixed(1)}×`),
            rangeField(T('확대 속도'), s.zoom.ramp, 0.2, 1.2, 0.05, (v) => { s.zoom.ramp = v; markDirty(); }, (v) => T('{0}초', v.toFixed(2))),
          ]),
          sel ? h('div', { class: 'section' },
            h('h3', {}, T('선택한 줌 ({0} ~ {1})', fmt(sel.start, true), fmt(sel.end, true))),
            rangeField(T('배율'), sel.scale, 1.1, 4, 0.1, (v) => { sel.scale = v; sel.auto = false; markDirty(); }, (v) => `${v.toFixed(1)}×`),
            rangeField(T('가로 위치'), sel.x, 0, 1, 0.01, (v) => { sel.x = v; sel.auto = false; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
            rangeField(T('세로 위치'), sel.y, 0, 1, 0.01, (v) => { sel.y = v; sel.auto = false; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
            h('button', { class: 'btn wide danger', onclick: () => {
              project.zooms = project.zooms.filter((z) => z.id !== sel.id);
              ed.selected = null;
              timeline.select(null);
              markDirty();
              drawPanel();
            } }, T('이 줌 삭제'))) : null,
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
            h('div', { class: 'field' }, h('label', {}, T('내용')), h('textarea', { value: a.text, rows: 2, oninput: (e) => { a.text = e.target.value; markDirty(); } })),
            rangeField(T('글자 크기'), a.size, 20, 200, 2, set('size'), (v) => `${v}px`),
            colorField(T('글자 색'), a.color, set('color')),
            inlineSwitch(T('굵게'), a.bold !== false, set('bold')),
            inlineSwitch(T('뒤에 바탕'), a.bgOn !== false, set('bgOn', true)),
            a.bgOn !== false ? colorField(T('바탕 색'), a.bg, set('bg')) : null,
          ],
          arrow: () => [
            rangeField(T('길이'), a.w, 0.04, 0.7, 0.01, set('w'), pct),
            rangeField(T('방향'), a.angle, 0, 345, 15, set('angle'), (v) => `${v}°`),
            rangeField(T('두께'), a.stroke, 3, 40, 1, set('stroke'), (v) => `${v}px`),
            colorField(T('색'), a.color, set('color')),
          ],
          box: () => [
            rangeField(T('가로 크기'), a.w, 0.03, 1, 0.01, set('w'), pct),
            rangeField(T('세로 크기'), a.h, 0.03, 1, 0.01, set('h'), pct),
            rangeField(T('선 두께'), a.stroke, 2, 30, 1, set('stroke'), (v) => `${v}px`),
            colorField(T('색'), a.color, set('color')),
          ],
          image: () => [
            rangeField(T('크기'), a.w, 0.03, 1, 0.01, set('w'), pct),
            h('button', { class: 'btn small', onclick: async () => {
              const picked = await platform.importAsset(project.id, 'image', 'note');
              if (picked) { a.file = picked.name; markDirty(); }
            } }, T('그림 바꾸기')),
          ],
          blur: () => [
            h('div', { class: 'hint' }, T('비밀번호나 개인 정보처럼 보이면 안 되는 곳을 흐리게 가립니다. 화면이 확대되거나 움직이면 가린 위치는 따라가지 않습니다.')),
            rangeField(T('가로 크기'), a.w, 0.03, 1, 0.01, set('w'), pct),
            rangeField(T('세로 크기'), a.h, 0.03, 1, 0.01, set('h'), pct),
            rangeField(T('흐림 세기'), a.strength, 4, 50, 1, set('strength'), (v) => `${v}px`),
          ],
        }[a.type]() : null;
        return [
          h('h3', {}, T('주석')),
          h('div', { class: 'small muted', style: { marginBottom: '10px' } }, T('지금 보고 있는 시각에 넣습니다. 미리보기에서 끌어 옮기고, 타임라인 주석 줄에서 나오는 시간을 맞추세요.')),
          h('div', { class: 'row', style: { flexWrap: 'wrap' } }, NOTE_TYPES.map((n) => h('button', { class: 'btn small', onclick: () => addItem('note', now(), { type: n.id }) }, `+ ${n.name}`))),
          a ? h('div', { class: 'section' },
            h('h3', {}, T('선택한 주석 · {0} ({1} ~ {2})', typeName(a.type), fmt(a.start, true), fmt(a.end, true))),
            byType,
            rangeField(T('가로 위치'), a.x, 0, 1, 0.005, set('x'), pct),
            rangeField(T('세로 위치'), a.y, 0, 1, 0.005, set('y'), pct),
            h('button', { class: 'btn wide danger', onclick: removeSelected }, T('이 주석 삭제')))
            : h('div', { class: 'small muted', style: { marginTop: '12px' } }, T('주석 {0}개 · 타임라인이나 미리보기에서 누르면 여기서 고칠 수 있습니다.', project.annotations.length)),
        ];
      },
      keys: () => {
        const keyCount = project.events.filter((e) => e.type === 'kd' && !e.repeat).length;
        return [
          h('h3', {}, T('키 표시')),
          !project.inputHooked && !keyCount ? h('div', { class: 'hint warn' }, T('이 녹화에는 키 기록이 없습니다.')) : h('div', { class: 'hint' }, T('기록된 키 {0}개 · 말풍선 {1}개', keyCount, ed.derived.groups.length)),
          project.typingRecorded === false && s.keys.mode !== 'shortcuts' ? h('div', { class: 'hint' }, T('이 녹화는 타이핑한 글자를 기록하지 않아 단축키만 보입니다. 처음 화면의 녹화 옵션에서 바꿀 수 있습니다.')) : null,
          inlineSwitch(T('영상에 키 보여주기'), s.keys.enabled, (v) => setKeysShown(v)),
          keyPanel(s.keys, (rebuild) => markDirty({ rederive: !!rebuild }), drawPanel),
        ];
      },
      cursor: () => {
        const c = s.cursor;
        const kindNote = () => {
          const kinds = new Set((ed.derived.cursor.kinds || []).map((k) => k.kind));
          return kinds.size ? T('이 녹화에 기록된 커서 종류 {0}개', kinds.size) : T('이 녹화에는 커서 종류 기록이 없어 화살표로 그립니다');
        };
        return [
          h('h3', {}, T('커서와 클릭')),
          !ed.derived.cursor.available ? h('div', { class: 'hint warn' }, T('이 녹화에는 마우스 위치 기록이 없어 커서와 클릭 효과를 그릴 수 없습니다 (전체 화면 녹화에서 사용 가능).')) : null,
          inlineSwitch(T('클릭할 때 효과'), c.clicks, (v) => { c.clicks = v; markDirty(); drawPanel(); }),
          c.clicks ? [
            segField(T('효과 모양'), c.effect || 'ripple', CLICK_EFFECTS.filter((x) => x.id !== 'none'), (v) => { c.effect = v; markDirty(); }, 4),
            colorField(T('효과 색'), c.color, (v) => { c.color = v; markDirty(); }),
          ] : null,
          more('clicks', [
            c.clicks ? [rangeField(T('효과 크기'), c.clickSize ?? 1, 0.5, 2.5, 0.05, (v) => { c.clickSize = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
            rangeField(T('효과 길이'), c.clickDur ?? 0.65, 0.3, 1.5, 0.05, (v) => { c.clickDur = v; markDirty(); }, (v) => T('{0}초', v.toFixed(2))),
            rangeField(T('효과 진하기'), c.clickOpacity ?? 1, 0.1, 1, 0.05, (v) => { c.clickOpacity = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`)] : null,
            extRow(T('확장 클릭 효과'), extensionItems('clickEffects'), (it) => { Object.assign(c, it.values); c.clicks = true; }),
            inlineSwitch(T('커서 주변 강조'), c.highlight, (v) => { c.highlight = v; markDirty(); }),
            inlineSwitch(T('휠을 굴릴 때 표시'), c.scrolls !== false, (v) => { c.scrolls = v; markDirty(); }),
          ]),
          h('div', { class: 'section' },
            h('h3', {}, T('커서 다시 그리기')),
            project.cursorHidden ? h('div', { class: 'hint' }, T('이 녹화는 실제 커서 없이 찍었습니다. 여기서 끄면 영상에 커서가 보이지 않습니다.')) : null,
            inlineSwitch(project.cursorHidden ? T('커서 그리기') : T('커서를 크게 다시 그리기'), c.show, (v) => { c.show = v; markDirty(); drawPanel(); }),
            c.show ? [
              project.cursorHidden ? null : h('div', { class: 'hint' }, T('녹화된 실제 커서 위에 겹쳐 그립니다. 실제 커서는 지워지지 않아서 "부드럽게"를 높이면 두 커서가 잠깐 떨어져 보일 수 있습니다.')),
              segField(T('모양'), c.style || 'arrow', CURSOR_STYLES, (v) => { c.style = v; markDirty(); drawPanel(); }, 3),
              c.style === 'custom' ? h('div', { class: 'hint' }, T('확장 커서 묶음 "{0}"을 쓰는 중입니다. 위에서 다른 모양을 고르면 바뀝니다.', c.lookName || '')) : null,
              extRow(T('확장 커서 묶음'), extensionItems('cursorPacks'), (it) => { c.style = 'custom'; c.look = { ...it.look }; c.lookName = it.name; }),
              c.style === 'custom' || CURSOR_STYLES.find((x) => x.id === (c.style || 'arrow'))?.pack ? inlineSwitch(T('녹화된 커서 종류 따라가기'), c.followKind !== false, (v) => { c.followKind = v; markDirty(); }, kindNote()) : null,
              rangeField(T('크기'), c.size, 0.8, 4, 0.1, (v) => { c.size = v; markDirty(); }, (v) => `${v.toFixed(1)}×`),
              segField(T('움직임'), c.motion || 'legacy', [...(c.motion ? [] : [{ id: 'legacy', name: T('예전 방식') }]), ...MOTION_PRESETS], (v) => { c.motion = v === 'legacy' ? null : v; markDirty(); drawPanel(); }, 3),
              more('pointer', [
              !c.motion ? rangeField(T('부드럽게'), c.smoothing, 0, 1, 0.05, (v) => { c.smoothing = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`) : null,
              c.motion === 'custom' ? [
                rangeField(T('스프링 세기'), c.springStiffness ?? 1, 0.2, 4, 0.05, (v) => { c.springStiffness = v; markDirty(); }, (v) => `${v.toFixed(2)}×`),
                rangeField(T('스프링 감쇠'), c.springDamping ?? 1, 0.2, 3, 0.05, (v) => { c.springDamping = v; markDirty(); }, (v) => `${v.toFixed(2)}×`),
                rangeField(T('스프링 무게'), c.springMass ?? 1, 0.3, 4, 0.05, (v) => { c.springMass = v; markDirty(); }, (v) => `${v.toFixed(2)}×`),
              ] : null,
              rangeField(T('빠르게 움직일 때 잔상'), c.motionBlur, 0, 1, 0.05, (v) => { c.motionBlur = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
              rangeField(T('클릭할 때 눌리는 정도'), c.bounce, 0, 1, 0.05, (v) => { c.bounce = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
              c.bounce > 0 ? rangeField(T('눌림 속도'), c.bounceDur ?? 0.28, 0.12, 0.8, 0.02, (v) => { c.bounceDur = v; markDirty(); }, (v) => T('{0}초', v.toFixed(2))) : null,
              rangeField(T('움직이는 쪽으로 기울기'), c.sway, 0, 1, 0.05, (v) => { c.sway = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
              rangeField(T('멈춰 있으면 숨기기'), c.idleHide || 0, 0, 5, 0.5, (v) => { c.idleHide = v; markDirty(); }, (v) => (v ? T('{0}초 뒤', v) : T('안 숨김'))),
              inlineSwitch(T('실제 커서가 숨으면 같이 숨기기'), c.hideWhenHidden !== false, (v) => { c.hideWhenHidden = v; markDirty(); }, T('글자를 칠 때나 동영상을 볼 때처럼 Windows가 커서를 감출 때')),
              inlineSwitch(T('끝날 때 처음 위치로 돌아가기'), c.loop, (v) => { c.loop = v; markDirty(); }, T('반복 재생하는 영상·GIF가 매끄럽게 이어집니다')),
              ]),
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
          h('h3', {}, T('웹캠 말풍선')),
          !webcam ? h('div', { class: 'hint' }, T('이 녹화에는 웹캠 영상이 없습니다. 녹화 옵션에서 웹캠을 고르거나, 따로 찍은 영상을 넣을 수 있습니다.')) : null,
          h('div', { class: 'row', style: { marginBottom: '14px' } },
            h('button', { class: 'btn small grow', onclick: async () => {
              const picked = await platform.importAsset(project.id, 'video', 'webcam');
              if (picked) swap(picked.name);
            } }, webcam ? T('📂 다른 영상으로 바꾸기') : T('📂 웹캠 영상 넣기')),
            webcam ? h('button', { class: 'btn small danger', onclick: () => { if (confirm(T('웹캠 영상을 이 녹화에서 뺄까요?'))) swap(null); } }, T('빼기')) : null),
          webcam ? [
            inlineSwitch(T('웹캠 보이기'), w.enabled, (v) => { w.enabled = v; markDirty(); }),
            positionField(T('위치'), w.position, ['top-left', 'top-right', 'bottom-left', 'bottom-right'], (v) => { w.position = v; markDirty(); drawPanel(); }),
            inlineSwitch(T('위치 직접 정하기'), w.position === 'custom', (v) => { w.position = v ? 'custom' : 'bottom-left'; markDirty(); drawPanel(); }),
            w.position === 'custom' ? [
              rangeField(T('가로 위치'), w.x ?? 0.9, 0, 1, 0.01, (v) => { w.x = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
              rangeField(T('세로 위치'), w.y ?? 0.9, 0, 1, 0.01, (v) => { w.y = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
            ] : null,
            rangeField(T('크기'), w.size, 8, 50, 1, (v) => { w.size = v; markDirty(); }, (v) => `${v}%`),
            more('webcam', [
            inlineSwitch(T('좌우 뒤집기 (거울처럼)'), w.mirror !== false, (v) => { w.mirror = v; markDirty(); }),
            rangeField(T('가장자리 여백'), w.margin ?? 28, 0, 140, 2, (v) => { w.margin = v; markDirty(); }, (v) => `${v}px`),
            rangeField(T('둥글기'), w.roundness ?? 100, 0, 100, 5, (v) => { w.roundness = v; markDirty(); }, (v) => (v === 100 ? T('원') : `${v}%`)),
            rangeField(T('그림자'), w.shadow ?? 0.45, 0, 1, 0.05, (v) => { w.shadow = v; markDirty(); }, (v) => (v ? `${Math.round(v * 100)}%` : T('없음'))),
            inlineSwitch(T('화면이 확대되면 작아지기'), !!w.reactToZoom, (v) => { w.reactToZoom = v; markDirty(); }),
            ]),
          ] : null,
        ];
      },
      audio: () => {
        const a = selectedOf('audio');
        const au = s.audio;
        return [
          h('h3', {}, T('소리')),
          rangeField(T('녹화된 소리 크기'), Math.round((au.volume ?? 1) * 100), 0, 100, 5, (v) => { au.volume = v / 100; markDirty(); }, (v) => (v ? `${v}%` : T('끔'))),
          h('div', { class: 'section' },
            h('h3', {}, T('소리 파일 추가 (배경 음악·효과음)')),
            h('button', { class: 'btn wide', onclick: () => addItem('audio', screen.currentTime || 0) }, T('♪ 여기에 소리 파일 넣기')),
            h('div', { class: 'small muted', style: { marginTop: '8px' } }, T('추가한 소리 {0}개 · 타임라인 소리 줄에서 끌어 옮기고, 끝을 끌어 길이를 줄입니다.', project.audios.length)),
            a ? h('div', { style: { marginTop: '14px' } },
              h('div', { class: 'field-label', style: { marginBottom: '8px', wordBreak: 'break-all' } }, T('선택: {0} ({1} ~ {2})', a.name, fmt(a.start, true), fmt(a.end, true))),
              rangeField(T('크기'), Math.round((a.volume ?? 1) * 100), 0, 100, 5, (v) => { a.volume = v / 100; markDirty(); }, (v) => `${v}%`),
              rangeField(T('파일의 몇 초부터 틀까요'), a.offset || 0, 0, 120, 0.5, (v) => { a.offset = v; markDirty(); }, (v) => T('{0}초', v)),
              h('button', { class: 'btn wide danger', onclick: removeSelected }, T('이 소리 삭제'))) : null),
        ];
      },
      subs: () => drawSubtitlePanel(),
    };
    sideBody.replaceChildren(...[panels[ed.tab]()].flat(Infinity).filter(Boolean));
  }

  // ---- cutting the quiet parts in one go
  /** The sound to listen to: the microphone if it was recorded apart, else the computer's sound or the video's. */
  function talkFile() {
    return project.files.voice || project.files.audio || project.files.screen;
  }
  function silenceSection() {
    const pref = store.get('silence', { minGap: 1, keepBusy: true });
    const auto = project.cuts.filter((c) => c.silence);
    return h('div', { class: 'section' },
      h('h3', {}, T('말 없는 구간 자르기')),
      h('div', { class: 'small muted', style: { marginBottom: '10px' } }, T('말이 멈춘 곳을 찾아 한 번에 잘라냅니다. 말소리 앞뒤는 조금씩 남깁니다.')),
      segField(T('이만큼 조용하면 자르기'), String(pref.minGap), [0.7, 1, 2, 3].map((v) => ({ id: String(v), name: T('{0}초', v) })), (v) => { pref.minGap = Number(v); store.set('silence', pref); }),
      inlineSwitch(T('타이핑·클릭·마우스가 움직이는 곳은 남기기'), pref.keepBusy, (v) => { pref.keepBusy = v; store.set('silence', pref); }),
      h('button', { class: 'btn wide', disabled: !talkFile() || ed.silenceBusy, onclick: cutSilences }, ed.silenceBusy ? T('조용한 곳을 찾는 중…') : T('🔇 말 없는 구간 찾아 자르기')),
      auto.length ? h('div', { class: 'row', style: { marginTop: '8px' } },
        h('span', { class: 'small muted grow' }, T('자동으로 자른 구간 {0}개', auto.length)),
        h('button', { class: 'btn small', onclick: () => { project.cuts = project.cuts.filter((c) => !c.silence); ed.selected = null; markDirty(); drawPanel(); } }, T('모두 되살리기'))) : null);
  }
  async function cutSilences() {
    const pref = store.get('silence', { minGap: 1, keepBusy: true });
    const file = talkFile();
    ed.silenceBusy = true;
    drawPanel();
    try {
      const samples = await decodeAudio(platform.mediaUrl(project.id, file));
      const { cuts, clear } = findSilences(samples, 16000, {
        minGap: pref.minGap,
        pad: 0.25,
        offset: file === project.files.voice ? (project.offsets?.voice || 0) : 0,
        busy: pref.keepBusy ? busyTimes(project.events) : [],
      });
      if (!clear) { toast(T('말소리와 조용한 곳의 차이가 뚜렷하지 않아 자를 곳을 찾지 못했습니다.'), true); return; }
      const before = outDuration(segments({ ...project, cuts: project.cuts.filter((c) => !c.silence) }));
      const end = duration();
      project.cuts = [...project.cuts.filter((c) => !c.silence),
        ...cuts.filter((c) => c.start < end).map((c) => ({ id: newId('c'), start: c.start, end: Math.min(c.end, end), silence: true }))];
      ed.selected = null;
      markDirty();
      toast(cuts.length ? T('말 없는 구간 {0}개를 잘라 {1} 줄였습니다', cuts.length, fmt(Math.max(0, before - outDuration(ed.segs)), true)) : T('자를 만큼 긴 조용한 곳이 없습니다.'));
    } catch (err) {
      console.error(err);
      toast(T('소리를 읽지 못했습니다: {0}', err.message), true);
    } finally {
      ed.silenceBusy = false;
      if (state.editor === ed) drawPanel();
    }
  }

  function drawSubtitlePanel() {
    const s = project.settings;
    const prefs = store.get('asr', { model: MODELS[1].id, language: 'korean', gpu: true });
    const soundFile = project.files.voice || project.files.audio || project.files.screen;
    const hasAudio = !!soundFile;
    const progressBar = h('div', { class: 'progress hidden' }, h('div'));
    const progressText = h('div', { class: 'small muted', style: { marginTop: '6px' } });
    const runBtn = h('button', { class: 'btn primary wide', disabled: !hasAudio || ed.transcribing, onclick: async () => {
      if (project.subtitles.length && !confirm(T('지금 있는 자막을 새로 만든 자막으로 바꿀까요?'))) return;
      ed.transcribing = true;
      runBtn.disabled = true;
      runBtn.textContent = T('자막 만드는 중…');
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
              progressText.textContent = T('음성 인식 모델 내려받는 중 (처음 한 번만) · {0} / {1}', formatBytes(p.loaded), formatBytes(p.total));
            } else {
              progressBar.classList.add('indeterminate');
              const labels = {
                decoding: T('녹음된 소리를 읽는 중…'),
                loading: T('모델 준비 중 ({0})…', p.device === 'webgpu' ? T('그래픽카드') : 'CPU'),
                transcribing: T('말을 글로 옮기는 중 ({0}) · 영상 길이에 따라 시간이 걸립니다', p.device === 'webgpu' ? T('그래픽카드') : 'CPU'),
                retry: T('그래픽카드로 실패해 CPU로 다시 시도합니다…'),
                shaping: T('문장 단위로 자막 정리 중…'),
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
        toast(T('자막 {0}개를 만들었습니다 ({1}초)', subs.length, Math.round((performance.now() - started) / 1000)));
      } catch (err) {
        console.error(err);
        toast(T('자막을 만들지 못했습니다: {0}', err.message), true);
      } finally {
        ed.transcribing = false;
        if (state.editor === ed) drawPanel();
      }
    } }, ed.transcribing ? T('자막 만드는 중…') : project.subtitles.length ? T('↻ 음성으로 자막 다시 만들기') : T('🎙 음성으로 자막 만들기'));

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
        h('button', { class: 'btn small ghost', title: T('여기로 이동'), onclick: () => seek(c.start + 0.01) }, '▶'),
        h('button', { class: 'btn small ghost danger', title: T('삭제'), onclick: () => { project.subtitles = project.subtitles.filter((x) => x.id !== c.id); markDirty(); drawPanel(); } }, '✕')),
      h('textarea', { value: c.text, rows: 2, oninput: (e) => { c.text = e.target.value; delete c.words; markDirty(); } }));
    }));

    return [
      h('h3', {}, T('음성 자막')),
      !project.files.voice ? h('div', { class: 'hint' }, T('마이크를 따로 녹음하지 않아 영상의 소리 전체로 자막을 만듭니다.')) : null,
      selectField(T('말한 언어'), prefs.language, LANGUAGES, (v) => { prefs.language = v; store.set('asr', prefs); }),
      runBtn,
      progressBar,
      progressText,
      h('div', { class: 'small muted', style: { marginTop: '8px' } }, T('음성은 이 컴퓨터 안에서만 처리됩니다. 모델은 처음에 한 번 내려받습니다.')),
      more('asr', [
        selectField(T('정확도'), prefs.model, MODELS, (v) => { prefs.model = v; store.set('asr', prefs); }),
        inlineSwitch(T('그래픽카드로 빠르게'), prefs.gpu, (v) => { prefs.gpu = v; store.set('asr', prefs); }, T('안 되면 자동으로 CPU를 씁니다')),
      ]),
      h('div', { class: 'section' },
        h('h3', {}, T('자막 모양')),
        inlineSwitch(T('영상에 자막 넣기'), s.subtitles.enabled, (v) => { s.subtitles.enabled = v; markDirty(); }),
        segField(T('스타일'), s.subtitles.style, SUBTITLE_STYLES, (v) => { s.subtitles.style = v; markDirty(); drawPanel(); }, 4),
        ['karaoke', 'pop'].includes(s.subtitles.style) ? h('div', { class: 'hint' }, T('말하는 낱말을 강조합니다. 낱말 시간은 문장 길이로 나눠 어림합니다.')) : null,
        segField(T('위치'), s.subtitles.position, [{ id: 'bottom', name: T('아래') }, { id: 'middle', name: T('가운데') }, { id: 'top', name: T('위') }], (v) => { s.subtitles.position = v; markDirty(); }),
        more('subs', [
        extRow(T('확장 자막 스타일'), extensionItems('subtitleStyles'), (it) => { Object.assign(s.subtitles, it.values); }),
        segField(T('나타나기'), s.subtitles.anim || 'fade', [{ id: 'none', name: T('없음') }, { id: 'fade', name: T('서서히') }, { id: 'rise', name: T('올라오기') }, { id: 'pop', name: T('튀어나오기') }], (v) => { s.subtitles.anim = v; markDirty(); }),
        rangeField(T('글자 크기'), s.subtitles.size, 0.6, 1.8, 0.05, (v) => { s.subtitles.size = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`),
        ['box', 'outline', 'karaoke', 'pop', 'minimal'].includes(s.subtitles.style) ? colorField(T('글자 색'), s.subtitles.textColor || '#ffffff', (v) => { s.subtitles.textColor = v; markDirty(); }) : null,
        ['karaoke', 'pop'].includes(s.subtitles.style) ? colorField(T('강조 색'), s.subtitles.highlight || '#ffd33d', (v) => { s.subtitles.highlight = v; markDirty(); }) : null,
        ['box', 'paper'].includes(s.subtitles.style) ? rangeField(T('바탕 진하기'), s.subtitles.bgOpacity ?? 0.68, 0, 1, 0.05, (v) => { s.subtitles.bgOpacity = v; markDirty(); }, (v) => `${Math.round(v * 100)}%`) : null,
        ])),
      h('div', { class: 'section' },
        h('div', { class: 'row', style: { marginBottom: '10px' } },
          h('h3', { class: 'grow', style: { margin: 0 } }, T('자막 {0}개', project.subtitles.length)),
          h('button', { class: 'btn small', onclick: () => {
            const t = screen.currentTime;
            const c = { id: newId('s'), start: t, end: Math.min(project.durationMs / 1000, t + 2.5), text: T('새 자막') };
            project.subtitles.push(c);
            project.subtitles.sort((a, b) => a.start - b.start);
            ed.selected = { kind: 'sub', id: c.id };
            markDirty();
            drawPanel();
          } }, T('+ 여기에 추가')),
          h('button', { class: 'btn small', disabled: !project.subtitles.length, onclick: saveSrt }, T('SRT 저장'))),
        project.subtitles.length ? cues : h('div', { class: 'small muted' }, T('아직 자막이 없습니다.'))),
    ];
  }

  async function saveSrt() {
    const text = toSRT(mapCues(project.subtitles, ed.segs));
    const file = await platform.saveText(`${safeFileName(project.name)}.srt`, text, 'srt');
    if (file) toast(T('SRT 자막 파일을 저장했습니다.'));
  }

  // ---------------- export
  /** quick: save at once with the last settings (MP4 first) into the Videos folder, no questions. */
  function openExport(quick = false) {
    togglePlay(false);
    const formats = exportFormats();
    if (!formats.length) { toast(T('이 컴퓨터에서는 영상을 저장할 수 없습니다.'), true); return; }
    const prefs = { gifFps: 15, gifSide: 800, gifLoop: true, ...store.get('export', { format: formats[0].id, longSide: 1920, fps: 60, burn: true, srt: true }) };
    if (!formats.find((f) => f.id === prefs.format)) prefs.format = formats[0].id;
    // The one-click button always makes a video file (MP4 when it can), never a GIF.
    if (quick && prefs.format === 'gif') prefs.format = formats[0].id;
    const len = outDuration(ed.segs);
    if (!(len > 0)) { toast(T('내보낼 구간이 없습니다. 잘라낸 부분을 확인하세요.'), true); return; }
    const body = h('div');
    const bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal' }, h('h2', {}, quick ? T('영상 저장') : T('영상 내보내기')), body));
    document.body.append(bg);
    const close = () => bg.remove();

    // replaceChildren would turn a nested list into text, so the list is flattened first
    const drawForm = () => body.replaceChildren(...[
      selectField(T('파일 형식'), prefs.format, formats, (v) => { prefs.format = v; drawForm(); }),
      prefs.format === 'gif' ? [
        segField(T('크기 (긴 쪽)'), String(prefs.gifSide), [{ id: '480', name: '480' }, { id: '640', name: '640' }, { id: '800', name: '800' }, { id: '1080', name: '1080' }], (v) => { prefs.gifSide = Number(v); }),
        segField(T('초당 프레임'), String(prefs.gifFps), [{ id: '10', name: '10' }, { id: '15', name: '15' }, { id: '20', name: '20' }, { id: '25', name: '25' }], (v) => { prefs.gifFps = Number(v); }),
        inlineSwitch(T('계속 반복 재생'), prefs.gifLoop, (v) => { prefs.gifLoop = v; }),
        inlineSwitch(T('자막을 그림에 넣기'), prefs.burn, (v) => { prefs.burn = v; }),
        h('div', { class: 'hint' }, T('길이 {0} · GIF는 소리가 없고 용량이 큽니다. 30초 이하의 짧은 구간에 알맞습니다.', fmt(len))),
      ] : [

      selectField(T('화질'), String(prefs.longSide), [{ id: '1280', name: T('720p (가벼움)') }, { id: '1920', name: T('1080p (추천)') }, { id: '2560', name: '1440p' }, { id: '3840', name: '4K' }], (v) => { prefs.longSide = Number(v); }),
      segField(T('초당 프레임'), String(prefs.fps), [{ id: '30', name: '30fps' }, { id: '60', name: '60fps' }], (v) => { prefs.fps = Number(v); }),
      inlineSwitch(T('자막을 영상에 넣기'), prefs.burn, (v) => { prefs.burn = v; }),
      project.subtitles.length ? inlineSwitch(T('SRT 자막 파일도 저장'), prefs.srt, (v) => { prefs.srt = v; }) : null,
      h('div', { class: 'hint' }, T('길이 {0} · 내보내기는 영상 길이만큼, 컴퓨터가 바쁘면 조금 더 걸립니다. 그동안 이 창을 열어 두세요.', fmt(len))),
      ],
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: close }, T('취소')),
        h('button', { class: 'btn primary', onclick: run }, T('저장할 곳 고르기'))),
    ].flat(Infinity).filter(Boolean));

    async function run() {
      store.set('export', prefs);
      const format = formats.find((f) => f.id === prefs.format);
      const gif = format.ext === 'gif';
      const srtText = toSRT(mapCues(project.subtitles, ed.segs));
      const name = `${safeFileName(project.name)}.${format.ext}`;
      const writer = await platform.exportWriter(name, format.ext, format.mime, quick);
      if (!writer) { if (quick) close(); return; }
      const bar = h('div', { class: 'progress' }, h('div'));
      const label = h('div', { class: 'small muted', style: { marginTop: '8px' } }, T('준비 중…'));
      ed.abort = new AbortController();
      body.replaceChildren(bar, label, h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => ed.abort?.abort() }, T('중지'))));
      try {
        const file = await exportVideo({
          project, derived: ed.derived, screenUrl, webcamUrl, format, url,
          longSide: gif ? prefs.gifSide : prefs.longSide, fps: gif ? prefs.gifFps : prefs.fps, loop: prefs.gifLoop, burnSubtitles: prefs.burn, writer,
          signal: ed.abort.signal,
          onProgress: (k) => { bar.firstChild.style.width = `${Math.round(k * 100)}%`; label.textContent = `${Math.round(k * 100)}% · ${fmt(k * len)} / ${fmt(len)}`; },
        });
        ed.abort = null;
        if (!file) { close(); toast(T('내보내기를 중지했습니다.')); return; }
        let srtNote = '';
        if (gif) {
          // a GIF carries no separate subtitle file
        } else if (prefs.srt && project.subtitles.length && isDesktop && writer.path) {
          const srtPath = writer.path.replace(/\.[^.\\/]+$/, '.srt');
          await window.keycast.writeText(srtPath, srtText);
          srtNote = T(' + SRT 자막');
        } else if (prefs.srt && project.subtitles.length && !isDesktop) {
          await saveSrt();
        }
        body.replaceChildren(
          h('div', { class: 'done' },
            h('span', {}, '✅'),
            h('b', {}, T('영상을 저장했습니다{0}', srtNote)),
            // The file name, and only the folder it is in: the whole path is in the tooltip.
            writer.path ? h('span', { class: 'small muted', title: writer.path, style: { wordBreak: 'break-all' } },
              writer.path.split(/[\\/]/).slice(-2).join(' › ')) : null),
          h('div', { class: 'actions' },
            quick ? h('button', { class: 'btn ghost', onclick: () => { close(); openExport(false); } }, T('다른 설정으로 저장…')) : null,
            isDesktop ? h('button', { class: 'btn', onclick: () => platform.reveal(writer.path) }, T('📁 폴더에서 보기')) : null,
            h('button', { class: 'btn primary', onclick: close }, T('닫기'))));
      } catch (err) {
        console.error(err);
        ed.abort = null;
        close();
        toast(T('내보내지 못했습니다: {0}', err.message || err), true);
      }
    }
    if (quick) run(); else drawForm();
  }

  // ---------------- layout
  mount(
    topbar(
      h('button', { class: 'btn small ghost', onclick: async () => { if (ed.dirty) await platform.saveProject(project); showHome(); } }, T('← 처음으로')),
      nameInput,
      saveTag,
      h('button', { class: 'btn small ghost', title: T('되돌리기 (Ctrl+Z)'), onclick: () => timeTravel(ed.history, ed.future) }, '↶'),
      h('button', { class: 'btn small ghost', title: T('다시 하기 (Ctrl+Y)'), onclick: () => timeTravel(ed.future, ed.history) }, '↷'),
      h('button', { class: 'btn small ghost', title: T('단축키'), onclick: openShortcuts }, '⌨'),
      h('button', { class: 'btn small ghost', title: T('형식·화질·저장할 곳을 골라 내보내기'), onclick: () => openExport(false) }, T('내보내기 설정…')),
      h('button', { class: 'btn primary', title: T('지난번 설정으로 동영상 폴더에 바로 저장합니다'), onclick: () => openExport(true) }, exportFormats()[0]?.id === 'mp4' ? T('⤓ MP4로 저장') : T('⤓ 영상 저장'))),
    h('div', { class: 'editor' },
      h('div', { class: 'stage' },
        h('div', { class: 'preview-wrap' }, preview),
        h('div', { class: 'transport' },
          playBtn,
          timeLabel,
          h('div', { class: 'grow' }),
          keysToggle,
          sizeLabel),
        h('div', { class: 'timeline-wrap' }, timelineCanvas,
          h('div', { class: 'timeline-help' }, T('클릭해서 이동 · 줄을 더블클릭하면 그 줄에 추가 · 블록을 끌어 옮기고 끝을 끌어 늘리기 · 선택 후 Delete로 삭제 · Space 재생 · Ctrl+Z 되돌리기')))),
      h('aside', { class: 'side' }, sideTabs, sideSub, sideBody)));

  drawTabs();
  drawPanel();
  timeline.setData(project, ed.derived);
  seek(project.trim.start);
  loop();
}

