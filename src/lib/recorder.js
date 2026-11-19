// Records the chosen screen (with system sound and microphone mixed in), a clean microphone
// track for speech recognition, an optional webcam, and every key and click with timestamps.

import { platform } from './platform.js';
import { defaultSettings } from './compositor.js';
import { autoZoomRegions } from './zoom.js';

function pickMime(candidates) {
  for (const m of candidates) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class TrackRecorder {
  constructor(stream, mime, writer, bitrate) {
    const opts = { mimeType: mime };
    if (bitrate) opts.videoBitsPerSecond = bitrate;
    this.rec = new MediaRecorder(stream, opts);
    this.writer = writer;
    this.pending = Promise.resolve();
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size) {
        this.pending = this.pending.then(async () => this.writer.write(new Uint8Array(await e.data.arrayBuffer())));
      }
    };
  }
  start() {
    return new Promise((resolve) => {
      // The file's timeline begins when start() is called. The 'start' event can arrive seconds
      // later (encoder warm-up on large screens), so it must not be used as time zero.
      const calledAt = Date.now();
      this.rec.onstart = () => resolve(calledAt);
      this.rec.start(1000);
    });
  }
  pause() { if (this.rec.state === 'recording') this.rec.pause(); }
  resume() { if (this.rec.state === 'paused') this.rec.resume(); }
  async stop(durationMs) {
    if (this.rec.state !== 'inactive') {
      await new Promise((resolve) => {
        this.rec.onstop = resolve;
        this.rec.stop();
      });
    }
    await this.pending;
    return this.writer.close({ durationMs });
  }
}

export class Recorder {
  constructor(opts) {
    this.opts = opts;
    this.streams = [];
    this.pauses = [];
    this.paused = false;
    this.stopping = null;
    this.onStatus = opts.onStatus || (() => {});
    this.onEnded = opts.onEnded || (() => {});
  }

  async start() {
    this.parts = [];
    try {
      return await this.begin();
    } catch (err) {
      // Leave nothing behind: no running capture, no half-written files, no empty project.
      this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      if (this.audioCtx) this.audioCtx.close().catch(() => {});
      await Promise.all(this.parts.map((p) => p.writer.abort().catch(() => {})));
      if (this.ff) { await platform.captureAbort(); await Promise.all((this.seg?.recs || []).map((r) => r.rec.writer.abort().catch(() => {}))); }
      if (this.projectId) await platform.deleteProject(this.projectId).catch(() => {});
      throw err;
    }
  }

