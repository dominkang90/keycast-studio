// App state and the preferences kept in localStorage.

import { KEY_DEFAULTS } from '../lib/keys.js';
import { defaultSettings } from '../lib/compositor.js';
import { platform } from '../lib/platform.js';
import { readExtension } from '../lib/extensions.js';
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

// ---------------------------------------------------------------- extensions
let extensionsCache = null;

/** Installed extensions (checked), each with `enabled`. Reloaded with `reload`. */
export async function loadExtensions(reload = false) {
  if (extensionsCache && !reload) return extensionsCache;
  const raw = await platform.listExtensions().catch(() => []);
  const off = new Set(store.get('extensionsOff', []));
  extensionsCache = raw.map((r) => (r.error
    ? { id: r.folder, name: r.folder, error: r.error, count: 0, enabled: false }
    : { ...readExtension(r.folder, r.json), enabled: !off.has(r.folder) }));
  return extensionsCache;
}

/** Items of one kind from every enabled extension, each with the extension's name. */
export function extensionItems(kind) {
  return (extensionsCache || []).filter((e) => e.enabled && !e.error).flatMap((e) => (e[kind] || []).map((item) => ({ ...item, from: e.name })));
}

export function setExtensionEnabled(id, on) {
  const off = new Set(store.get('extensionsOff', []));
  if (on) off.delete(id); else off.add(id);
  store.set('extensionsOff', [...off]);
  const e = (extensionsCache || []).find((x) => x.id === id);
  if (e) e.enabled = on;
}
