// Which kind of mouse pointer Windows is showing (arrow, hand, text, resize, …), so the editor can
// draw the matching shape from a cursor pack. Reads GetCursorInfo through koffi (no compiler
// needed); anywhere else, or if koffi is missing, it simply reports nothing.
let api;

function load() {
  if (api !== undefined) return api;
  api = null;
  if (process.platform !== 'win32') return api;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const POINT = koffi.struct('KC_POINT', { x: 'long', y: 'long' });
    const CURSORINFO = koffi.struct('KC_CURSORINFO', { cbSize: 'uint32', flags: 'uint32', hCursor: 'uintptr_t', ptScreenPos: POINT });
    const GetCursorInfo = user32.func('bool __stdcall GetCursorInfo(_Inout_ KC_CURSORINFO *pci)');
    const LoadCursorW = user32.func('uintptr_t __stdcall LoadCursorW(uintptr_t hInstance, uintptr_t lpCursorName)');
    // Windows' shared system pointers (IDC_* numbers) and the names used in projects.
    const ids = {
      32512: 'arrow', 32513: 'text', 32514: 'wait', 32515: 'crosshair', 32516: 'up-arrow',
      32642: 'resize-nwse', 32643: 'resize-nesw', 32644: 'resize-ew', 32645: 'resize-ns', 32646: 'move',
      32648: 'not-allowed', 32649: 'pointer', 32650: 'progress', 32651: 'help',
    };
    const byHandle = new Map();
    for (const [id, name] of Object.entries(ids)) {
      const h = LoadCursorW(0, Number(id));
      if (h) byHandle.set(String(h), name);
    }
    const info = { cbSize: koffi.sizeof(CURSORINFO), flags: 0, hCursor: 0, ptScreenPos: { x: 0, y: 0 } };
    api = {
      /** 'arrow', 'pointer', 'text', … ; 'hidden' when no pointer is shown; 'other' for app-drawn ones. */
      current() {
        info.cbSize = koffi.sizeof(CURSORINFO);
        if (!GetCursorInfo(info)) return null;
        if (!(info.flags & 1)) return 'hidden';
        return byHandle.get(String(info.hCursor)) || 'other';
      },
    };
  } catch (err) {
    console.error('cursor type unavailable:', err.message);
    api = null;
  }
  return api;
}

let timer = null;

/** Calls onChange(name) whenever the pointer kind changes, checking 30 times a second. */
function watch(onChange) {
  stop();
  const a = load();
  if (!a) return false;
  let last = null;
  const tick = () => {
    let now = null;
    try { now = a.current(); } catch { now = null; }
    if (now && now !== last) { last = now; onChange(now); }
  };
  tick();
  timer = setInterval(tick, 33);
  return true;
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { watch, stop, available: () => !!load() };
