// Draws one finished frame: background, framed screen with crop and zoom, cursor and click
// effects, notes, webcam bubble, key bubbles and subtitles. Used by the preview, the live
// overlay and export.

import { visibleGroups, KEY_DEFAULTS, isModifier } from './keys.js';
import { cameraAt, viewRect } from './zoom.js';
import { cueAt, wrapLines } from './subtitles.js';

export const FONT = '"Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';

export const BACKGROUNDS = [
  { id: 'aurora', name: '오로라', stops: ['#6d5efc', '#c254d8', '#f7797d'] },
  { id: 'ocean', name: '바다', stops: ['#0ea5e9', '#2563eb', '#1e1b4b'] },
  { id: 'mint', name: '민트', stops: ['#34d399', '#0ea5a4', '#0f766e'] },
  { id: 'sunset', name: '노을', stops: ['#fbbf24', '#f97316', '#db2777'] },
  { id: 'graphite', name: '그래파이트', stops: ['#3f4652', '#1f242c', '#0b0e13'] },
  { id: 'paper', name: '종이', stops: ['#f8fafc', '#e2e8f0', '#cbd5e1'] },
];

// Built-in wallpapers, painted from soft colour blobs: [x, y, radius, colour] in 0..1 of the frame.
export const WALLPAPERS = [
  { id: 'wp-dawn', name: '새벽', base: '#1b1035', blobs: [[0.15, 0.2, 0.7, '#ff7eb3'], [0.85, 0.15, 0.6, '#7366ff'], [0.6, 0.95, 0.7, '#ffb86b'], [0.1, 0.9, 0.5, '#3ec6ff']] },
  { id: 'wp-lagoon', name: '석호', base: '#04263b', blobs: [[0.2, 0.1, 0.7, '#19d3c5'], [0.9, 0.4, 0.6, '#2b6bff'], [0.4, 1.0, 0.7, '#0b8f6a'], [0.75, 0.9, 0.4, '#b6f36a']] },
  { id: 'wp-candy', name: '사탕', base: '#ffe8f1', blobs: [[0.1, 0.15, 0.6, '#ff9ecd'], [0.9, 0.2, 0.6, '#a0c4ff'], [0.5, 0.95, 0.7, '#fff3a0'], [0.95, 0.9, 0.45, '#c9a7ff']] },
  { id: 'wp-ember', name: '불씨', base: '#1a0a05', blobs: [[0.2, 0.9, 0.7, '#ff4d1c'], [0.8, 0.8, 0.6, '#ffb000'], [0.5, 0.1, 0.7, '#5a1a8f'], [0.95, 0.15, 0.4, '#ff2e7e']] },
  { id: 'wp-forest', name: '숲', base: '#07140c', blobs: [[0.15, 0.2, 0.7, '#1f7a4a'], [0.85, 0.3, 0.6, '#9bd35a'], [0.5, 1.0, 0.7, '#0e4d4a'], [0.9, 0.95, 0.4, '#e5d96b']] },
  { id: 'wp-night', name: '밤하늘', base: '#03040d', blobs: [[0.2, 0.25, 0.6, '#1b2a80'], [0.8, 0.2, 0.5, '#4b1fa8'], [0.5, 0.95, 0.8, '#0a3a66'], [0.92, 0.85, 0.35, '#12a3b8']] },
];

export const KEY_THEMES = {
  dark: { face: '#24292f', edge: '#0b0d10', text: '#ffffff', plus: '#ffffffb3', panel: 'rgba(13,17,23,0.72)' },
  light: { face: '#ffffff', edge: '#b6bec8', text: '#1f2328', plus: '#1f2328aa', panel: 'rgba(255,255,255,0.75)' },
  neon: { face: '#111827', edge: '#7c3aed', text: '#e9d5ff', plus: '#c4b5fd', panel: 'rgba(17,24,39,0.78)', glow: '#a855f7' },
  key: { face: '#f6d365', edge: '#c08a1e', text: '#3b2a05', plus: '#ffffffcc', panel: 'rgba(0,0,0,0.55)' },
};

export const FULL_CROP = { x: 0, y: 0, w: 1, h: 1 };

export function defaultSettings() {
  return {
    frame: { aspect: '16:9', background: 'aurora', image: null, blur: 0, padding: 7, radius: 14, shadow: true, shadowSize: 1, crop: { ...FULL_CROP } },
    zoom: { enabled: true, scale: 1.8, follow: true, ramp: 0.55 },
    cursor: {
      clicks: true, effect: 'ripple', highlight: false, color: '#ffd33d', scrolls: true,
      show: false, style: 'arrow', size: 1.6, smoothing: 0.25, motionBlur: 0.3, bounce: 0.5, sway: 0.3, loop: false,
    },
    keys: { ...KEY_DEFAULTS, custom: { ...KEY_DEFAULTS.custom } },
    webcam: { enabled: true, position: 'bottom-left', x: 0.9, y: 0.9, size: 22, mirror: true, margin: 28, roundness: 100, shadow: 0.45, reactToZoom: false },
    subtitles: { enabled: true, size: 1, position: 'bottom', style: 'box' },
    audio: { volume: 1 },
  };
}

