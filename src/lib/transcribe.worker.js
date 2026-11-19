// Speech recognition that runs on this computer (Whisper through transformers.js).
// The model downloads once and is cached afterwards.
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
// A page opened from a file has no cache storage; the desktop app ships the runtime files itself.
env.useBrowserCache = self.origin !== 'null';

let asr = null;
let loadedKey = '';

async function load(model, device, post) {
  const key = `${model}|${device}`;
  if (asr && loadedKey === key) return asr;
  asr = null;
  const dtype = device === 'webgpu'
    ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
    : { encoder_model: 'q8', decoder_model_merged: 'q8' };
  asr = await pipeline('automatic-speech-recognition', model, {
    device,
    dtype,
    progress_callback: (p) => post({ type: 'download', ...p }),
  });
  loadedKey = key;
  return asr;
}

self.onmessage = async ({ data }) => {
  const post = (msg) => self.postMessage(msg);
  if (data.type === 'origin') {
    // Desktop app: load the speech runtime from the app itself (works offline after the first model download).
    if (data.origin) env.backends.onnx.wasm.wasmPaths = `${data.origin}/ort/`;
    return;
  }
  if (data.type !== 'run') return;
  const { model, language, audio } = data;
  // One device per run. A failed graphics-card start leaves the runtime unusable in this worker,
  // so the caller retries on the processor in a fresh worker instead.
  let gpu = false;
  if (data.preferGpu) {
    try { gpu = !!(await self.navigator?.gpu?.requestAdapter()); } catch { gpu = false; }
  }
  const devices = [gpu ? 'webgpu' : 'wasm'];
  let lastErr = null;
  for (const device of devices) {
    try {
      post({ type: 'status', stage: 'loading', device });
      const run = await load(model, device, post);
      post({ type: 'status', stage: 'transcribing', device });
      const out = await run(audio, {
        language: language && language !== 'auto' ? language : undefined,
        task: 'transcribe',
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      post({ type: 'result', text: out.text, chunks: out.chunks || [{ timestamp: [0, null], text: out.text }], device });
      return;
    } catch (err) {
      lastErr = err;
      asr = null;
      loadedKey = '';
    }
  }
  post({ type: 'error', device: devices[0], message: String(lastErr?.message || lastErr) });
};
