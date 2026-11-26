// Plays the edit once in the background, draws every frame and records the result to a file.

import { Muxer as Mp4Muxer, StreamTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, StreamTarget as WebmTarget } from 'webm-muxer';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { renderFrame, projectOutputSize, preloadImages } from './compositor.js';
import { segments, outDuration, outToSrc, srcToOut, syncAudios, cutFade, softenCuts } from './timemap.js';
import { Input, UrlSource, ALL_FORMATS, VideoSampleSink, AudioBufferSink } from 'mediabunny';
import { T } from './i18n.js';

export function exportFormats() {
  const can = (m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m);
  const formats = [];
  const mp4 = ['video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/mp4;codecs=avc1.4d0033,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'].find(can);
  if (mp4) formats.push({ id: 'mp4', name: T('MP4 (어디서나 재생)'), mime: mp4, ext: 'mp4' });
  const webm = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(can);
  if (webm) formats.push({ id: 'webm', name: T('WebM (작은 용량)'), mime: webm, ext: 'webm' });
  formats.push({ id: 'gif', name: T('GIF (움직이는 그림, 소리 없음)'), mime: 'image/gif', ext: 'gif' });
  return formats;
}

function loadVideo(url, withAudio) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.playsInline = true;
    v.muted = !withAudio;
    v.src = url;
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => reject(new Error(T('영상 파일을 열지 못했습니다.')));
  });
}

function seek(video, t) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 0.001 && video.readyState >= 2) return resolve();
    const done = () => { video.removeEventListener('seeked', done); resolve(); };
    video.addEventListener('seeked', done);
    video.currentTime = t;
    setTimeout(done, 4000);
  });
}

/**
 * @param {{project:object, derived:object, screenUrl:string, webcamUrl?:string, format:object,
 *          longSide:number, fps:number, burnSubtitles:boolean, writer:object, loop?:boolean,
 *          url:(name:string)=>string, onProgress:(k:number)=>void, signal:AbortSignal}} o
 */
export async function exportVideo(o) {
  const { project } = o;
  if (!segments(project).length) throw new Error(T('내보낼 구간이 없습니다. 잘라낸 부분을 확인하세요.'));
  await preloadImages(project, o.url);
  const gif = o.format.ext === 'gif';
  const screen = await loadVideo(o.screenUrl, !gif);
  const webcam = o.webcamUrl && project.settings.webcam.enabled ? await loadVideo(o.webcamUrl, false).catch(() => null) : null;
  const { width: W, height: H } = projectOutputSize(project, screen.videoWidth, screen.videoHeight, o.longSide);
  if (gif) return exportGif(o, { screen, webcam, W, H });
  const audioCtx = new AudioContext();
  const plan = await encodingPlan(o.format, W, H, o.fps, audioCtx.sampleRate).catch(() => null);
  // Faster than real time: frames are decoded straight from the file and the sound is mixed
  // offline. Speed changes still use the playback route, which keeps the voice's pitch.
  if (plan && o.fast !== false && canExportFast(project, screen)) {
    let fast = null;
    try { fast = await openFast(o); } catch (err) { console.warn('fast export unavailable:', err); }
    if (fast) {
      audioCtx.close().catch(() => {});
      release(screen, webcam);
      return exportFast(o, { W, H, plan, ...fast });
    }
  }
  if (!plan) {
    // This computer cannot encode frame by frame: record the playback instead (frame rate may vary,
    // and cut-out parts and speed changes are not applied).
    audioCtx.close().catch(() => {});
    for (const v of [screen, webcam]) { if (v) { v.removeAttribute('src'); v.load(); } }
    return exportRealtime(o);
  }
  return exportExact(o, { screen, webcam, W, H, audioCtx, plan });
}

const CHANNELS = 2;