export function cropOf(project) {
  const c = project.settings?.frame?.crop;
  if (!c || !(c.w > 0.05) || !(c.h > 0.05)) return FULL_CROP;
  return c;
}

export function outputSize(aspect, sourceW, sourceH, longSide = 1920) {
  let ratio;
  if (aspect === 'source' || !aspect) ratio = sourceW && sourceH ? sourceW / sourceH : 16 / 9;
  else {
    const [a, b] = aspect.split(':').map(Number);
    ratio = a / b;
  }
  let w;
  let h;
  if (ratio >= 1) { w = longSide; h = Math.round(longSide / ratio); } else { h = longSide; w = Math.round(longSide * ratio); }
  return { width: w - (w % 2), height: h - (h % 2) };
}

/** Output size for a project, taking the crop into account. */
export function projectOutputSize(project, videoW, videoH, longSide) {
  const c = cropOf(project);
  const w = (videoW || project.source?.width || 1920) * c.w;
  const h = (videoH || project.source?.height || 1080) * c.h;
  return outputSize(project.settings.frame.aspect, w, h, longSide);
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOut = (k) => 1 - Math.pow(1 - clamp01(k), 3);

function rgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})/i.exec(hex || '');
  if (!m) return `rgba(0,0,0,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ------------------------------------------------------------------ pictures
const images = new Map();
/** The picture if it is ready, otherwise null (loading starts in the background). */
export function getImage(url) {
  if (!url) return null;
  let e = images.get(url);
  if (!e) {
    e = { img: new Image(), ok: false, done: null };
    e.done = new Promise((resolve) => {
      e.img.onload = () => { e.ok = true; resolve(true); };
      e.img.onerror = () => resolve(false);
    });
    e.img.src = url;
    images.set(url, e);
  }
  return e.ok ? e.img : null;
}

/** Wait until every picture the project uses is loaded (before an export starts). */
export async function preloadImages(project, url) {
  const names = [];
  if (project.settings.frame.background === 'image') names.push(project.settings.frame.image);
  for (const a of project.annotations || []) if (a.type === 'image') names.push(a.file);
  await Promise.all(names.filter(Boolean).map((n) => { getImage(url(n)); return images.get(url(n))?.done; }));
}

// ------------------------------------------------------------------ background
const bgCache = new Map();

function paintBackground(ctx, W, H, frame, img) {
  const bg = frame.background;
  if (bg === 'none') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
  if (bg?.startsWith?.('#')) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); return; }
  const blur = (frame.blur || 0) * (Math.min(W, H) / 1080);
  if (bg === 'image') {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    if (img) {
      const k = Math.max(W / img.naturalWidth, H / img.naturalHeight) * (blur ? 1.08 : 1);
      const w = img.naturalWidth * k;
      const h = img.naturalHeight * k;
      ctx.save();
      if (blur) ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      ctx.restore();
    }
    return;
  }
  const wp = WALLPAPERS.find((w) => w.id === bg);
  if (wp) {
    ctx.fillStyle = wp.base;
    ctx.fillRect(0, 0, W, H);
    const m = Math.max(W, H);
    ctx.save();
    if (blur) ctx.filter = `blur(${blur}px)`;
    for (const [x, y, r, color] of wp.blobs) {
      const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * m);
      g.addColorStop(0, rgba(color, 0.95));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    return;
  }
  const preset = BACKGROUNDS.find((b) => b.id === bg) || BACKGROUNDS[0];
  const g = ctx.createLinearGradient(0, 0, W, H);
  preset.stops.forEach((c, i) => g.addColorStop(i / (preset.stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // soft light blob for depth
  const r = ctx.createRadialGradient(W * 0.2, H * 0.1, 0, W * 0.2, H * 0.1, Math.max(W, H) * 0.7);
  r.addColorStop(0, 'rgba(255,255,255,0.18)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, W, H);
}

function drawBackground(ctx, W, H, frame, url) {
  const img = frame.background === 'image' && url ? getImage(url(frame.image)) : null;
  const key = [W, H, frame.background, frame.image, frame.blur || 0, !!img].join('|');
  let c = bgCache.get(key);
  if (!c) {
    // Painted once and reused: a blurred picture is too slow to redo for every frame.
    if (bgCache.size > 5) bgCache.delete(bgCache.keys().next().value);
    c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    paintBackground(c.getContext('2d'), W, H, frame, img);
    bgCache.set(key, c);
  }
  ctx.drawImage(c, 0, 0);
}

/** Where the recorded screen sits inside the output frame. */
export function contentRect(W, H, sw, sh, frame) {
  const pad = frame.background === 'none' ? 0 : (Math.min(W, H) * (frame.padding ?? 7)) / 100;
  const aw = W - pad * 2;
  const ah = H - pad * 2;
  const ratio = sw && sh ? sw / sh : 16 / 9;
  let w = aw;
  let h = aw / ratio;
  if (h > ah) { h = ah; w = ah * ratio; }
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

function drawScreen(ctx, video, rect, view, frame, scaleUnit) {
  const radius = frame.background === 'none' ? 0 : (frame.radius ?? 14) * scaleUnit;
  const shadow = frame.shadow ? (frame.shadowSize ?? 1) : 0;
  if (shadow > 0 && frame.background !== 'none') {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${Math.min(0.9, 0.45 * shadow)})`;
    ctx.shadowBlur = 40 * scaleUnit * shadow;
    ctx.shadowOffsetY = 14 * scaleUnit * shadow;
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.clip();
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const vw = video?.videoWidth || 0;
  const vh = video?.videoHeight || 0;
  if (vw && vh) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, view.x * vw, view.y * vh, view.w * vw, view.h * vh, rect.x, rect.y, rect.w, rect.h);
  }
  ctx.restore();
}

