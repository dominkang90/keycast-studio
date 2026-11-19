import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));

// The speech model runtime loads its WebAssembly files at run time; ship them with the app
// so nothing but the model itself is downloaded.
function copyOnnxRuntime() {
  return {
    name: 'copy-onnx-runtime',
    closeBundle() {
      const from = resolve(here, 'node_modules/@huggingface/transformers/dist');
      const to = resolve(here, 'dist/ort');
      mkdirSync(to, { recursive: true });
      for (const f of readdirSync(from)) {
        if (/^ort-wasm.*\.(wasm|mjs)$/.test(f)) copyFileSync(resolve(from, f), resolve(to, f));
      }
      // The user manual (사용설명서.html) opens from the app's ❓ button.
      copyFileSync(resolve(here, '사용설명서.html'), resolve(here, 'dist/manual.html'));
    },
  };
}

export default defineConfig({
  root: resolve(here, 'src'),
  base: './',
  publicDir: false,
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    target: 'chrome128',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        index: resolve(here, 'src/index.html'),
        toolbar: resolve(here, 'src/toolbar.html'),
        overlay: resolve(here, 'src/overlay.html'),
      },
    },
  },
  worker: { format: 'es' },
  plugins: [copyOnnxRuntime()],
});
