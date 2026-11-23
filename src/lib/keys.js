// Turns raw key/mouse events into the key bubbles shown on the video.
// Times are in seconds on the project timeline.

import { T } from './i18n.js';

const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Win'];
const MODIFIERS = new Set(MOD_ORDER);

const SHIFTED = {
  1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(', 0: ')',
  '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|', ';': ':', "'": '"', ',': '<', '.': '>', '/': '?', '`': '~',
};

const SPECIAL_LABELS = {
  Enter: '⏎ Enter', Backspace: '⌫', Tab: '⇥ Tab', Space: 'Space', 'Caps Lock': '⇪ Caps',
};

export function isPrintable(name) {
  return name.length === 1 || name === 'Space';
}

function displayLabel(name) {
  return SPECIAL_LABELS[name] || name;
}

export const KEY_DEFAULTS = {
  enabled: true,
  // Shortcuts only by default: what you type stays private and the video shows the keys that matter.
  mode: 'shortcuts', // 'all' | 'shortcuts' | 'custom'
  allowed: ['Ctrl', 'Alt', 'Win'], // custom filter: bubbles that begin with one of these
  position: 'bottom-center',
  marginX: 36,
  marginY: 36,
  size: 1.25,
  theme: 'dark',
  showMouse: false,
  hold: 1.4,
  maxGroups: 3,
  anim: 'fade', // 'none' | 'fade' | 'zoom' | 'float' | 'slide'
  animDur: 0.25,
  caps: 'upper', // 'upper' | 'lower' | 'asis'
  modLabel: 'text', // 'text' (Ctrl) | 'symbol' (⌃)
  // 'windows' (Win, Alt) or 'mac' (Cmd, Option): names drawn for the same recorded keys
  keyNames: typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '') ? 'mac' : 'windows',
  showCount: true,
  // used when theme === 'custom'
  custom: {
    capStyle: 'raised', // 'raised' | 'flat' | 'outline'
    gradient: false,
    face: '#ffffff', text: '#111827',
    modHighlight: true, modFace: '#3a86ff', modText: '#ffffff',
    border: true, borderColor: '#1a1a1a', borderWidth: 2, radius: 9,
    panel: true, panelColor: '#000000', panelOpacity: 0.55,
  },
};

// Keys that act as shortcuts on their own (F5 to refresh, Esc to close, F2 to rename).
const SOLO_SHORTCUTS = /^(F([1-9]|1\d|2[0-4])|Esc|PrtSc)$/;

/**
 * Whether a key event may be saved when typing is not recorded: shortcuts, modifiers and keys
 * such as Enter or arrows stay; letters, digits and symbols typed on their own are dropped, so
 * text like passwords never reaches the project file.
 */
export function keepWithoutTyping(ev) {
  if (ev.type !== 'kd' && ev.type !== 'ku') return true;
  const name = ev.name || '';
  // Named keys that never carry text are kept; everything else (letters, digits, symbols, the
  // number pad, unknown keys) counts as typing. An allowlist, so a new key name stays private.
  if (MODIFIERS.has(name) || NAMED_KEYS.has(name) || SOLO_SHORTCUTS.test(name)) return true;
  if (ev.type !== 'kd') return false;
  const m = ev.mods || {};
  // Ctrl+Alt together is also how AltGr types characters such as @ { \ on many layouts.
  if (m.ctrl && m.alt && !m.meta) return false;
  // Alt + number pad digits types characters by code (Alt+0169).
  if (/^Num /.test(name)) return false;
  return !!(m.ctrl || m.alt || m.meta);
}

const NAMED_KEYS = new Set([
  'Enter', 'Tab', 'Backspace', 'Del', 'Ins', 'Home', 'End', 'PgUp', 'PgDn', '←', '↑', '→', '↓',
  'Caps Lock', 'Num Lock', 'Scroll Lock', 'Menu', '한/영', '한자', 'Kana', 'Convert', 'NoConvert',
]);

export function isModifier(name) {
  return MODIFIERS.has(name);
}

const MOUSE_NAMES = { 1: T('왼쪽 클릭'), 2: T('오른쪽 클릭'), 3: T('휠 클릭') };
export const DRAG_LABEL = T('드래그');

/**
 * @param {Array} events project events (t in seconds)
 * @param {object} opts key overlay settings
 * @returns {Array<{start:number,end:number,kind:string,items:Array<{t:number,keys:string[],count:number}>}>}
 */