/** Encoder settings this computer supports for the chosen file type, or null. */
async function encodingPlan(format, W, H, fps, sampleRate) {
  if (!window.VideoEncoder || !window.AudioEncoder || !window.MediaStreamTrackProcessor || !window.AudioData) return null;
  const mp4 = format.ext === 'mp4';
  const bitrate = Math.round(Math.min(40e6, Math.max(5e6, W * H * fps * 0.12)));
  const videoChoices = mp4
    ? ['avc1.640034', 'avc1.640033', 'avc1.64002a', 'avc1.4d0033'].map((codec) => ({ codec, avc: { format: 'avc' }, mux: 'avc' }))
    : [{ codec: 'vp09.00.51.08', mux: 'V_VP9' }, { codec: 'vp09.00.40.08', mux: 'V_VP9' }, { codec: 'vp8', mux: 'V_VP8' }];
  let video = null;
  for (const { mux, ...c } of videoChoices) {
    const config = { ...c, width: W, height: H, bitrate, framerate: fps };
    if ((await VideoEncoder.isConfigSupported(config)).supported) { video = { config, mux }; break; }
  }
  const audioChoices = mp4 ? [{ codec: 'mp4a.40.2', mux: 'aac' }, { codec: 'opus', mux: 'opus' }] : [{ codec: 'opus', mux: 'A_OPUS' }];
  let audio = null;
  for (const { codec, mux } of audioChoices) {
    const config = { codec, sampleRate, numberOfChannels: CHANNELS, bitrate: 192000 };
    if ((await AudioEncoder.isConfigSupported(config)).supported) { audio = { config, mux }; break; }
  }
  return video && audio ? { video, audio, mp4 } : null;
}

function loadAudio(url) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'auto';
    a.onloadedmetadata = () => resolve(a);
    a.onerror = () => resolve(null);
    a.src = url;
  });
}

function release(...media) {
  for (const m of media) {
    if (!m) continue;
    m.pause();
    m.removeAttribute('src');
    m.load();
  }
}

/**
 * Frame-exact export: every output frame (1/fps apart) is drawn and encoded with its own
 * timestamp, so the file has exactly the chosen frame rate even when this computer is busy.
 * The recording is played piece by piece: cut-out parts are jumped over and speed regions
 * play faster or slower.
 */
