// App state and the preferences kept in localStorage.

import { KEY_DEFAULTS } from '../lib/keys.js';
import { defaultSettings } from '../lib/compositor.js';
export const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(`keycast.${key}`)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(`keycast.${key}`, JSON.stringify(value)); },
};

export const state = {
  info: null,
  sources: [],
  sourceKind: 'screen',
  sourceId: null,
  mics: [],
  cams: [],
  options: store.get('options', { micId: 'default', systemAudio: true, webcamId: '', liveOverlay: true, countdown: true, recordTyping: false }),
  recorder: null,
  editor: null,
};

// ------------------------------------------------------------------ saved preferences
export const DEFAULT_SHORTCUTS = { stop: 'Alt+Shift+S', pause: 'Alt+Shift+P', keys: 'Alt+Shift+K' };
export function shortcuts() { return { ...DEFAULT_SHORTCUTS, ...store.get('shortcuts', {}) }; }

/** The look used last time (new recordings start from it). */
export function savedLook() {
  const d = defaultSettings();
  const saved = store.get('look', {});
  // v1.1 made "shortcuts only" the default: move earlier settings over once.
  if (!store.get('shortcutsDefault', false)) {
    if (saved.keys) delete saved.keys.mode;
    store.set('look', saved);
    store.set('shortcutsDefault', true);
  }
  for (const k of Object.keys(d)) Object.assign(d[k], saved[k] || {});
  d.keys.custom = { ...KEY_DEFAULTS.custom, ...(saved.keys?.custom || {}) };
  return d;
}

export function saveOptions() { store.set('options', state.options); }
export function liveOverlaySettings() {
  const look = savedLook();
  return { ...look.keys, mouse: { clicks: look.cursor.clicks, effect: look.cursor.effect, scrolls: look.cursor.scrolls !== false, highlight: look.cursor.highlight, color: look.cursor.color, clickSize: look.cursor.clickSize, clickDur: look.cursor.clickDur } };
}
