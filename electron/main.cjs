// KeyCast Studio — main process.
// Owns windows, screen-source selection, the global keyboard/mouse hook and file storage.
const {
  app, BrowserWindow, ipcMain, desktopCapturer, screen, session, protocol,
  dialog, shell, globalShortcut, Menu, systemPreferences, Tray, nativeImage, net,
} = require('electron');

const MAC = process.platform === 'darwin';
/** macOS asks before an app may read every key (Accessibility) and see the screen (Screen Recording). */
function macAccess(prompt = false) {
  if (!MAC) return { accessibility: true, screen: 'granted' };
  return {
    accessibility: systemPreferences.isTrustedAccessibilityClient(prompt),
    screen: systemPreferences.getMediaAccessStatus('screen'),
  };
}
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { Readable } = require('stream');
const { patchWebmDuration } = require('./webm.cjs');
const { labelForKey, MODIFIER_NAMES } = require('./keys.cjs');
const capture = require('./capture.cjs');
const cursorType = require('./cursor-type.cjs');
const imeState = require('./ime-state.cjs');

let uIOhook = null;
try {
  ({ uIOhook } = require('uiohook-napi'));
} catch (err) {
  console.error('Global input hook unavailable:', err);
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

const UI_ROOT = path.join(__dirname, '..', 'dist');
const UI_ORIGIN = 'app://local';
let MEDIA_ROOT = '';

// ---------------------------------------------------------------- portable mode
// The portable exe (and any copy with a "KeyCast Data" folder beside it) keeps its settings,
// recordings and saved videos in that folder, so the app can live on a USB stick.
const PORTABLE_FOLDER = 'KeyCast Data';
const DEFAULT_USER_DATA = app.getPath('userData');
const PORTABLE = (() => {
  if (process.env.KEYCAST_MEDIA_ROOT && !process.env.KEYCAST_PORTABLE_DIR) return null; // test runs keep their own folder
  const base = process.env.KEYCAST_PORTABLE_DIR || process.env.PORTABLE_EXECUTABLE_DIR
    || (process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE) : (MAC || !app.isPackaged ? null : path.dirname(process.execPath)));
  if (!base) return null;
  const root = path.join(base, PORTABLE_FOLDER);
  const made = !fs.existsSync(root);
  // Only the portable exe makes the folder; other builds use it when someone put it there.
  if (made && !process.env.PORTABLE_EXECUTABLE_DIR && !process.env.KEYCAST_PORTABLE_DIR) return null;
  try {
    fs.mkdirSync(path.join(root, 'Settings'), { recursive: true });
    fs.accessSync(root, fs.constants.W_OK);
  } catch {
    return null; // a read-only place (a CD, a locked folder): fall back to the usual folders
  }
  return { root, made, settings: path.join(root, 'Settings'), recordings: path.join(root, 'Recordings'), exports: path.join(root, 'Exports') };
})();
if (PORTABLE) {
  // First start of a new portable folder: bring over the settings made before (before the page opens them).
  if (PORTABLE.made) {
    try { fs.cpSync(path.join(DEFAULT_USER_DATA, 'Local Storage'), path.join(PORTABLE.settings, 'Local Storage'), { recursive: true }); } catch { /* none yet */ }
  }
  app.setPath('userData', PORTABLE.settings);
  app.setPath('sessionData', PORTABLE.settings);
}

/** Recordings made before, in the usual folder, when this copy keeps its own elsewhere. */
function oldRecordingsDir() {
  if (!PORTABLE) return null;
  const dir = path.join(app.getPath('videos'), 'KeyCast Studio');
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).some((e) => e.isDirectory() && !e.name.startsWith('_') && fs.existsSync(path.join(dir, e.name, 'project.json'))) ? dir : null;
  } catch { return null; }
}

/** Where videos are saved: the portable folder, else the system's Videos folder. */
function exportsDir() {
  return PORTABLE ? PORTABLE.exports : app.getPath('videos');
}

let studio = null;
let toolbar = null;
let overlay = null;

// ---------------------------------------------------------------- serving files
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mkv': 'video/x-matroska', '.mov': 'video/quicktime',
  '.srt': 'text/plain; charset=utf-8', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac',
};
const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

function inside(root, target) {
  const rel = path.relative(root, target);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function serveFile(file, request) {
  let stat;
  try {
    stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', ...ISOLATION };
  const range = request.headers.get('range');
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = 0;
    let end = stat.size - 1;
    if (m) {
      if (m[1]) start = Number(m[1]);
      if (m[2]) end = Number(m[2]);
      if (!m[1] && m[2]) { start = Math.max(0, stat.size - Number(m[2])); end = stat.size - 1; }
    }
    end = Math.min(end, stat.size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    status: 200,
    headers: { ...headers, 'Content-Length': String(stat.size) },
  });
}

function registerProtocol() {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith('/media/')) {
      const file = path.resolve(MEDIA_ROOT, pathname.slice('/media/'.length));
      if (!inside(MEDIA_ROOT, file)) return new Response('Forbidden', { status: 403 });
      return serveFile(file, request);
    }
    let rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(UI_ROOT, rel);
    if (!inside(UI_ROOT, file)) return new Response('Forbidden', { status: 403 });
    return serveFile(file, request);
  });
}

