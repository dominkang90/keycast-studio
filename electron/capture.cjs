// Screen capture without the mouse pointer, so the editor can draw a nicer one instead.
// Windows: wgc-capture.exe (Windows Graphics Capture with hardware H.264, from Recordly, see
// scripts/bundle-wgc.cjs), or else ffmpeg's gfxcapture filter (the same Windows API).
// macOS: ffmpeg with AVFoundation. Linux: ffmpeg with X11 (not under Wayland).
// A recording is made of segments (one per stretch between pauses); each is later joined
// with its sound and all of them are put together into one file.
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

let cached;
/** Whether this desktop can be captured without the pointer at all (X11 only on Linux). */
function canHidePointer() {
  if (process.platform === 'linux') return process.env.XDG_SESSION_TYPE !== 'wayland' && !!process.env.DISPLAY;
  return process.platform === 'win32' || process.platform === 'darwin';
}

/** ffmpeg shipped next to the app (bin/), or one installed on this computer. */
function ffmpegPath() {
  if (cached !== undefined) return cached;
  cached = null;
  if (!canHidePointer()) return cached;
  const win = process.platform === 'win32';
  const local = path.join(__dirname, '..', 'bin', win ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(local)) { cached = local; return cached; }
  // Apps started from the Dock or a desktop menu do not get the shell's PATH: look in the usual
  // places of Homebrew and Linux packages too.
  if (!win) {
    const known = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg', '/snap/bin/ffmpeg'].find((p) => fs.existsSync(p));
    if (known) { cached = known; return cached; }
  }
  try {
    const r = spawnSync(win ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8', windowsHide: true });
    const first = r.status === 0 ? r.stdout.split(/\r?\n/).find((l) => l.trim()) : null;
    if (first) cached = first.trim();
  } catch { /* not installed */ }
  return cached;
}

/** ffmpeg input arguments that capture one screen without the pointer on this system. */
function captureInput({ index, fps, display }) {
  if (process.platform === 'darwin') {
    // AVFoundation names screens "Capture screen 0", "Capture screen 1", … in display order.
    return ['-f', 'avfoundation', '-capture_cursor', '0', '-capture_mouse_clicks', '0', '-framerate', String(fps), '-pixel_format', 'nv12', '-i', `Capture screen ${index}:none`,
      '-vf', 'crop=trunc(iw/2)*2:trunc(ih/2)*2'];
  }
  if (process.platform === 'linux') {
    const b = display?.bounds || { displayX: 0, displayY: 0, displayW: 1920, displayH: 1080 };
    return ['-f', 'x11grab', '-draw_mouse', '0', '-framerate', String(fps), '-video_size', `${b.displayW - (b.displayW % 2)}x${b.displayH - (b.displayH % 2)}`,
      '-i', `${process.env.DISPLAY || ':0'}+${b.displayX},${b.displayY}`];
  }
  // Windows Graphics Capture: full frame rate and no mouse pointer (desktop duplication keeps
  // the pointer on some graphics cards, and GDI capture is far too slow on large screens).
  return ['-f', 'lavfi', '-i', `gfxcapture=monitor_idx=${index}:capture_cursor=0:max_framerate=${fps},hwdownload,format=bgra,crop=trunc(iw/2)*2:trunc(ih/2)*2`];
}

/** wgc-capture.exe shipped next to the app, or one named in KEYCAST_WGC_PATH (development). */
function wgcPath() {
  if (process.platform !== 'win32') return null;
  const local = path.join(__dirname, '..', 'bin', 'wgc-capture.exe');
  if (fs.existsSync(local)) return local;
  const env = process.env.KEYCAST_WGC_PATH;
  return env && fs.existsSync(env) ? env : null;
}

/** Which capture program a recording without the pointer uses: 'wgc', 'ffmpeg' or null. */
function backend() {
  if (wgcPath()) return 'wgc';
  return ffmpegPath() ? 'ffmpeg' : null;
}

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), ['-y', '-hide_banner', '-loglevel', 'error', ...args], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg: ${err.trim() || `exit ${code}`}`))));
  });
}

let cap = null;

/** Starts one segment. Resolves once pictures are really being written. */
function start(opts) {
  if (cap) return Promise.reject(new Error('capture already running'));
  return wgcPath() ? startWgc(opts) : startFfmpeg(opts);
}

function startWgc({ file, fps, display }) {
  // The monitor is found by its handle (Electron's display id) or else by its bounds in pixels.
  const config = { outputPath: file, fps, displayId: Number(display?.id) || 0, ...(display?.bounds || {}) };
  const proc = spawn(wgcPath(), [JSON.stringify(config)], { windowsHide: true });
  const c = { proc, file, t0: Infinity, out: 0, err: '', closed: null, kind: 'wgc' };
  cap = c;
  c.closed = new Promise((resolve) => proc.on('close', resolve));
  proc.stderr.on('data', (d) => { c.err = (c.err + d).slice(-2000); });
  return new Promise((resolve, reject) => {
    const fail = (msg) => { clearTimeout(timer); if (cap === c) cap = null; reject(new Error(msg)); };
    const timer = setTimeout(() => { abort(); fail(`Screen capture did not start. ${c.err.trim()}`); }, 10000);
    let text = '';
    proc.stdout.on('data', (d) => {
      text += d;
      // "Recording started" is printed once the first picture has been encoded.
      if (c.t0 === Infinity && text.includes('Recording started')) {
        c.t0 = Date.now();
        clearTimeout(timer);
        resolve(true);
      }
    });
    proc.on('error', (err) => fail(err.message));
    proc.on('close', (code) => {
      if (c.t0 === Infinity) fail(`Screen capture stopped. ${c.err.trim() || `exit ${code}`}`);
      else if (cap === c && !c.stopping) cap = null;
    });
  });
}

function startFfmpeg({ file, index, fps, display }) {
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-stats_period', '0.1',
    ...captureInput({ index, fps, display }),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '20', '-pix_fmt', 'yuv420p', '-g', String(fps * 2),
    file,
  ];
  const proc = spawn(ffmpegPath(), args, { windowsHide: true });
  const c = { proc, file, t0: Infinity, out: 0, err: '', closed: null };
  cap = c;
  c.closed = new Promise((resolve) => proc.on('close', resolve));
  proc.stderr.on('data', (d) => { c.err = (c.err + d).slice(-2000); });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { abort(); reject(new Error(`Screen capture did not start. ${c.err.trim()}`)); }, 10000);
    let text = '';
    proc.stdout.on('data', (d) => {
      text += d;
      const lines = text.split(/\r?\n/);
      text = lines.pop();
      for (const line of lines) {
        const m = /^out_time_us=(\d+)/.exec(line);
        if (!m) continue;
        const us = Number(m[1]);
        if (!(us > 0)) continue;
        // The segment began no later than "now minus what has been written": the smallest
        // such value seen is the best estimate of the moment of its first picture.
        c.t0 = Math.min(c.t0, Date.now() - us / 1000);
        c.out = us / 1e6;
        clearTimeout(timer);
        resolve(true);
      }
    });
    proc.on('error', (err) => { clearTimeout(timer); cap = null; reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (cap === c && !c.stopping) { cap = null; reject(new Error(`Screen capture stopped. ${c.err.trim() || `exit ${code}`}`)); }
    });
  });
}

/** Ends the running segment. Returns when its first picture was taken and how long it is. */
async function stop() {
  const c = cap;
  if (!c) return null;
  c.stopping = true;
  const stoppedAt = Date.now();
  try { c.proc.stdin.write(c.kind === 'wgc' ? 'stop\n' : 'q\n'); } catch { /* already gone */ }
  const killer = setTimeout(() => { try { c.proc.kill(); } catch { /* gone */ } }, 8000);
  await c.closed;
  clearTimeout(killer);
  cap = null;
  // wgc-capture reports no running time: the segment lasts from its first picture to Stop.
  if (c.kind === 'wgc') c.out = Math.max(0, (stoppedAt - c.t0) / 1000);
  return { t0: c.t0, duration: c.out };
}

function abort() {
  const c = cap;
  cap = null;
  if (!c) return;
  c.stopping = true;
  try { c.proc.kill(); } catch { /* gone */ }
}

/**
 * Joins every segment with its sound, then all segments into screen.mp4.
 * @param {string} dir project folder
 * @param {Array<{video:string,audio:string|null,audioStart:number|null,t0:number,duration:number}>} segments
 */
async function finish(dir, segments) {
  const parts = [];
  const temp = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    temp.push(s.video);
    if (!s.audio) { parts.push(s.video); continue; }
    temp.push(s.audio);
    // Line the sound up with the picture: it began `late` seconds after the first picture.
    const late = Number.isFinite(s.audioStart - s.t0) ? (s.audioStart - s.t0) / 1000 : 0;
    const align = late >= 0 ? `adelay=${Math.round(late * 1000)}:all=1` : `atrim=start=${(-late).toFixed(3)},asetpts=PTS-STARTPTS`;
    const out = `part-${i}.mp4`;
    await run(['-i', path.join(dir, s.video), '-i', path.join(dir, s.audio), '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-af', `${align},apad`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
      '-t', s.duration.toFixed(3), path.join(dir, out)]);
    parts.push(out);
    temp.push(out);
  }
  const final = path.join(dir, 'screen.mp4');
  if (parts.length === 1) {
    await run(['-i', path.join(dir, parts[0]), '-c', 'copy', '-movflags', '+faststart', final]);
  } else {
    const list = path.join(dir, 'parts.txt');
    await fsp.writeFile(list, parts.map((p) => `file '${p}'`).join('\n'));
    temp.push('parts.txt');
    await run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', final]);
  }
  // The sound on its own, so subtitles do not have to load the whole video.
  let audio = null;
  if (segments.some((s) => s.audio)) {
    try { await run(['-i', final, '-vn', '-c:a', 'copy', path.join(dir, 'audio.m4a')]); audio = 'audio.m4a'; } catch { audio = null; }
  }
  // Microphone and webcam: each segment is shifted to where it belongs, made exactly as long
  // as its picture, and the segments are joined. Every file then shares one clock.
  const lateOf = (s, key) => { const v = (s[`${key}Start`] - s.t0) / 1000; return Number.isFinite(v) ? v : 0; };
  const joined = async (key, out, chain, codec) => {
    const have = segments.filter((s) => s[key]);
    // Some pieces have no track: nothing can be joined, so the pieces are kept as they are.
    if (have.length !== segments.length) return null;
    const inputs = [];
    const filters = [];
    segments.forEach((s, i) => {
      inputs.push('-i', path.join(dir, s[key]));
      filters.push(`[${i}:${chain.stream}]${chain.build(lateOf(s, key), s.duration)}[p${i}]`);
    });
    filters.push(`${segments.map((_s, i) => `[p${i}]`).join('')}concat=n=${segments.length}:${chain.concat}[out]`);
    try {
      await run([...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', ...codec, path.join(dir, out)]);
      // Only now are the pieces no longer needed; if joining fails they stay, so nothing is lost.
      segments.forEach((s) => temp.push(s[key]));
      return out;
    } catch (err) {
      console.error(err);
      return null;
    }
  };
  const voice = await joined('voice', 'voice.m4a', {
    stream: 'a', concat: 'v=0:a=1',
    build: (late, dur) => `${late >= 0 ? `adelay=${Math.round(late * 1000)}:all=1` : `atrim=start=${(-late).toFixed(3)},asetpts=PTS-STARTPTS`},apad,atrim=0:${dur.toFixed(3)},asetpts=PTS-STARTPTS`,
  }, ['-c:a', 'aac', '-b:a', '160k', '-ar', '48000']);
  const webcam = await joined('cam', 'webcam.mp4', {
    stream: 'v', concat: 'v=1:a=0',
    build: (late, dur) => `fps=30,${late >= 0 ? `tpad=start_duration=${late.toFixed(3)}:start_mode=clone` : `trim=start=${(-late).toFixed(3)},setpts=PTS-STARTPTS`},tpad=stop_duration=${dur.toFixed(3)}:stop_mode=clone,trim=0:${dur.toFixed(3)},setpts=PTS-STARTPTS,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
  }, ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']);

  await Promise.all(temp.map((n) => fsp.rm(path.join(dir, n), { force: true })));
  return { file: 'screen.mp4', audio, voice, webcam, duration: segments.reduce((sum, s) => sum + s.duration, 0) };
}

module.exports = { ffmpegPath, wgcPath, backend, canHidePointer, captureInput, start, stop, abort, finish };
