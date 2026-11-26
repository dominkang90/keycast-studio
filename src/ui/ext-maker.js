// Extension maker: build an extension pack (backgrounds, key themes, cursor packs, click effects,
// subtitle styles) with a live preview drawn by the real renderer, then add it to the app or save
// the extension.json to share. Format: docs/EXTENSIONS.md.
import { h, toast, rangeField, segField, colorField, inlineSwitch, askConfirm } from './dom.js';
import { platform, isDesktop } from '../lib/platform.js';
import { readExtension, applyBackground } from '../lib/extensions.js';
import { renderFrame, defaultSettings, CLICK_EFFECTS } from '../lib/compositor.js';
import { SUBTITLE_STYLES } from '../lib/subtitles.js';
import { buildKeyGroups, KEY_DEFAULTS } from '../lib/keys.js';
import { CursorTrack, clicksOf } from '../lib/zoom.js';
import { OFFICIAL_EXTENSIONS } from '../lib/official-extensions.js';
import { loadExtensions } from './state.js';
import { T } from '../lib/i18n.js';

const KINDS = ['backgrounds', 'keyThemes', 'cursorPacks', 'clickEffects', 'subtitleStyles'];

/** A new item of each kind, so a fresh pack shows something straight away. */
function newItem(kind, n) {
  const name = `${T('새 항목')} ${n}`;
  switch (kind) {
    case 'backgrounds': return { name, gradient: ['#6366f1', '#ec4899'], angle: 135 };
    case 'keyThemes': return { name, face: '#ffffff', text: '#111827', modFace: '#3a86ff', modText: '#ffffff', border: true, borderColor: '#1a1a1a', borderWidth: 2, radius: 9, capStyle: 'raised', panel: true, panelColor: '#000000', panelOpacity: 0.55 };
    case 'cursorPacks': return { name, fill: '#ffffff', edge: '#111111', width: 1.3 };
    case 'clickEffects': return { name, effect: 'ripple', color: '#ffd33d', size: 1, duration: 0.65, opacity: 1 };
    default: return { name, style: 'box', textColor: '#ffffff', highlight: '#ffd33d', bgOpacity: 0.68, anim: 'fade', size: 1, position: 'bottom' };
  }
}

/** Folder name for a pack: lowercase letters, digits and dashes. */
export function folderFor(name) {
  const slug = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return slug || 'my-pack';
}

// ---------------------------------------------------------------- preview scene
/** A made-up screen to draw the pack on: a window with lines and a button. */
function fakeScreen() {
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 720;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f5f7'; g.fillRect(0, 0, 1280, 720);
  g.fillStyle = '#e3e6eb'; g.fillRect(0, 0, 1280, 52);
  g.fillStyle = '#d0d5dd'; g.fillRect(0, 52, 230, 668);
  g.fillStyle = '#9aa3b2';
  for (let i = 0; i < 8; i++) g.fillRect(260, 100 + i * 46, [520, 380, 600, 300, 460, 540, 260, 420][i], 14);
  g.fillStyle = '#3a86ff'; g.beginPath(); g.roundRect(880, 560, 220, 64, 12); g.fill();
  g.fillStyle = '#ffffff'; g.fillRect(940, 586, 100, 12);
  c.videoWidth = 1280; // read by the renderer like a video's size
  c.videoHeight = 720;
  return c;
}

/** Pointer path, two clicks and two shortcuts over four seconds. */
function fakeEvents() {
  const ev = [];
  for (let i = 0; i <= 40; i++) {
    const t = i * 0.1;
    const k = Math.min(1, t / 1.4);
    ev.push({ t, type: 'mm', x: 0.3 + (0.47 - 0.3) * k + 0.02 * Math.sin(t * 3), y: 0.35 + (0.82 - 0.35) * k });
  }
  ev.push({ t: 1.5, type: 'md', button: 1, x: 0.77, y: 0.82 }, { t: 1.6, type: 'mu', button: 1, x: 0.77, y: 0.82 });
  ev.push({ t: 1.0, type: 'kd', name: 'S', mods: { ctrl: true } }, { t: 1.1, type: 'ku', name: 'S' });
  ev.push({ t: 2.6, type: 'kd', name: 'C', mods: { ctrl: true, shift: true } }, { t: 2.7, type: 'ku', name: 'C' });
  ev.push({ t: 2.8, type: 'md', button: 1, x: 0.6, y: 0.5 }, { t: 2.9, type: 'mu', button: 1, x: 0.6, y: 0.5 });
  return ev.sort((a, b) => a.t - b.t);
}