// ---------------------------------------------------------------- windows
function createStudio() {
  studio = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#141415',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    title: 'KeyCast Studio',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  studio.once('ready-to-show', () => studio.show());
  if (process.env.KEYCAST_SMOKE) smokeTest(studio, process.env.KEYCAST_SMOKE);
  studio.loadURL(`${UI_ORIGIN}/index.html${SELFTEST ? '#selftest' : ''}`);
  if (SELFTEST) setupSelfTest(studio);
  studio.on('closed', () => {
    studio = null;
    stopKeysOnly();
    closeRecordingWindows();
  });
}

// ---------------------------------------------------------------- small start window
// The home screen can shrink to a small window that holds only "what to record" and the record
// button. The editor always opens full size; going home shrinks it again.
const COMPACT = { width: 380, height: 660 };
let compact = false;
let bigBounds = null;
function setCompact(on) {
  if (!studio || studio.isDestroyed() || on === compact) return compact;
  if (on) {
    if (studio.isMaximized()) studio.unmaximize();
    if (studio.isFullScreen()) studio.setFullScreen(false);
    bigBounds = studio.getBounds();
    studio.setMinimumSize(340, 480);
    const area = screen.getDisplayMatching(bigBounds).workArea;
    // Near the right edge of the screen it is on, like a small tool window.
    studio.setBounds({ x: area.x + area.width - COMPACT.width - 24, y: area.y + Math.max(24, Math.round((area.height - COMPACT.height) / 2)), ...COMPACT });
  } else {
    const b = bigBounds || { width: 1360, height: 860 };
    studio.setMinimumSize(1024, 640);
    if (bigBounds) studio.setBounds(b);
    else { studio.setSize(b.width, b.height); studio.center(); }
  }
  compact = on;
  drawTray();
  return compact;
}

// ---------------------------------------------------------------- tray icon
// Start a recording or show keys without finding the window first. Closing the window still quits.
let tray = null;
function createTray() {
  if (process.env.KEYCAST_SMOKE) return;
  try {
    let icon = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png'));
    icon = icon.resize(MAC ? { width: 18, height: 18 } : { width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('KeyCast Studio');
    tray.on('click', () => { if (!MAC) showStudio(); });
    drawTray();
  } catch (err) {
    console.error('Tray unavailable:', err);
    tray = null;
  }
}
function showStudio() {
  if (!studio || studio.isDestroyed()) return;
  if (studio.isMinimized()) studio.restore();
  studio.show();
  studio.focus();
}
// Quitting while recording: stop the recording first so its files are finished and saved,
// then quit once the recording is written (or after a while if that never happens).
let recordingActive = false;
let quitAfterRecording = false;
function quitWhenSaved() {
  if (quitAfterRecording && !recordingActive) setTimeout(() => app.quit(), 300);
}
function trayCommand(action) {
  showStudio();
  studio?.webContents.send('tray:command', action);
}
function drawTray() {
  if (!tray || tray.isDestroyed()) return;
  const t = trayText();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t.open, click: showStudio },
    { label: t.record, enabled: !input.running, click: () => trayCommand('record') },
    { label: keysOnly ? t.keysOff : t.keysOn, enabled: keysOnly || !input.running, click: () => trayCommand('keys') },
    { label: t.small, type: 'checkbox', checked: compact, click: () => trayCommand(compact ? 'big' : 'small') },
    { type: 'separator' },
    { label: t.quit, role: 'quit' },
  ]));
}
// The page sends its words for the menu (in the language picked there).
let trayWords = null;
function trayText() {
  return trayWords || { open: 'Open KeyCast Studio', record: 'Start recording', keysOn: 'Show keys on screen', keysOff: 'Hide keys', small: 'Small window', quit: 'Quit' };
}

function displayFor(displayId) {
  const displays = screen.getAllDisplays();
  return displays.find((d) => String(d.id) === String(displayId)) || screen.getPrimaryDisplay();
}

function openToolbar(display) {
  const width = 500;
  const height = 64;
  toolbar = new BrowserWindow({
    width, height,
    x: Math.round(display.workArea.x + display.workArea.width / 2 - width / 2),
    y: display.workArea.y + 16,
    frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: false,
    transparent: true, hasShadow: false, title: 'KeyCast — Recording',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true },
  });
  toolbar.setAlwaysOnTop(true, 'screen-saver');
  toolbar.setContentProtection(true); // keep the controls out of the recording
  toolbar.loadURL(`${UI_ORIGIN}/toolbar.html`);
  toolbar.webContents.once('did-finish-load', () => sendKeysVisible());
  toolbar.on('closed', () => { toolbar = null; });
}

// ---------------------------------------------------------------- live key display while recording
// Shown only to the person recording (kept out of the file); it can be switched on and off at any time.
let liveKeys = { display: null, settings: null, visible: false, accel: 'Alt+Shift+K' };

function sendKeysVisible() {
  if (toolbar && !toolbar.isDestroyed()) toolbar.webContents.send('keys:visible', liveKeys.visible, liveKeys.accel);
}

/** Pauses or resumes recording key presses (for typing a password while recording). */
function toggleKeyRecording() {
  if (!input.running) return;
  input.keysPaused = !input.keysPaused;
  if (toolbar && !toolbar.isDestroyed()) toolbar.webContents.send('keys:recording', !input.keysPaused);
}

