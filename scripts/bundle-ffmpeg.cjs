// Puts ffmpeg next to the packaged app so "hide the real mouse cursor" works without a
// separate install. Uses FFMPEG_PATH, or the ffmpeg found on PATH. It must be ffmpeg 8 or
// newer with the Windows Graphics Capture filter (gfxcapture).
// Run: node scripts/bundle-ffmpeg.cjs [packaged app folder]
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'release', 'KeyCast Studio-win32-x64'));
const binDir = path.join(appDir, 'resources', 'app', 'bin');

function findFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    return execFileSync('where', ['ffmpeg'], { encoding: 'utf8' }).split(/\r?\n/).find((l) => l.trim()).trim();
  } catch {
    return null;
  }
}

const ffmpeg = findFfmpeg();
if (!ffmpeg || !fs.existsSync(ffmpeg)) {
  console.error('ffmpeg not found. Install it (winget install Gyan.FFmpeg) or set FFMPEG_PATH.');
  process.exit(1);
}
const help = execFileSync(ffmpeg, ['-hide_banner', '-h', 'filter=gfxcapture'], { encoding: 'utf8' });
if (!help.includes('capture_cursor')) {
  console.error(`${ffmpeg} has no gfxcapture filter. Use ffmpeg 8 or newer (for example the Gyan.FFmpeg full build).`);
  process.exit(1);
}
const version = execFileSync(ffmpeg, ['-hide_banner', '-version'], { encoding: 'utf8' });

fs.mkdirSync(binDir, { recursive: true });
fs.copyFileSync(ffmpeg, path.join(binDir, 'ffmpeg.exe'));
// ffmpeg's own license and where its source code is, as its license asks
const licenseFile = ['LICENSE', 'LICENSE.txt'].map((n) => path.join(path.dirname(path.dirname(ffmpeg)), n)).find((p) => fs.existsSync(p));
if (licenseFile) fs.copyFileSync(licenseFile, path.join(binDir, 'FFMPEG-LICENSE.txt'));
fs.writeFileSync(path.join(binDir, 'FFMPEG-README.txt'), [
  'This folder holds an unmodified copy of FFmpeg, used by KeyCast Studio to record the screen',
  'without the mouse pointer. FFmpeg is a separate program under its own license (see',
  'FFMPEG-LICENSE.txt); KeyCast Studio only starts it as a separate process.',
  '',
  'FFmpeg source code: https://ffmpeg.org/download.html',
  'Build used here (version and configuration below): https://www.gyan.dev/ffmpeg/builds/',
  '',
  version,
].join('\r\n'));
console.log(`ffmpeg copied to ${binDir}`);