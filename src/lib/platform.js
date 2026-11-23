// One interface over the desktop app (Electron) and a plain browser tab.
// In a browser the recorder still works, but keys are only seen while this tab has focus
// and recordings live in memory until exported.

import { T } from './i18n.js';

const api = typeof window !== 'undefined' ? window.keycast : undefined;

export const isDesktop = !!api;

class MemoryWriter {
  constructor(name, type) {
    this.name = name;
    this.type = type;
    this.parts = [];
  }
  async write(buf) { this.parts.push(buf); }
  async close() {
    const blob = new Blob(this.parts, { type: this.type });
    this.parts = [];
    return URL.createObjectURL(blob);
  }
  async abort() { this.parts = []; }
}

class FileWriter {
  constructor(handle) { this.handle = handle; this.queue = Promise.resolve(); this.bytes = 0; }
  write(buf) {
    this.bytes += buf.byteLength;
    this.queue = this.queue.then(() => api.writeFile(this.handle, buf));
    return this.queue;
  }
  async close(opts) {
    await this.queue;
    return api.closeFile(this.handle, opts);
  }
  async abort() {
    await this.queue.catch(() => {});
    return api.abortFile(this.handle);
  }
}

const memoryProjects = new Map();
const memoryFiles = new Map();
let browserKeyListener = null;
let browserEvents = [];

function browserKeyName(e) {
  const map = { Control: 'Ctrl', Meta: 'Win', Escape: 'Esc', ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Delete: 'Del', PageUp: 'PgUp', PageDown: 'PgDn', Insert: 'Ins', CapsLock: 'Caps Lock', HangulMode: '한/영', HanjaMode: '한자' };
  if (map[e.key]) return map[e.key];
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

function pickBrowserFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] || null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** The key name the recorder uses for a key pressed inside this window. */
export function keyNameOf(e) { return browserKeyName(e); }