function toggleLiveKeys() {
  if (!liveKeys.display) return;
  liveKeys.visible = !liveKeys.visible;
  if (liveKeys.visible) {
    if (overlay && !overlay.isDestroyed()) overlay.showInactive();
    else openOverlay(liveKeys.display, liveKeys.settings);
  } else if (overlay && !overlay.isDestroyed()) {
    overlay.hide();
  }
  sendKeysVisible();
}

function openOverlay(display, settings, protect = true) {
  const area = display.bounds;
  overlay = new BrowserWindow({
    x: area.x, y: area.y, width: area.width, height: area.height,
    frame: false, transparent: true, resizable: false, movable: false, focusable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true },
  });
  overlay.setIgnoreMouseEvents(true);
  overlay.setAlwaysOnTop(true, 'screen-saver');
  // While recording here the editor adds keys to the video itself, so the live ones stay out of it.
  // In keys-only mode other recorders and screen sharing are meant to see them.
  overlay.setContentProtection(protect);
  overlay.loadURL(`${UI_ORIGIN}/overlay.html#${encodeURIComponent(JSON.stringify(settings || {}))}`);
  overlay.on('closed', () => { overlay = null; });
}

function closeRecordingWindows() {
  if (toolbar && !toolbar.isDestroyed()) toolbar.close();
  if (overlay && !overlay.isDestroyed()) overlay.close();
  toolbar = null;
  overlay = null;
}

// ---------------------------------------------------------------- capture source
let pendingCapture = { sourceId: null, systemAudio: false };

function setupDisplayMedia() {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(true));
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const source = sources.find((s) => s.id === pendingCapture.sourceId) || sources[0];
      const answer = { video: source };
      if (pendingCapture.systemAudio && process.platform === 'win32') answer.audio = 'loopback';
      callback(answer);
    } catch (err) {
      console.error(err);
      callback({});
    }
  });
}

// ---------------------------------------------------------------- input hook
const input = {
  running: false,
  events: [],
  display: null,
  isScreen: false,
  down: new Set(),
  lastMove: 0,
  // "Pause key recording" from the recording bar: key presses are left out until it is turned back on.
  keysPaused: false,
};

function cursorPoint() {
  const p = screen.getCursorScreenPoint();
  const d = input.display;
  if (!d || !input.isScreen) return { x: null, y: null };
  const b = d.bounds;
  return { x: (p.x - b.x) / b.width, y: (p.y - b.y) / b.height };
}

function overToolbar() {
  if (!toolbar || toolbar.isDestroyed()) return false;
  const p = screen.getCursorScreenPoint();
  const b = toolbar.getBounds();
  return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
}

function pushEvent(ev) {
  if (!input.running) return;
  // Paused key recording keeps no key at all, only the release of Ctrl, Alt, Shift or Win so a
  // modifier held when the pause began is not left pressed in the recording.
  if (input.keysPaused && (ev.type === 'kd' || (ev.type === 'ku' && !MODIFIER_NAMES.has(ev.name)))) return;
  // Clicks on the recording controls are not part of what is being shown.
  if ((ev.type === 'md' || ev.type === 'mu') && overToolbar()) return;
  if (!keysOnly) input.events.push(ev);
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send('live:input', ev);
  }
}

function mods(e) {
  return { ctrl: !!e.ctrlKey, alt: !!e.altKey, shift: !!e.shiftKey, meta: !!e.metaKey };
}

function attachHook() {
  if (!uIOhook || attachHook.done) return;
  attachHook.done = true;
  uIOhook.on('keydown', (e) => {
    const repeat = input.down.has(e.keycode);
    input.down.add(e.keycode);
    const name = labelForKey(e.keycode);
    const ev = { t: Date.now(), type: 'kd', code: e.keycode, name, repeat, mods: mods(e), modifier: MODIFIER_NAMES.has(name) };
    // A letter typed while the Korean IME is in Hangul mode: the editor shows it as Hangul.
    if (!repeat && name.length === 1 && /[A-Z]/.test(name) && !e.ctrlKey && !e.altKey && !e.metaKey && !input.keysPaused && input.running && imeState.hangul() === true) ev.hangul = true;
    pushEvent(ev);
  });
  uIOhook.on('keyup', (e) => {
    input.down.delete(e.keycode);
    pushEvent({ t: Date.now(), type: 'ku', code: e.keycode, name: labelForKey(e.keycode) });
  });
  uIOhook.on('mousedown', (e) => {
    const p = cursorPoint();
    pushEvent({ t: Date.now(), type: 'md', button: e.button, x: p.x, y: p.y, mods: mods(e) });
  });
  uIOhook.on('mouseup', (e) => {
    const p = cursorPoint();
    pushEvent({ t: Date.now(), type: 'mu', button: e.button, x: p.x, y: p.y });
  });
  uIOhook.on('mousemove', () => {
    const now = Date.now();
    if (now - input.lastMove < 16) return;
    input.lastMove = now;
    const p = cursorPoint();
    if (p.x === null) return;
    pushEvent({ t: now, type: 'mm', x: p.x, y: p.y });
  });
  uIOhook.on('wheel', (e) => {
    const p = cursorPoint();
    pushEvent({ t: Date.now(), type: 'wh', x: p.x, y: p.y, rotation: e.rotation, direction: e.direction });
  });
}