function toCanvas(p, rect, view) {
  return { x: rect.x + ((p.x - view.x) / view.w) * rect.w, y: rect.y + ((p.y - view.y) / view.h) * rect.h };
}

// ------------------------------------------------------------------ pointer effects
export function drawClicks(ctx, t, clicks, rect, view, cursorOpts, unit, scale) {
  const color = cursorOpts.color || '#ffd33d';
  const spot = cursorOpts.effect === 'spotlight';
  for (const c of clicks) {
    const age = t - c.t;
    if (age < 0) break;
    if (age > 0.65) continue;
    const k = age / 0.65;
    const p = toCanvas(c, rect, view);
    ctx.save();
    if (spot) {
      const radius = (30 - 8 * k) * unit * Math.sqrt(scale);
      ctx.globalAlpha = (1 - k) * 0.55;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const radius = (10 + 34 * k) * unit * Math.sqrt(scale);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.lineWidth = 4 * unit;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.35;
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.restore();
  }
}

/** A small wheel mark next to the cursor while scrolling (keyviz-style mouse indicator). */
export function drawScrolls(ctx, t, scrolls, rect, view, cursorOpts, unit) {
  for (let i = scrolls.length - 1; i >= 0; i--) {
    const w = scrolls[i];
    const age = t - w.t;
    if (age < 0) continue;
    if (age > 0.45) break;
    const p = toCanvas(w, rect, view);
    const down = (w.rotation || 0) > 0;
    const s = unit * 1.1;
    const x = p.x + 26 * s;
    const y = p.y + 30 * s;
    ctx.save();
    ctx.globalAlpha = 1 - age / 0.45;
    roundRect(ctx, x - 11 * s, y - 17 * s, 22 * s, 34 * s, 11 * s);
    ctx.fillStyle = 'rgba(13,17,23,0.8)';
    ctx.fill();
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = cursorOpts.color || '#ffd33d';
    ctx.stroke();
    const dy = (down ? 1 : -1) * (2 + 5 * (age / 0.45)) * s;
    ctx.beginPath();
    ctx.moveTo(x - 5 * s, y + dy - (down ? 4 : -4) * s);
    ctx.lineTo(x, y + dy + (down ? 3 : -3) * s);
    ctx.lineTo(x + 5 * s, y + dy - (down ? 4 : -4) * s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
    break; // only the latest one
  }
}

export function drawHighlight(ctx, p, unit, color) {
  ctx.save();
  const r = 34 * unit;
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  g.addColorStop(0, `${color}66`);
  g.addColorStop(1, `${color}00`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Arrow outline on a 24-unit grid, tip at (0, 0).
const ARROW = [[0, 0], [0, 17.2], [4.4, 13.4], [7.3, 20], [10, 18.8], [7.1, 12.4], [12.6, 12.4]];
export const CURSOR_STYLES = [
  { id: 'arrow', name: '검은 화살표' }, { id: 'white', name: '흰 화살표' },
  { id: 'dot', name: '점' }, { id: 'ring', name: '고리' },
];

function cursorShape(ctx, style, s, color) {
  if (style === 'dot' || style === 'ring') {
    ctx.beginPath();
    ctx.arc(0, 0, 9 * s, 0, Math.PI * 2);
    if (style === 'dot') { ctx.fillStyle = color; ctx.fill(); }
    ctx.lineWidth = (style === 'ring' ? 3.2 : 2) * s;
    ctx.strokeStyle = style === 'ring' ? color : '#ffffff';
    ctx.stroke();
    return;
  }
  ctx.beginPath();
  ARROW.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.2 * s;
  ctx.strokeStyle = style === 'white' ? '#111111' : '#ffffff';
  ctx.stroke();
  ctx.fillStyle = style === 'white' ? '#ffffff' : '#111111';
  ctx.fill();
}

/** Position of the redrawn cursor: smoothed, and brought back to where it began when looping. */
function cursorPos(cursor, t, o, range, clicks) {
  const radius = (o.smoothing || 0) * 0.3;
  let p = radius > 0.01 ? cursor.smooth(t, radius) : cursor.at(t);
  // Around a click the cursor must sit exactly where the click happened, however much
  // smoothing is on, or the click effect appears beside it.
  if (p && radius > 0.01 && clicks?.length) {
    let near = Infinity;
    for (let i = clicks.length - 1; i >= 0; i--) {
      const d = Math.abs(t - clicks[i].t);
      if (d < near) near = d;
      if (clicks[i].t < t - 0.25) break;
    }
    if (near < 0.25) {
      const k = 1 - near / 0.25;
      const real = cursor.at(t);
      const e = k * k * (3 - 2 * k);
      p = { x: p.x + (real.x - p.x) * e, y: p.y + (real.y - p.y) * e };
    }
  }
  if (p && o.loop && range && range.end - range.start > 2) {
    const k = (t - (range.end - 0.9)) / 0.9;
    if (k > 0) {
      const home = cursor.at(range.start);
      const e = easeOut(k);
      p = { x: p.x + (home.x - p.x) * e, y: p.y + (home.y - p.y) * e };
    }
  }
  return p;
}

function drawCursor(ctx, t, derived, rect, view, o, unit, scale, range) {
  const cursor = derived.cursor;
  const p = cursorPos(cursor, t, o, range, derived.clicks);
  if (!p) return;
  const prev = cursorPos(cursor, t - 0.034, o, range, derived.clicks) || p;
  const a = toCanvas(p, rect, view);
  const b = toCanvas(prev, rect, view);
  const vx = (a.x - b.x) / 0.034; // px per second
  const vy = (a.y - b.y) / 0.034;
  let size = (o.size || 1.6) * unit * Math.sqrt(scale) * 1.25;
  // Click bounce: press in, spring back.
  if (o.bounce > 0) {
    for (let i = derived.clicks.length - 1; i >= 0; i--) {
      const age = t - derived.clicks[i].t;
      if (age < 0) continue;
      if (age < 0.28) size *= 1 - 0.3 * o.bounce * Math.sin(Math.PI * (age / 0.28));
      break;
    }
  }
  const tilt = Math.max(-0.45, Math.min(0.45, (vx / (1400 * unit)) * (o.sway || 0)));
  const speed = Math.hypot(vx, vy);
  const ghosts = o.motionBlur > 0 && speed > 500 * unit ? 4 : 0;
  for (let i = ghosts; i >= 0; i--) {
    const back = i * 0.011 * o.motionBlur;
    ctx.save();
    ctx.globalAlpha = i === 0 ? 1 : 0.22 * (1 - i / (ghosts + 1));
    ctx.translate(a.x - vx * back, a.y - vy * back);
    ctx.rotate(tilt);
    if (i === 0) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 5 * size; ctx.shadowOffsetY = 1.5 * size; }
    cursorShape(ctx, o.style || 'arrow', size, o.color || '#ffd33d');
    ctx.restore();
  }
}

// ------------------------------------------------------------------ webcam
function drawWebcam(ctx, video, W, H, opts, unit, avoidBottom, camScale) {
  if (!video || !video.videoWidth) return;
  let d = (Math.min(W, H) * (opts.size || 22)) / 100;
  // Optionally step back a little while the screen is zoomed in.
  if (opts.reactToZoom && camScale > 1) d /= 1 + (camScale - 1) * 0.45;
  const m = (opts.margin ?? 28) * unit;
  const pos = opts.position || 'bottom-left';
  let x;
  let y;
  if (pos === 'custom') {
    x = m + (W - 2 * m - d) * clamp01(opts.x ?? 0.9);
    y = m + (H - 2 * m - d) * clamp01(opts.y ?? 0.9);
  } else {
    x = pos.endsWith('left') ? m : W - m - d;
    y = pos.startsWith('top') ? m : H - m - d;
    if (!pos.startsWith('top')) y -= avoidBottom;
  }
  const r = (d / 2) * clamp01((opts.roundness ?? 100) / 100);
  const shadow = opts.shadow ?? 0.45;
  if (shadow > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${Math.min(0.95, shadow)})`;
    ctx.shadowBlur = 24 * unit * (0.5 + shadow);
    roundRect(ctx, x, y, d, d, r);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  roundRect(ctx, x, y, d, d, r);
  ctx.clip();
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const s = Math.min(vw, vh);
  if (opts.mirror !== false) {
    ctx.translate(x + d, y);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(x, y);
  }
  ctx.drawImage(video, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, d, d);
  ctx.restore();
  ctx.save();
  ctx.lineWidth = 4 * unit;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  roundRect(ctx, x + 2 * unit, y + 2 * unit, d - 4 * unit, d - 4 * unit, Math.max(0, r - 2 * unit));
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ key bubbles
const MOD_SYMBOLS = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Win: '⊞' };

function keyLabel(k, opts) {
  if (isModifier(k)) {
    if (opts.modLabel === 'symbol') return MOD_SYMBOLS[k];
    return opts.modLabel === 'both' ? `${MOD_SYMBOLS[k]} ${k}` : k;
  }
  if (k.length === 1 && opts.caps === 'lower') return k.toLowerCase();
  return k;
}

/** Colours and shapes for the keycaps: a preset, or the user's own choices. */
export function resolveKeyTheme(opts) {
  if (opts.theme === 'custom') {
    const c = { ...KEY_DEFAULTS.custom, ...(opts.custom || {}) };
    return {
      face: c.face, text: c.text, edge: c.border ? c.borderColor : rgba('#000000', 0.5),
      modFace: c.modHighlight ? c.modFace : c.face, modText: c.modHighlight ? c.modText : c.text,
      borderW: c.border ? c.borderWidth : 0, borderColor: c.borderColor, radius: c.radius, capStyle: c.capStyle, gradient: !!c.gradient,
      panel: c.panel ? rgba(c.panelColor, c.panelOpacity) : null,
      plus: c.panel ? '#ffffffcc' : c.face,
    };
  }
  const th = KEY_THEMES[opts.theme] || KEY_THEMES.dark;
  return { ...th, modFace: th.face, modText: th.text, borderW: 0, borderColor: th.edge, radius: 9, capStyle: 'raised' };
}

/** Keycaps for one row. Returns its width (measure only when draw=false). */
function keyRow(ctx, items, x, y, s, theme, draw, opts) {
  const capH = 46 * s;
  const pad = 15 * s;
  const gap = 8 * s;
  ctx.font = `600 ${20 * s}px ${FONT}`;
  let cx = x;
  items.forEach((item, idx) => {
    if (idx > 0) cx += gap;
    item.keys.forEach((k, ki) => {
      if (ki > 0) {
        const plusW = 18 * s;
        if (draw) {
          ctx.fillStyle = theme.plus;
          ctx.font = `600 ${18 * s}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('+', cx + plusW / 2, y + capH / 2 - 2 * s);
          ctx.font = `600 ${20 * s}px ${FONT}`;
        }
        cx += plusW;
      }
      const label = keyLabel(k, opts);
      const w = Math.max(capH, ctx.measureText(label).width + pad * 2);
      if (draw) {
        const mod = isModifier(k);
        const face = mod ? theme.modFace : theme.face;
        const text = mod ? theme.modText : theme.text;
        const r = (theme.radius ?? 9) * s;
        const style = theme.capStyle || 'raised';
        const faceH = style === 'raised' ? capH - 4 * s : capH;
        if (style === 'raised') {
          ctx.save();
          if (theme.glow) { ctx.shadowColor = theme.glow; ctx.shadowBlur = 14 * s; }
          roundRect(ctx, cx, y + 4 * s, w, capH - 2 * s, r);
          ctx.fillStyle = theme.edge;
          ctx.fill();
          ctx.restore();
        }
        roundRect(ctx, cx, y, w, faceH, r);
        if (style !== 'outline') {
          ctx.fillStyle = face;
          ctx.fill();
          if (theme.gradient) {
            // lighter at the top, darker at the bottom, like a real keycap
            const g = ctx.createLinearGradient(0, y, 0, y + faceH);
            g.addColorStop(0, 'rgba(255,255,255,0.22)');
            g.addColorStop(0.5, 'rgba(255,255,255,0)');
            g.addColorStop(1, 'rgba(0,0,0,0.26)');
            ctx.fillStyle = g;
            ctx.fill();
          }
        }
        if (theme.borderW || style === 'outline') {
          ctx.lineWidth = Math.max(1, (theme.borderW || 2) * s);
          ctx.strokeStyle = style === 'outline' && !theme.borderW ? face : theme.borderColor;
          ctx.stroke();
        }
        ctx.fillStyle = style === 'outline' ? face : text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx + w / 2, y + faceH / 2 + 1 * s);
      }
      cx += w;
    });
    if (item.count > 1 && opts.showCount !== false) {
      const label = `×${item.count}`;
      ctx.font = `700 ${16 * s}px ${FONT}`;
      const w = ctx.measureText(label).width + 6 * s;
      if (draw) {
        ctx.fillStyle = theme.plus;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx + 5 * s, y + capH / 2);
      }
      cx += w + 4 * s;
      ctx.font = `600 ${20 * s}px ${FONT}`;
    }
  });
  return cx - x;
}

