// Finding the quiet parts of a recording, to cut them out in one go.
// Works on plain samples, so it runs (and is tested) without a browser.

const WINDOW = 0.02; // seconds per loudness step

/** Loudness in dB for each 20 ms step. */
export function loudness(samples, rate) {
  const n = Math.max(1, Math.round(rate * WINDOW));
  const steps = Math.floor(samples.length / n);
  const db = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    let sum = 0;
    for (let j = i * n, end = j + n; j < end; j++) sum += samples[j] * samples[j];
    db[i] = 10 * Math.log10(sum / n + 1e-10);
  }
  return db;
}

function percentile(values, p) {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * Quiet stretches of at least `minGap` seconds, shortened by `pad` on both sides so words are not
 * clipped. The line between quiet and speech follows the recording: just above its background noise.
 * @param {Float32Array} samples mono samples
 * @param {number} rate samples per second
 * @param {{minGap?:number, pad?:number, offset?:number, busy?:Array<[number,number]>}} opts
 *   offset: seconds the sound starts after the picture; busy: [start, end] times to keep (things happening on screen)
 * @returns {{cuts:Array<{start:number,end:number}>, threshold:number, clear:boolean}}
 */
export function findSilences(samples, rate, { minGap = 1, pad = 0.25, offset = 0, busy = [] } = {}) {
  const db = loudness(samples, rate);
  if (db.length < 10) return { cuts: [], threshold: 0, clear: false };
  const floor = percentile(db, 0.1);
  const speech = percentile(db, 0.95);
  // A recording with no clear difference between talk and pauses (all silent, or music throughout).
  const clear = speech - floor >= 12 && speech > -45;
  if (!clear) return { cuts: [], threshold: floor, clear };
  const threshold = Math.max(floor + 8, Math.min(floor + (speech - floor) * 0.3, speech - 12));
  const runs = [];
  let start = -1;
  for (let i = 0; i <= db.length; i++) {
    const quiet = i < db.length && db[i] < threshold;
    if (quiet && start < 0) start = i;
    if (!quiet && start >= 0) {
      runs.push([start * WINDOW + offset, i * WINDOW + offset]);
      start = -1;
    }
  }
  const cuts = [];
  for (const [s, e] of runs) {
    if (e - s < minGap) continue;
    // A quiet stretch at the very start or end needs no room for a word on that side.
    const a = s <= offset + WINDOW ? s : s + pad;
    const b = e >= db.length * WINDOW + offset - WINDOW ? e : e - pad;
    // Split around anything that happens on screen (typing, clicks, pointer moves).
    let pieces = [[a, b]];
    for (const [bs, be] of busy) {
      pieces = pieces.flatMap(([x, y]) => (be <= x || bs >= y ? [[x, y]] : [[x, bs], [be, y]]));
    }
    for (const [x, y] of pieces) if (y - x >= 0.3) cuts.push({ start: +x.toFixed(3), end: +y.toFixed(3) });
  }
  return { cuts, threshold, clear };
}

/** Times with something happening on screen, each widened by `margin` seconds and merged. */
export function busyTimes(events, margin = 0.6) {
  const times = (events || []).filter((e) => e.type === 'kd' || e.type === 'md' || e.type === 'wh' || e.type === 'mm').map((e) => e.t).sort((a, b) => a - b);
  const out = [];
  for (const t of times) {
    const last = out[out.length - 1];
    if (last && t - margin <= last[1]) last[1] = t + margin;
    else out.push([t - margin, t + margin]);
  }
  return out;
}
