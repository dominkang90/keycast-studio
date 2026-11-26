// Fails the build if the packaged program is missing a file it needs to start.
const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..', 'release', 'KeyCast Studio-win32-x64', 'resources', 'app');
if (!fs.existsSync(path.join(appDir, '..', 'app-update.yml'))) { console.error('Packaged app is missing resources/app-update.yml'); process.exit(1); }
const required = [
  'package.json',
  'electron/main.cjs',
  'electron/preload.cjs',
  'electron/keys.cjs',
  'electron/webm.cjs',
  'dist/index.html',
  'dist/toolbar.html',
  'dist/overlay.html',
  'dist/manual.html',
  'node_modules/uiohook-napi/package.json',
  'node_modules/koffi/src/koffi/index.cjs',
  'node_modules/electron-updater/package.json',
];

// Every local file main.cjs requires must be there too.
const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
for (const m of main.matchAll(/require\('\.\/([^']+)'\)/g)) required.push(`electron/${m[1]}`);

// Every packaged module must have its entry file (the packager drops folders named src/).
const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    const mod = path.join(dir, ent.name);
    if (ent.name.startsWith('@')) { walk(mod); continue; }
    try {
      const main = JSON.parse(fs.readFileSync(path.join(mod, 'package.json'), 'utf8')).main || 'index.js';
      const ok = [main, `${main}.js`, path.join(main, 'index.js')].some((m) => fs.existsSync(path.join(mod, m)) && fs.statSync(path.join(mod, m)).isFile());
      if (!ok) required.push(path.relative(appDir, path.join(mod, main)).replace(/\\/g, '/'));
    } catch { /* not a module folder */ }
    walk(path.join(mod, 'node_modules'));
  }
};
walk(path.join(appDir, 'node_modules'));

const missing = [...new Set(required)].filter((f) => !fs.existsSync(path.join(appDir, f)));
if (missing.length) {
  console.error(`Packaged app is missing: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`Packaged app has all ${new Set(required).size} required files.`);