/**
 * Draws the key bubbles. Returns the height used at the bottom (so other layers can avoid it).
 */
export function drawKeys(ctx, W, H, t, groups, opts, unit, bottomOffset = 0) {
  if (!opts.enabled || !groups.length) return 0;
  const vis = visibleGroups(groups, t, opts);
  if (!vis.length) return 0;
  const theme = resolveKeyTheme(opts);
  const s = unit * (opts.size || 1);
  const rowH = 46 * s;
  const panelPad = 12 * s;
  const rowGap = 10 * s;
  const marginX = (opts.marginX ?? 36) * unit;
  const marginY = (opts.marginY ?? 36) * unit;
  const maxW = W * 0.86;
  const pos = opts.position || 'bottom-center';
  const fromTop = pos.startsWith('top');
  const middle = pos.startsWith('center');
  const anim = opts.anim || 'fade';

  const rows = vis.map((v) => {
    let items = v.items;
    let width = keyRow(ctx, items, 0, 0, s, theme, false, opts);
    while (width > maxW - panelPad * 2 && items.length > 1) {
      items = items.slice(1);
      width = keyRow(ctx, items, 0, 0, s, theme, false, opts);
    }
    return { items, width, alpha: v.alpha, enter: v.enter ?? 1, leave: v.leave ?? 0 };
  });

  const boxH = rowH + panelPad * 2;
  let y;
  if (fromTop) y = marginY;
  else if (middle) y = (H - boxH) / 2;
  else y = H - marginY - bottomOffset - boxH;
  const order = rows.slice().reverse();
  let used = 0;
  for (const row of order) {
    const boxW = row.width + panelPad * 2;
    let x;
    if (pos.endsWith('left')) x = marginX;
    else if (pos.endsWith('right')) x = W - marginX - boxW;
    else x = (W - boxW) / 2;
    const e = easeOut(row.enter);
    const l = row.leave;
    ctx.save();
    ctx.globalAlpha = row.alpha;
    if (anim === 'zoom') {
      const k = (0.6 + 0.4 * e) * (1 - 0.3 * l);
      ctx.translate(x + boxW / 2, y + boxH / 2);
      ctx.scale(k, k);
      ctx.translate(-(x + boxW / 2), -(y + boxH / 2));
    } else if (anim === 'float') {
      ctx.translate(0, (fromTop ? -1 : 1) * ((1 - e) * 22 * s - l * 22 * s));
    } else if (anim === 'slide') {
      const dir = pos.endsWith('right') ? 1 : -1;
      ctx.translate(dir * ((1 - e) * 60 * s + l * 60 * s), 0);
    }
    if (theme.panel) {
      roundRect(ctx, x, y, boxW, boxH, 16 * s);
      ctx.fillStyle = theme.panel;
      ctx.fill();
    }
    keyRow(ctx, row.items, x + panelPad, y + panelPad, s, theme, true, opts);
    ctx.restore();
    used += boxH + rowGap;
    y += fromTop ? boxH + rowGap : -(boxH + rowGap);
  }
  return fromTop || middle ? 0 : used;
}

