// Shapes raw speech-recognition chunks into readable subtitles:
// drops silence and typical hallucinations, splits at sentence boundaries,
// keeps lines short enough to read, and gives each cue a sensible length.

import { newId } from './zoom.js';
import { T } from './i18n.js';

export const SUBTITLE_DEFAULTS = {
  enabled: true, size: 1, position: 'bottom', style: 'box',
  textColor: '#ffffff', highlight: '#ffd33d', bgOpacity: 0.68, anim: 'fade',
};

export const SUBTITLE_STYLES = [
  { id: 'box', name: T('상자') }, { id: 'outline', name: T('테두리') }, { id: 'yellow', name: T('노란 글씨') },
  { id: 'karaoke', name: T('노래방') }, { id: 'pop', name: T('강조 팝') }, { id: 'paper', name: T('종이') }, { id: 'minimal', name: T('미니멀') },
];

const HALLUCINATIONS = [
  /^(thank you|thanks) (for watching|so much)[.!]*$/i,
  /^please subscribe/i,
  /시청해\s*주셔서\s*감사합니다/,
  /구독(과|,)?\s*좋아요/,
  /^(MBC|KBS|SBS)\s*뉴스/,
  /^자막\s*(제작|by)/i,
  /^subtitles? by/i,
  /^\[?(음악|music|박수|웃음)\]?$/i,
  /^[.\s…]*$/,
  /^[[(（*♪].*[\])）*♪]$/, // sound descriptions such as (whistling) or [Music]
];

export function isCJK(text) {
  const cjk = (text.match(/[ㄱ-ㆎ가-힣぀-ヿ一-鿿]/g) || []).length;
  return cjk > text.replace(/\s/g, '').length * 0.3;
}

function rms(audio, sampleRate, start, end) {
  if (!audio) return 1;
  const a = Math.max(0, Math.floor(start * sampleRate));
  const b = Math.min(audio.length, Math.ceil(end * sampleRate));
  if (b <= a) return 0;
  let sum = 0;
  const step = Math.max(1, Math.floor((b - a) / 8000));
  let n = 0;
  for (let i = a; i < b; i += step) { sum += audio[i] * audio[i]; n++; }
  return Math.sqrt(sum / n);
}

