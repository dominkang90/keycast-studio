// Cursor packs: KeyCast's own pointer drawings for every pointer kind Windows reports while
// recording (arrow, hand, text, resize, …). All shapes sit on a 24-unit grid with the hot spot at
// (0, 0) and are scaled by `s`.
import { T } from './i18n.js';

// Filled shapes
const ARROW = 'M0 0 L0 17.2 L4.4 13.4 L7.3 20 L10 18.8 L7.1 12.4 L12.6 12.4 Z';
const HAND = 'M0.6 -0.2 C1.9 -0.2 2.6 0.7 2.6 2 L2.6 7.4 C3.2 6.9 4.6 6.9 5.2 7.9 C5.9 7.3 7.4 7.4 7.9 8.6 ' +
  'C8.7 8.1 10.4 8.4 10.4 10 L10.4 14.6 C10.4 18.2 8.4 20.4 5 20.4 L3.2 20.4 C0.8 20.4 -0.6 19.2 -2 17 ' +
  'L-5 12.2 C-5.8 10.9 -4.3 9.6 -3 10.6 L-1.4 12 L-1.4 2 C-1.4 0.7 -0.7 -0.2 0.6 -0.2 Z';
const RESIZE = 'M-12 0 L-6.5 -5.5 L-6.5 -2.2 L6.5 -2.2 L6.5 -5.5 L12 0 L6.5 5.5 L6.5 2.2 L-6.5 2.2 L-6.5 5.5 Z';
const MOVE = 'M0 -12 L4.6 -7.4 L1.9 -7.4 L1.9 -1.9 L7.4 -1.9 L7.4 -4.6 L12 0 L7.4 4.6 L7.4 1.9 L1.9 1.9 L1.9 7.4 ' +
  'L4.6 7.4 L0 12 L-4.6 7.4 L-1.9 7.4 L-1.9 1.9 L-7.4 1.9 L-7.4 4.6 L-12 0 L-7.4 -4.6 L-7.4 -1.9 L-1.9 -1.9 ' +
  'L-1.9 -7.4 L-4.6 -7.4 Z';
// Line shapes (drawn as an outline stroke under an inner stroke)
const IBEAM = 'M-4.2 -10 C-2 -10 -0.6 -9.4 0 -8.2 C0.6 -9.4 2 -10 4.2 -10 M0 -8.2 L0 8.2 M-4.2 10 C-2 10 -0.6 9.4 0 8.2 C0.6 9.4 2 10 4.2 10 M-2.6 0 L2.6 0';
const CROSS = 'M0 -11 L0 -3 M0 3 L0 11 M-11 0 L-3 0 M3 0 L11 0';

/** Pointer kinds a recording can contain, and what each is drawn as. */
export const CURSOR_KINDS = ['arrow', 'pointer', 'text', 'crosshair', 'resize-ew', 'resize-ns', 'resize-nwse', 'resize-nesw', 'move', 'not-allowed', 'wait', 'progress', 'help'];

/** Packs draw every kind; the last two are single shapes that ignore the kind. */
export const CURSOR_STYLES = [
  { id: 'arrow', name: T('검은 화살표'), pack: true },
  { id: 'white', name: T('흰 화살표'), pack: true },
  { id: 'soft', name: T('부드러운'), pack: true },
  { id: 'accent', name: T('색 화살표'), pack: true },
  { id: 'outline', name: T('테두리 화살표'), pack: true },
  { id: 'neon', name: T('네온'), pack: true },
  { id: 'hand', name: T('손가락'), pack: false },
  { id: 'dot', name: T('점'), pack: false },
  { id: 'ring', name: T('고리'), pack: false },
];

const paths = new Map();
function path(d) {
  let p = paths.get(d);
  if (!p) { p = new Path2D(d); paths.set(d, p); }
  return p;
}

/** Fill, edge and effects of a pack. */
function look(style, color, custom) {
  if (style === 'custom' && custom) return { fill: custom.fill || '#ffffff', edge: custom.edge || '#111111', width: custom.width || 1.3, glow: custom.glow || null };
  switch (style) {
    case 'white': return { fill: '#ffffff', edge: '#111111', width: 1.3 };
    case 'soft': return { fill: '#ffffff', edge: 'rgba(0,0,0,0.62)', width: 1, soft: true };
    case 'accent': return { fill: color, edge: '#ffffff', width: 1.4 };
    case 'outline': return { fill: 'rgba(255,255,255,0.1)', edge: color, width: 1.6 };
    case 'neon': return { fill: '#0b0b10', edge: color, width: 1.5, glow: color };
    default: return { fill: '#111111', edge: '#ffffff', width: 1.3 };
  }
}

