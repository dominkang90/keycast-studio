import { shapeSubtitles } from './subtitles.js';
// Inlined so the browser version also works when opened straight from a file.
import TranscribeWorker from './transcribe.worker.js?worker&inline';

export const MODELS = [
  { id: 'onnx-community/whisper-tiny', name: '빠름 (tiny, 약 40MB)' },
  { id: 'onnx-community/whisper-base', name: '보통 (base, 약 80MB)' },
  { id: 'onnx-community/whisper-small', name: '정확 (small, 약 250MB)' },
  { id: 'onnx-community/whisper-large-v3-turbo', name: '가장 정확 (large-v3-turbo, 약 600MB, 그래픽카드 권장)' },
];

export const LANGUAGES = [
  { id: 'auto', name: '자동 감지' },
  { id: 'korean', name: '한국어' },
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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`오디오를 읽지 못했습니다 (${res.status})`);
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

/**
 * @param {{url:string, model:string, language:string, duration:number, onProgress:(info:object)=>void}} opts
 * @returns {Promise<Array>} subtitles
 */
export async function transcribe(opts) {
  opts.onProgress?.({ stage: 'decoding' });
  const audio = await decodeAudio(opts.url);
  if (!audio.length) throw new Error('녹음된 소리가 없습니다.');
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
      worker.onerror = (e) => reject(new Error(e.message || '음성 인식 작업을 시작하지 못했습니다.'));
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