/** The preview project with the chosen item of every kind applied, as the editor would. */
function previewProject(ext, pick) {
  const s = defaultSettings();
  const item = (k) => ext[k][Math.min(pick[k] ?? 0, ext[k].length - 1)];
  const bg = item('backgrounds');
  if (bg) applyBackground(s.frame, bg);
  const key = item('keyThemes');
  if (key) { s.keys.theme = 'custom'; s.keys.custom = { ...KEY_DEFAULTS.custom, ...key.custom }; }
  s.keys.mode = 'shortcuts';
  const cur = item('cursorPacks');
  s.cursor.show = true;
  if (cur) { s.cursor.style = 'custom'; s.cursor.look = { ...cur.look }; }
  const click = item('clickEffects');
  if (click) Object.assign(s.cursor, click.values);
  const sub = item('subtitleStyles');
  if (sub) Object.assign(s.subtitles, sub.values);
  s.subtitles.enabled = true;
  return {
    id: 'maker', durationMs: 4000, settings: s, zooms: [], cuts: [], speeds: [], annotations: [], audios: [],
    trim: { start: 0, end: 4 }, source: { width: 1280, height: 720 },
    subtitles: [{ id: 's', start: 0.4, end: 3.8, text: T('단축키 하나로 영상을 자릅니다') }],
  };
}

