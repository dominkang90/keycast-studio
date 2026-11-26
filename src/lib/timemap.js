// Maps recording time to finished-video time. Cut-out parts are skipped and speed
// regions stretch or squeeze what is left. All times are seconds.

/**
 * The pieces of the recording that end up in the video, in order.
 * @returns {Array<{s0:number,s1:number,speed:number,o0:number,o1:number}>}
 */
export function segments(project) {
  const dur = (project.durationMs || 0) / 1000;
  const a = Math.max(0, project.trim?.start || 0);
  const b = Math.min(dur, project.trim?.end ?? dur);
  let keep = b > a ? [[a, b]] : [];
  const cuts = [...(project.cuts || [])].sort((x, y) => x.start - y.start);
  for (const c of cuts) {
    const next = [];
    for (const [s, e] of keep) {
      if (c.end <= s || c.start >= e) { next.push([s, e]); continue; }
      if (c.start - s > 0.02) next.push([s, c.start]);
      if (e - c.end > 0.02) next.push([c.end, e]);
    }
    keep = next;
  }
  const speeds = (project.speeds || []).filter((r) => r.end > r.start && r.speed > 0);
  const speedAt = (t) => speeds.find((r) => t >= r.start && t < r.end)?.speed || 1;
  const out = [];
  let o = 0;
  for (const [s, e] of keep) {
    const points = new Set([s, e]);
    for (const r of speeds) {
      if (r.start > s && r.start < e) points.add(r.start);
      if (r.end > s && r.end < e) points.add(r.end);
    }
    const sorted = [...points].sort((x, y) => x - y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const s0 = sorted[i];
      const s1 = sorted[i + 1];
      if (s1 - s0 < 1e-4) continue;
      const speed = speedAt((s0 + s1) / 2);
      const len = (s1 - s0) / speed;
      out.push({ s0, s1, speed, o0: o, o1: o + len });
      o += len;
    }
  }
  return out;
}

export function outDuration(segs) {
  return segs.length ? segs[segs.length - 1].o1 : 0;
}

/** Index of the piece that holds recording time t, or of the next piece after it (-1 past the end). */
export function segIndexAt(segs, t) {
  for (let i = 0; i < segs.length; i++) if (t < segs[i].s1 - 1e-6) return i;
  return -1;
}

export function srcToOut(segs, t) {
  if (!segs.length) return 0;
  const i = segIndexAt(segs, t);
  if (i < 0) return outDuration(segs);
  const g = segs[i];
  if (t <= g.s0) return g.o0;
  return g.o0 + (t - g.s0) / g.speed;
}

export function outToSrc(segs, o) {
  if (!segs.length) return 0;
  for (const g of segs) {
    if (o < g.o1 - 1e-9) return g.s0 + Math.max(0, o - g.o0) * g.speed;
  }
  return segs[segs.length - 1].s1;
}

/** Subtitles re-timed for the finished video (parts inside cut-out sections disappear). */
export function mapCues(subtitles, segs) {
  const out = [];
  for (const s of subtitles || []) {
    const start = srcToOut(segs, s.start);
    const end = srcToOut(segs, s.end);
    if (end - start > 0.05) out.push({ ...s, start, end });
  }
  return out;
}

/**
 * Keeps the added sound files in step with the picture.
 * @param {Map<string,HTMLMediaElement>} els sound elements by region id
 */
export function syncAudios(els, project, segs, t, playing) {
  if (!els?.size) return;
  const o = srcToOut(segs, t);
  for (const a of project.audios || []) {
    const el = els.get(a.id);
    if (!el) continue;
    const pos = o - srcToOut(segs, a.start) + (a.offset || 0);
    const inside = playing && t >= a.start && t < a.end && pos >= 0 && (!Number.isFinite(el.duration) || pos < el.duration);
    if (!inside) { if (!el.paused) el.pause(); continue; }
    el.volume = Math.min(1, Math.max(0, a.volume ?? 1));
    if (Math.abs(el.currentTime - pos) > 0.3) el.currentTime = pos;
    if (el.paused) el.play().catch(() => {});
  }
}

/**
 * Where the finished video jumps over a cut (times on the finished video), and how long the sound
 * dips there: a few milliseconds, or longer with the dip-to-black transition.
 */
export function cutFade(project, segs) {
  const times = segs.slice(1).filter((g, i) => Math.abs(g.s0 - segs[i].s1) > 1e-3).map((g) => g.o0);
  const len = project.settings?.cut?.transition === 'fade' ? Math.min(0.2, (project.settings.cut.duration || 0.3) / 2) : 0.02;
  return { times, len };
}

/** Fades the sound out and back in around each cut so the join does not click. planes: one array per channel, starting at sample `start`. */
export function softenCuts(planes, start, rate, fade) {
  if (!fade.times.length || !planes.length) return;
  const n = planes[0].length;
  for (const c of fade.times) {
    const a = Math.max(0, Math.floor((c - fade.len) * rate) - start);
    const b = Math.min(n, Math.ceil((c + fade.len) * rate) - start);
    for (let i = a; i < b; i++) {
      const d = Math.abs((start + i) / rate - c);
      if (d >= fade.len) continue;
      const g = d / fade.len;
      for (const ch of planes) ch[i] *= g;
    }
  }
}