async function exportExact(o, { screen, webcam, W, H, audioCtx, plan }) {
  const { project } = o;
  const fps = o.fps;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });

  const segs = segments(project);
  const total = Math.max(1, Math.round(outDuration(segs) * fps));

  // ---- file writing (the muxers hand out pieces in order)
  let pending = Promise.resolve();
  let failure = null;
  let written = 0;
  const onData = (data, position) => {
    if (position !== written) { failure = failure || new Error(T('영상 파일을 순서대로 쓰지 못했습니다.')); return; }
    written += data.byteLength;
    const copy = data.slice();
    pending = pending.then(() => o.writer.write(copy));
  };
  const muxer = plan.mp4
    ? new Mp4Muxer({
      target: new Mp4Target({ onData }),
      video: { codec: plan.video.mux, width: W, height: H, frameRate: fps },
      audio: { codec: plan.audio.mux, numberOfChannels: CHANNELS, sampleRate: plan.audio.config.sampleRate },
      fastStart: 'fragmented',
      firstTimestampBehavior: 'offset',
    })
    : new WebmMuxer({
      target: new WebmTarget({ onData }),
      streaming: true,
      video: { codec: plan.video.mux, width: W, height: H, frameRate: fps },
      audio: { codec: plan.audio.mux, numberOfChannels: CHANNELS, sampleRate: plan.audio.config.sampleRate },
      firstTimestampBehavior: 'offset',
    });

  const fail = (err) => { failure = failure || err; };
  const venc = new VideoEncoder({ output: (chunk, meta) => { try { muxer.addVideoChunk(chunk, meta); } catch (err) { fail(err); } }, error: fail });
  venc.configure(plan.video.config);
  const aenc = new AudioEncoder({ output: (chunk, meta) => { try { muxer.addAudioChunk(chunk, meta); } catch (err) { fail(err); } }, error: fail });
  aenc.configure(plan.audio.config);

  // ---- sound: the recording plus any added sound files, re-timed by counting samples
  const dest = audioCtx.createMediaStreamDestination();
  dest.channelCount = CHANNELS;
  const gain = audioCtx.createGain();
  gain.gain.value = project.settings.audio?.volume ?? 1;
  audioCtx.createMediaElementSource(screen).connect(gain).connect(dest);
  const audioEls = new Map();
  for (const a of project.audios || []) {
    const el = await loadAudio(o.url(a.file));
    if (!el) continue;
    audioCtx.createMediaElementSource(el).connect(dest);
    audioEls.set(a.id, el);
  }
  const audioTrack = dest.stream.getAudioTracks()[0];
  const reader = new MediaStreamTrackProcessor({ track: audioTrack }).readable.getReader();
  const rate = plan.audio.config.sampleRate;
  let listening = false;
  let audioDone = false;
  let samples = 0;
  // Sound may never run ahead of the picture: when drawing is slower than playback, sound that
  // arrives late (silence from a paused or finished player) is left out.
  let audioCap = 0;
  const fade = cutFade(project, segs);
  const audioLoop = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (audioDone) { value.close(); break; }
      if (!listening || failure) { value.close(); continue; }
      const n = value.numberOfFrames;
      if (samples + n > audioCap * value.sampleRate) { value.close(); continue; }
      const buf = new Float32Array(n * CHANNELS);
      for (let c = 0; c < CHANNELS; c++) {
        value.copyTo(buf.subarray(c * n, (c + 1) * n), { planeIndex: Math.min(c, value.numberOfChannels - 1), format: 'f32-planar' });
      }
      softenCuts(Array.from({ length: CHANNELS }, (_c, c) => buf.subarray(c * n, (c + 1) * n)), samples, value.sampleRate, fade);
      const data = new AudioData({
        format: 'f32-planar', sampleRate: value.sampleRate, numberOfFrames: n, numberOfChannels: CHANNELS,
        timestamp: Math.round((samples / value.sampleRate) * 1e6), data: buf,
      });
      samples += n;
      value.close();
      aenc.encode(data);
      data.close();
    }
  })().catch(fail);
  // Fill with silence up to a point of the finished video, so sound and picture stay together
  // across jumps and the sound track is as long as the picture.
  const padAudio = (sec) => {
    let need = Math.round(sec * rate) - samples;
    while (need > 0 && aenc.state === 'configured') {
      const n = Math.min(need, rate);
      const data = new AudioData({
        format: 'f32-planar', sampleRate: rate, numberOfFrames: n, numberOfChannels: CHANNELS,
        timestamp: Math.round((samples / rate) * 1e6), data: new Float32Array(n * CHANNELS),
      });
      aenc.encode(data);
      data.close();
      samples += n;
      need -= n;
    }
  };

  // ---- picture: one drawn frame for every 1/fps step of the finished video
  let slot = 0;
  const keyEvery = Math.max(1, Math.round(fps * 2));
  const frameUs = 1e6 / fps;
  const emitTo = (target) => {
    const stop = Math.min(total, target);
    while (slot < stop) {
      renderFrame(ctx, { W, H, t: outToSrc(segs, slot / fps), screen, webcam, project, derived: o.derived, burnSubtitles: o.burnSubtitles, url: o.url, segs });
      const frame = new VideoFrame(canvas, { timestamp: Math.round(slot * frameUs), duration: Math.round(frameUs) });
      venc.encode(frame, { keyFrame: slot % keyEvery === 0 });
      frame.close();
      slot++;
    }
  };
  const lastSlotOf = (g, last) => (last ? total : Math.ceil(g.o1 * fps - 1e-6));

  const camOff = project.offsets?.webcam || 0;
  let si = 0;
  screen.playbackRate = segs[0].speed;
  if (webcam) webcam.playbackRate = segs[0].speed;
  await seek(screen, segs[0].s0);
  if (webcam) await seek(webcam, Math.max(0, segs[0].s0 - camOff));

  let cancelled = false;
  let timer = null;
  try {
    await new Promise((resolve, reject) => {
      let finished = false;
      let holding = false;
      let jumping = false;
      let lastTime = -1;
      let lastMove = performance.now();
      const finish = () => { if (!finished) { finished = true; resolve(); } };
      o.signal?.addEventListener('abort', () => { cancelled = true; finish(); });
      const jump = (prev, next) => {
        jumping = true;
        (async () => {
          audioCap = prev.o1;
          // Sound arrives a little after the picture: take the rest of this piece before moving on.
          const until = performance.now() + 400;
          while (!finished && samples < prev.o1 * rate - rate * 0.005 && performance.now() < until) {
            await new Promise((r) => setTimeout(r, 10));
          }
          listening = false;
          padAudio(prev.o1);
          if (Math.abs(next.s0 - prev.s1) > 1e-3 || screen.ended) {
            screen.pause();
            webcam?.pause();
            syncAudios(audioEls, project, segs, prev.s1, false);
            await seek(screen, next.s0);
            if (webcam) await seek(webcam, Math.max(0, next.s0 - camOff));
          }
          screen.playbackRate = next.speed;
          if (webcam) webcam.playbackRate = next.speed;
          if (screen.paused && !finished) await screen.play();
          listening = true;
          lastMove = performance.now();
          lastTime = -1;
          jumping = false;
        })().catch((err) => { finished = true; reject(err); });
      };
      const tick = () => {
        if (finished || jumping) return;
        try {
          if (failure) throw failure;
          const g = segs[si];
          const last = si === segs.length - 1;
          const t = screen.currentTime;
          if (webcam) {
            if (Math.abs(webcam.currentTime - (t - camOff)) > 0.2) webcam.currentTime = Math.max(0, t - camOff);
            if (webcam.paused && !webcam.ended && !holding) webcam.play().catch(() => {});
          }
          syncAudios(audioEls, project, segs, t, !holding);
          if (t !== lastTime) { lastTime = t; lastMove = performance.now(); }
          // The recording can be shorter than its stated length, or stop moving: fill the rest and go on.
          const stuck = !holding && performance.now() - lastMove > 8000;
          if (t >= g.s1 - (0.5 / fps) * g.speed || screen.ended || stuck) {
            audioCap = g.o1;
            emitTo(lastSlotOf(g, last));
            o.onProgress?.(Math.min(1, slot / total));
            if (last) { finish(); return; }
            si++;
            jump(g, segs[si]);
            return;
          }
          const o1 = g.o0 + (Math.max(g.s0, t) - g.s0) / g.speed;
          audioCap = Math.min(g.o1, o1 + 0.15);
          emitTo(Math.min(lastSlotOf(g, false), Math.floor(o1 * fps + 1e-6) + 1));
          o.onProgress?.(Math.min(1, slot / total));
          // Never let the encoder fall far behind: wait for it instead of dropping frames.
          if (!holding && venc.encodeQueueSize > 12) {
            holding = true;
            listening = false;
            screen.pause();
            webcam?.pause();
          } else if (holding && venc.encodeQueueSize < 4) {
            holding = false;
            lastMove = performance.now();
            screen.play().then(() => { listening = true; }, reject);
          }
        } catch (err) {
          finished = true;
          reject(err);
        }
      };
      timer = setInterval(tick, Math.max(4, 500 / fps));
      const onFrame = () => { if (finished) return; tick(); screen.requestVideoFrameCallback(onFrame); };
      screen.play().then(() => {
        listening = true;
        if (screen.requestVideoFrameCallback) screen.requestVideoFrameCallback(onFrame);
      }, reject);
    });
    clearInterval(timer);
    screen.pause();
    webcam?.pause();
    syncAudios(audioEls, project, segs, 0, false);
    listening = false;
    if (!cancelled && !failure) padAudio(total / fps);
    audioDone = true;
    await audioLoop;
    if (!cancelled) {
      await venc.flush();
      await aenc.flush();
      if (failure) throw failure;
      muxer.finalize();
      if (failure) throw failure;
      await pending;
    }
  } catch (err) {
    await pending.catch(() => {});
    await o.writer.abort().catch(() => {});
    throw err;
  } finally {
    clearInterval(timer);
    audioDone = true;
    try { if (venc.state !== 'closed') venc.close(); } catch { /* already closed */ }
    try { if (aenc.state !== 'closed') aenc.close(); } catch { /* already closed */ }
    audioTrack.stop();
    audioCtx.close().catch(() => {});
    release(screen, webcam, ...audioEls.values());
  }
  if (cancelled) {
    await pending.catch(() => {});
    await o.writer.abort();
    return null;
  }
  return o.writer.close(plan.mp4 ? {} : { durationMs: Math.round((total / fps) * 1000) });
}

