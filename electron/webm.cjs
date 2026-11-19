// Recorded WebM files have no duration in their header, which breaks seeking and the timeline.
// This writes the real duration into the Segment Info element.
const fs = require('fs');
const fsp = fs.promises;

const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_DURATION = 0x4489;
const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_CLUSTER = 0x1f43b675;

function vintLength(first) {
  for (let len = 1, mask = 0x80; len <= 8; len++, mask >>= 1) {
    if (first & mask) return len;
  }
  return -1;
}

function readId(buf, pos) {
  const len = vintLength(buf[pos]);
  if (len < 1 || len > 4 || pos + len > buf.length) throw new Error('bad element id');
  let value = 0;
  for (let i = 0; i < len; i++) value = value * 256 + buf[pos + i];
  return { value, len };
}

function readSize(buf, pos) {
  const len = vintLength(buf[pos]);
  if (len < 1 || pos + len > buf.length) throw new Error('bad element size');
  let value = buf[pos] & ((1 << (8 - len)) - 1);
  let allOnes = value === (1 << (8 - len)) - 1;
  for (let i = 1; i < len; i++) {
    value = value * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) allOnes = false;
  }
  return { value, len, unknown: allOnes };
}

function readUInt(buf, pos, size) {
  let v = 0;
  for (let i = 0; i < size; i++) v = v * 256 + buf[pos + i];
  return v;
}

function encodeSize8(n) {
  const out = Buffer.alloc(8);
  out[0] = 0x01;
  let v = n;
  for (let i = 7; i >= 1; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return out;
}

/** Locate Segment > Info inside the first bytes of the file. */
function locateInfo(head) {
  let pos = 0;
  const ebml = readId(head, pos);
  pos += ebml.len;
  const ebmlSize = readSize(head, pos);
  pos += ebmlSize.len + ebmlSize.value;
  const seg = readId(head, pos);
  if (seg.value !== ID_SEGMENT) throw new Error('no segment');
  pos += seg.len;
  const segSize = readSize(head, pos);
  pos += segSize.len;
  while (pos < head.length - 12) {
    const id = readId(head, pos);
    const size = readSize(head, pos + id.len);
    const dataStart = pos + id.len + size.len;
    if (id.value === ID_INFO) {
      return { start: pos, dataStart, end: dataStart + size.value };
    }
    if (id.value === ID_CLUSTER || size.unknown) break;
    pos = dataStart + size.value;
  }
  throw new Error('no info element');
}

async function patchWebmDuration(file, durationMs) {
  const fd = await fsp.open(file, 'r');
  let head;
  let total;
  try {
    total = (await fd.stat()).size;
    head = Buffer.alloc(Math.min(total, 1 << 20));
    await fd.read(head, 0, head.length, 0);
  } finally {
    await fd.close();
  }
  const info = locateInfo(head);
  if (info.end > head.length) throw new Error('info element too large');

  let scale = 1000000;
  let durationAt = -1;
  let durationSize = 0;
  let pos = info.dataStart;
  while (pos < info.end) {
    const id = readId(head, pos);
    const size = readSize(head, pos + id.len);
    const data = pos + id.len + size.len;
    if (id.value === ID_TIMECODE_SCALE) scale = readUInt(head, data, size.value);
    if (id.value === ID_DURATION) { durationAt = data; durationSize = size.value; }
    pos = data + size.value;
  }
  const units = (durationMs * 1000000) / scale;

  if (durationAt >= 0) {
    // Rewrite the existing value in place.
    const buf = Buffer.alloc(durationSize);
    if (durationSize === 4) buf.writeFloatBE(units, 0); else buf.writeDoubleBE(units, 0);
    const handle = await fsp.open(file, 'r+');
    try { await handle.write(buf, 0, buf.length, durationAt); } finally { await handle.close(); }
    return;
  }

  const durationEl = Buffer.alloc(11);
  durationEl[0] = 0x44;
  durationEl[1] = 0x89;
  durationEl[2] = 0x88; // size 8
  durationEl.writeDoubleBE(units, 3);
  const children = head.subarray(info.dataStart, info.end);
  const idBytes = head.subarray(info.start, info.start + 4);
  const newInfo = Buffer.concat([idBytes, encodeSize8(children.length + durationEl.length), children, durationEl]);

  const tmp = `${file}.tmp`;
  const out = fs.createWriteStream(tmp);
  out.write(head.subarray(0, info.start));
  out.write(newInfo);
  await new Promise((resolve, reject) => {
    const rest = fs.createReadStream(file, { start: info.end });
    rest.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    rest.pipe(out);
  });
  await fsp.rename(tmp, file);
}

module.exports = { patchWebmDuration, locateInfo };