function startInput(display, isScreen) {
  input.events = [];
  input.down.clear();
  input.display = display;
  input.isScreen = isScreen;
  input.running = true;
  input.keysPaused = false;
  // The kind of pointer (arrow, hand, text…) so the editor can draw the matching shape.
  cursorType.watch((cursor) => pushEvent({ t: Date.now(), type: 'ct', cursor }));
  if (!uIOhook) return false;
  // Without Accessibility permission the hook cannot start on macOS; ask, and record without keys.
  if (MAC && !macAccess(true).accessibility) return false;
  attachHook();
  try {
    uIOhook.start();
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

function stopInput() {
  input.running = false;
  cursorType.stop();
  if (uIOhook) {
    try { uIOhook.stop(); } catch { /* already stopped */ }
  }
  const events = input.events;
  input.events = [];
  return events;
}

let keysOnly = false;
let keysOnlyAccel = null;
function stopKeysOnly() {
  if (!keysOnly) return;
  keysOnly = false;
  stopInput();
  if (keysOnlyAccel) { try { globalShortcut.unregister(keysOnlyAccel); } catch { /* not held */ } keysOnlyAccel = null; }
  if (overlay && !overlay.isDestroyed()) overlay.close();
  overlay = null;
  if (studio && !studio.isDestroyed()) studio.webContents.send('keys:state', false);
  drawTray();
}

const ACCEL_NAMES = { Control: 'Ctrl', CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl', Super: 'Win', Meta: 'Win', Command: 'Win' };
function dropShortcutEvents(accel) {
  const names = new Set(String(accel).split('+').map((k) => ACCEL_NAMES[k] || k));
  // The app's own shortcuts are pressed on purpose; leave that one press out of the video.
  // Only the latest press of each key is removed, so a shortcut being shown just before stays.
  const cutoff = Date.now() - 1500;
  const drop = new Set();
  for (const name of names) {
    let lastDown = -1;
    input.events.forEach((ev, i) => { if (ev.t >= cutoff && ev.type === 'kd' && ev.name === name) lastDown = i; });
    if (lastDown < 0) continue;
    // that press, its auto-repeats and its release
    input.events.forEach((ev, i) => { if (i >= lastDown && ev.name === name && (ev.type === 'kd' || ev.type === 'ku')) drop.add(i); });
  }
  input.events = input.events.filter((_ev, i) => !drop.has(i));
}

// Held only while recording, so other programs keep these keys the rest of the time.
let heldShortcuts = [];
function unregisterShortcuts() {
  for (const a of heldShortcuts) { try { globalShortcut.unregister(a); } catch { /* not held */ } }
  heldShortcuts = [];
}

/** Returns which of the two shortcuts could be taken (another program may already hold one). */
function registerShortcuts(sc = {}) {
  unregisterShortcuts();
  const result = {};
  for (const [command, fallback, key] of [['stop', 'Alt+Shift+S', 'stop'], ['toggle-pause', 'Alt+Shift+P', 'pause'], ['toggle-keys', 'Alt+Shift+K', 'keys'], ['toggle-keyrec', 'Alt+Shift+L', 'keyRec']]) {
    const accel = sc[key] || fallback;
    let ok = false;
    try {
      ok = globalShortcut.register(accel, () => {
        dropShortcutEvents(accel);
        if (command === 'toggle-keys') toggleLiveKeys();
        else if (command === 'toggle-keyrec') toggleKeyRecording();
        else studio?.webContents.send('recorder:command', command);
      });
    } catch { ok = false; }
    if (ok) heldShortcuts.push(accel);
    result[key] = ok;
  }
  return result;
}

async function newProjectDir() {
  const stamp = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  let id = `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}_${pad(stamp.getHours())}-${pad(stamp.getMinutes())}-${pad(stamp.getSeconds())}`;
  let n = 1;
  while (fs.existsSync(path.join(MEDIA_ROOT, id))) id = `${id}_${n++}`;
  await fsp.mkdir(path.join(MEDIA_ROOT, id), { recursive: true });
  return id;
}

const IMPORT_TYPES = {
  video: { name: 'Video', extensions: ['mp4', 'webm', 'mkv', 'mov', 'm4v'] },
  image: { name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
  audio: { name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'webm'] },
};
async function pickFile(kind) {
  // The scripted self-test names its files instead of using the file window.
  const preset = (process.env.KEYCAST_SELFTEST || process.env.KEYCAST_MEDIA_ROOT) && process.env[`KEYCAST_PICK_${String(kind).toUpperCase()}`];
  if (preset) return preset;
  const r = await dialog.showOpenDialog(studio, { properties: ['openFile'], filters: [IMPORT_TYPES[kind] || IMPORT_TYPES.video] });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
}

// ---------------------------------------------------------------- storage
const writers = new Map();
let writerSeq = 1;

function projectDir(id) {
  const dir = path.resolve(MEDIA_ROOT, id);
  if (!inside(MEDIA_ROOT, dir)) throw new Error('Bad project id');
  return dir;
}

function safeName(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

// ---------------------------------------------------------------- ipc
function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    mediaRoot: MEDIA_ROOT,
    inputHook: !!uIOhook,
    ffmpeg: !!capture.ffmpegPath(),
    captureBackend: capture.backend(),
    // Electron records the computer's sound ("loopback") on Windows only.
    systemAudio: process.platform === 'win32',
    // Linux under Wayland: keys and pointer come only from apps running through XWayland.
    wayland: process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland',
    access: macAccess(),
    portable: PORTABLE ? { root: PORTABLE.root, oldRecordings: oldRecordingsDir() } : null,
    tray: !!tray && !tray.isDestroyed(),
  }));

  // Screen capture through ffmpeg, which can leave the mouse pointer out of the picture.
  ipcMain.handle('capture:start', (_e, opts) => {
    const displays = screen.getAllDisplays();
    const index = Math.max(0, displays.findIndex((d) => String(d.id) === String(opts.displayId)));
    const d = displays[index];
    // Bounds in real pixels: how wgc-capture finds the monitor when the id does not match.
    const px = (v) => Math.round(v * d.scaleFactor);
    const display = { id: d.id, bounds: { displayX: px(d.bounds.x), displayY: px(d.bounds.y), displayW: px(d.bounds.width), displayH: px(d.bounds.height) } };
    return capture.start({ file: path.join(projectDir(opts.projectId), safeName(opts.name)), index, display, fps: opts.fps || 60 });
  });
  ipcMain.handle('capture:stop', () => capture.stop());
  ipcMain.handle('capture:abort', () => capture.abort());
  ipcMain.handle('capture:finish', (_e, opts) => capture.finish(projectDir(opts.projectId), opts.segments.map((s) => ({ ...s, video: safeName(s.video), audio: s.audio ? safeName(s.audio) : null, voice: s.voice ? safeName(s.voice) : null, cam: s.cam ? safeName(s.cam) : null }))));

  ipcMain.handle('sources:list', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 400, height: 225 },
      fetchWindowIcons: true,
    });
    const displays = screen.getAllDisplays();
    return sources
      .filter((s) => !/KeyCast/.test(s.name))
      .map((s) => {
        const d = displays.find((x) => String(x.id) === String(s.display_id));
        return {
          id: s.id,
          name: s.name,
          kind: s.id.startsWith('screen') ? 'screen' : 'window',
          displayId: s.display_id || null,
          thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
          icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
          size: d ? { width: Math.round(d.bounds.width * d.scaleFactor), height: Math.round(d.bounds.height * d.scaleFactor) } : null,
        };
      });
  });

  ipcMain.handle('capture:prepare', (_e, opts) => {
    pendingCapture = { sourceId: opts.sourceId, systemAudio: !!opts.systemAudio };
    return true;
  });

  ipcMain.handle('recording:begin', (_e, opts) => {
    recordingActive = true;
    const display = displayFor(opts.displayId);
    const isScreen = opts.kind === 'screen';
    stopKeysOnly();
    const hooked = startInput(display, isScreen);
    const shortcuts = registerShortcuts(opts.shortcuts);
    if (studio) studio.hide();
    openToolbar(display);
    liveKeys = { display, settings: opts.overlay, visible: !!opts.liveOverlay, accel: opts.shortcuts?.keys || 'Alt+Shift+K' };
    if (opts.liveOverlay) openOverlay(display, opts.overlay);
    drawTray();
    return { hooked, shortcuts, display: { width: display.bounds.width, height: display.bounds.height, scaleFactor: display.scaleFactor } };
  });

  ipcMain.handle('recording:end', () => {
    recordingActive = false;
    // The recording failed to save: nothing more will come, so quit soon anyway.
    if (quitAfterRecording) setTimeout(() => app.quit(), 8000);
    const events = stopInput();
    unregisterShortcuts();
    liveKeys = { display: null, settings: null, visible: false, accel: 'Alt+Shift+K' };
    closeRecordingWindows();
    if (studio) {
      studio.show();
      studio.focus();
    }
    drawTray();
    return events;
  });

  ipcMain.on('toolbar:action', (_e, action) => {
    if (action === 'toggle-keys') { toggleLiveKeys(); return; }
    if (action === 'toggle-keyrec') { toggleKeyRecording(); return; }
    studio?.webContents.send('recorder:command', action);
  });

  ipcMain.on('recorder:status', (_e, status) => {
    if (toolbar && !toolbar.isDestroyed()) toolbar.webContents.send('recorder:status', { ...status, keysPaused: input.keysPaused });
  });

  ipcMain.handle('project:create', () => newProjectDir());

  // Open a video made elsewhere: it is copied into a new project so the original stays untouched.
  ipcMain.handle('project:import', async () => {
    const src = await pickFile('video');
    if (!src) return null;
    const id = await newProjectDir();
    const file = `screen${path.extname(src).toLowerCase()}`;
    await fsp.copyFile(src, path.join(MEDIA_ROOT, id, file));
    return { id, file, label: path.basename(src), events: await pointerFileEvents(src) };
  });

  /**
   * Pointer movements, clicks and pointer kinds saved next to a recording by another recorder
   * (Recordly writes <video>.cursor.json), turned into KeyCast events. Empty when there is none.
   */
  async function pointerFileEvents(video) {
    let json;
    try { json = JSON.parse(await fsp.readFile(`${video}.cursor.json`, 'utf8')); } catch { return []; }
    const samples = Array.isArray(json?.samples) ? json.samples : [];
    const events = [];
    let kind = null;
    for (const s of samples) {
      const t = Number(s.timeMs) / 1000;
      const x = Number(s.cx);
      const y = Number(s.cy);
      if (!Number.isFinite(t) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      const at = { t: Math.round(t * 1000) / 1000, x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
      if (typeof s.cursorType === 'string' && s.cursorType !== kind) {
        kind = s.cursorType;
        events.push({ t: at.t, type: 'ct', cursor: kind });
      }
      if (s.interactionType === 'click') events.push({ ...at, type: 'md', button: 1 });
      else if (s.interactionType === 'mouseup') events.push({ ...at, type: 'mu', button: 1 });
      else events.push({ ...at, type: 'mm' });
    }
    return events;
  }

  // Copy a picture, sound or video chosen by the user into the project.
  ipcMain.handle('asset:import', async (_e, { projectId, kind, prefix }) => {
    const src = await pickFile(kind);
    if (!src) return null;
    const name = `${safeName(prefix || kind)}-${Date.now().toString(36)}${path.extname(src).toLowerCase()}`;
    await fsp.copyFile(src, path.join(projectDir(projectId), name));
    return { name, label: path.basename(src) };
  });

  // Extensions: data-only packs in <recordings>/_extensions/<folder>/extension.json.
  // The files are read here and checked again in the page (src/lib/extensions.js).
  const extDir = () => path.join(MEDIA_ROOT, '_extensions');
  ipcMain.handle('extensions:list', async () => {
    await fsp.mkdir(extDir(), { recursive: true });
    const out = [];
    for (const d of await fsp.readdir(extDir(), { withFileTypes: true })) {
      if (!d.isDirectory() || out.length >= 100) continue;
      const file = path.join(extDir(), d.name, 'extension.json');
      try {
        const stat = await fsp.stat(file);
        if (stat.size > 256 * 1024) { out.push({ folder: d.name, error: 'extension.json is larger than 256 KB' }); continue; }
        out.push({ folder: d.name, json: JSON.parse(await fsp.readFile(file, 'utf8')) });
      } catch (err) {
        out.push({ folder: d.name, error: err.code === 'ENOENT' ? 'no extension.json' : err.message });
      }
    }
    return out;
  });
  ipcMain.handle('extensions:open', async () => {
    await fsp.mkdir(extDir(), { recursive: true });
    return shell.openPath(extDir());
  });
  // Installs a pack (an official one, or one made in the extension maker) as
  // _extensions/<folder>/extension.json. The folder name is checked; only that file is written.
  ipcMain.handle('extensions:install', async (_e, folder, text) => {
    if (typeof folder !== 'string' || !/^[a-z0-9][a-z0-9-]{0,48}$/.test(folder)) throw new Error('bad extension folder name');
    if (typeof text !== 'string' || text.length > 256 * 1024) throw new Error('bad extension');
    JSON.parse(text);
    const dir = path.join(extDir(), folder);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, 'extension.json'), text);
    return true;
  });

  // Pictures dropped into the wallpapers folder show up as backgrounds.
  ipcMain.handle('wallpapers:list', async () => {
    const dir = path.join(MEDIA_ROOT, '_wallpapers');
    await fsp.mkdir(dir, { recursive: true });
    const names = await fsp.readdir(dir);
    return names.filter((n) => /\.(png|jpe?g|webp|bmp)$/i.test(n)).map((n) => `/_wallpapers/${n}`);
  });
  ipcMain.handle('wallpapers:open', async () => {
    const dir = path.join(MEDIA_ROOT, '_wallpapers');
    await fsp.mkdir(dir, { recursive: true });
    return shell.openPath(dir);
  });

  // Keys on screen without recording (like keyviz): for live demos, calls and other recorders.
  ipcMain.handle('keys:toggle', (_e, opts = {}) => {
    if (keysOnly) { stopKeysOnly(); return false; }
    if (input.running) return false;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    if (!startInput(display, true)) { input.running = false; return false; }
    keysOnly = true;
    openOverlay(display, opts.overlay, false);
    drawTray();
    if (opts.shortcut) {
      try { if (globalShortcut.register(opts.shortcut, stopKeysOnly)) keysOnlyAccel = opts.shortcut; } catch { /* taken */ }
    }
    return true;
  });
  ipcMain.handle('keys:state', () => keysOnly);

  ipcMain.handle('file:open', async (_e, { projectId, name, absolutePath }) => {
    const file = absolutePath || path.join(projectDir(projectId), safeName(name));
    const stream = fs.createWriteStream(file);
    await new Promise((resolve, reject) => { stream.once('open', resolve); stream.once('error', reject); });
    const handle = writerSeq++;
    const w = { stream, file, error: null };
    // A failed write (a full disk, a removed drive) must reach the page, not leave it waiting.
    stream.on('error', (err) => { w.error = err; });
    writers.set(handle, w);
    return handle;
  });

  ipcMain.handle('file:write', async (_e, handle, data) => {
    const w = writers.get(handle);
    if (!w) throw new Error('Writer closed');
    if (w.error || w.stream.destroyed) throw w.error || new Error('Writer closed');
    const buf = Buffer.from(data);
    if (!w.stream.write(buf)) {
      await new Promise((resolve, reject) => {
        const done = () => { w.stream.off('drain', done); w.stream.off('close', done); w.error ? reject(w.error) : resolve(); };
        w.stream.on('drain', done);
        w.stream.on('close', done);
      });
    }
    return buf.length;
  });

  ipcMain.handle('file:close', async (_e, handle, opts = {}) => {
    const w = writers.get(handle);
    if (!w) return null;
    writers.delete(handle);
    if (!w.error) await new Promise((r) => w.stream.end(r));
    if (w.error) throw w.error; // the file is incomplete: do not report it as saved
    if (opts.durationMs && /\.webm$/i.test(w.file)) {
      try { await patchWebmDuration(w.file, opts.durationMs); } catch (err) { console.warn('duration patch failed', err); }
    }
    return w.file;
  });

  ipcMain.handle('file:abort', async (_e, handle) => {
    const w = writers.get(handle);
    if (!w) return;
    writers.delete(handle);
    await new Promise((r) => w.stream.end(r));
    await fsp.rm(w.file, { force: true });
  });

  ipcMain.handle('project:save', async (_e, project) => {
    const dir = projectDir(project.id);
    await fsp.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, 'project.json.tmp');
    await fsp.writeFile(tmp, JSON.stringify(project));
    await fsp.rename(tmp, path.join(dir, 'project.json'));
    quitWhenSaved();
    return true;
  });

  ipcMain.handle('project:load', async (_e, id) => {
    const text = await fsp.readFile(path.join(projectDir(id), 'project.json'), 'utf8');
    // The folder is the project: a copied folder keeps the old id inside, and saving or deleting
    // with that id would touch the original.
    return { ...JSON.parse(text), id };
  });

  ipcMain.handle('project:list', async () => {
    let entries = [];
    try { entries = await fsp.readdir(MEDIA_ROOT, { withFileTypes: true }); } catch { return []; }
    const list = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      try {
        const p = JSON.parse(await fsp.readFile(path.join(MEDIA_ROOT, ent.name, 'project.json'), 'utf8'));
        list.push({ id: ent.name, name: p.name, createdAt: p.createdAt, durationMs: p.durationMs, source: p.source?.name, keyCount: (p.events || []).filter((e) => e.type === 'kd' && !e.repeat).length, subtitles: (p.subtitles || []).length });
      } catch { /* not a project */ }
    }
    list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return list;
  });

  ipcMain.handle('project:delete', async (_e, id) => {
    // A video that was just open may stay locked for a moment on Windows: keep trying briefly.
    await fsp.rm(projectDir(id), { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
    return true;
  });

  ipcMain.handle('dialog:save', async (_e, { defaultName, filters }) => {
    // scripted runs (KEYCAST_SAVE_DIR) save without the window
    if (process.env.KEYCAST_SAVE_DIR) return path.join(process.env.KEYCAST_SAVE_DIR, defaultName);
    const result = await dialog.showSaveDialog(studio, {
      defaultPath: path.join(exportsDir(), defaultName),
      filters,
    });
    return result.canceled ? null : result.filePath;
  });

  // One-click export: no dialog, the next free name in the Videos folder (a test run's own folder
  // when KEYCAST_SAVE_DIR or KEYCAST_MEDIA_ROOT is set).
  ipcMain.handle('export:quickPath', async (_e, defaultName) => {
    const dir = process.env.KEYCAST_SAVE_DIR || (process.env.KEYCAST_MEDIA_ROOT && !PORTABLE ? path.join(MEDIA_ROOT, '_exports') : exportsDir());
    await fsp.mkdir(dir, { recursive: true });
    const safe = path.basename(String(defaultName || 'KeyCast.mp4'));
    const ext = path.extname(safe);
    const stem = safe.slice(0, safe.length - ext.length);
    let file = path.join(dir, safe);
    for (let n = 2; fs.existsSync(file); n++) file = path.join(dir, `${stem} (${n})${ext}`);
    return file;
  });

  ipcMain.handle('file:writeText', async (_e, file, text) => {
    await fsp.writeFile(file, text, 'utf8');
    return file;
  });

  ipcMain.handle('shell:reveal', (_e, file) => {
    shell.showItemInFolder(file);
    return true;
  });

  ipcMain.handle('shell:openFolder', () => shell.openPath(MEDIA_ROOT));
  ipcMain.handle('shell:openOldRecordings', () => { const dir = oldRecordingsDir(); return dir ? shell.openPath(dir) : ''; });
  ipcMain.handle('window:compact', (_e, on) => setCompact(!!on));
  // New version notice: asks GitHub for the latest release (nothing about the user is sent) and
  // only tells; the person downloads it from the release page themself.
  ipcMain.handle('update:check', async () => {
    let latest = process.env.KEYCAST_FAKE_LATEST || '';
    if (!latest && (SELFTEST || process.env.KEYCAST_SMOKE)) return null;
    if (!latest) {
      try {
        const res = await net.fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KeyCast-Studio' }, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        latest = String((await res.json()).tag_name || '');
      } catch { return null; }
    }
    latest = latest.replace(/^v/, '');
    return newerThan(latest, app.getVersion()) ? { version: latest } : null;
  });
  ipcMain.handle('update:open', () => shell.openExternal(RELEASES_PAGE));
  ipcMain.on('tray:words', (_e, words) => {
    const keys = ['open', 'record', 'keysOn', 'keysOff', 'small', 'quit'];
    if (words && keys.every((k) => typeof words[k] === 'string' && words[k].length < 60)) { trayWords = Object.fromEntries(keys.map((k) => [k, words[k]])); drawTray(); }
  });
  // macOS: show the permission prompts, then open the matching page of System Settings.
  ipcMain.handle('access:ask', async () => {
    if (!MAC) return macAccess();
    const now = macAccess(true);
    if (now.screen !== 'granted') {
      try { await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }); } catch { /* prompt only */ }
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    } else if (!now.accessibility) {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    }
    return macAccess();
  });
  // The English user guide is the README on GitHub; the address is fixed here, not passed in.
  ipcMain.handle('shell:openHelp', () => shell.openExternal('https://github.com/dominkang90/keycast-studio#readme'));
}