// ------------------------------------------------------------------ fast export

// Up to this size the decoded frames draw quickly enough that reading the file beats playing it
// (11 s at 1920x1200: 6.2 s instead of 11.4 s). Larger recordings, such as 2880x1800, draw too
// slowly on common graphics chips (22.5 s instead of 11.6 s) and are played back instead.
const FAST_MAX_PIXELS = 1920 * 1200;

function canExportFast(project, screen) {
  if (typeof window === 'undefined' || !window.VideoDecoder) return false;
  if (!(screen.videoWidth * screen.videoHeight <= FAST_MAX_PIXELS)) return false;
  return segments(project).every((g) => Math.abs(g.speed - 1) < 1e-6);
}

/** Opens the recording (and webcam) for frame-by-frame reading. Throws if the file cannot be read. */
async function openFast(o) {
  const open = async (url) => {
    const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
    const video = await input.getPrimaryVideoTrack();
    if (!video || !(await video.canDecode())) throw new Error('video track cannot be decoded');
    const audio = await input.getPrimaryAudioTrack();
    return { input, video, audio: audio && (await audio.canDecode()) ? audio : null };
  };
  const screen = await open(o.screenUrl);
  const webcam = o.webcamUrl && o.project.settings.webcam.enabled ? await open(o.webcamUrl).catch(() => null) : null;
  return { src: screen, cam: webcam };
}

