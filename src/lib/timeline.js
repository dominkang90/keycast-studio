// The editing timeline: trim handles and cut-out parts, speed regions, zoom blocks, notes,
// added sound, key marks and subtitle blocks.

import { newId } from './zoom.js';
import { T, lang } from './i18n.js';

const GUTTER = 64;
const RULER = 24;
const TRACK = 28;
const TRACKS = ['clip', 'speed', 'zoom', 'notes', 'audio', 'keys', 'subs'];
const LABELS = { clip: T('영상'), speed: T('속도'), zoom: T('줌'), notes: T('주석'), audio: T('소리'), keys: T('키'), subs: T('자막') };
// Which list of the project each row shows, and what its blocks are called when selected.
const ROWS = {
  clip: { list: 'cuts', kind: 'cut' },
  speed: { list: 'speeds', kind: 'speed' },
  zoom: { list: 'zooms', kind: 'zoom' },
  notes: { list: 'annotations', kind: 'note' },
  audio: { list: 'audios', kind: 'audio' },
  subs: { list: 'subtitles', kind: 'sub' },
};
// One hue per kind of block. Blocks are a quiet tint with a coloured edge, so the timeline
// reads as a tool and the colour stays in the picture above it.
const COLORS = { speed: '#e3b341', zoom: '#9d8cff', note: '#e58fb1', audio: '#5ac8c8', sub: '#4cc38a' };
const INK = { text: '#ededed', text2: '#a1a1a6', text3: '#85858b', row: '#19191b', rec: '#ff453a', cut: '#e5484d' };
// The fallback font for letters the Latin fonts lack follows the interface language.
const CJK_FONT = { ja: '"Yu Gothic UI", "Meiryo UI"', 'zh-CN': '"Microsoft YaHei UI"', 'zh-TW': '"Microsoft JhengHei UI"' }[lang] || '"Malgun Gothic"';
const UI_FONT = `11.5px "Segoe UI Variable Text", "Segoe UI", ${CJK_FONT}, sans-serif`;
const MONO_FONT = `11px "Cascadia Mono", Consolas, ${CJK_FONT}, monospace`;
const NOTE_NAMES = { text: T('글자'), arrow: T('화살표'), box: T('네모'), image: T('그림'), blur: T('가리기') };

export function listOfKind(project, kind) {
  const row = Object.values(ROWS).find((r) => r.kind === kind);
  return row ? project[row.list] : null;
}