// ------------------------------------------------------------------ notes (annotations)
export const NOTE_TYPES = [
  { id: 'text', name: '글자' }, { id: 'arrow', name: '화살표' }, { id: 'box', name: '네모' },
  { id: 'image', name: '그림' }, { id: 'blur', name: '가리기' },
];

export function newNote(type, t, duration) {
  const base = { type, start: t, end: Math.min(duration, t + 3), x: 0.5, y: 0.5 };
  if (type === 'text') return { ...base, text: '여기에 글자', size: 54, color: '#ffffff', bg: '#000000', bgOn: true, bold: true };
  if (type === 'arrow') return { ...base, w: 0.16, angle: 45, color: '#ff4d4f', stroke: 10 };
  if (type === 'box') return { ...base, w: 0.3, h: 0.2, color: '#ff4d4f', stroke: 6 };
  if (type === 'image') return { ...base, w: 0.25, file: null };
  return { ...base, w: 0.3, h: 0.12, strength: 18 };
}

/** The rectangle a note covers on the canvas (for drawing and for picking it with the mouse). */
export function noteRect(ctx, a, W, H, url) {
  const unit = Math.min(W, H) / 1080;
  const cx = a.x * W;
  const cy = a.y * H;
  if (a.type === 'text') {
    const size = (a.size || 54) * unit;
    ctx.font = `${a.bold === false ? 500 : 700} ${size}px ${FONT}`;
    const lines = String(a.text || '').split('\n');
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width), size) + size * 0.7;
    const h = lines.length * size * 1.3 + size * 0.35;
    return { x: cx - w / 2, y: cy - h / 2, w, h, lines, size };
  }
  if (a.type === 'arrow') {
    const len = (a.w || 0.16) * W;
    return { x: cx - len / 2, y: cy - len / 2, w: len, h: len };
  }
  if (a.type === 'image') {
    const img = url ? getImage(url(a.file)) : null;
    const w = (a.w || 0.25) * W;
    const h = img ? (w * img.naturalHeight) / img.naturalWidth : w * 0.6;
    return { x: cx - w / 2, y: cy - h / 2, w, h, img };
  }
  const w = (a.w || 0.3) * W;
  const h = (a.h || 0.2) * H;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