// ---------------------------------------------------------------- the window
export function openExtensionMaker(initial, base = null) {
  // A pack named like an official one gets its own folder, so reinstalling the official pack keeps it.
  const folderOf = () => { const f = folderFor(pack.name); return f === base || OFFICIAL_EXTENSIONS.some((o) => o.folder === f) ? `${f}-custom` : f; };
  const pack = initial ? JSON.parse(JSON.stringify(initial)) : {
    name: T('내 확장'), version: '1.0', author: '', description: '',
    backgrounds: [newItem('backgrounds', 1)], keyThemes: [newItem('keyThemes', 1)], cursorPacks: [newItem('cursorPacks', 1)],
    clickEffects: [newItem('clickEffects', 1)], subtitleStyles: [newItem('subtitleStyles', 1)],
  };
  for (const k of KINDS) pack[k] = Array.isArray(pack[k]) ? pack[k] : [];
  const pick = Object.fromEntries(KINDS.map((k) => [k, 0]));
  const events = fakeEvents();
  const screen = fakeScreen();
  let ext = readExtension(folderOf(), pack);
  let project = previewProject(ext, pick);
  let derived = null;
  const rebuild = () => {
    ext = readExtension(folderOf(), pack);
    project = previewProject(ext, pick);
    derived = { groups: buildKeyGroups(events, project.settings.keys), clicks: clicksOf(events), cursor: new CursorTrack(events), scrolls: [] };
    status.textContent = T('쓸 수 있는 항목 {0}개', ext.count);
  };

  const canvas = h('canvas', { class: 'maker-preview', width: 960, height: 540 });
  const ctx = canvas.getContext('2d', { alpha: false });
  const status = h('div', { class: 'small muted' });
  let raf = 0;
  const t0 = performance.now();
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const t = ((performance.now() - t0) / 1000) % 4;
    try {
      renderFrame(ctx, { W: 960, H: 540, t, screen, project, derived, burnSubtitles: true, url: (n) => platform.mediaUrl(null, n) });
    } catch (err) {
      console.warn('preview', err);
    }
  };

  const left = h('div', { class: 'maker-form' });
  const changed = (redraw) => { rebuild(); if (redraw) drawForm(); };
  const textField = (label, value, set, attrs = {}) => h('div', { class: 'field' }, h('label', {}, label),
    h('input', { type: 'text', value: value ?? '', ...attrs, oninput: (e) => { set(e.target.value); changed(false); } }));

  const kindTitles = { backgrounds: T('배경'), keyThemes: T('키 테마'), cursorPacks: T('커서 묶음'), clickEffects: T('클릭 효과'), subtitleStyles: T('자막 스타일') };
  function itemFields(kind, it) {
    const set = (key) => (v) => { it[key] = v; changed(false); };
    const pct = (v) => `${Math.round(v * 100)}%`;
    switch (kind) {
      case 'backgrounds': {
        const blobs = Array.isArray(it.blobs);
        return [
          segField(T('종류'), blobs ? 'blobs' : 'gradient', [{ id: 'gradient', name: T('그라데이션') }, { id: 'blobs', name: T('빛 번짐') }], (v) => {
            if (v === 'blobs') { delete it.gradient; delete it.angle; it.base = '#101014'; it.blobs = [[0.2, 0.2, 0.7, '#6366f1'], [0.85, 0.3, 0.6, '#ec4899'], [0.5, 1, 0.7, '#06b6d4']]; } else { delete it.blobs; delete it.base; it.gradient = ['#6366f1', '#ec4899']; it.angle = 135; }
            changed(true);
          }),
          blobs ? [
            colorField(T('바탕 색'), it.base, set('base')),
            it.blobs.map((b, i) => colorField(`${T('색')} ${i + 1}`, b[3], (v) => { b[3] = v; changed(false); })),
          ] : [
            it.gradient.map((c, i) => colorField(`${T('색')} ${i + 1}`, c, (v) => { it.gradient[i] = v; changed(false); })),
            h('div', { class: 'row' },
              it.gradient.length < 6 ? h('button', { class: 'btn small', onclick: () => { it.gradient.push(it.gradient[it.gradient.length - 1]); changed(true); } }, T('+ 색')) : null,
              it.gradient.length > 2 ? h('button', { class: 'btn small', onclick: () => { it.gradient.pop(); changed(true); } }, T('− 색')) : null),
            rangeField(T('방향'), it.angle ?? 135, 0, 360, 5, set('angle'), (v) => `${v}°`),
          ],
        ];
      }
      case 'keyThemes': return [
        segField(T('키 모양'), it.capStyle || 'raised', [{ id: 'raised', name: T('입체') }, { id: 'flat', name: T('납작') }, { id: 'outline', name: T('테두리만') }], (v) => { it.capStyle = v; changed(false); }),
        colorField(T('키 색'), it.face, set('face')), colorField(T('글자 색'), it.text, set('text')),
        colorField(T('조합키 색'), it.modFace, set('modFace')), colorField(T('조합키 글자 색'), it.modText, set('modText')),
        inlineSwitch(T('테두리'), it.border !== false, (v) => { it.border = v; changed(true); }),
        it.border !== false ? [colorField(T('테두리 색'), it.borderColor, set('borderColor')), rangeField(T('테두리 두께'), it.borderWidth ?? 2, 0, 6, 1, set('borderWidth'), (v) => `${v}px`)] : null,
        rangeField(T('모서리 둥글기'), it.radius ?? 9, 0, 24, 1, set('radius'), (v) => `${v}px`),
        inlineSwitch(T('키에 입체감(그라데이션)'), !!it.gradient, (v) => { it.gradient = v; changed(false); }),
        inlineSwitch(T('뒤에 바탕 깔기'), it.panel !== false, (v) => { it.panel = v; changed(true); }),
        it.panel !== false ? [colorField(T('바탕 색'), it.panelColor, set('panelColor')), rangeField(T('바탕 진하기'), it.panelOpacity ?? 0.55, 0, 1, 0.05, set('panelOpacity'), pct)] : null,
      ];
      case 'cursorPacks': return [
        colorField(T('채우기 색'), it.fill, set('fill')), colorField(T('테두리 색'), it.edge, set('edge')),
        rangeField(T('테두리 두께'), it.width ?? 1.3, 0.5, 3, 0.1, set('width'), (v) => v.toFixed(1)),
        inlineSwitch(T('빛나게'), !!it.glow, (v) => { if (v) it.glow = it.edge || '#3b82f6'; else delete it.glow; changed(true); }),
        it.glow ? colorField(T('빛 색'), it.glow, set('glow')) : null,
      ];
      case 'clickEffects': return [
        segField(T('효과 모양'), it.effect || 'ripple', CLICK_EFFECTS.filter((x) => x.id !== 'none'), (v) => { it.effect = v; changed(false); }, 4),
        colorField(T('효과 색'), it.color, set('color')),
        rangeField(T('효과 크기'), it.size ?? 1, 0.5, 2.5, 0.05, set('size'), pct),
        rangeField(T('효과 길이'), it.duration ?? 0.65, 0.3, 1.5, 0.05, set('duration'), (v) => T('{0}초', v.toFixed(2))),
        rangeField(T('효과 진하기'), it.opacity ?? 1, 0.1, 1, 0.05, set('opacity'), pct),
      ];
      default: return [
        segField(T('스타일'), it.style || 'box', SUBTITLE_STYLES, (v) => { it.style = v; changed(false); }, 4),
        colorField(T('글자 색'), it.textColor || '#ffffff', set('textColor')), colorField(T('강조 색'), it.highlight || '#ffd33d', set('highlight')),
        rangeField(T('바탕 진하기'), it.bgOpacity ?? 0.68, 0, 1, 0.05, set('bgOpacity'), pct),
        segField(T('나타나기'), it.anim || 'fade', [{ id: 'none', name: T('없음') }, { id: 'fade', name: T('서서히') }, { id: 'rise', name: T('올라오기') }, { id: 'pop', name: T('튀어나오기') }], (v) => { it.anim = v; changed(false); }),
        rangeField(T('글자 크기'), it.size ?? 1, 0.6, 1.8, 0.05, set('size'), pct),
        segField(T('위치'), it.position || 'bottom', [{ id: 'bottom', name: T('아래') }, { id: 'middle', name: T('가운데') }, { id: 'top', name: T('위') }], (v) => { it.position = v; changed(false); }),
      ];
    }
  }

  function drawForm() {
    left.replaceChildren(
      h('h3', {}, T('확장 정보')),
      textField(T('이름'), pack.name, (v) => { pack.name = v; }),
      textField(T('만든 사람'), pack.author, (v) => { pack.author = v; }),
      textField(T('버전'), pack.version, (v) => { pack.version = v; }),
      textField(T('설명'), pack.description, (v) => { pack.description = v; }),
      ...KINDS.map((kind) => h('div', { class: 'section' },
        h('div', { class: 'row', style: { marginBottom: '8px' } },
          h('h3', { class: 'grow', style: { margin: 0 } }, `${kindTitles[kind]} ${pack[kind].length}`),
          h('button', { class: 'btn small', onclick: () => { pack[kind].push(newItem(kind, pack[kind].length + 1)); pick[kind] = pack[kind].length - 1; changed(true); } }, T('+ 추가'))),
        h('div', { class: 'ext-row' }, pack[kind].map((it, i) => h('button', {
          class: `btn small${pick[kind] === i ? ' primary' : ''}`,
          onclick: () => { pick[kind] = i; changed(true); },
        }, it.name || '—'))),
        pack[kind][pick[kind]] ? h('div', { class: 'maker-item' },
          textField(T('항목 이름'), pack[kind][pick[kind]].name, (v) => { pack[kind][pick[kind]].name = v; }),
          itemFields(kind, pack[kind][pick[kind]]),
          h('button', { class: 'btn small danger', onclick: () => { pack[kind].splice(pick[kind], 1); pick[kind] = Math.max(0, pick[kind] - 1); changed(true); } }, T('이 항목 삭제'))) : null)),
    );
    left.querySelectorAll('input[type=text]').forEach((el) => el.addEventListener('change', () => drawForm()));
  }

  const json = () => `${JSON.stringify(pack, null, 2)}\n`;
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || typeof data !== 'object') throw new Error('not an object');
      close();
      openExtensionMaker(data);
    } catch (err) {
      toast(T('불러오지 못했습니다: {0}', err.message), true);
    }
  } });
  const close = () => { cancelAnimationFrame(raf); bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  const bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal maker' },
    h('div', { class: 'row', style: { marginBottom: '12px' } },
      h('h2', { class: 'grow', style: { margin: 0 } }, T('확장 만들기')),
      h('button', { class: 'btn small', onclick: () => fileInput.click() }, T('⤒ JSON 불러오기')),
      h('select', { class: 'maker-template', 'aria-label': T('공식 확장에서 시작'), onchange: (e) => {
        const o = OFFICIAL_EXTENSIONS.find((x) => x.folder === e.target.value);
        if (o) { close(); openExtensionMaker({ ...o.json, name: `${o.json.name} (${T('내 버전')})` }, o.folder); }
      } }, h('option', { value: '' }, T('공식 확장에서 시작…')), OFFICIAL_EXTENSIONS.map((o) => h('option', { value: o.folder }, o.json.name))),
      fileInput),
    h('div', { class: 'maker-body' },
      left,
      h('div', { class: 'maker-side' },
        canvas,
        status,
        h('div', { class: 'small muted', style: { marginTop: '6px' } }, T('각 종류에서 고른 항목이 함께 미리 보입니다. 미리보기는 앱이 영상을 그리는 방식 그대로입니다.')))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: close }, T('닫기')),
      h('button', { class: 'btn', onclick: () => {
        const a = h('a', { href: URL.createObjectURL(new Blob([json()], { type: 'application/json' })), download: 'extension.json' });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast(T('extension.json을 저장했습니다. 이 파일을 "{0}" 폴더에 넣어 나눌 수 있습니다.', folderOf()));
      } }, T('⤓ JSON 내려받기')),
      isDesktop ? h('button', { class: 'btn primary', onclick: async () => {
        if (!ext.count) { toast(T('쓸 수 있는 항목이 하나도 없습니다.'), true); return; }
        const folder = folderOf();
        const list = await loadExtensions(true);
        if (list.some((e) => e.id === folder) && !(await askConfirm(T('"{0}" 확장이 이미 있습니다. 바꿀까요?', folder), T('바꾸기')))) return;
        await platform.installExtension(folder, json());
        await loadExtensions(true);
        toast(T('"{0}" 확장을 넣었습니다.', pack.name));
      } }, T('앱에 넣기')) : null)));
  document.body.append(bg);
  document.addEventListener('keydown', onKey);
  rebuild();
  drawForm();
  frame();
}
