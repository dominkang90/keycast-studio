// Recording purposes: one choice sets the recording options (and a few looks of the new project)
// instead of seven separate switches. Changing a single option afterwards makes it "custom".
import { T } from '../lib/i18n.js';

export const PRESETS = [
  {
    id: 'tutorial', icon: '🎓', name: T('튜토리얼'), note: T('키·타이핑·클릭 확대'),
    options: { recordTyping: true, liveOverlay: true, hideCursor: true, countdown: true, systemAudio: false },
    look: (s) => { s.keys.enabled = true; s.keys.mode = 'all'; s.zoom.enabled = true; s.cursor.clicks = true; },
  },
  {
    id: 'demo', icon: '🚀', name: T('제품 데모'), note: T('단축키·부드러운 커서'),
    options: { recordTyping: false, liveOverlay: true, hideCursor: true, countdown: true, systemAudio: true },
    look: () => {}, // the app's usual look: shortcuts only, zoom on clicks
  },
  {
    id: 'plain', icon: '⏺', name: T('그냥 녹화'), note: T('화면과 소리만'),
    options: { recordTyping: false, liveOverlay: false, hideCursor: false, countdown: false, systemAudio: true },
    look: (s) => { s.keys.enabled = false; s.zoom.enabled = false; s.cursor.clicks = false; },
  },
];

/** The purpose whose options all match the current ones, or null when they were set by hand. */
export function presetOf(o) {
  return PRESETS.find((p) => Object.entries(p.options).every(([k, v]) => (k === 'hideCursor' ? (o[k] !== false) === v : !!o[k] === v))) || null;
}

/** Applies a purpose's looks to the settings of a new recording. */
export function applyPresetLook(settings, o) {
  const p = presetOf(o);
  if (p) p.look(settings);
  return settings;
}