let blurPad = null;
function drawNotes(ctx, W, H, t, notes, url, selectedId) {
  const unit = Math.min(W, H) / 1080;
  for (const a of notes) {
    if (t < a.start || t > a.end) continue;
    const alpha = Math.min(1, (t - a.start) / 0.15 + 0.05, (a.end - t) / 0.15 + 0.05);
    const r = noteRect(ctx, a, W, H, url);
    ctx.save();
    ctx.globalAlpha = clamp01(alpha);
    if (a.type === 'text') {
      if (a.bgOn !== false && a.bg) {
        roundRect(ctx, r.x, r.y, r.w, r.h, r.size * 0.28);
        ctx.fillStyle = rgba(a.bg, 0.72);
        ctx.fill();
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.75)';
        ctx.shadowBlur = r.size * 0.25;
      }
      ctx.fillStyle = a.color || '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      r.lines.forEach((line, i) => ctx.fillText(line, a.x * W, r.y + r.size * 0.175 + r.size * 1.3 * (i + 0.5)));
    } else if (a.type === 'arrow') {
      const len = r.w;
      const ang = ((a.angle ?? 45) * Math.PI) / 180;
      const lw = (a.stroke || 10) * unit;
      const head = Math.max(lw * 3.2, len * 0.22);
      ctx.translate(a.x * W, a.y * H);
      ctx.rotate(ang);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = lw;
      ctx.strokeStyle = a.color || '#ff4d4f';
      ctx.fillStyle = a.color || '#ff4d4f';
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2 - head * 0.7, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(len / 2, 0);
      ctx.lineTo(len / 2 - head, -head * 0.55);
      ctx.lineTo(len / 2 - head, head * 0.55);
      ctx.closePath();
      ctx.fill();
    } else if (a.type === 'box') {
      ctx.lineWidth = (a.stroke || 6) * unit;
      ctx.strokeStyle = a.color || '#ff4d4f';
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 6 * unit;
      roundRect(ctx, r.x, r.y, r.w, r.h, 10 * unit);
      ctx.stroke();
    } else if (a.type === 'image') {
      if (r.img) ctx.drawImage(r.img, r.x, r.y, r.w, r.h);
      else { ctx.strokeStyle = '#ffffff88'; ctx.setLineDash([8 * unit, 6 * unit]); ctx.lineWidth = 2 * unit; ctx.strokeRect(r.x, r.y, r.w, r.h); }
    } else if (a.type === 'blur') {
      // Blur what is already drawn underneath this rectangle.
      // Only that part is copied and blurred, so it stays fast.
      const px = (a.strength || 18) * unit;
      const m = Math.ceil(px * 2);
      const sx = Math.max(0, Math.floor(r.x - m));
      const sy = Math.max(0, Math.floor(r.y - m));
      const sw = Math.min(W - sx, Math.ceil(r.w + m * 2));
      const sh = Math.min(H - sy, Math.ceil(r.h + m * 2));
      if (sw > 1 && sh > 1) {
        blurPad = blurPad || document.createElement('canvas');
        if (blurPad.width < sw || blurPad.height < sh) { blurPad.width = Math.max(blurPad.width, sw); blurPad.height = Math.max(blurPad.height, sh); }
        blurPad.getContext('2d').drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        ctx.filter = `blur(${px}px)`;
        ctx.drawImage(blurPad, 0, 0, sw, sh, sx, sy, sw, sh);
      }
    }
    ctx.restore();
    if (selectedId === a.id) {
      ctx.save();
      ctx.setLineDash([6 * unit, 5 * unit]);
      ctx.lineWidth = 2 * unit;
      ctx.strokeStyle = '#2f81f7';
      ctx.strokeRect(r.x - 4 * unit, r.y - 4 * unit, r.w + 8 * unit, r.h + 8 * unit);
      ctx.restore();
    }
  }
}