export function buildKeyGroups(events, opts = KEY_DEFAULTS) {
  const groups = [];
  const held = new Map(); // modifier -> {t, used}
  let current = null;
  const typingGap = 1.1;

  const startGroup = (kind, t) => {
    current = { kind, start: t, end: t, items: [] };
    groups.push(current);
    return current;
  };

  const allowed = opts.mode === 'custom' ? new Set(opts.allowed || []) : null;
  let press = null; // the mouse button being held: where it went down and its bubble

  const addItem = (kind, t, keys, first) => {
    // Custom filter (keyviz-style): show only what begins with a chosen key.
    if (allowed && !allowed.has(first)) return null;
    const label = keys.join('+');
    if (kind === 'typing') {
      if (!current || current.kind !== 'typing' || t - current.end > typingGap) startGroup('typing', t);
    } else if (!current || current.kind !== kind || current.items.length === 0 ||
        current.items[current.items.length - 1].keys.join('+') !== label || t - current.end > typingGap) {
      startGroup(kind, t);
    }
    const last = current.items[current.items.length - 1];
    if (last && last.keys.join('+') === label && t - current.end <= typingGap) {
      last.count += 1;
      last.t = t;
      current.end = t;
      return last;
    }
    const item = { t, keys, count: 1 };
    current.items.push(item);
    current.end = t;
    return item;
  };

  for (const ev of events) {
    if (ev.type === 'kd') {
      const name = ev.name;
      if (MODIFIERS.has(name)) {
        if (!held.has(name)) held.set(name, { t: ev.t, used: false });
        continue;
      }
      if (ev.repeat) {
        if (current && current.items.length) {
          const last = current.items[current.items.length - 1];
          if (last.keys[last.keys.length - 1] === displayLabel(name) || last.keys[last.keys.length - 1] === name) {
            last.count += 1;
            last.t = ev.t;
            current.end = ev.t;
          }
        }
        continue;
      }
      // Modifier state: trust what we tracked, fall back to the flags carried by the event.
      const mods = new Set(held.keys());
      if (ev.mods) {
        if (ev.mods.ctrl) mods.add('Ctrl');
        if (ev.mods.alt) mods.add('Alt');
        if (ev.mods.shift) mods.add('Shift');
        if (ev.mods.meta) mods.add('Win');
      }
      for (const m of mods) if (held.has(m)) held.get(m).used = true;
      const ordered = MOD_ORDER.filter((m) => mods.has(m));
      const strong = ordered.filter((m) => m !== 'Shift');
      const printable = isPrintable(name);

      if (strong.length || (ordered.includes('Shift') && !printable) || (opts.mode === 'shortcuts' && SOLO_SHORTCUTS.test(name))) {
        addItem('combo', ev.t, [...ordered, displayLabel(name)], ordered[0] || name);
      } else {
        if (opts.mode === 'shortcuts') continue;
        let label = displayLabel(name);
        if (ordered.includes('Shift') && name.length === 1 && SHIFTED[name]) label = SHIFTED[name];
        addItem('typing', ev.t, [label], name);
      }
    } else if (ev.type === 'ku') {
      const name = ev.name;
      if (MODIFIERS.has(name) && held.has(name)) {
        const info = held.get(name);
        held.delete(name);
        if (!info.used && opts.mode !== 'shortcuts' && ev.t - info.t < 1.5) {
          addItem('combo', info.t, [name], name);
        }
      }
    } else if (ev.type === 'md' && opts.showMouse) {
      const mods = MOD_ORDER.filter((m) => held.has(m));
      for (const m of mods) held.get(m).used = true;
      const item = addItem('mouse', ev.t, [...mods, MOUSE_NAMES[ev.button] || T('클릭')], mods[0] || 'Click');
      press = { x: ev.x, y: ev.y, item, mods, drag: false };
    } else if (ev.type === 'mm' && press && !press.drag && press.x !== null && press.x !== undefined) {
      // Holding the button and moving far enough turns the click into a drag.
      if (Math.hypot(ev.x - press.x, ev.y - press.y) > 0.03) {
        press.drag = true;
        if (press.item && press.item.count === 1) {
          press.item.keys = [...press.mods, DRAG_LABEL];
        } else if (press.item) {
          press.item.count -= 1;
          addItem('mouse', ev.t, [...press.mods, DRAG_LABEL], press.mods[0] || 'Drag');
        } else {
          addItem('mouse', ev.t, [...press.mods, DRAG_LABEL], press.mods[0] || 'Drag');
        }      }
    } else if (ev.type === 'mu') {
      press = null;
    } else if (ev.type === 'wh' && opts.showMouse) {
      const mods = MOD_ORDER.filter((m) => held.has(m));
      for (const m of mods) held.get(m).used = true;
      addItem('mouse', ev.t, [...mods, (ev.rotation || 0) > 0 ? T('휠 ↓') : T('휠 ↑')], mods[0] || 'Wheel');
    }
  }
  return groups;
}

/** Groups visible at time t, oldest first, each with an opacity. */
export function visibleGroups(groups, t, opts = KEY_DEFAULTS) {
  const hold = opts.hold ?? 1.4;
  const anim = opts.anim || 'fade';
  const fade = anim === 'none' ? 0.001 : Math.max(0.05, opts.animDur ?? 0.3);
  const out = [];
  // Binary search for the last group that started before t.
  let lo = 0;
  let hi = groups.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (groups[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  for (let i = idx; i >= 0 && out.length < (opts.maxGroups || 3); i--) {
    const g = groups[i];
    const until = g.end + hold;
    if (t > until + fade) {
      if (t - g.end > 30) break;
      continue;
    }
    const items = g.items.filter((it) => it.t <= t + 1e-6);
    if (!items.length) continue;
    // How far the bubble is into appearing (0..1) and into leaving (0..1).
    const enter = Math.min(1, (t - g.start) / fade);
    const leave = t > until ? Math.min(1, (t - until) / fade) : 0;
    let alpha = anim === 'none' ? 1 : Math.min(1, enter + 0.2) * (1 - leave);
    // Older groups dim when newer ones appear.
    alpha *= out.length === 0 ? 1 : 0.55 / out.length;
    out.push({ group: g, items, alpha: Math.max(0, Math.min(1, alpha)), enter, leave });
  }
  return out.reverse();
}

export function comboLabel(item) {
  return item.keys.join(' + ') + (item.count > 1 ? ` ×${item.count}` : '');
}
