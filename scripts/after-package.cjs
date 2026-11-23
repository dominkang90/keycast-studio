// Runs after @electron/packager:
// 1. removes Chromium language files the app does not need (about 37 MB); Chromium uses them only
//    for its own texts such as context menus, and English stays as the fallback;
// 2. puts back koffi's loader folder (node_modules/koffi/src), which the packager leaves out
//    because the app's own top-level src/ is excluded.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'release', 'KeyCast Studio-win32-x64');
if (!fs.existsSync(out)) {
  console.error('No packaged app. Run "npm run package" first.');
  process.exit(1);
}

const KEEP = new Set(['en-US', 'ko', 'ja', 'zh-CN', 'zh-TW']);
const locales = path.join(out, 'locales');
let removed = 0;
let bytes = 0;
for (const f of fs.readdirSync(locales)) {
  if (!f.endsWith('.pak') || KEEP.has(path.basename(f, '.pak'))) continue;
  bytes += fs.statSync(path.join(locales, f)).size;
  fs.rmSync(path.join(locales, f));
  removed++;
}
console.log(`Removed ${removed} unused language files (${(bytes / 1048576).toFixed(1)} MB).`);

const koffiSrc = path.join(root, 'node_modules', 'koffi', 'src');
const koffiOut = path.join(out, 'resources', 'app', 'node_modules', 'koffi', 'src');
if (fs.existsSync(koffiSrc) && !fs.existsSync(path.join(koffiOut, 'koffi', 'index.cjs'))) {
  fs.cpSync(koffiSrc, koffiOut, { recursive: true });
  console.log('Restored node_modules/koffi/src.');
}