// ------------------------------------------------------------------ subtitles
export function drawSubtitle(ctx, W, H, t, subtitles, opts, unit, bottomOffset = 0) {
  if (!opts.enabled || !subtitles?.length) return 0;
  const cue = cueAt(subtitles, t);
  if (!cue) return 0;
  const size = 34 * unit * (opts.size || 1);
  ctx.font = `600 ${size}px ${FONT}`;
  let lines = wrapLines(cue.text);
  const maxW = W * 0.84;
  // Hard wrap if a line still does not fit
  lines = lines.flatMap((line) => {
    if (ctx.measureText(line).width <= maxW) return [line];
    const words = line.split(/(\s+)/);
    const out = [];
    let cur = '';
    for (const w of words) {
      if (ctx.measureText(cur + w).width > maxW && cur) { out.push(cur.trim()); cur = w; } else cur += w;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  });
  const lineH = size * 1.32;
  const padX = 18 * unit;
  const padY = 9 * unit;
  const blockH = lines.length * lineH + padY * 2;
  const margin = 40 * unit;
  const top = opts.position === 'top';
  const y0 = top ? margin : H - margin - bottomOffset - blockH;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    const w = ctx.measureText(line).width;
    const cy = y0 + padY + lineH * i + lineH / 2;
    if (opts.style === 'box') {
      const top0 = i === 0 ? cy - lineH / 2 - padY : cy - lineH / 2;
      const bottom0 = i === lines.length - 1 ? cy + lineH / 2 + padY : cy + lineH / 2;
      roundRect(ctx, W / 2 - w / 2 - padX, top0, w + padX * 2, bottom0 - top0, 10 * unit);
      ctx.fillStyle = 'rgba(0,0,0,0.68)';
      ctx.fill();
    }
  });
  lines.forEach((line, i) => {
    const cy = y0 + padY + lineH * i + lineH / 2;
    if (opts.style !== 'box') {
      ctx.lineWidth = size * 0.16;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(line, W / 2, cy);
    }
    ctx.fillStyle = opts.style === 'yellow' ? '#ffe14d' : '#ffffff';
    ctx.fillText(line, W / 2, cy);
  });
  ctx.restore();
  return top ? 0 : blockH + 12 * unit;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{W:number,H:number,t:number,screen:HTMLVideoElement,webcam?:HTMLVideoElement,
 *          project:object, derived:{groups:Array,clicks:Array,cursor:object,scrolls?:Array},
 *          burnSubtitles?:boolean, url?:(name:string)=>string, selectedNote?:string}} f
 */
