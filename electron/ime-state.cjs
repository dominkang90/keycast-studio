// Whether the window being typed into has the Korean IME in Hangul mode, asked at each key press so
// the key overlay can show 안녕 instead of D K S S U D. Windows only, through koffi (no compiler
// needed): the foreground window's keyboard layout must be Korean (0x412) and its IME open in
// native (Hangul) conversion mode. Anywhere else it answers null and letters stay letters.
let api;

const WM_IME_CONTROL = 0x283;
const IMC_GETCONVERSIONMODE = 0x1;
const IMC_GETOPENSTATUS = 0x5;
const IME_CMODE_NATIVE = 0x1;
const SMTO_ABORTIFHUNG = 0x2;
const LANG_KOREAN = 0x412;

function load() {
  if (api !== undefined) return api;
  api = null;
  if (process.platform !== 'win32') return api;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const imm32 = koffi.load('imm32.dll');
    const GetForegroundWindow = user32.func('uintptr_t __stdcall GetForegroundWindow()');
    const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(uintptr_t hWnd, void *lpdwProcessId)');
    const GetKeyboardLayout = user32.func('uintptr_t __stdcall GetKeyboardLayout(uint32_t idThread)');
    const SendMessageTimeoutW = user32.func('intptr_t __stdcall SendMessageTimeoutW(uintptr_t hWnd, uint32_t Msg, uintptr_t wParam, intptr_t lParam, uint32_t fuFlags, uint32_t uTimeout, _Out_ uintptr_t *lpdwResult)');
    const ImmGetDefaultIMEWnd = imm32.func('uintptr_t __stdcall ImmGetDefaultIMEWnd(uintptr_t hWnd)');
    const ask = (wnd, what) => {
      const out = [0];
      if (!SendMessageTimeoutW(wnd, WM_IME_CONTROL, what, 0, SMTO_ABORTIFHUNG, 40, out)) return null;
      return Number(out[0]);
    };
    api = {
      /** true in Hangul mode, false in English mode or another layout, null when it cannot tell. */
      hangul(hwnd = GetForegroundWindow()) {
        if (!hwnd) return null;
        const layout = Number(BigInt(GetKeyboardLayout(GetWindowThreadProcessId(hwnd, null))) & 0xffffn);
        if (layout !== LANG_KOREAN) return false;
        const ime = ImmGetDefaultIMEWnd(hwnd);
        if (!ime) return null;
        const open = ask(ime, IMC_GETOPENSTATUS);
        const mode = ask(ime, IMC_GETCONVERSIONMODE);
        if (open === null || mode === null) return null;
        return !!open && (mode & IME_CMODE_NATIVE) !== 0;
      },
    };
  } catch (err) {
    console.error('IME state unavailable:', err.message);
    api = null;
  }
  return api;
}

/** Hangul mode of the foreground window: true, false, or null when unknown. */
function hangul(hwnd) {
  const a = load();
  if (!a) return null;
  try { return a.hangul(hwnd); } catch { return null; }
}

module.exports = { hangul, available: () => !!load() };