/** Mixes the recording's sound and added sound files for the finished video, offline. */
async function mixAudio(o, segs, total, rate, src) {
  const { project } = o;
  const ctx = new OfflineAudioContext(CHANNELS, Math.max(1, Math.ceil(total * rate)), rate);
  const volume = project.settings.audio?.volume ?? 1;
  if (src.audio && volume > 0) {
    const gain = ctx.createGain();
    gain.gain.value = volume;
    // Only the recording jumps at a cut (added sounds play straight through): dip it there.
    const { times, len } = cutFade(project, segs);
    for (const c of times) {
      gain.gain.setValueAtTime(volume, Math.max(0, c - len));
      gain.gain.linearRampToValueAtTime(0, c);
      gain.gain.linearRampToValueAtTime(volume, c + len);
    }
    gain.connect(ctx.destination);
    const sink = new AudioBufferSink(src.audio);
    for (const g of segs) {
      for await (const { buffer, timestamp, duration } of sink.buffers(g.s0, g.s1)) {
        // Only the part of this piece that falls inside the segment.
        const from = Math.max(timestamp, g.s0);
        const to = Math.min(timestamp + duration, g.s1);
        if (to <= from) continue;
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(gain);
        node.start(g.o0 + (from - g.s0), from - timestamp, to - from);
      }
    }
  }
  // Added sound files play continuously from where they start on the finished video's timeline.
  for (const a of project.audios || []) {
    try {
      const data = await (await fetch(o.url(a.file))).arrayBuffer();
      const buffer = await ctx.decodeAudioData(data);
      const outStart = srcToOut(segs, a.start);
      const outEnd = Math.min(total, srcToOut(segs, a.end));
      const offset = a.offset || 0;
      const len = Math.min(outEnd - outStart, buffer.duration - offset);
      if (len <= 0) continue;
      const gain = ctx.createGain();
      gain.gain.value = Math.min(1, Math.max(0, a.volume ?? 1));
      gain.connect(ctx.destination);
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(gain);
      node.start(outStart, offset, len);
    } catch (err) {
      console.warn('sound file skipped:', a.file, err);
    }
  }
  return ctx.startRendering();
}

