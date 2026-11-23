// Draws one finished frame: background, framed screen with crop and zoom, cursor and click
// effects, notes, webcam bubble, key bubbles and subtitles. Used by the preview, the live
// overlay and export.

import { visibleGroups, KEY_DEFAULTS, isModifier } from './keys.js';
import { cameraAt, viewRect } from './zoom.js';
import { cueAt, cueWords, lineLimit, SUBTITLE_DEFAULTS } from './subtitles.js';
import { CURSOR_STYLES, cursorShape, isCentred } from './cursors.js';
import { T } from './i18n.js';

export const FONT = '"Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';

export const BACKGROUNDS = [
  { id: 'aurora', name: T('오로라'), stops: ['#6d5efc', '#c254d8', '#f7797d'] },
  { id: 'ocean', name: T('바다'), stops: ['#0ea5e9', '#2563eb', '#1e1b4b'] },
  { id: 'mint', name: T('민트'), stops: ['#34d399', '#0ea5a4', '#0f766e'] },
  { id: 'sunset', name: T('노을'), stops: ['#fbbf24', '#f97316', '#db2777'] },
  { id: 'graphite', name: T('그래파이트'), stops: ['#3f4652', '#1f242c', '#0b0e13'] },
  { id: 'paper', name: T('종이'), stops: ['#f8fafc', '#e2e8f0', '#cbd5e1'] },
];

