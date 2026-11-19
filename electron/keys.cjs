// Turns the global hook's key codes into the names shown on screen.
let codeToName = {};
try {
  const { UiohookKey } = require('uiohook-napi');
  for (const [name, code] of Object.entries(UiohookKey)) {
    if (!(code in codeToName)) codeToName[code] = name;
  }
} catch {
  codeToName = {};
}

const RENAME = {
  CtrlRight: 'Ctrl', AltRight: 'Alt', ShiftRight: 'Shift', MetaRight: 'Win', Meta: 'Win',
  Escape: 'Esc', Backspace: 'Backspace', Delete: 'Del', Insert: 'Ins', PageUp: 'PgUp', PageDown: 'PgDn',
  ArrowLeft: '←', ArrowUp: '↑', ArrowRight: '→', ArrowDown: '↓',
  NumpadArrowLeft: '←', NumpadArrowUp: '↑', NumpadArrowRight: '→', NumpadArrowDown: '↓',
  NumpadEnter: 'Enter', NumpadMultiply: 'Num *', NumpadAdd: 'Num +', NumpadSubtract: 'Num -',
  NumpadDecimal: 'Num .', NumpadDivide: 'Num /', NumpadHome: 'Home', NumpadEnd: 'End',
  NumpadPageUp: 'PgUp', NumpadPageDown: 'PgDn', NumpadInsert: 'Ins', NumpadDelete: 'Del',
  Semicolon: ';', Equal: '=', Comma: ',', Minus: '-', Period: '.', Slash: '/', Backquote: '`',
  BracketLeft: '[', Backslash: '\\', BracketRight: ']', Quote: "'", CapsLock: 'Caps Lock',
  PrintScreen: 'PrtSc', NumLock: 'Num Lock', ScrollLock: 'Scroll Lock',
};

// Korean keyboards: the Hangul/English and Hanja keys (scan codes vary by driver).
const EXTRA = { 114: '한/영', 113: '한자', 3698: '한/영', 3697: '한자', 112: 'Kana', 121: 'Convert', 123: 'NoConvert', 3677: 'Menu' };

const MODIFIER_NAMES = new Set(['Ctrl', 'Alt', 'Shift', 'Win']);

function labelForKey(code) {
  if (EXTRA[code]) return EXTRA[code];
  const raw = codeToName[code];
  if (!raw) return `Key ${code}`;
  if (RENAME[raw]) return RENAME[raw];
  if (/^Numpad\d$/.test(raw)) return `Num ${raw.slice(6)}`;
  return raw;
}

module.exports = { labelForKey, MODIFIER_NAMES };
