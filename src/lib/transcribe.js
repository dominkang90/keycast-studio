import { shapeSubtitles } from './subtitles.js';
// Inlined so the browser version also works when opened straight from a file.
import TranscribeWorker from './transcribe.worker.js?worker&inline';
import { T } from './i18n.js';
import { Input, UrlSource, ALL_FORMATS, AudioBufferSink } from 'mediabunny';

export const MODELS = [
  { id: 'onnx-community/whisper-tiny', name: T('빠름 (tiny, 약 40MB)') },
  { id: 'onnx-community/whisper-base', name: T('보통 (base, 약 80MB)') },
  { id: 'onnx-community/whisper-small', name: T('정확 (small, 약 250MB)') },
  { id: 'onnx-community/whisper-large-v3-turbo', name: T('가장 정확 (large-v3-turbo, 약 600MB, 그래픽카드 권장)') },
];

export const LANGUAGES = [
  { id: 'auto', name: T('자동 감지') },
  { id: 'korean', name: T('한국어') },
  { id: 'english', name: 'English' },
  { id: 'japanese', name: '日本語' },
  { id: 'chinese', name: '中文' },
  { id: 'spanish', name: 'Español' },
  { id: 'german', name: 'Deutsch' },
  { id: 'french', name: 'Français' },
];

const SAMPLE_RATE = 16000;

/** Decode any audio/video file to 16 kHz mono samples. */
export async function decodeAudio(url) {
  // Files of the app (recordings, imported videos) are read a piece at a time: an imported
  // video can be several GB, far too big to load whole.
  if (/^app:/i.test(url)) {
    try {
      const out = await streamAudio(url);
      if (out) return out;
    } catch (err) {
      console.warn('reading the sound in pieces failed, reading the whole file:', err);
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(T('오디오를 읽지 못했습니다 ({0})', res.status));
  const data = await res.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const buf = await ctx.decodeAudioData(data);
    if (buf.numberOfChannels === 1) return buf.getChannelData(0).slice();
    const out = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < ch.length; i++) out[i] += ch[i] / buf.numberOfChannels;
    }
    return out;
  } finally {
    ctx.close();
  }
}

/** Reads only the sound track, in pieces, mixed to mono and resampled to 16 kHz. Null if there is none. */
async function streamAudio(url) {
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) return null;
    const parts = [];
    let outLen = 0;
    let block = [];
    let blockLen = 0;
    let rate = 0;
    // About 10 s at a time is resampled in one go, so the seams are few and far apart.
    const flush = async () => {
      if (!blockLen) return;
      const joined = new Float32Array(blockLen);
      let at = 0;
      for (const b of block) { joined.set(b, at); at += b.length; }
      block = [];
      blockLen = 0;
      const ctx = new OfflineAudioContext(1, Math.max(1, Math.round((joined.length * SAMPLE_RATE) / rate)), SAMPLE_RATE);
      const buf = ctx.createBuffer(1, joined.length, rate);
      buf.copyToChannel(joined, 0);
      const node = ctx.createBufferSource();
      node.buffer = buf;
      node.connect(ctx.destination);
      node.start(0);
      const done = (await ctx.startRendering()).getChannelData(0);
      parts.push(done);
      outLen += done.length;
    };
    let first = true;
    for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers()) {
      if (buffer.sampleRate !== rate) { await flush(); rate = buffer.sampleRate; }
      // Sound that starts after the picture keeps its place.
      if (first && timestamp > 0.001) { parts.push(new Float32Array(Math.round(timestamp * SAMPLE_RATE))); outLen += parts[0].length; }
      first = false;
      const mono = new Float32Array(buffer.length);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const ch = buffer.getChannelData(c);
        for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buffer.numberOfChannels;
      }
      block.push(mono);
      blockLen += mono.length;
      if (blockLen >= rate * 10) await flush();
    }
    await flush();
    const out = new Float32Array(outLen);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  } finally {
    input.dispose?.();
  }
}

/**
 * @param {{url:string, model:string, language:string, duration:number, onProgress:(info:object)=>void}} opts
 * @returns {Promise<Array>} subtitles
 */
export async function transcribe(opts) {
  opts.onProgress?.({ stage: 'decoding' });
  const audio = await decodeAudio(opts.url);
  if (!audio.length) throw new Error(T('녹음된 소리가 없습니다.'));
  let result;
  try {
    result = await runWorker(opts, audio, opts.preferGpu !== false);
  } catch (err) {
    if (!err.gpu) throw err;
    // The graphics card did not work: start over on the processor with a clean worker.
    opts.onProgress?.({ stage: 'retry', message: err.message });
    result = await runWorker(opts, audio, false);
  }
  const shape = (r) => shapeSubtitles(r.chunks, { audio, sampleRate: SAMPLE_RATE, duration: opts.duration });
  opts.onProgress?.({ stage: 'shaping' });
  let subs = shape(result);
  if (!subs.length && result.device === 'webgpu') {
    // Some graphics cards run the model but return nothing. Check once on the processor.
    opts.onProgress?.({ stage: 'retry' });
    result = await runWorker(opts, audio, false);
    opts.onProgress?.({ stage: 'shaping' });
    subs = shape(result);
  }
  return subs;
}

async function runWorker(opts, audio, preferGpu) {
  const worker = new TranscribeWorker();
  worker.postMessage({ type: 'origin', origin: location.protocol === 'app:' ? location.origin : null });
  const files = new Map();
  try {
    return await new Promise((resolve, reject) => {
      worker.onerror = (e) => reject(new Error(e.message || T('음성 인식 작업을 시작하지 못했습니다.')));
      worker.onmessage = ({ data }) => {
        if (data.type === 'download') {
          if (data.status === 'progress' && data.file) {
            files.set(data.file, { loaded: data.loaded || 0, total: data.total || 0 });
            let loaded = 0;
            let total = 0;
            for (const f of files.values()) { loaded += f.loaded; total += f.total; }
            opts.onProgress?.({ stage: 'downloading', loaded, total });
          }
        } else if (data.type === 'status') {
          opts.onProgress?.({ stage: data.stage, device: data.device, message: data.message });
        } else if (data.type === 'result') {
          resolve(data);
        } else if (data.type === 'error') {
          const err = new Error(data.message);
          err.gpu = data.device === 'webgpu';
          reject(err);
        }
      };
      worker.postMessage({ type: 'run', model: opts.model, language: opts.language, audio, preferGpu });
    });
  } finally {
    worker.terminate();
  }
}
