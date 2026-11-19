// Auto-zoom on clicks and the smoothed camera that follows the cursor.
// Positions are normalised (0..1) across the recorded screen; times are seconds.

export const ZOOM_DEFAULTS = { enabled: true, scale: 1.8, follow: true, ramp: 0.55 };

let idSeq = 1;
export function newId(prefix = 'z') {
  return `${prefix}${Date.now().toString(36)}${(idSeq++).toString(36)}`;
}

export function clicksOf(events) {
  return events.filter((e) => e.type === 'md' && e.x !== null && e.x !== undefined && e.x >= 0 && e.x <= 1 && e.y >= 0 && e.y <= 1);
}

/** Build zoom regions around clicks: nearby clicks share one region. */
export function autoZoomRegions(events, duration, scale = ZOOM_DEFAULTS.scale) {
  const clicks = clicksOf(events);
  const regions = [];
  const lead = 0.7;
  const tail = 2.2;
  for (const c of clicks) {
    const last = regions[regions.length - 1];
    const start = Math.max(0, c.t - lead);
    const end = Math.min(duration, c.t + tail);
    const far = last ? Math.hypot(c.x - last._cx, c.y - last._cy) > 0.45 : true;
    if (last && start <= last.end + 0.8 && !far) {
      last.end = Math.max(last.end, end);
      last._n += 1;
      last._cx += (c.x - last._cx) / last._n;
      last._cy += (c.y - last._cy) / last._n;
    } else {
      regions.push({ id: newId(), start, end, scale, auto: true, _cx: c.x, _cy: c.y, _n: 1 });
    }
  }
  return regions
    .filter((r) => r.end - r.start > 0.5)
    .map((r) => ({ id: r.id, start: r.start, end: r.end, scale: r.scale, auto: true, x: r._cx, y: r._cy }));
}

export class CursorTrack {
  constructor(events) {
    this.points = events
      .filter((e) => (e.type === 'mm' || e.type === 'md' || e.type === 'mu') && e.x !== null && e.x !== undefined)
      .map((e) => ({ t: e.t, x: e.x, y: e.y }))
      .sort((a, b) => a.t - b.t);
  }

  get available() {
    return this.points.length > 0;
  }

  at(t) {
    const p = this.points;
    if (!p.length) return null;
    if (t <= p[0].t) return { x: p[0].x, y: p[0].y };
    if (t >= p[p.length - 1].t) return { x: p[p.length - 1].x, y: p[p.length - 1].y };
    let lo = 0;
    let hi = p.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (p[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = p[lo];
    const b = p[hi];
    const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }

  /** Average position around t, so the camera glides instead of shaking. */
  smooth(t, radius = 0.35) {
    if (!this.points.length) return null;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let dt = -radius; dt <= radius + 1e-9; dt += radius / 4) {
      const q = this.at(t + dt);
      const w = 1 - Math.abs(dt) / (radius * 1.2);
      sx += q.x * w;
      sy += q.y * w;
      n += w;
    }
    return { x: sx / n, y: sy / n };
  }
}

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** Camera at time t: zoom factor and the normalised point it looks at. */
export function cameraAt(t, regions, cursor, opts = ZOOM_DEFAULTS) {
  if (!opts.enabled || !regions.length) return { scale: 1, x: 0.5, y: 0.5 };
  const now = rawCamera(t, regions, cursor, opts);
  if (!now.weight) return { scale: 1, x: 0.5, y: 0.5 };
  // Where the camera looks is averaged over a short stretch of time, so moving from one
  // zoom to the next is an unhurried pan. How far it is zoomed in is left as it is.
  let wsum = 0;
  let x = 0;
  let y = 0;
  const span = 0.6;
  for (let i = -4; i <= 4; i++) {
    const dt = (i / 4) * span;
    const c = i === 0 ? now : rawCamera(t + dt, regions, cursor, opts);
    const w = (1 - Math.abs(i) / 5) * c.weight;
    if (w <= 0) continue;
    wsum += w;
    x += w * c.x;
    y += w * c.y;
  }
  return { scale: now.scale, x: x / wsum, y: y / wsum };
}

function rawCamera(t, regions, cursor, opts) {
  const ramp = opts.ramp ?? 0.55;
  // Every region that is active (or easing in or out) pulls on the camera in proportion to
  // how far in it is. Where one zoom hands over to the next the camera glides across
  // instead of jumping from one spot to the other.
  let weight = 0;
  let x = 0;
  let y = 0;
  let extra = 0;
  let top = 0;
  const follow = opts.follow && cursor && cursor.available;
  for (const r of regions) {
    if (t < r.start - 0.001 || t > r.end + ramp) continue;
    let amount;
    if (t < r.start + ramp) amount = ease(Math.max(0, (t - r.start) / ramp));
    else if (t > r.end) amount = ease(Math.max(0, 1 - (t - r.end) / ramp));
    else amount = 1;
    if (amount <= 0) continue;
    let tx = r.x;
    let ty = r.y;
    if (follow) {
      const s = cursor.smooth(Math.min(Math.max(t, r.start), r.end), 0.5);
      if (s) {
        tx = r.x * 0.35 + s.x * 0.65;
        ty = r.y * 0.35 + s.y * 0.65;
      }
    }
    weight += amount;
    x += amount * tx;
    y += amount * ty;
    extra += amount * (r.scale - 1);
    top = Math.max(top, amount);
  }
  if (!weight) return { scale: 1, x: 0.5, y: 0.5, weight: 0 };
  return { scale: 1 + (extra / weight) * top, x: x / weight, y: y / weight, weight: Math.min(1, weight) };
}

/** Which part of the source (normalised) is visible for a camera. */
export function viewRect(cam) {
  const w = 1 / cam.scale;
  const h = 1 / cam.scale;
  const x = Math.min(Math.max(cam.x - w / 2, 0), 1 - w);
  const y = Math.min(Math.max(cam.y - h / 2, 0), 1 - h);
  return { x, y, w, h };
}