// ---------------------------------------------------------------- new version notice
const RELEASES_API = 'https://api.github.com/repos/dominkang90/keycast-studio/releases/latest';
const RELEASES_PAGE = 'https://github.com/dominkang90/keycast-studio/releases/latest';
/** True when version a (like 2.6.1) is later than b. */
function newerThan(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10));
  const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10));
  if (pa.slice(0, 3).some((x) => !Number.isFinite(x))) return false;
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

// ---------------------------------------------------------------- self-test
// KEYCAST_SELFTEST=<folder> runs the scripted check in the renderer and writes its log there.
const SELFTEST = process.env.KEYCAST_SELFTEST || '';

function setupSelfTest(win) {
  fs.mkdirSync(SELFTEST, { recursive: true });
  const log = [];
  const finish = (code) => {
    fs.writeFileSync(path.join(SELFTEST, 'selftest.log'), log.join('\n'));
    app.exit(code);
  };
  ipcMain.handle('selftest:shot', async (_e, name) => {
    const target = name === 'toolbar' && toolbar && !toolbar.isDestroyed() ? toolbar : win;
    const img = await target.webContents.capturePage();
    fs.writeFileSync(path.join(SELFTEST, `${safeName(name)}.png`), img.toPNG());
    return true;
  });
  ipcMain.handle('selftest:path', (_e, name) => path.join(SELFTEST, safeName(name)));
  win.webContents.on('console-message', (_e, level, message) => {
    log.push(`[${level}] ${message}`);
    if (message.startsWith('SELFTEST_DONE')) setTimeout(() => finish(message.includes('FAIL') ? 1 : 0), 300);
  });
  win.webContents.on('render-process-gone', (_e, d) => { log.push(`renderer gone: ${d.reason}`); finish(2); });
  win.webContents.once('did-finish-load', () => {
    setTimeout(() => win.webContents.executeJavaScript('window.__keycastSelfTest && window.__keycastSelfTest()').catch((err) => log.push(`exec failed ${err}`)), 2500);
  });
  setTimeout(() => { log.push('timeout'); finish(3); }, 6 * 60 * 1000);
}