export class Timeline {
  constructor(canvas, handlers) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.h = handlers;
    this.project = null;
    this.derived = null;
    this.time = 0;
    this.selected = null;
    this.drag = null;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('dblclick', (e) => this.dbl(e));
    new ResizeObserver(() => this.render()).observe(canvas);
  }

  get duration() { return this.project ? this.project.durationMs / 1000 : 1; }
  get width() { return this.canvas.clientWidth; }
  x(t) { return GUTTER + (t / this.duration) * (this.width - GUTTER - 10); }
  t(x) { return Math.min(this.duration, Math.max(0, ((x - GUTTER) / (this.width - GUTTER - 10)) * this.duration)); }
  rowY(name) { return RULER + TRACKS.indexOf(name) * TRACK; }

  setData(project, derived) { this.project = project; this.derived = derived; this.render(); }
  setTime(t) { this.time = t; this.render(); }
  select(sel) { this.selected = sel; this.render(); }

  hit(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const row = y < RULER ? 'ruler' : TRACKS[Math.floor((y - RULER) / TRACK)] || null;
    const res = { x, y, row, t: this.t(x) };
    const p = this.project;
    if (!p) return res;
    const near = (a) => Math.abs(x - this.x(a)) <= 6;
    if (row === 'clip') {
      if (near(p.trim.start)) res.part = 'trim-start';
      else if (near(p.trim.end)) res.part = 'trim-end';
      if (res.part) return res;
    }
    const def = ROWS[row];
    const list = def ? p[def.list] : null;
    if (list) {
      for (const item of list) {
        if (x >= this.x(item.start) - 5 && x <= this.x(item.end) + 5) {
          res.item = item;
          res.kind = def.kind;
          res.part = near(item.start) ? 'start' : near(item.end) ? 'end' : 'body';
          break;
        }
      }
    }
    return res;
  }

  down(e) {
    if (!this.project) return;
    const h = this.hit(e);
    this.canvas.setPointerCapture(e.pointerId);
    if (h.row === 'clip' && h.part?.startsWith('trim')) {
      this.drag = { mode: h.part, t0: h.t };
    } else if (h.item) {
      this.selected = { kind: h.kind, id: h.item.id };
      this.h.onSelect?.(this.selected);
      this.drag = { mode: 'item', part: h.part, item: h.item, t0: h.t, start: h.item.start, end: h.item.end };
    } else {
      if (ROWS[h.row] && this.selected) {
        this.selected = null;
        this.h.onSelect?.(null);
      }
      this.drag = { mode: 'scrub' };
      this.h.onSeek?.(h.t);
    }
    this.render();
  }

  move(e) {
    const h = this.hit(e);
    if (!this.drag) {
      this.canvas.style.cursor = h.part === 'start' || h.part === 'end' || h.part?.startsWith('trim') ? 'ew-resize' : h.item ? 'grab' : 'pointer';
      return;
    }
    const p = this.project;
    const d = this.drag;
    if (d.mode === 'scrub') this.h.onSeek?.(h.t);
    else if (d.mode === 'trim-start') { p.trim.start = Math.min(h.t, p.trim.end - 0.5); this.h.onSeek?.(p.trim.start); d.changed = true; }
    else if (d.mode === 'trim-end') { p.trim.end = Math.max(h.t, p.trim.start + 0.5); this.h.onSeek?.(p.trim.end); d.changed = true; }
    else if (d.mode === 'item') {
      const dt = h.t - d.t0;
      const it = d.item;
      if (d.part === 'start') it.start = Math.min(Math.max(0, d.start + dt), it.end - 0.2);
      else if (d.part === 'end') it.end = Math.max(Math.min(this.duration, d.end + dt), it.start + 0.2);
      else {
        const len = d.end - d.start;
        it.start = Math.min(Math.max(0, d.start + dt), this.duration - len);
        it.end = it.start + len;
      }
      if (it.auto) it.auto = false;
      d.changed = true;
    }
    this.render();
  }

  up(e) {
    if (this.drag?.changed) this.h.onChange?.();
    this.drag = null;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  dbl(e) {
    const h = this.hit(e);
    if (!this.project || h.item) return;
    const t = h.t;
    if (h.row === 'zoom') {
      const z = { id: newId(), start: Math.max(0, t - 0.5), end: Math.min(this.duration, t + 2.5), scale: this.project.settings.zoom.scale, auto: false, x: 0.5, y: 0.5 };
      const c = this.derived?.cursor?.at(t);
      if (c) { z.x = c.x; z.y = c.y; }
      this.project.zooms.push(z);
      this.project.zooms.sort((a, b) => a.start - b.start);
      this.selected = { kind: 'zoom', id: z.id };
      this.h.onSelect?.(this.selected);
      this.h.onChange?.();
    } else if (h.row === 'subs') {
      const s = { id: newId('s'), start: t, end: Math.min(this.duration, t + 2.5), text: T('새 자막') };
      this.project.subtitles.push(s);
      this.project.subtitles.sort((a, b) => a.start - b.start);
      this.selected = { kind: 'sub', id: s.id };
      this.h.onSelect?.(this.selected);
      this.h.onChange?.();
    } else if (ROWS[h.row]) {
      // Cut-out parts, speed regions, notes and sound are made by the editor.
      this.h.onAdd?.(ROWS[h.row].kind, t);
    }
    this.render();
  }

  block(item, row, kind, label) {
    const ctx = this.ctx;
    const y = this.rowY(row);
    const sel = this.selected?.kind === kind && this.selected.id === item.id;
    const xs = this.x(item.start);
    const w = Math.max(4, this.x(item.end) - xs);
    const color = COLORS[kind];
    ctx.save();
    roundRect(ctx, xs, y + 4, w, TRACK - 8, 4);
    ctx.globalAlpha = sel ? 0.5 : 0.24;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.clip();
    ctx.fillRect(xs, y + 4, 2, TRACK - 8); // the edge that says what kind of block it is
    ctx.restore();
    if (sel) {
      roundRect(ctx, xs + 0.5, y + 4.5, w - 1, TRACK - 9, 4);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    // Where blocks overlap, only the first one is named: two labels on top of each other read as neither.
    const free = this.labelEnd[row] ?? -Infinity;
    if (label && w > 28 && xs >= free) {
      this.labelEnd[row] = xs + Math.min(w, ctx.measureText(label).width + 16);
      ctx.save();
      ctx.beginPath();
      ctx.rect(xs, y, w - 4, TRACK);
      ctx.clip();
      ctx.fillStyle = INK.text;
      ctx.fillText(label, xs + 8, y + TRACK / 2);
      ctx.restore();
    }
  }

  render() {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = RULER + TRACKS.length * TRACK + 6;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.height = `${H}px`;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = MONO_FONT;
    if (!this.project) return;
    const p = this.project;
    const dur = this.duration;

    // ruler
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const pxPerSec = (W - GUTTER - 10) / dur;
    const step = steps.find((s) => s * pxPerSec >= 70) || 600;
    ctx.fillStyle = INK.text3;
    ctx.strokeStyle = 'rgba(237,237,237,0.16)';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (let s = 0; s <= dur + 1e-6; s += step) {
      const x = this.x(s);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, RULER - 7);
      ctx.lineTo(x + 0.5, RULER);
      ctx.stroke();
      ctx.fillText(fmt(s, step < 1), x + 4, RULER / 2 - 1);
    }
    ctx.font = UI_FONT;

    for (const name of TRACKS) {
      const y = this.rowY(name);
      ctx.fillStyle = INK.row;
      roundRect(ctx, GUTTER, y + 2, W - GUTTER - 10, TRACK - 4, 4);
      ctx.fill();
      ctx.fillStyle = INK.text3;
      ctx.textAlign = 'left';
      ctx.fillText(LABELS[name], 16, y + TRACK / 2);
    }

    // clip with trim, then the parts cut out of it
    {
      const y = this.rowY('clip');
      const xs = this.x(p.trim.start);
      const xe = this.x(p.trim.end);
      // the recording itself: a neutral bar with two bright handles for the ends
      ctx.fillStyle = 'rgba(237,237,237,0.16)';
      roundRect(ctx, xs, y + 4, xe - xs, TRACK - 8, 4);
      ctx.fill();
      ctx.fillStyle = INK.text;
      roundRect(ctx, xs, y + 4, 4, TRACK - 8, 2);
      ctx.fill();
      roundRect(ctx, xe - 4, y + 4, 4, TRACK - 8, 2);
      ctx.fill();
      ctx.fillStyle = INK.text2;
      // Screen names come from Windows in its own language; show the app's word for a screen instead.
      const label = p.source?.kind === 'screen' ? T('전체 화면') : p.source?.name ? truncate(p.source.name, 40) : T('화면');
      ctx.fillText(label, xs + 12, y + TRACK / 2);
      for (const cut of p.cuts || []) {
        const sel = this.selected?.kind === 'cut' && this.selected.id === cut.id;
        const cx = this.x(cut.start);
        const cw = Math.max(4, this.x(cut.end) - cx);
        ctx.fillStyle = INK.row;
        roundRect(ctx, cx, y + 4, cw, TRACK - 8, 3);
        ctx.fill();
        ctx.globalAlpha = sel ? 0.6 : 0.34;
        ctx.fillStyle = INK.cut;
        ctx.fill();
        ctx.globalAlpha = 1;
        if (sel) { ctx.strokeStyle = INK.cut; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1; }
        if (cw > 22) { ctx.fillStyle = INK.text; ctx.fillText('✂', cx + 5, y + TRACK / 2); }
      }
    }

    this.labelEnd = {};
    for (const r of p.speeds || []) this.block(r, 'speed', 'speed', `${r.speed}×`);
    for (const z of p.zooms) this.block(z, 'zoom', 'zoom', `${z.scale.toFixed(1)}×`);
    for (const a of p.annotations || []) this.block(a, 'notes', 'note', a.type === 'text' ? a.text : NOTE_NAMES[a.type]);
    for (const a of p.audios || []) this.block(a, 'audio', 'audio', `♪ ${a.name || ''}`);

    // key marks
    if (this.derived?.groups) {
      const y = this.rowY('keys');
      for (const g of this.derived.groups) {
        // shortcuts stand out, typing and mouse are quieter
        ctx.fillStyle = g.kind === 'combo' ? INK.text : g.kind === 'mouse' ? INK.text3 : 'rgba(237,237,237,0.34)';
        const xs = this.x(g.start);
        const xe = Math.max(xs + 2, this.x(g.end));
        ctx.fillRect(xs, y + 10, xe - xs, TRACK - 20);
      }
    }

    for (const s of p.subtitles) this.block(s, 'subs', 'sub', s.text);

    // dim what will not be in the video: outside the trim and inside cut-out parts
    ctx.fillStyle = 'rgba(20,20,21,0.66)';
    ctx.fillRect(GUTTER, RULER, this.x(p.trim.start) - GUTTER, H - RULER);
    ctx.fillRect(this.x(p.trim.end), RULER, W - 10 - this.x(p.trim.end), H - RULER);
    const clipBottom = this.rowY('clip') + TRACK;
    for (const cut of p.cuts || []) ctx.fillRect(this.x(cut.start), clipBottom, this.x(cut.end) - this.x(cut.start), H - clipBottom);

    // playhead
    const px = this.x(this.time);
    ctx.strokeStyle = INK.rec;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, 2);
    ctx.lineTo(px, H);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = INK.rec;
    ctx.beginPath();
    ctx.moveTo(px - 6, 0);
    ctx.lineTo(px + 6, 0);
    ctx.lineTo(px, 8);
    ctx.fill();
  }
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

function truncate(s, n) { return s.length > n ? `${s.slice(0, n - 1)}…` : s; }

export function fmt(sec, withMs = false) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  if (withMs) return `${m}:${r.toFixed(1).padStart(4, '0')}`;
  return `${m}:${String(Math.floor(r)).padStart(2, '0')}`;
}
