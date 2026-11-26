// Small DOM helpers and form controls shared by every screen.

import { isDesktop } from '../lib/platform.js';
import { withIcon } from '../lib/icons.js';
import { T, lang, LANGS, setLang } from '../lib/i18n.js';
// ------------------------------------------------------------------ tiny DOM helper
export function h(tag, attrs = {}, ...children) {
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

/**
 * A yes/no question in the app's own window (the system confirm() box looks foreign and freezes
 * the whole app while it is open). Esc and "취소" answer no. Resolves true or false.
 */
export function askConfirm(message, okLabel, danger = true) {
  return new Promise((resolve) => {
    const done = (yes) => { bg.remove(); resolve(yes); };
    const bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true' },
      h('p', { style: { margin: '0 0 4px', lineHeight: '1.6' } }, message),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => done(false) }, T('취소')),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => done(true) }, okLabel))));
    document.body.append(bg);
  });
}

export function toast(msg, error = false) {
  const el = h('div', { class: `toast${error ? ' error' : ''}`, role: error ? 'alert' : 'status' }, msg);
  document.body.append(el);
  setTimeout(() => el.remove(), error ? 6000 : 3200);
}

export const app = document.getElementById('app');
export function mount(...nodes) {
  app.replaceChildren(...nodes.flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false));
}
// ------------------------------------------------------------------ shared bits
export function topbar(...right) {
  return h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }), h('span', {}, 'KeyCast', h('i', {}, ' Studio'))),
    h('div', { class: 'grow' }),
    ...right,
    h('button', { class: 'btn small ghost', title: T('사용설명서 열기'), onclick: openManual }, T('❓ 사용법')));
}

/** Interface language picker; the page reloads in the new language (edits are saved first). */
export function langMenu() {
  return h('select', { class: 'lang-menu', 'aria-label': 'Language / 언어', title: 'Language / 언어', onchange: (e) => { setLang(e.target.value); location.reload(); } },
    LANGS.map((l) => h('option', { value: l.id, selected: l.id === lang }, l.name)));
}

const HELP_EN = 'https://github.com/dominkang90/keycast-studio#readme';

export function openManual() {
  // The Korean manual ships with the app (and sits next to the browser version); other languages
  // use the README on GitHub, opened in the normal web browser.
  if (lang !== 'ko') {
    if (isDesktop && window.keycast?.openHelp) window.keycast.openHelp();
    else window.open(HELP_EN, '_blank', 'noopener');
    return;
  }
  const url = isDesktop ? './manual.html' : '../사용설명서.html';
  window.open(url, '_blank', 'width=980,height=900');
}

export function switchEl(checked, onChange) {
  const input = h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) });
  return h('label', { class: 'switch' }, input, h('span'));
}

export function inlineSwitch(label, checked, onChange, note) {
  return h('div', { class: 'field inline' },
    h('label', {}, label, note ? h('div', { class: 'small muted' }, note) : null),
    switchEl(checked, onChange));
}

export function rangeField(label, value, min, max, step, onInput, format = (v) => v) {
  const tag = h('span', { class: 'value-tag' }, format(value));
  return h('div', { class: 'field' },
    h('div', { class: 'row' }, h('span', { class: 'field-label grow' }, label), tag),
    h('input', { type: 'range', min, max, step, value, 'aria-label': label, oninput: (e) => { const v = Number(e.target.value); tag.textContent = format(v); onInput(v); } }));
}

export function selectField(label, value, options, onChange) {
  return h('div', { class: 'field' },
    h('label', {}, label),
    h('select', { 'aria-label': label, onchange: (e) => onChange(e.target.value) },
      options.map((o) => h('option', { value: o.id, selected: o.id === value }, o.name))));
}

export function segField(label, value, options, onChange, cols) {
  // With cols the buttons wrap into rows of that many, for longer lists.
  const wrap = h('div', { class: 'seg', style: cols ? { gridAutoFlow: 'row', gridTemplateColumns: `repeat(${cols}, 1fr)` } : {} });
  const draw = (cur) => {
    wrap.replaceChildren(...options.map((o) => h('button', { class: o.id === cur ? 'on' : '', onclick: () => { onChange(o.id); draw(o.id); } }, o.name)));
  };
  draw(value);
  return h('div', { class: 'field' }, label ? h('label', {}, label) : null, wrap);
}

export function colorField(label, value, onInput) {
  return h('div', { class: 'field inline' }, h('label', {}, label),
    h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000', oninput: (e) => onInput(e.target.value) }));
}

export const ALL_POSITIONS = ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'];
export function positionField(label, value, positions, onChange) {
  const names = { 'top-left': '↖', 'top-center': '↑', 'top-right': '↗', 'center-left': '←', center: '•', 'center-right': '→', 'bottom-left': '↙', 'bottom-center': '↓', 'bottom-right': '↘' };
  const grid = h('div', { class: 'pos-grid' });
  const cells = positions.some((p) => p.startsWith('center')) ? ALL_POSITIONS : ALL_POSITIONS.filter((p) => !p.startsWith('center'));
  const draw = (cur) => grid.replaceChildren(...cells.map((p) =>
    h('button', { class: p === cur ? 'on' : '', disabled: !positions.includes(p), style: positions.includes(p) ? null : { opacity: 0.25 }, onclick: () => { onChange(p); draw(p); } }, names[p])));
  draw(value);
  return h('div', { class: 'field' }, h('label', {}, label), grid);
}

export function formatBytes(n) {
  if (!n) return '0 MB';
  return `${(n / 1048576).toFixed(n > 104857600 ? 0 : 1)} MB`;
}

export function kbdLabel(accel) {
  return String(accel).split('+').flatMap((k, i) => [i ? ' + ' : null, h('span', { class: 'kbd' }, k === 'Super' ? 'Win' : k)]).filter(Boolean);
}

/** A global shortcut from a key press inside this window, or null when it cannot be one. */
export function accelFromEvent(e) {
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

export function safeFileName(name) {
  return String(name).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'keycast';
}


// Folded settings ("More ▾") stay open or closed across redraws of a panel.
const openMore = new Set();
/** Less-used settings behind a "More" fold, so a panel starts with only what most people change. */
export function more(id, ...children) {
  const items = children.flat(Infinity).filter(Boolean);
  if (!items.length) return null;
  const box = h('details', { class: 'more', open: openMore.has(id) },
    h('summary', {}, T('자세히')), h('div', { class: 'more-body' }, items));
  box.addEventListener('toggle', () => { if (box.open) openMore.add(id); else openMore.delete(id); });
  return box;
}
