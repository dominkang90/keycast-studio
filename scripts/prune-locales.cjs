// Removes Chromium language files the app does not need (about 37 MB). Chromium uses them only
// for its own built-in texts such as context menus; English stays as the fallback.
const fs = require('fs');
const path = require('path');

const KEEP = new Set(['en-US', 'ko', 'ja', 'zh-CN', 'zh-TW']);
const dir = path.join(__dirname, '..', 'release', 'KeyCast Studio-win32-x64', 'locales');
if (!fs.existsSync(dir)) {
  console.error('No packaged app to prune. Run "npm run package" first.');
  process.exit(1);
}
let removed = 0;
let bytes = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.pak') || KEEP.has(path.basename(f, '.pak'))) continue;
  bytes += fs.statSync(path.join(dir, f)).size;
  fs.rmSync(path.join(dir, f));
  removed++;
}
console.log(`Removed ${removed} unused language files (${(bytes / 1048576).toFixed(1)} MB).`);
