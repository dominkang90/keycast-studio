// Puts Recordly's Windows Graphics Capture helper (wgc-capture.exe) into the packaged app, next
// to FFmpeg. It records the screen with Windows' own capture API and hardware H.264 encoding, and
// leaves the mouse pointer out so the editor can draw a nicer one.
//
// The helper is an unmodified copy from the Recordly project (AGPL-3.0). KeyCast Studio only starts
// it as a separate program; its licence and the place of its source code go into the same folder.
// The file is downloaded from a fixed Recordly release and checked against a known SHA-256.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TAG = 'v1.4.0';
const REPO = 'webadderallorg/Recordly';
const SHA256 = 'a5a9c0c417144a834af3206b60bae32d0c21d55deb8a3f5446831621cfdfa7b3';
const BIN_URL = `https://raw.githubusercontent.com/${REPO}/${TAG}/electron/native/bin/win32-x64/wgc-capture.exe`;
const LICENSE_URL = `https://raw.githubusercontent.com/${REPO}/${TAG}/LICENSE.md`;
const SOURCE_URL = `https://github.com/${REPO}/tree/${TAG}/electron/native/wgc-capture`;

const binDir = process.argv[2] || path.join(__dirname, '..', 'release', 'KeyCast Studio-win32-x64', 'resources', 'app', 'bin');

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

(async () => {
  const exe = await get(BIN_URL);
  const sum = crypto.createHash('sha256').update(exe).digest('hex');
  if (sum !== SHA256) {
    console.error(`wgc-capture.exe has SHA-256 ${sum}, expected ${SHA256}. Not bundled.`);
    process.exit(1);
  }
  const license = await get(LICENSE_URL);
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'wgc-capture.exe'), exe);
  fs.writeFileSync(path.join(binDir, 'WGC-CAPTURE-LICENSE.txt'), license);
  fs.writeFileSync(path.join(binDir, 'WGC-CAPTURE-README.txt'), [
    'wgc-capture.exe is an unmodified copy of the screen capture helper from Recordly,',
    `licensed under the GNU Affero General Public License v3.0 (see WGC-CAPTURE-LICENSE.txt).`,
    'KeyCast Studio starts it as a separate program and does not link to it.',
    '',
    `Source code: ${SOURCE_URL}`,
    `Binary:      ${BIN_URL}`,
    `SHA-256:     ${SHA256}`,
    '',
  ].join('\r\n'));
  console.log(`wgc-capture.exe (${TAG}) copied to ${binDir}`);
})().catch((err) => { console.error(err.message); process.exit(1); });