/**
 * A video encoder setting that really starts on this computer: the graphics card's encoder can
 * refuse to start (for example while another program holds it), so one frame is tried first and
 * the software encoder is used when that fails.
 */
async function workingVideoConfig(config, W, H) {
  for (const c of [config, { ...config, hardwareAcceleration: 'prefer-software' }]) {
    let error = null;
    const enc = new VideoEncoder({ output: () => {}, error: (e) => { error = e; } });
    try {
      enc.configure(c);
      const canvas = new OffscreenCanvas(W, H);
      canvas.getContext('2d').fillRect(0, 0, W, H);
      const frame = new VideoFrame(canvas, { timestamp: 0 });
      enc.encode(frame, { keyFrame: true });
      frame.close();
      await enc.flush();
    } catch (err) {
      error = error || err;
    } finally {
      try { if (enc.state !== 'closed') enc.close(); } catch { /* closed */ }
    }
    if (!error) return c;
    console.warn('video encoder setting refused:', c.hardwareAcceleration || 'default', error.message);
  }
  throw new Error('No video encoder could be started.');
}

async function exportFast(o, { W, H, plan, src, cam }) {
  const videoConfig = await workingVideoConfig(plan.video.config, W, H);
  const { project } = o;
  const fps = o.fps;
  const segs = segments(project);
  const outLen = outDuration(segs);
  const total = Math.max(1, Math.round(outLen * fps));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });

  let pending = Promise.resolve();
  let failure = null;
  let written = 0;
  const onData = (data, position) => {
    if (position !== written) { failure = failure || new Error(T('영상 파일을 순서대로 쓰지 못했습니다.')); return; }
    written += data.byteLength;
    const copy = data.slice();
    pending = pending.then(() => o.writer.write(copy));
  };
  const muxer = plan.mp4
    ? new Mp4Muxer({
      target: new Mp4Target({ onData }),
      video: { codec: plan.video.mux, width: W, height: H, frameRate: fps },
      audio: { codec: plan.audio.mux, numberOfChannels: CHANNELS, sampleRate: plan.audio.config.sampleRate },
      fastStart: 'fragmented',
      firstTimestampBehavior: 'offset',
    })
    : new WebmMuxer({
      target: new WebmTarget({ onData }),
      streaming: true,
      video: { codec: plan.video.mux, width: W, height: H, frameRate: fps },
      audio: { codec: plan.audio.mux, numberOfChannels: CHANNELS, sampleRate: plan.audio.config.sampleRate },
      firstTimestampBehavior: 'offset',
    });
  const fail = (err) => { failure = failure || err; };
  const venc = new VideoEncoder({ output: (chunk, meta) => { try { muxer.addVideoChunk(chunk, meta); } catch (err) { fail(err); } }, error: (e) => fail(new Error(`video encoder: ${e.message}`)) });
  venc.configure(videoConfig);
  const aenc = new AudioEncoder({ output: (chunk, meta) => { try { muxer.addAudioChunk(chunk, meta); } catch (err) { fail(err); } }, error: (e) => fail(new Error(`audio encoder: ${e.message}`)) });
  aenc.configure(plan.audio.config);

  const cancelled = () => !!o.signal?.aborted;
  const camOff = project.offsets?.webcam || 0;
  try {
    // ---- sound first (small), so the encoder can interleave it with the picture
    const rate = plan.audio.config.sampleRate;
    const mixed = await mixAudio(o, segs, outLen, rate, src);
    const step = rate; // one second per piece
    for (let i = 0; i < mixed.length; i += step) {
      const n = Math.min(step, mixed.length - i);
      const buf = new Float32Array(n * CHANNELS);
      for (let c = 0; c < CHANNELS; c++) buf.set(mixed.getChannelData(Math.min(c, mixed.numberOfChannels - 1)).subarray(i, i + n), c * n);
      const data = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: n, numberOfChannels: CHANNELS, timestamp: Math.round((i / rate) * 1e6), data: buf });
      aenc.encode(data);
      data.close();
    }

    // ---- picture: the frame shown at each output time, read in order from the file
    const times = function* (offset) { for (let s = 0; s < total; s++) yield Math.max(0, outToSrc(segs, s / fps) - offset); };
    const screens = new VideoSampleSink(src.video).samplesAtTimestamps(times(0));
    const cams = cam ? new VideoSampleSink(cam.video).samplesAtTimestamps(times(camOff)) : null;
    const keyEvery = Math.max(1, Math.round(fps * 2));
    const frameUs = 1e6 / fps;
    let lastScreen = null;
    let lastCam = null;
    for (let slot = 0; slot < total; slot++) {
      if (cancelled()) break;
      if (failure) throw failure;
      const s = (await screens.next()).value;
      if (s) { lastScreen?.close(); lastScreen = s.toVideoFrame(); s.close(); }
      if (cams) {
        const c = (await cams.next()).value;
        if (c) { lastCam?.close(); lastCam = c.toVideoFrame(); c.close(); }
      }
      renderFrame(ctx, { W, H, t: outToSrc(segs, slot / fps), screen: lastScreen, webcam: lastCam, project, derived: o.derived, burnSubtitles: o.burnSubtitles, url: o.url });
      const frame = new VideoFrame(canvas, { timestamp: Math.round(slot * frameUs), duration: Math.round(frameUs) });
      venc.encode(frame, { keyFrame: slot % keyEvery === 0 });
      frame.close();
      // Let the encoder keep up instead of queueing every frame in memory.
      while (venc.encodeQueueSize > 16) await new Promise((r) => setTimeout(r, 1));
      if (slot % 4 === 0) o.onProgress?.(slot / total);
    }
    lastScreen?.close();
    lastCam?.close();
    await screens.return?.();
    await cams?.return?.();
    if (cancelled()) {
      await pending.catch(() => {});
      await o.writer.abort();
      return null;
    }
    await venc.flush();
    await aenc.flush();
    if (failure) throw failure;
    muxer.finalize();
    if (failure) throw failure;
    await pending;
    o.onProgress?.(1);
  } catch (err) {
    await pending.catch(() => {});
    await o.writer.abort().catch(() => {});
    throw err;
  } finally {
    try { if (venc.state !== 'closed') venc.close(); } catch { /* closed */ }
    try { if (aenc.state !== 'closed') aenc.close(); } catch { /* closed */ }
    src.input.dispose?.();
    cam?.input.dispose?.();
  }
  return o.writer.close(plan.mp4 ? {} : { durationMs: Math.round((total / fps) * 1000) });
}