function filled(ctx, d, lk, rotate = 0) {
  ctx.save();
  if (rotate) ctx.rotate(rotate);
  const p = path(d);
  ctx.lineJoin = 'round';
  ctx.lineWidth = lk.width;
  ctx.strokeStyle = lk.edge;
  ctx.fillStyle = lk.fill;
  ctx.fill(p);
  ctx.stroke(p);
  ctx.restore();
}

function lines(ctx, d, lk, inner = 1.7) {
  const p = path(d);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = inner + lk.width * 2;
  ctx.strokeStyle = lk.edge;
  ctx.stroke(p);
  ctx.lineWidth = inner;
  ctx.strokeStyle = lk.fill === 'rgba(255,255,255,0.1)' ? '#ffffff' : lk.fill;
  ctx.stroke(p);
}

function spinner(ctx, lk, t, r) {
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = lk.edge;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = lk.fill === '#111111' ? '#3a86ff' : lk.fill;
  const a = (t || 0) * Math.PI * 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, r, a, a + Math.PI * 1.25);
  ctx.stroke();
}

/**
 * Draw a pointer with its hot spot at the current origin.
 * @param {string} style one of CURSOR_STYLES
 * @param {number} s scale (1 = 24 px tall arrow)
 * @param {string} color effect colour (used by the accent, outline and neon packs)
 * @param {string} [kind] pointer kind from the recording ('arrow' when unknown)
 * @param {number} [t] time in seconds, for the busy spinner
 * @param {object} [custom] fill, edge, width and glow of a pack from an extension (style 'custom')
 */
export function cursorShape(ctx, style, s, color, kind = 'arrow', t = 0, custom = null) {
  if (style === 'dot' || style === 'ring') {
    ctx.beginPath();
    ctx.arc(0, 0, 9 * s, 0, Math.PI * 2);
    if (style === 'dot') { ctx.fillStyle = color; ctx.fill(); }
    ctx.lineWidth = (style === 'ring' ? 3.2 : 2) * s;
    ctx.strokeStyle = style === 'ring' ? color : '#ffffff';
    ctx.stroke();
    return;
  }
  ctx.save();
  ctx.scale(s, s);
  if (style === 'hand') {
    filled(ctx, HAND, { fill: '#ffffff', edge: '#111111', width: 1.3 });
    ctx.restore();
    return;
  }
  const lk = look(style, color, custom);
  if (lk.glow) { ctx.shadowColor = lk.glow; ctx.shadowBlur = 8; }
  switch (kind) {
    case 'pointer': filled(ctx, HAND, lk); break;
    case 'text': lines(ctx, IBEAM, lk); break;
    case 'crosshair': lines(ctx, CROSS, lk); break;
    case 'resize-ew': filled(ctx, RESIZE, lk); break;
    case 'resize-ns': filled(ctx, RESIZE, lk, Math.PI / 2); break;
    case 'resize-nwse': filled(ctx, RESIZE, lk, Math.PI / 4); break;
    case 'resize-nesw': filled(ctx, RESIZE, lk, -Math.PI / 4); break;
    case 'move': filled(ctx, MOVE, lk); break;
    case 'not-allowed': {
      ctx.lineWidth = 4.6;
      ctx.strokeStyle = lk.edge;
      ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.moveTo(-6, 6); ctx.lineTo(6, -6); ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#e5484d';
      ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.moveTo(-6, 6); ctx.lineTo(6, -6); ctx.stroke();
      break;
    }
    case 'wait': spinner(ctx, lk, t, 8.5); break;
    case 'progress':
      filled(ctx, ARROW, lk);
      ctx.translate(15, 18);
      spinner(ctx, lk, t, 5);
      break;
    case 'help':
      filled(ctx, ARROW, lk);
      ctx.font = '700 11px "Segoe UI", sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = lk.edge;
      ctx.fillStyle = lk.fill === 'rgba(255,255,255,0.1)' ? lk.edge : lk.fill;
      ctx.strokeText('?', 12, 22);
      ctx.fillText('?', 12, 22);
      break;
    default: filled(ctx, ARROW, lk);
  }
  ctx.restore();
}

/** Kinds that are drawn centred on the hot spot (they should not tilt with movement). */
export function isCentred(kind) {
  return kind !== 'arrow' && kind !== 'pointer' && kind !== 'progress' && kind !== 'help';
}
