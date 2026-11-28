// Draws build/icon.png and build/icon.ico from build/icon.svg (needs the "sharp" package).
// Run: node scripts/make-icon.cjs
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const dir = path.join(__dirname, '..', 'build');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'));
const small = fs.readFileSync(path.join(dir, '..', 'brand', 'icon-small.svg'));
const sizes = [256, 128, 64, 48, 32, 24, 16];

(async () => {
  await sharp(svg, { density: 384 }).resize(512, 512).png().toFile(path.join(dir, 'icon.png'));
  const pngs = await Promise.all(sizes.map((s) => sharp(s <= 24 ? small : svg, { density: 384 }).resize(s, s).png().toBuffer()));
  // .ico holding PNG images (supported since Windows Vista)
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    head.writeUInt8(s >= 256 ? 0 : s, e);
    head.writeUInt8(s >= 256 ? 0 : s, e + 1);
    head.writeUInt8(0, e + 2);
    head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(pngs[i].length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  fs.writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat([head, ...pngs]));
  console.log('build/icon.png and build/icon.ico written');
})();