/** GIF: every frame is found by seeking (no sound), reduced to 256 colours and written at the end. */
async function exportGif(o, { screen, webcam, W, H }) {
  const { project } = o;
  const fps = o.fps;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  const segs = segments(project);
  const total = Math.max(1, Math.round(outDuration(segs) * fps));
  const gif = GIFEncoder();
  let cancelled = false;
  try {
    for (let slot = 0; slot < total; slot++) {
      if (o.signal?.aborted) { cancelled = true; break; }
      const t = outToSrc(segs, slot / fps);
      await seek(screen, t);
      if (webcam) await seek(webcam, Math.max(0, Math.min(t - (project.offsets?.webcam || 0), (webcam.duration || t) - 0.05)));
      renderFrame(ctx, { W, H, t, screen, webcam, project, derived: o.derived, burnSubtitles: o.burnSubtitles, url: o.url });
      const { data } = ctx.getImageData(0, 0, W, H);
      const palette = quantize(data, 256);
      const index = applyPalette(data, palette);
      const opts = { palette, delay: Math.round(1000 / fps) };
      if (slot === 0) opts.repeat = o.loop === false ? -1 : 0;
      gif.writeFrame(index, W, H, opts);
      o.onProgress?.((slot + 1) / total);
    }
    if (!cancelled) {
      gif.finish();
      const bytes = gif.bytes();
      const step = 4 * 1024 * 1024;
      for (let i = 0; i < bytes.length; i += step) await o.writer.write(bytes.slice(i, i + step));
    }
  } catch (err) {
    await o.writer.abort().catch(() => {});
    throw err;
  } finally {
    release(screen, webcam);
  }
  if (cancelled) {
    await o.writer.abort();
    return null;
  }
  return o.writer.close({});
}