// ---------------------------------------------------------------- lifecycle
const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', showStudio);

  app.whenReady().then(async () => {
    // KEYCAST_MEDIA_ROOT points a test or demo run at its own folder instead of the user's recordings.
    const usual = path.join(app.getPath('videos'), 'KeyCast Studio');
    MEDIA_ROOT = PORTABLE ? PORTABLE.recordings : (process.env.KEYCAST_MEDIA_ROOT || usual);
    await fsp.mkdir(MEDIA_ROOT, { recursive: true });
    if (PORTABLE?.made) await fsp.cp(path.join(usual, '_extensions'), path.join(MEDIA_ROOT, '_extensions'), { recursive: true }).catch(() => {});
    // macOS needs the standard menus for Cmd+C, Cmd+V and Cmd+Q; elsewhere the window has none.
    Menu.setApplicationMenu(MAC ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
    registerProtocol();
    setupDisplayMedia();
    registerIpc();
    createStudio();
    createTray();
  });

  app.on('before-quit', (e) => {
    if (!recordingActive || !studio || studio.isDestroyed()) return;
    e.preventDefault();
    if (quitAfterRecording) return;
    quitAfterRecording = true;
    studio.webContents.send('recorder:command', 'stop');
    setTimeout(() => app.exit(0), 60000); // never keep the app from quitting for good
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    capture.abort();
    stopInput();
  });

  app.on('window-all-closed', () => app.quit());
}

