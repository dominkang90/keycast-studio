// Interface language. Korean text in the code is the key; other languages map it to their own
// text in src/i18n/<lang>.js. Missing entries fall back to the Korean text, so a half-finished
// translation still works. See CONTRIBUTING.md ("Translating the app").
import en from '../i18n/en.js';
import ja from '../i18n/ja.js';
import zhCN from '../i18n/zh-CN.js';
import zhTW from '../i18n/zh-TW.js';
import es from '../i18n/es.js';
import fr from '../i18n/fr.js';
import de from '../i18n/de.js';
import it from '../i18n/it.js';
import nl from '../i18n/nl.js';
import ptBR from '../i18n/pt-BR.js';
import ru from '../i18n/ru.js';

const TABLES = { en, ja, 'zh-CN': zhCN, 'zh-TW': zhTW, es, fr, de, it, nl, 'pt-BR': ptBR, ru };

/** The language menu, each name written in its own language. */
export const LANGS = [
  { id: 'ko', name: '한국어' }, { id: 'en', name: 'English' }, { id: 'ja', name: '日本語' },
  { id: 'zh-CN', name: '简体中文' }, { id: 'zh-TW', name: '繁體中文' }, { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' }, { id: 'de', name: 'Deutsch' }, { id: 'it', name: 'Italiano' },
  { id: 'nl', name: 'Nederlands' }, { id: 'pt-BR', name: 'Português (Brasil)' }, { id: 'ru', name: 'Русский' },
];

/** The interface language for a system language such as "zh-HK" or "pt-PT". */
export function matchLanguage(tag) {
  const t = String(tag || '').toLowerCase();
  if (t.startsWith('ko')) return 'ko';
  if (t.startsWith('zh')) return /^zh-(tw|hk|mo|hant)/.test(t) ? 'zh-TW' : 'zh-CN';
  if (t.startsWith('pt')) return 'pt-BR';
  const base = t.split('-')[0];
  return TABLES[base] ? base : 'en';
}

function detect() {
  // Outside a page (unit tests, workers) the source language is used.
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return 'ko';
  try {
    const saved = localStorage.getItem('keycast.lang');
    if (saved === 'ko' || TABLES[saved]) return saved;
  } catch { /* storage blocked */ }
  return matchLanguage(navigator.language);
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

export const LANGUAGE_TABLES = TABLES;