/** Older way: play the edit and record the playback. Used only where exact encoding is unavailable. */
async function exportRealtime(o) {
  const { project } = o;
  const screen = await loadVideo(o.screenUrl, true);
  const webcam = o.webcamUrl && project.settings.webcam.enabled ? await loadVideo(o.webcamUrl, false).catch(() => null) : null;
  const { width: W, height: H } = projectOutputSize(project, screen.videoWidth, screen.videoHeight, o.longSide);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });

  const stream = canvas.captureStream(o.fps);
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  audioCtx.createMediaElementSource(screen).connect(dest);
  const audioTrack = dest.stream.getAudioTracks()[0];
  if (audioTrack) stream.addTrack(audioTrack);

  const pixels = W * H;
  const recorder = new MediaRecorder(stream, {
    mimeType: o.format.mime,
    videoBitsPerSecond: Math.round(Math.min(40e6, Math.max(5e6, pixels * o.fps * 0.12))),
    audioBitsPerSecond: 192000,
  });
  let pending = Promise.resolve();
  recorder.ondataavailable = (e) => {
    if (e.data?.size) pending = pending.then(async () => o.writer.write(new Uint8Array(await e.data.arrayBuffer())));
  };

  const start = Math.max(0, project.trim?.start || 0);
  const end = Math.min(project.durationMs / 1000, project.trim?.end ?? project.durationMs / 1000);
  await seek(screen, start);
  if (webcam) await seek(webcam, start);

  const draw = () => {
    renderFrame(ctx, { W, H, t: screen.currentTime, screen, webcam, project, derived: o.derived, burnSubtitles: o.burnSubtitles, url: o.url });
  };
  draw();

  let cancelled = false;
  try {
    await new Promise((resolve, reject) => {
      recorder.onerror = (e) => reject(e.error || new Error(T('녹화 중 오류')));
      recorder.start(1000);
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (recorder.state !== 'inactive') {
          recorder.onstop = resolve;
          recorder.stop();
        } else resolve();
      };
      o.signal?.addEventListener('abort', () => { cancelled = true; screen.pause(); webcam?.pause(); finish(); });
      const tick = () => {
        if (cancelled) return;
        const t = screen.currentTime;
        if (webcam) {
          if (Math.abs(webcam.currentTime - t) > 0.2) webcam.currentTime = t;
          if (webcam.paused && !webcam.ended) webcam.play().catch(() => {});
        }
        draw();
        o.onProgress?.(Math.min(1, (t - start) / Math.max(0.001, end - start)));
        if (t >= end - 0.01 || screen.ended) {
          screen.pause();
          webcam?.pause();
          draw();
          finish();
          return;
        }
        if (screen.requestVideoFrameCallback) screen.requestVideoFrameCallback(tick); else requestAnimationFrame(tick);
      };
      // A timer keeps drawing between video frames (keys and subtitles change on their own).
      const between = setInterval(() => {
        if (cancelled || finished) return;
        if (screen.ended || screen.currentTime >= end - 0.01) { screen.pause(); webcam?.pause(); draw(); o.onProgress?.(1); finish(); return; }
        if (!screen.paused) draw();
      }, 1000 / o.fps);
      recorder.addEventListener('stop', () => clearInterval(between));
      screen.play().then(() => {
        webcam?.play().catch(() => {});
        if (screen.requestVideoFrameCallback) screen.requestVideoFrameCallback(tick); else requestAnimationFrame(tick);
      }, reject);
    });
    await pending;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    audioCtx.close().catch(() => {});
    screen.removeAttribute('src');
    screen.load();
    if (webcam) { webcam.removeAttribute('src'); webcam.load(); }
  }
  if (cancelled) {
    await o.writer.abort();
    return null;
  }
  const durationMs = Math.round((end - start) * 1000);
  return o.writer.close(o.format.ext === 'webm' ? { durationMs } : {});
}