export const platform = {
  isDesktop,

  async info() {
    return isDesktop ? api.info() : { platform: 'browser', inputHook: false };
  },

  async listSources() {
    if (isDesktop) return api.listSources();
    return [{ id: 'browser', name: T('녹화할 화면은 시작할 때 고릅니다'), kind: 'screen', thumbnail: null }];
  },

  async getDisplayStream(source, { systemAudio }) {
    if (isDesktop) await api.prepareCapture({ sourceId: source.id, systemAudio });
    return navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 60, max: 60 } },
      audio: !!systemAudio,
    });
  },

  async beginRecording(opts) {
    if (isDesktop) return api.beginRecording(opts);
    browserEvents = [];
    const mods = (e) => ({ ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
    const down = new Set();
    browserKeyListener = (e) => {
      const name = browserKeyName(e);
      if (e.type === 'keydown') {
        browserEvents.push({ t: Date.now(), type: 'kd', name, repeat: e.repeat || down.has(e.code), mods: mods(e), modifier: ['Ctrl', 'Alt', 'Shift', 'Win'].includes(name) });
        down.add(e.code);
      } else {
        down.delete(e.code);
        browserEvents.push({ t: Date.now(), type: 'ku', name });
      }
    };
    window.addEventListener('keydown', browserKeyListener, true);
    window.addEventListener('keyup', browserKeyListener, true);
    return { hooked: false };
  },

  async endRecording() {
    if (isDesktop) return api.endRecording();
    window.removeEventListener('keydown', browserKeyListener, true);
    window.removeEventListener('keyup', browserKeyListener, true);
    const out = browserEvents;
    browserEvents = [];
    return out;
  },

  sendStatus(status) { if (isDesktop) api.sendStatus(status); },
  onCommand(fn) { return isDesktop ? api.onCommand(fn) : () => {}; },

  async createProject() {
    if (isDesktop) return api.createProject();
    return `browser-${Date.now()}`;
  },

  async openWriter(projectId, name, type) {
    if (isDesktop) return new FileWriter(await api.openFile({ projectId, name }));
    const w = new MemoryWriter(name, type);
    const close = w.close.bind(w);
    w.close = async () => {
      const url = await close();
      memoryFiles.set(`${projectId}/${name}`, url);
      return url;
    };
    return w;
  },

  mediaUrl(projectId, name) {
    if (!name) return null;
    // A name that starts with "/" lives in the recordings folder itself (shared wallpapers).
    if (name.startsWith('/')) return isDesktop ? `app://local/media${name.split('/').map(encodeURIComponent).join('/')}` : null;
    if (isDesktop) return `app://local/media/${encodeURIComponent(projectId)}/${encodeURIComponent(name)}`;
    return memoryFiles.get(`${projectId}/${name}`) || null;
  },

  /** Let the user pick a picture, sound or video and keep a copy with the project. */
  async importAsset(projectId, kind, prefix) {
    if (isDesktop) return api.importAsset({ projectId, kind, prefix });
    const file = await pickBrowserFile(`${kind}/*`);
    if (!file) return null;
    const name = `${prefix || kind}-${Date.now().toString(36)}-${file.name}`;
    memoryFiles.set(`${projectId}/${name}`, URL.createObjectURL(file));
    return { name, label: file.name };
  },

  /** Open a video made elsewhere as a new project. Returns {id, file, label} or null. */
  async importProject() {
    if (isDesktop) return api.importProject();
    const file = await pickBrowserFile('video/*');
    if (!file) return null;
    const id = `browser-${Date.now()}`;
    const name = `screen-${file.name}`;
    memoryFiles.set(`${id}/${name}`, URL.createObjectURL(file));
    return { id, file: name, label: file.name };
  },

  captureStart(opts) { return api.captureStart(opts); },
  captureStop() { return api.captureStop(); },
  captureAbort() { return isDesktop ? api.captureAbort() : null; },
  captureFinish(opts) { return api.captureFinish(opts); },

  async listWallpapers() { return isDesktop ? api.listWallpapers() : []; },
  openWallpapers() { if (isDesktop) api.openWallpapers(); },
  async toggleKeys(opts) { return isDesktop ? api.toggleKeys(opts) : false; },
  async keysState() { return isDesktop ? api.keysState() : false; },
  onKeysState(fn) { return isDesktop ? api.onKeysState(fn) : () => {}; },

  async saveProject(project) {
    if (isDesktop) return api.saveProject(project);
    memoryProjects.set(project.id, structuredClone(project));
    return true;
  },

  async loadProject(id) {
    if (isDesktop) return api.loadProject(id);
    return structuredClone(memoryProjects.get(id));
  },

  async listProjects() {
    if (isDesktop) return api.listProjects();
    return [...memoryProjects.values()].map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, durationMs: p.durationMs, source: p.source?.name, keyCount: p.events.filter((e) => e.type === 'kd' && !e.repeat).length, subtitles: p.subtitles.length })).reverse();
  },

  async deleteProject(id) {
    if (isDesktop) return api.deleteProject(id);
    memoryProjects.delete(id);
    return true;
  },

  /** Ask where to save; returns a writer or null when cancelled. */
  async exportWriter(defaultName, ext, type) {
    if (isDesktop) {
      const filters = [{ name: ext.toUpperCase(), extensions: [ext] }];
      const file = await api.saveDialog({ defaultName, filters });
      if (!file) return null;
      const writer = new FileWriter(await api.openFile({ absolutePath: file }));
      writer.path = file;
      return writer;
    }
    const w = new MemoryWriter(defaultName, type);
    const close = w.close.bind(w);
    w.close = async () => {
      const url = await close();
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultName;
      a.click();
      return defaultName;
    };
    w.path = defaultName;
    return w;
  },

  async writerForPath(absolutePath) {
    const writer = new FileWriter(await api.openFile({ absolutePath }));
    writer.path = absolutePath;
    return writer;
  },

  async saveText(defaultName, text, ext) {
    if (isDesktop) {
      const file = await api.saveDialog({ defaultName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
      if (!file) return null;
      return api.writeText(file, text);
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = defaultName;
    a.click();
    return defaultName;
  },

  reveal(file) { if (isDesktop && file) api.reveal(file); },
  openRecordingsFolder() { if (isDesktop) api.openRecordingsFolder(); },
};