function splitSentences(text) {
  const parts = text.match(/[^.!?。！？…]+[.!?。！？…]+["')\]]*\s*|[^.!?。！？…]+$/g);
  return (parts || [text]).map((s) => s.trim()).filter(Boolean);
}

/** Break text into pieces no longer than max characters, preferring commas, then spaces. */
function splitLong(text, max) {
  if (text.length <= max) return [text];
  const out = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max + 1);
    let cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('，'));
    if (cut < max * 0.4) cut = window.lastIndexOf(' ');
    if (cut < max * 0.4) cut = max;
    out.push(rest.slice(0, cut + (rest[cut] === ',' ? 1 : 0)).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export function lineLimit(text) {
  return isCJK(text) ? 20 : 42;
}

/** Wrap one cue into at most two balanced lines. */
export function wrapLines(text, max = lineLimit(text)) {
  if (text.length <= max) return [text];
  const mid = Math.floor(text.length / 2);
  let best = -1;
  for (let d = 0; d < mid; d++) {
    if (text[mid + d] === ' ') { best = mid + d; break; }
    if (text[mid - d] === ' ') { best = mid - d; break; }
  }
  if (best < 0) best = mid;
  return [text.slice(0, best).trim(), text.slice(best).trim()];
}

/**
 * @param {Array<{timestamp:[number, number|null], text:string}>} chunks
 * @param {{audio?:Float32Array, sampleRate?:number, duration?:number, offset?:number}} ctx
 */
export function shapeSubtitles(chunks, ctx = {}) {
  const sampleRate = ctx.sampleRate || 16000;
  const offset = ctx.offset || 0;
  const duration = ctx.duration || Infinity;

  // 1. clean and time-fix raw chunks
  let raw = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const text = (c.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    let [start, end] = c.timestamp || [0, null];
    if (start === null || start === undefined) continue;
    if (end === null || end === undefined || end <= start) {
      const next = chunks[i + 1]?.timestamp?.[0];
      end = next && next > start ? next : start + Math.max(1, text.length * 0.09);
    }
    raw.push({ start, end, text });
  }

  // 2. drop silence, hallucinations and repeated lines
  const energies = raw.map((r) => rms(ctx.audio, sampleRate, r.start, r.end));
  const sorted = [...energies].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const floor = Math.max(0.003, median * 0.12);
  raw = raw.filter((r, i) => {
    if (/^[[(（*♪].*[\])）*♪]$/.test(r.text)) return false; // (whistling), [Music]: not speech
    if (HALLUCINATIONS.some((re) => re.test(r.text))) return !!ctx.audio && energies[i] > median * 0.8;
    if (ctx.audio && energies[i] < floor) return false;
    return true;
  });
  raw = raw.filter((r, i) => i === 0 || r.text !== raw[i - 1].text || r.start - raw[i - 1].end > 3);

  // 3. split into sentences and readable pieces, sharing time by length
  const cues = [];
  for (const r of raw) {
    const max = lineLimit(r.text) * 2;
    const pieces = splitSentences(r.text).flatMap((s) => splitLong(s, max));
    const total = pieces.reduce((n, p) => n + p.length, 0) || 1;
    let t = r.start;
    for (const p of pieces) {
      const len = ((r.end - r.start) * p.length) / total;
      cues.push({ start: t, end: t + len, text: p });
      t += len;
    }
  }

  // 4. merge fragments that are too short to read on their own
  const merged = [];
  for (const c of cues) {
    const prev = merged[merged.length - 1];
    const tiny = c.text.length < 6 || c.end - c.start < 0.6;
    if (prev && tiny && c.start - prev.end < 0.4 && (prev.text + ' ' + c.text).length <= lineLimit(prev.text) * 2) {
      prev.text = `${prev.text} ${c.text}`;
      prev.end = c.end;
    } else {
      merged.push({ ...c });
    }
  }

  // 5. timing: at least ~1s on screen, never overlapping the next cue
  for (let i = 0; i < merged.length; i++) {
    const c = merged[i];
    const next = merged[i + 1];
    const minEnd = c.start + Math.max(1, Math.min(2.5, c.text.length * 0.06));
    if (c.end < minEnd) c.end = next ? Math.min(minEnd, next.start - 0.05) : minEnd;
    if (next && c.end > next.start - 0.02) c.end = next.start - 0.02;
    if (c.end <= c.start) c.end = c.start + 0.5;
  }

  return merged
    .map((c) => ({ id: newId('s'), start: c.start + offset, end: Math.min(duration, c.end + offset), text: c.text }))
    .filter((c) => c.end > c.start);
}

export function cueAt(subtitles, t) {
  for (const s of subtitles) if (t >= s.start && t < s.end) return s;
  return null;
}

function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

/** SubRip text for the cues inside [from, to), re-timed to start at `from`. */
export function toSRT(subtitles, from = 0, to = Infinity) {
  const lines = [];
  let n = 1;
  for (const s of [...subtitles].sort((a, b) => a.start - b.start)) {
    if (s.end <= from || s.start >= to) continue;
    const start = Math.max(s.start, from) - from;
    const end = Math.min(s.end, to) - from;
    lines.push(String(n++), `${srtTime(start)} --> ${srtTime(end)}`, wrapLines(s.text).join('\n'), '');
  }
  return lines.join('\r\n');
}

/**
 * Words of a cue with an estimated time for each, so styles can highlight the word being
 * spoken. Uses cue.words when the recogniser gave word times; otherwise shares the cue's time
 * by word length. Text without spaces (Japanese, Chinese) is cut into short pieces.
 * @returns {Array<{text:string,start:number,end:number,space:boolean}>}
 */
export function cueWords(cue) {
  if (Array.isArray(cue.words) && cue.words.length) {
    return cue.words.map((w, i) => ({ text: String(w.text).trim(), start: w.start, end: w.end, space: i > 0 && w.space !== false }));
  }
  const pieces = [];
  for (const token of String(cue.text || '').split(/\s+/).filter(Boolean)) {
    const noSpaces = token.length > 6 && /[぀-ヿ一-鿿]/.test(token);
    if (!noSpaces) { pieces.push({ text: token, space: pieces.length > 0 }); continue; }
    // Cut after punctuation or every 3 characters.
    let cur = '';
    let first = true;
    for (const ch of token) {
      cur += ch;
      if (cur.length >= 3 || /[、。，！？・]/.test(ch)) {
        pieces.push({ text: cur, space: first && pieces.length > 0 });
        cur = '';
        first = false;
      }
    }
    if (cur) pieces.push({ text: cur, space: first && pieces.length > 0 });
  }
  const weight = (p) => p.text.replace(/[.,!?。、，！？…"'()]/g, '').length + 1;
  const total = pieces.reduce((s, p) => s + weight(p), 0) || 1;
  const span = Math.max(0, cue.end - cue.start);
  let at = cue.start;
  return pieces.map((p) => {
    const d = (span * weight(p)) / total;
    const w = { ...p, start: at, end: at + d };
    at += d;
    return w;
  });
}
