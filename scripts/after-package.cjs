// Runs after @electron/packager:
// 1. removes Chromium language files the app does not need (about 37 MB); Chromium uses them only
//    for its own texts such as context menus, and English stays as the fallback;
// 2. puts back the src/ folders of the packaged modules (koffi's loader, debug for the updater,
//    and so on), which the packager leaves out because the app's own top-level src/ is excluded;
// 3. writes resources/app-update.yml, where the installed app looks for its updates (GitHub releases).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'release', 'KeyCast Studio-win32-x64');
if (!fs.existsSync(out)) {
  console.error('No packaged app. Run "npm run package" first.');
  process.exit(1);
}

const KEEP = new Set(['en-US', 'ko', 'ja', 'zh-CN', 'zh-TW', 'es', 'es-419', 'fr', 'de', 'it', 'nl', 'pt-BR', 'ru']);
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

// Every packaged module (nested ones too) that has a src/ folder in node_modules gets it back.
const restored = [];
const walk = (outMods, srcMods) => {
  if (!fs.existsSync(outMods)) return;
  for (const ent of fs.readdirSync(outMods, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith('@')) { walk(path.join(outMods, ent.name), path.join(srcMods, ent.name)); continue; }
    const from = path.join(srcMods, ent.name, 'src');
    const to = path.join(outMods, ent.name, 'src');
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.cpSync(from, to, { recursive: true });
      restored.push(path.relative(path.join(out, 'resources', 'app'), to));
    }
    walk(path.join(outMods, ent.name, 'node_modules'), path.join(srcMods, ent.name, 'node_modules'));
  }
};
walk(path.join(out, 'resources', 'app', 'node_modules'), path.join(root, 'node_modules'));
console.log(`Restored ${restored.length} src folders: ${restored.join(', ')}`);

// The installed app updates itself from the GitHub releases (electron-updater reads this file).
fs.writeFileSync(path.join(out, 'resources', 'app-update.yml'), [
  'provider: github',
  'owner: dominkang90',
  'repo: keycast-studio',
  'updaterCacheDirName: keycast-studio-updater',
  '',
].join('\n'));
console.log('Wrote resources/app-update.yml.');