  async begin() {
    const { source, micId, systemAudio, webcamId } = this.opts;
    this.projectId = await platform.createProject();

    // Hiding the real mouse pointer needs the ffmpeg capture; it records whole screens only.
    const ff = !!this.opts.hideCursor && source.kind === 'screen' && platform.isDesktop;
    this.ff = ff;
    this.segs = [];
    let display = null;
    let videoTrack = null;
    if (!ff || systemAudio) {
      display = await platform.getDisplayStream(source, { systemAudio });
      this.streams.push(display);
    }
    if (ff) {
      // Only the computer's sound is taken from this stream; the picture comes from ffmpeg.
      display?.getVideoTracks().forEach((t) => t.stop());
      this.size = { width: source.size?.width || 1920, height: source.size?.height || 1080 };
    } else {
      videoTrack = display.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      this.size = { width: settings.width || 1920, height: settings.height || 1080 };
      videoTrack.addEventListener('ended', () => this.stop().then((p) => this.onEnded(p)).catch(() => {}));
    }

    let mic = null;
    if (micId) {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: micId === 'default' ? undefined : { exact: micId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.streams.push(mic);
    }
    let cam = null;
    if (webcamId) {
      try {
        cam = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: webcamId === 'default' ? undefined : { exact: webcamId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        });
        this.streams.push(cam);
      } catch (err) {
        console.warn('webcam unavailable', err);
      }
    }

    // Mix the computer's sound and the microphone into the screen recording.
    const tracks = ff ? [] : [videoTrack];
    const systemTracks = display ? display.getAudioTracks() : [];
    if (systemTracks.length || mic) {
      this.audioCtx = new AudioContext();
      const dest = this.audioCtx.createMediaStreamDestination();
      if (systemTracks.length) this.audioCtx.createMediaStreamSource(new MediaStream(systemTracks)).connect(dest);
      if (mic) {
        const g = this.audioCtx.createGain();
        g.gain.value = 1.1;
        this.audioCtx.createMediaStreamSource(mic).connect(g).connect(dest);
      }
      tracks.push(dest.stream.getAudioTracks()[0]);
    }
    this.mixTrack = tracks.find((tr) => tr.kind === 'audio') || null;
    const hasAudio = !!this.mixTrack;

    const screenMime = pickMime(hasAudio
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']);
    const pixels = this.size.width * this.size.height;
    const bitrate = Math.round(Math.min(40e6, Math.max(6e6, pixels * 4.5)));

    this.files = { screen: ff ? 'screen.mp4' : 'screen.webm', voice: null, audio: null, webcam: null };
    if (!ff) {
      this.parts.push(new TrackRecorder(new MediaStream(tracks), screenMime,
        await platform.openWriter(this.projectId, 'screen.webm', 'video/webm'), bitrate));
    }
    // With the ffmpeg capture the microphone and webcam are recorded per segment as well
    // (see startSegment), so every file lines up with the picture after a pause too.
    this.micTrack = ff && mic ? mic.getAudioTracks()[0] : null;
    this.camTrack = ff && cam ? cam.getVideoTracks()[0] : null;
    if (mic && !ff) {
      this.files.voice = 'voice.webm';
      this.parts.push(new TrackRecorder(new MediaStream(mic.getAudioTracks()), pickMime(['audio/webm;codecs=opus', 'audio/webm']),
        await platform.openWriter(this.projectId, 'voice.webm', 'audio/webm')));
    } else if (hasAudio && !ff) {
      // No microphone: keep the sound on its own so subtitles don't have to load the whole video.
      this.files.audio = 'audio.webm';
      this.parts.push(new TrackRecorder(new MediaStream([this.mixTrack]), pickMime(['audio/webm;codecs=opus', 'audio/webm']),
        await platform.openWriter(this.projectId, 'audio.webm', 'audio/webm')));
    }
    if (cam && !ff) {
      this.files.webcam = 'webcam.webm';
      this.parts.push(new TrackRecorder(new MediaStream(cam.getVideoTracks()), pickMime(['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']),
        await platform.openWriter(this.projectId, 'webcam.webm', 'video/webm'), 2.5e6));
    }

    const meta = await platform.beginRecording({
      displayId: source.displayId,
      kind: source.kind,
      liveOverlay: !!this.opts.liveOverlay,
      overlay: this.opts.overlaySettings,
      shortcuts: this.opts.shortcuts,
    });
    this.hooked = !!meta?.hooked;
    this.shortcutsOk = meta?.shortcuts || null;
    await sleep(platform.isDesktop ? 450 : 50); // let this window get out of the way

    if (ff) await this.startSegment();
    const starts = await Promise.all(this.parts.map((p) => p.start()));
    this.startEpoch = ff ? Date.now() : starts[0];
    this.partStart = starts.length ? starts[0] : null;
    this.timer = setInterval(() => this.emitStatus(), 250);
    this.emitStatus();
    return this.projectId;
  }

  elapsedMs(now = Date.now()) {
    let paused = 0;
    for (const p of this.pauses) paused += (p.to ?? now) - p.from;
    return Math.max(0, now - this.startEpoch - paused);
  }

  emitStatus() {
    const status = { elapsedMs: this.elapsedMs(), paused: this.paused, shortcuts: this.opts.shortcuts };
    this.onStatus(status);
    platform.sendStatus(status);
  }

  /** ffmpeg mode: one picture file (and one sound file) per stretch between pauses. */
  async startSegment() {
    const i = this.segs.length;
    const seg = { video: `seg-${i}.mp4`, audio: null, voice: null, cam: null, recs: [] };
    await platform.captureStart({ projectId: this.projectId, name: seg.video, displayId: this.opts.source.displayId, fps: 60 });
    const audioMime = pickMime(['audio/webm;codecs=opus', 'audio/webm']);
    const add = async (key, track, name, mime, type, bitrate) => {
      if (!track) return;
      seg[key] = name;
      const rec = new TrackRecorder(new MediaStream([track]), mime, await platform.openWriter(this.projectId, name, type), bitrate);
      seg.recs.push({ key, rec });
    };
    await add('audio', this.mixTrack, `mix-${i}.webm`, audioMime, 'audio/webm');
    await add('voice', this.micTrack, `voice-${i}.webm`, audioMime, 'audio/webm');
    await add('cam', this.camTrack, `cam-${i}.webm`, pickMime(['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']), 'video/webm', 2.5e6);
    const starts = await Promise.all(seg.recs.map((r) => r.rec.start()));
    seg.recs.forEach((r, n) => { seg[`${r.key}Start`] = starts[n]; });
    this.seg = seg;
  }

  async endSegment() {
    const seg = this.seg;
    if (!seg) return;
    this.seg = null;
    await Promise.all(seg.recs.map((r) => r.rec.stop()));
    const done = await platform.captureStop();
    if (!done || !(done.duration > 0)) throw new Error('화면 캡처가 비어 있습니다.');
    const { recs: _recs, ...files } = seg;
    this.segs.push({ ...files, t0: done.t0, duration: done.duration });
  }

  async togglePauseSegments() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (this.paused) {
        await this.startSegment();
        this.parts.forEach((p) => p.resume());
        this.pauses[this.pauses.length - 1].to = Date.now();
        this.paused = false;
      } else {
        this.parts.forEach((p) => p.pause());
        this.pauses.push({ from: Date.now(), to: null });
        this.paused = true;
        await this.endSegment();
      }
    } finally {
      this.busy = false;
    }
    this.emitStatus();
  }

  togglePause() {
    if (this.stopping) return;
    if (this.ff) { this.togglePauseSegments().catch((err) => console.error(err)); return; }
    if (this.paused) {
      this.parts.forEach((p) => p.resume());
      this.pauses[this.pauses.length - 1].to = Date.now();
      this.paused = false;
    } else {
      this.parts.forEach((p) => p.pause());
      this.pauses.push({ from: Date.now(), to: null });
      this.paused = true;
    }
    this.emitStatus();
  }

  /** Wall-clock event time -> seconds on the recording, or null while paused. */
  toProjectTime(epoch) {
    if (this.ff) {
      // Each segment knows when its first picture was taken.
      let before = 0;
      for (const s of this.segs) {
        if (epoch >= s.t0 && epoch < s.t0 + s.duration * 1000) return before + (epoch - s.t0) / 1000;
        before += s.duration;
      }
      return null;
    }
    if (epoch < this.startEpoch) return null;
    let paused = 0;
    for (const p of this.pauses) {
      const to = p.to ?? Infinity;
      if (epoch >= p.from && epoch < to) return null;
      if (epoch >= to) paused += to - p.from;
    }
    return (epoch - this.startEpoch - paused) / 1000;
  }

  stop() {
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      clearInterval(this.timer);
      if (this.paused) this.pauses[this.pauses.length - 1].to = Date.now();
      let durationMs = this.elapsedMs();
      if (this.ff) {
        while (this.busy) await sleep(50);
        await this.endSegment();
      }
      await Promise.all(this.parts.map((p) => p.stop(durationMs)));
      let offsets = null;
      if (this.ff) {
        const fin = await platform.captureFinish({ projectId: this.projectId, segments: this.segs });
        durationMs = Math.round(fin.duration * 1000);
        this.files.voice = fin.voice;
        this.files.webcam = fin.webcam;
        if (!fin.voice) this.files.audio = fin.audio;
      }
      this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      if (this.audioCtx) this.audioCtx.close().catch(() => {});
      const rawEvents = await platform.endRecording();
      const duration = durationMs / 1000;
      const events = [];
      for (const ev of rawEvents) {
        const t = this.toProjectTime(ev.t);
        if (t === null || t > duration) continue;
        const { t: _drop, ...rest } = ev;
        events.push({ ...rest, t: Math.round(t * 1000) / 1000 });
      }
      events.sort((a, b) => a.t - b.t);
      const createdAt = new Date().toISOString();
      // Start from the look used last time, so a style only has to be set up once.
      const settings = defaultSettings();
      for (const k of Object.keys(settings)) Object.assign(settings[k], this.opts.settings?.[k] || {});
      settings.frame.crop = { x: 0, y: 0, w: 1, h: 1 };
      if (settings.frame.background === 'image' && !String(settings.frame.image || '').startsWith('/')) settings.frame.background = 'aurora';
      settings.webcam.enabled = !!this.files.webcam;
      // The real pointer is not in the picture, so the drawn one must be on.
      if (this.ff) settings.cursor.show = true;
      const project = {
        version: 1,
        id: this.projectId,
        name: `녹화 ${createdAt.slice(0, 16).replace('T', ' ')}`,
        createdAt,
        source: { name: this.opts.source.name, kind: this.opts.source.kind, width: this.size.width, height: this.size.height },
        files: this.files,
        offsets,
        cursorHidden: !!this.ff,
        durationMs,
        inputHooked: this.hooked,
        events,
        settings,
        zooms: autoZoomRegions(events, duration, settings.zoom.scale),
        subtitles: [],
        cuts: [],
        speeds: [],
        annotations: [],
        audios: [],
        trim: { start: 0, end: duration },
      };
      await platform.saveProject(project);
      return project;
    })();
    return this.stopping;
  }
}
