// Fails the build if the packaged program is missing a file it needs to start.
const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..', 'release', 'KeyCast Studio-win32-x64', 'resources', 'app');
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
];

// Every local file main.cjs requires must be there too.
const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
for (const m of main.matchAll(/require\('\.\/([^']+)'\)/g)) required.push(`electron/${m[1]}`);

const missing = [...new Set(required)].filter((f) => !fs.existsSync(path.join(appDir, f)));
if (missing.length) {
  console.error(`Packaged app is missing: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`Packaged app has all ${new Set(required).size} required files.`);
