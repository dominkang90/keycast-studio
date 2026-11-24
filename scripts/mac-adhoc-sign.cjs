// electron-builder afterPack hook: gives the macOS app a complete ad-hoc signature.
//
// Without an Apple Developer ID, electron-builder 25 skips signing (it does not accept
// identity "-"), which leaves only Electron's own linker signature on the main binary: the
// bundle's Info.plist and resources are not sealed. macOS then calls a downloaded copy
// "damaged". Signing ad hoc here, before the dmg and zip are made, seals the whole bundle so
// macOS treats it as an app from an unidentified developer instead (Privacy & Security → Open
// Anyway).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/** Mach-O (thin or universal) files only: prebuilt modules for Linux and Windows are skipped. */
function isMachO(file) {
  const b = Buffer.alloc(4);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, b, 0, 4, 0); } finally { fs.closeSync(fd); }
  const m = b.readUInt32BE(0);
  return [0xcffaedfe, 0xcefaedfe, 0xfeedfacf, 0xfeedface, 0xcafebabe].includes(m);
}

/** Native modules and libraries among the app's own files (Contents/Resources). */
function looseBinaries(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) { looseBinaries(p, out); continue; }
    if (/\.(node|dylib|so)$/.test(e.name) && isMachO(p)) out.push(p);
  }
  return out;
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const sign = (...args) => execFileSync('codesign', ['--force', '--sign', '-', ...args], { stdio: 'inherit' });
  // Native modules in the app's own files first: the bundle signature seals them as they are.
  const resources = path.join(app, 'Contents', 'Resources');
  for (const file of looseBinaries(resources)) sign(file);
  // Frameworks and helper apps inside out, then the app itself.
  sign('--deep', app);
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
  console.log(`  • ad-hoc signed ${app}`);
};