// Built-in wallpapers, painted from soft colour blobs: [x, y, radius, colour] in 0..1 of the frame.
export const WALLPAPERS = [
  { id: 'wp-dawn', name: T('새벽'), base: '#1b1035', blobs: [[0.15, 0.2, 0.7, '#ff7eb3'], [0.85, 0.15, 0.6, '#7366ff'], [0.6, 0.95, 0.7, '#ffb86b'], [0.1, 0.9, 0.5, '#3ec6ff']] },
  { id: 'wp-lagoon', name: T('석호'), base: '#04263b', blobs: [[0.2, 0.1, 0.7, '#19d3c5'], [0.9, 0.4, 0.6, '#2b6bff'], [0.4, 1.0, 0.7, '#0b8f6a'], [0.75, 0.9, 0.4, '#b6f36a']] },
  { id: 'wp-candy', name: T('사탕'), base: '#ffe8f1', blobs: [[0.1, 0.15, 0.6, '#ff9ecd'], [0.9, 0.2, 0.6, '#a0c4ff'], [0.5, 0.95, 0.7, '#fff3a0'], [0.95, 0.9, 0.45, '#c9a7ff']] },
  { id: 'wp-ember', name: T('불씨'), base: '#1a0a05', blobs: [[0.2, 0.9, 0.7, '#ff4d1c'], [0.8, 0.8, 0.6, '#ffb000'], [0.5, 0.1, 0.7, '#5a1a8f'], [0.95, 0.15, 0.4, '#ff2e7e']] },
  { id: 'wp-forest', name: T('숲'), base: '#07140c', blobs: [[0.15, 0.2, 0.7, '#1f7a4a'], [0.85, 0.3, 0.6, '#9bd35a'], [0.5, 1.0, 0.7, '#0e4d4a'], [0.9, 0.95, 0.4, '#e5d96b']] },
  { id: 'wp-night', name: T('밤하늘'), base: '#03040d', blobs: [[0.2, 0.25, 0.6, '#1b2a80'], [0.8, 0.2, 0.5, '#4b1fa8'], [0.5, 0.95, 0.8, '#0a3a66'], [0.92, 0.85, 0.35, '#12a3b8']] },
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
      clicks: true, effect: 'ripple', clickSize: 1, clickDur: 0.65, clickOpacity: 1, highlight: false, color: '#ffd33d', scrolls: true,
      show: false, style: 'arrow', size: 1.6, smoothing: 0.25, motionBlur: 0.3, bounce: 0.5, bounceDur: 0.28, sway: 0.3, loop: false, idleHide: 0,
      motion: 'smooth', springStiffness: 1, springDamping: 1, springMass: 1, followKind: true, hideWhenHidden: true,
    },
    keys: { ...KEY_DEFAULTS, custom: { ...KEY_DEFAULTS.custom } },
    webcam: { enabled: true, position: 'bottom-left', x: 0.9, y: 0.9, size: 22, mirror: true, margin: 28, roundness: 100, shadow: 0.45, reactToZoom: false },
    subtitles: { ...SUBTITLE_DEFAULTS },
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
const shadowCache = new Map();

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
  // From an extension: a gradient at an angle, or colour blobs like the built-in wallpapers.
  const custom = bg === 'custom' ? frame.custom : null;
  if (custom?.kind === 'gradient' && custom.stops?.length >= 2) {
    const a = ((custom.angle ?? 135) - 90) * (Math.PI / 180);
    const len = (Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a))) / 2;
    const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * len, H / 2 - Math.sin(a) * len, W / 2 + Math.cos(a) * len, H / 2 + Math.sin(a) * len);
    custom.stops.forEach((c, i) => g.addColorStop(i / (custom.stops.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const wp = WALLPAPERS.find((w) => w.id === bg) || (custom?.kind === 'blobs' ? custom : null);
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
  const key = [W, H, frame.background, frame.image, frame.blur || 0, !!img, frame.background === 'custom' ? JSON.stringify(frame.custom) : ''].join('|');
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
    // A big soft shadow is slow to draw; it only changes with the layout, so it is drawn once.
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const key = [W, H, rect.x, rect.y, rect.w, rect.h, radius, shadow].map((v) => Math.round(v * 10)).join('|');
    let c = shadowCache.get(key);
    if (!c) {
      if (shadowCache.size > 5) shadowCache.delete(shadowCache.keys().next().value);
      c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const s = c.getContext('2d');
      s.shadowColor = `rgba(0,0,0,${Math.min(0.9, 0.45 * shadow)})`;
      s.shadowBlur = 40 * scaleUnit * shadow;
      s.shadowOffsetY = 14 * scaleUnit * shadow;
      roundRect(s, rect.x, rect.y, rect.w, rect.h, radius);
      s.fillStyle = '#000';
      s.fill();
      shadowCache.set(key, c);
    }
    ctx.drawImage(c, 0, 0);
  }
  ctx.save();
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.clip();
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const vw = video?.videoWidth || video?.displayWidth || 0;
  const vh = video?.videoHeight || video?.displayHeight || 0;
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
export const CLICK_EFFECTS = [
  { id: 'ripple', name: T('물결') }, { id: 'echo', name: T('겹물결') }, { id: 'spotlight', name: T('빛 번짐') },
  { id: 'burst', name: T('터짐') }, { id: 'none', name: T('없음') },
];

export function drawClicks(ctx, t, clicks, rect, view, cursorOpts, unit, scale) {
  const color = cursorOpts.color || '#ffd33d';
  const effect = cursorOpts.effect || 'ripple';
  if (effect === 'none') return;
  const dur = Math.max(0.2, cursorOpts.clickDur ?? 0.65);
  const size = (cursorOpts.clickSize ?? 1) * unit * Math.sqrt(scale);
  const op = cursorOpts.clickOpacity ?? 1;
  for (const c of clicks) {
    const age = t - c.t;
    if (age < 0) break;
    if (age > dur) continue;
    const k = age / dur;
    const p = toCanvas(c, rect, view);
    // Right clicks get a dashed ring so they read differently from left clicks.
    const right = c.button === 2;
    ctx.save();
    if (effect === 'spotlight') {
      const radius = (30 - 8 * k) * size;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      g.addColorStop(0, rgba(color, (1 - k) * 0.6 * op));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect === 'burst') {
      const e = easeOut(k);
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = 3.2 * size * (1 - k * 0.6);
      ctx.globalAlpha = op * (1 - k);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + 0.2;
        const r0 = (8 + 18 * e) * size;
        const r1 = (14 + 30 * e) * size;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(ang) * r0, p.y + Math.sin(ang) * r0);
        ctx.lineTo(p.x + Math.cos(ang) * r1, p.y + Math.sin(ang) * r1);
        ctx.stroke();
      }
      ctx.globalAlpha = op * ((1 - k) * 0.5);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 * size * (1 - k), 0, Math.PI * 2);
      ctx.fill();
    } else {
      const rings = effect === 'echo' ? 3 : 1;
      if (right) ctx.setLineDash([6 * size, 5 * size]);
      for (let i = 0; i < rings; i++) {
        const ki = (age - i * dur * 0.18) / (dur * (1 - 0.18 * (rings - 1)));
        if (ki < 0 || ki > 1) continue;
        const e = easeOut(ki);
        const radius = (10 + 34 * e) * size;
        ctx.globalAlpha = op * ((1 - ki) * (i === 0 ? 0.9 : 0.6));
        ctx.lineWidth = (i === 0 ? 4 : 2.6) * size;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        if (i === 0) {
          ctx.globalAlpha = op * ((1 - ki) * 0.3);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
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

export { CURSOR_STYLES, cursorShape };

/** How the redrawn pointer follows the real one: a spring with these values (mass 1 = normal). */
export const MOTION_PRESETS = [
  { id: 'raw', name: T('그대로'), spring: null },
  { id: 'precise', name: T('정확하게'), spring: { stiffness: 600, damping: 49, mass: 1 } },
  { id: 'snappy', name: T('빠릿하게'), spring: { stiffness: 320, damping: 30, mass: 1 } },
  { id: 'smooth', name: T('부드럽게'), spring: { stiffness: 170, damping: 26, mass: 1 } },
  { id: 'floaty', name: T('느긋하게'), spring: { stiffness: 90, damping: 15, mass: 1.2 } },
  { id: 'custom', name: T('직접'), spring: null },
];

/** The spring for the pointer settings, or null to follow the recording as it is. */
export function cursorSpring(o) {
  if (!o.motion) return null; // projects from before v1.3 keep their averaging smoothing
  if (o.motion === 'custom') {
    return { stiffness: 170 * (o.springStiffness ?? 1), damping: 26 * (o.springDamping ?? 1), mass: o.springMass ?? 1 };
  }
  return MOTION_PRESETS.find((m) => m.id === o.motion)?.spring || null;
}

/** Position of the redrawn cursor: smoothed, and brought back to where it began when looping. */
function cursorPos(cursor, t, o, range, clicks) {
  const spring = cursorSpring(o);
  const radius = o.motion ? 0 : (o.smoothing || 0) * 0.3;
  let p = spring && cursor.springAt ? cursor.springAt(t, spring) : radius > 0.01 ? cursor.smooth(t, radius) : cursor.at(t);
  const eased = !!spring || radius > 0.01;
  // Around a click the cursor must sit exactly where the click happened, however much
  // smoothing is on, or the click effect appears beside it.
  if (p && eased && clicks?.length) {
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
    const dur = Math.max(0.1, o.bounceDur ?? 0.28);
    for (let i = derived.clicks.length - 1; i >= 0; i--) {
      const age = t - derived.clicks[i].t;
      if (age < 0) continue;
      if (age < dur) size *= 1 - 0.3 * o.bounce * Math.sin(Math.PI * (age / dur));
      break;
    }
  }
  // Hide the pointer after it has rested for a while, fading out and back in.
  let fade = 1;
  if (o.idleHide > 0 && cursor.idleFor) {
    const idle = cursor.idleFor(t);
    fade = 1 - clamp01((idle - o.idleHide) / 0.4);
    if (fade <= 0) return;
  }
  // The pointer kind from the recording (hand over links, text cursor over text, …).
  let kind = o.followKind !== false && cursor.kindAt ? cursor.kindAt(t) : 'arrow';
  if (kind === 'hidden') {
    if (o.hideWhenHidden !== false) return;
    kind = 'arrow';
  }
  if (kind === 'other' || kind === 'up-arrow') kind = 'arrow';
  const tilt = isCentred(kind) ? 0 : Math.max(-0.45, Math.min(0.45, (vx / (1400 * unit)) * (o.sway || 0)));
  const speed = Math.hypot(vx, vy);
  const ghosts = o.motionBlur > 0 && speed > 500 * unit ? 4 : 0;
  for (let i = ghosts; i >= 0; i--) {
    const back = i * 0.011 * o.motionBlur;
    ctx.save();
    ctx.globalAlpha = fade * (i === 0 ? 1 : 0.22 * (1 - i / (ghosts + 1)));
    ctx.translate(a.x - vx * back, a.y - vy * back);
    ctx.rotate(tilt);
    if (i === 0) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 5 * size; ctx.shadowOffsetY = 1.5 * size; }
    cursorShape(ctx, o.style || 'arrow', size, o.color || '#ffd33d', kind, t, o.look);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ webcam
function drawWebcam(ctx, video, W, H, opts, unit, avoidBottom, camScale) {
  if (!video || !(video.videoWidth || video.displayWidth)) return;
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
  const vw = video.videoWidth || video.displayWidth;
  const vh = video.videoHeight || video.displayHeight;
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
// Keys are recorded with Windows names; on a Mac keyboard the same keys are called these.
const MAC_NAMES = { Win: 'Cmd', Alt: 'Option', Ctrl: 'Control' };
const MAC_SYMBOLS = { Win: '⌘', Alt: '⌥', Ctrl: '⌃', Shift: '⇧' };

function keyLabel(k, opts) {
  if (isModifier(k)) {
    const mac = opts.keyNames === 'mac';
    const symbol = (mac ? MAC_SYMBOLS : MOD_SYMBOLS)[k];
    const name = mac ? MAC_NAMES[k] || k : k;
    if (opts.modLabel === 'symbol') return symbol;
    return opts.modLabel === 'both' ? `${symbol} ${name}` : name;
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
  { id: 'text', name: T('글자') }, { id: 'arrow', name: T('화살표') }, { id: 'box', name: T('네모') },
  { id: 'image', name: T('그림') }, { id: 'blur', name: T('가리기') },
];

export function newNote(type, t, duration) {
  const base = { type, start: t, end: Math.min(duration, t + 3), x: 0.5, y: 0.5 };
  if (type === 'text') return { ...base, text: T('여기에 글자'), size: 54, color: '#ffffff', bg: '#000000', bgOn: true, bold: true };
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
/** Split words into the fewest lines that fit maxW (at least minLines), with similar widths. */
function layoutWords(words, widths, spaceW, maxW, minLines) {
  const total = widths.reduce((s, w, i) => s + w + (i && words[i].space ? spaceW : 0), 0);
  const n = Math.max(minLines, Math.ceil(total / maxW));
  const fill = (limit) => {
    const lines = [];
    let cur = null;
    words.forEach((w, i) => {
      const g = cur && cur.items.length && w.space ? spaceW : 0;
      if (cur && cur.items.length && cur.width + g + widths[i] > limit) cur = null;
      if (!cur) { cur = { items: [], width: 0 }; lines.push(cur); }
      const gap = cur.items.length && w.space ? spaceW : 0;
      cur.items.push({ word: w, x: cur.width + gap, w: widths[i] });
      cur.width += gap + widths[i];
    });
    return lines;
  };
  // Start from an even split and widen until the words fit in n lines.
  let limit = total / n;
  let lines = fill(limit);
  while (lines.length > n && limit < maxW) {
    limit = Math.min(maxW, limit * 1.04 + 1);
    lines = fill(limit);
  }
  return lines;
}

export function drawSubtitle(ctx, W, H, t, subtitles, opts, unit, bottomOffset = 0) {
  if (!opts.enabled || !subtitles?.length) return 0;
  const cue = cueAt(subtitles, t);
  if (!cue) return 0;
  const style = opts.style || 'box';
  const minimal = style === 'minimal';
  const pop = style === 'pop';
  const size = 34 * unit * (opts.size || 1) * (minimal ? 0.82 : pop ? 1.12 : 1);
  const weight = pop ? 800 : minimal ? 500 : 600;
  const font = `${weight} ${size}px ${FONT}`;
  ctx.save();
  ctx.font = font;
  const words = cueWords(cue);
  const widths = words.map((w) => ctx.measureText(w.text).width);
  const spaceW = ctx.measureText(' ').width;
  const maxW = W * 0.84;
  const lines = layoutWords(words, widths, spaceW, maxW, cue.text.length > lineLimit(cue.text) ? 2 : 1);

  const lineH = size * 1.32;
  const padX = 18 * unit;
  const padY = 9 * unit;
  const blockH = lines.length * lineH + padY * 2;
  const margin = 40 * unit;
  const pos = opts.position || 'bottom';
  let y0 = pos === 'top' ? margin : pos === 'middle' ? (H - blockH) / 2 : H - margin - bottomOffset - blockH;

  // Entrance and exit.
  const anim = opts.anim || 'fade';
  const kin = anim === 'none' ? 1 : easeOut((t - cue.start) / 0.22);
  const kout = anim === 'none' ? 1 : clamp01((cue.end - t) / 0.15);
  ctx.globalAlpha = Math.min(kin, kout);
  if (anim === 'rise') y0 += (1 - kin) * 18 * unit;
  if (anim === 'pop') {
    const sc = 0.82 + 0.18 * kin + 0.06 * Math.sin(Math.PI * clamp01((t - cue.start) / 0.3));
    ctx.translate(W / 2, y0 + blockH / 2);
    ctx.scale(sc, sc);
    ctx.translate(-W / 2, -(y0 + blockH / 2));
  }

  const textColor = style === 'paper' ? '#111827' : style === 'yellow' ? '#ffe14d' : (opts.textColor || '#ffffff');
  const hi = opts.highlight || '#ffd33d';
  const bgAlpha = opts.bgOpacity ?? 0.68;
  const boxed = style === 'box' || style === 'paper';
  if (boxed && bgAlpha > 0) {
    lines.forEach((line, i) => {
      const cy = y0 + padY + lineH * i + lineH / 2;
      const top0 = i === 0 ? cy - lineH / 2 - padY : cy - lineH / 2;
      const bottom0 = i === lines.length - 1 ? cy + lineH / 2 + padY : cy + lineH / 2;
      roundRect(ctx, W / 2 - line.width / 2 - padX, top0, line.width + padX * 2, bottom0 - top0, 10 * unit);
      ctx.fillStyle = style === 'paper' ? rgba('#ffffff', Math.max(0.6, bgAlpha)) : rgba('#000000', bgAlpha);
      ctx.fill();
    });
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const stroke = !boxed;
  lines.forEach((line, i) => {
    const cy = y0 + padY + lineH * i + lineH / 2;
    const x0 = W / 2 - line.width / 2;
    for (const it of line.items) {
      const w = it.word;
      const active = t >= w.start && t < w.end;
      const spoken = t >= w.end;
      let color = textColor;
      if (style === 'karaoke' && (active || spoken)) color = hi;
      if (pop && active) color = hi;
      ctx.save();
      let x = x0 + it.x;
      if (pop && active) {
        const k = clamp01((t - w.start) / 0.12);
        const sc = 1 + 0.14 * Math.sin(Math.PI * 0.5 * k);
        ctx.translate(x + it.w / 2, cy);
        ctx.scale(sc, sc);
        ctx.translate(-(x + it.w / 2), -cy);
      }
      if (minimal) {
        ctx.shadowColor = 'rgba(0,0,0,0.75)';
        ctx.shadowBlur = size * 0.22;
        ctx.shadowOffsetY = size * 0.05;
      } else if (stroke) {
        ctx.lineWidth = size * (pop ? 0.22 : 0.16);
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.strokeText(w.text, x, cy);
      }
      ctx.fillStyle = color;
      ctx.fillText(w.text, x, cy);
      ctx.restore();
    }
  });
  ctx.restore();
  return pos === 'bottom' ? blockH + 12 * unit : 0;
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
  const srcW = f.screen?.videoWidth || f.screen?.displayWidth || project.source?.width || 1920;
  const srcH = f.screen?.videoHeight || f.screen?.displayHeight || project.source?.height || 1080;
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
  bottom += drawSubtitle(ctx, W, H, t, project.subtitles, subOpts, unit, 0);
  const keyUsed = drawKeys(ctx, W, H, t, derived.groups, s.keys, unit, keysBottom ? bottom : 0);
  if (s.webcam.enabled && f.webcam) {
    const side = (s.webcam.position || '').split('-')[1];
    const avoid = keysBottom && !s.keys.position.endsWith('center') && side && s.keys.position.endsWith(side) ? keyUsed : 0;
    drawWebcam(ctx, f.webcam, W, H, s.webcam, unit, avoid, cam.scale);
  }
}
