// Live key bubbles shown on top of everything while recording, or on their own (keyviz-style),
// with click rings and a wheel mark next to the cursor.
import { buildKeyGroups, KEY_DEFAULTS } from './lib/keys.js';
import { drawKeys, drawClicks, drawScrolls, drawHighlight } from './lib/compositor.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let opts = { ...KEY_DEFAULTS };
let mouse = { clicks: true, scrolls: true, highlight: false, color: '#ffd33d', effect: 'ripple' };
try {
  const given = JSON.parse(decodeURIComponent(location.hash.slice(1) || '%7B%7D'));
  if (given.mouse) mouse = { ...mouse, ...given.mouse };
  delete given.mouse;
  opts = { ...opts, ...given, enabled: true };
} catch { /* defaults */ }

const t0 = Date.now();
let events = [];
let groups = [];
let clicks = [];
let scrolls = [];
let pointer = null;
let dirty = true;

window.keycast?.onLiveInput((ev) => {
  const t = (ev.t - t0) / 1000;
  const here = ev.x !== null && ev.x !== undefined;
  if (ev.type === 'mm') {
    if (here) pointer = { x: ev.x, y: ev.y };
    // Movement only matters to the key bubbles while a button is held (drag).
    if (!holding) return;
  }
  if (ev.type === 'md') { holding = true; if (here) { pointer = { x: ev.x, y: ev.y }; clicks.push({ t, x: ev.x, y: ev.y }); if (clicks.length > 30) clicks.shift(); } }
  if (ev.type === 'mu') holding = false;
  if (ev.type === 'wh' && here) { scrolls.push({ t, x: ev.x, y: ev.y, rotation: ev.rotation }); if (scrolls.length > 30) scrolls.shift(); }
  events.push({ ...ev, t });
  // Keep the last minute only.
  const cutoff = (Date.now() - t0) / 1000 - 60;
  if (events.length > 900) events = events.filter((e) => e.t > cutoff);
  dirty = true;
});
let holding = false;

function frame() {
  requestAnimationFrame(frame);
  const dpr = window.devicePixelRatio || 1;
  const W = Math.round(innerWidth * dpr);
  const H = Math.round(innerHeight * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  if (dirty) { groups = buildKeyGroups(events, opts); dirty = false; }
  ctx.clearRect(0, 0, W, H);
  const unit = Math.min(W, H) / 1080;
  const t = (Date.now() - t0) / 1000;
  const rect = { x: 0, y: 0, w: W, h: H };
  const view = { x: 0, y: 0, w: 1, h: 1 };
  if (mouse.highlight && pointer) drawHighlight(ctx, { x: pointer.x * W, y: pointer.y * H }, unit, mouse.color);
  if (mouse.clicks) drawClicks(ctx, t, clicks, rect, view, mouse, unit, 1);
  if (mouse.scrolls) drawScrolls(ctx, t, scrolls, rect, view, mouse, unit);
  drawKeys(ctx, W, H, t, groups, opts, unit, opts.position?.startsWith('bottom') ? 40 * unit : 0);
}
frame();
