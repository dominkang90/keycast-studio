// Interface language. Korean text in the code is the key; other languages map it to their own
// text in src/i18n/<lang>.js. Missing entries fall back to the Korean text, so a half-finished
// translation still works. See CONTRIBUTING.md ("Translating the app").
import en from '../i18n/en.js';

const TABLES = { en };
export const LANGS = [{ id: 'ko', name: '한국어' }, { id: 'en', name: 'English' }];

function detect() {
  // Outside a page (unit tests, workers) the source language is used.
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return 'ko';
  try {
    const saved = localStorage.getItem('keycast.lang');
    if (saved === 'ko' || TABLES[saved]) return saved;
  } catch { /* storage blocked */ }
  return /^ko\b/i.test(navigator.language || '') ? 'ko' : 'en';
}

export const lang = detect();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

/**
 * Translate text. {0}, {1} … are replaced by the extra arguments.
 * @example T('자막 {0}개', 3) // "3 subtitles" in English
 */
export function T(text, ...args) {
  const table = TABLES[lang];
  let out = (table && table[text]) || text;
  if (args.length) out = out.replace(/\{(\d+)\}/g, (m, i) => (i < args.length ? String(args[i]) : m));
  return out;
}

/** Remember the language; the page must reload to use it. */
export function setLang(id) {
  try { localStorage.setItem('keycast.lang', id); } catch { /* ignore */ }
}
