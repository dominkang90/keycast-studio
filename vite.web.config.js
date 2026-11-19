// Browser version as ONE html file (web/index.html) that also opens straight from disk,
// so it can be served as a static site or double-clicked without any server.
import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viteSingleFile } from 'vite-plugin-singlefile';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(here, 'src'),
  base: './',
  publicDir: false,
  build: {
    outDir: resolve(here, 'web'),
    emptyOutDir: true,
    target: 'chrome128',
    chunkSizeWarningLimit: 6000,
    cssCodeSplit: false,
    // Keep the big speech runtime file out of the page (it loads from the model CDN when needed).
    assetsInlineLimit: (file) => !file.endsWith('.wasm'),
    rollupOptions: {
      input: resolve(here, 'src/index.html'),
      output: { inlineDynamicImports: true },
    },
  },
  worker: { format: 'es' },
  plugins: [viteSingleFile({ useRecommendedBuildConfig: false, removeViteModuleLoader: true })],
});