/**
 * KEYCAST_SMOKE=<file>: start, check that the home screen drew and what this system offers, write
 * the result as JSON to <file> and quit (exit 0 when the page works). Used by the macOS and Linux
 * builds on GitHub Actions, where nothing can be recorded.
 */
function smokeTest(win, file) {
  const finish = (report, code) => {
    try { fs.writeFileSync(file, JSON.stringify(report, null, 2)); } catch { /* print only */ }
    console.log(`SMOKE ${JSON.stringify(report)}`);
    app.exit(code);
  };
  const timer = setTimeout(() => finish({ ok: false, error: 'timed out' }, 3), 60000);
  win.webContents.once('render-process-gone', (_e, d) => { clearTimeout(timer); finish({ ok: false, error: `renderer ${d.reason}` }, 2); });
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const page = await win.webContents.executeJavaScript(`({
          home: !!document.querySelector('.topbar') && !!document.querySelector('.home'),
          lang: document.documentElement.lang,
          title: document.title,
          buttons: document.querySelectorAll('button').length,
        })`);
        // Written before each step, so a crash still shows how far it got.
        try { fs.writeFileSync(file, JSON.stringify({ ok: false, stage: 'page drawn', page }, null, 2)); } catch { /* ignore */ }
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).then((s) => s.length, (e) => `error: ${e.message}`);
        clearTimeout(timer);
        finish({
          ok: page.home, version: app.getVersion(), platform: process.platform, arch: process.arch, page,
          inputHook: !!uIOhook, ffmpeg: capture.ffmpegPath(), captureBackend: capture.backend(), screens: sources, access: macAccess(),
        }, page.home ? 0 : 1);
      } catch (err) {
        clearTimeout(timer);
        finish({ ok: false, error: err.message }, 1);
      }
    }, 4000);
  });
}