export function renderFrame(ctx, f) {
  const { W, H, t, project, derived } = f;
  const s = project.settings;
  const unit = Math.min(W, H) / 1080;
  const srcW = f.screen?.videoWidth || project.source?.width || 1920;
  const srcH = f.screen?.videoHeight || project.source?.height || 1080;
  const crop = cropOf(project);

  drawBackground(ctx, W, H, s.frame, f.url);
  const rect = contentRect(W, H, srcW * crop.w, srcH * crop.h, s.frame);
  // The camera works inside the cropped picture; `view` is the part of the whole recording shown.
  const cam = cameraAt(t, project.zooms || [], derived.cursor, s.zoom);
  const inCrop = viewRect({ scale: cam.scale, x: clamp01((cam.x - crop.x) / crop.w), y: clamp01((cam.y - crop.y) / crop.h) });
  const view = { x: crop.x + inCrop.x * crop.w, y: crop.y + inCrop.y * crop.h, w: inCrop.w * crop.w, h: inCrop.h * crop.h };
  drawScreen(ctx, f.screen, rect, view, s.frame, unit);

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  const hasCursor = derived.cursor?.available;
  if (s.cursor.highlight && hasCursor) {
    const p = derived.cursor.at(t);
    if (p) drawHighlight(ctx, toCanvas(p, rect, view), unit, s.cursor.color || '#ffd33d');
  }
  if (s.cursor.clicks && s.cursor.effect !== 'none') drawClicks(ctx, t, derived.clicks, rect, view, s.cursor, unit, cam.scale);
  if (s.cursor.scrolls !== false && derived.scrolls?.length) drawScrolls(ctx, t, derived.scrolls, rect, view, s.cursor, unit);
  if (s.cursor.show && hasCursor) drawCursor(ctx, t, derived, rect, view, s.cursor, unit, cam.scale, project.trim);
  ctx.restore();

  if (project.annotations?.length) drawNotes(ctx, W, H, t, project.annotations, f.url, f.selectedNote);

  const subOpts = { ...s.subtitles, enabled: s.subtitles.enabled && f.burnSubtitles !== false };
  let bottom = 0;
  const keysBottom = s.keys.position?.startsWith('bottom');
  // Subtitles sit lowest; key bubbles stack above them when both are at the bottom.
  if (subOpts.position !== 'top') bottom += drawSubtitle(ctx, W, H, t, project.subtitles, subOpts, unit, 0);
  else drawSubtitle(ctx, W, H, t, project.subtitles, subOpts, unit, 0);
  const keyUsed = drawKeys(ctx, W, H, t, derived.groups, s.keys, unit, keysBottom ? bottom : 0);
  if (s.webcam.enabled && f.webcam) {
    const side = (s.webcam.position || '').split('-')[1];
    const avoid = keysBottom && !s.keys.position.endsWith('center') && side && s.keys.position.endsWith(side) ? keyUsed : 0;
    drawWebcam(ctx, f.webcam, W, H, s.webcam, unit, avoid, cam.scale);
  }
}
