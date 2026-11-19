// Unit checks for the logic that doesn't need a window: key grouping, zoom, subtitles, WebM patching.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildKeyGroups, visibleGroups, DRAG_LABEL } from '../src/lib/keys.js';
import { segments, outDuration, srcToOut, outToSrc, mapCues } from '../src/lib/timemap.js';
import { autoZoomRegions, cameraAt, CursorTrack, viewRect } from '../src/lib/zoom.js';
import { shapeSubtitles, toSRT, wrapLines } from '../src/lib/subtitles.js';

const require = createRequire(import.meta.url);
const { patchWebmDuration, locateInfo } = require('../electron/webm.cjs');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok - ${name}`); } catch (err) { console.error(`FAIL - ${name}\n${err.stack}`); process.exitCode = 1; }
}

test('combo with modifiers', () => {
  const g = buildKeyGroups([
    { t: 1, type: 'kd', name: 'Ctrl', mods: { ctrl: true } },
    { t: 1.1, type: 'kd', name: 'Shift', mods: { ctrl: true, shift: true } },
    { t: 1.2, type: 'kd', name: 'S', mods: { ctrl: true, shift: true } },
    { t: 1.3, type: 'ku', name: 'S' }, { t: 1.4, type: 'ku', name: 'Shift' }, { t: 1.4, type: 'ku', name: 'Ctrl' },
  ]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].items[0].keys, ['Ctrl', 'Shift', 'S']);
});

test('typing merges and shift makes symbols', () => {
  const g = buildKeyGroups([
    { t: 1, type: 'kd', name: 'H', mods: {} },
    { t: 1.1, type: 'kd', name: 'I', mods: {} },
    { t: 1.2, type: 'kd', name: 'Shift' },
    { t: 1.3, type: 'kd', name: '1', mods: { shift: true } },
    { t: 1.35, type: 'ku', name: 'Shift' },
    { t: 5, type: 'kd', name: 'A', mods: {} },
  ]);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].items.map((i) => i.keys[0]), ['H', 'I', '!']);
});

test('repeats are counted, lone modifier shown, shortcuts mode hides typing', () => {
  const ev = [
    { t: 1, type: 'kd', name: 'Backspace', mods: {} },
    { t: 1.05, type: 'kd', name: 'Backspace', repeat: true, mods: {} },
    { t: 1.1, type: 'kd', name: 'Backspace', repeat: true, mods: {} },
    { t: 3, type: 'kd', name: 'Win' }, { t: 3.1, type: 'ku', name: 'Win' },
  ];
  const g = buildKeyGroups(ev);
  assert.equal(g[0].items[0].count, 3);
  assert.deepEqual(g[1].items[0].keys, ['Win']);
  assert.equal(buildKeyGroups(ev, { mode: 'shortcuts' }).length, 0);
});

test('visible groups fade out', () => {
  const g = buildKeyGroups([{ t: 1, type: 'kd', name: 'A', mods: {} }]);
  assert.equal(visibleGroups(g, 0.5).length, 0);
  assert.equal(visibleGroups(g, 1.5).length, 1);
  assert.equal(visibleGroups(g, 10).length, 0);
});

test('zoom regions merge nearby clicks and camera eases', () => {
  const ev = [
    { t: 2, type: 'md', x: 0.2, y: 0.2 }, { t: 2.5, type: 'md', x: 0.25, y: 0.22 }, { t: 9, type: 'md', x: 0.8, y: 0.8 },
  ];
  const z = autoZoomRegions(ev, 20, 2);
  assert.equal(z.length, 2);
  const cur = new CursorTrack(ev);
  assert.equal(cameraAt(0, z, cur).scale, 1);
  assert.ok(cameraAt(2.5, z, cur).scale > 1.9);
  const v = viewRect(cameraAt(2.5, z, cur));
  assert.ok(v.x >= 0 && v.x + v.w <= 1);
});

test('subtitles split sentences, drop hallucinations, srt', () => {
  const subs = shapeSubtitles([
    { timestamp: [0, 4], text: ' 안녕하세요. 오늘은 단축키를 보여 드릴게요. ' },
    { timestamp: [4, 6], text: ' 시청해주셔서 감사합니다.' },
    { timestamp: [6, 9], text: 'Press Control S to save the file, then open the terminal.' },
  ]);
  assert.equal(subs.length, 3);
  assert.equal(subs[0].text, '안녕하세요.');
  assert.ok(subs[0].end <= subs[1].start);
  const srt = toSRT(subs);
  assert.ok(srt.startsWith('1\r\n00:00:00,000 --> '));
  assert.equal(wrapLines('짧은 자막').length, 1);
  assert.equal(wrapLines('이 문장은 한 줄에 다 들어가지 않을 만큼 꽤 길게 쓴 자막입니다').length, 2);
});

test('camera glides from one zoom to the next without jumping', () => {
  const regions = [
    { id: 'a', start: 1, end: 4, scale: 2, x: 0.2, y: 0.2 },
    { id: 'b', start: 3.8, end: 7, scale: 2.5, x: 0.8, y: 0.7 },
  ];
  // While zoomed in, the point the camera looks at must move a little at a time.
  let prev = cameraAt(2, regions, null, { enabled: true, ramp: 0.55 });
  let worst = 0;
  for (let t = 2; t <= 6; t += 1 / 60) {
    const c = cameraAt(t, regions, null, { enabled: true, ramp: 0.55 });
    assert.ok(c.scale > 1.9, `stays zoomed in at ${t.toFixed(2)}: ${c.scale}`);
    worst = Math.max(worst, Math.abs(c.x - prev.x), Math.abs(c.y - prev.y));
    prev = c;
  }
  assert.ok(worst < 0.015, `largest step between frames ${worst}`);
  assert.ok(Math.abs(cameraAt(2.5, regions, null, { enabled: true }).x - 0.2) < 1e-9);
  assert.ok(Math.abs(cameraAt(6, regions, null, { enabled: true }).x - 0.8) < 1e-9);
});

test('cut-out parts and speed regions map times', () => {
  const p = { durationMs: 20000, trim: { start: 2, end: 18 }, cuts: [{ start: 5, end: 8 }], speeds: [{ start: 10, end: 14, speed: 2 }] };
  const segs = segments(p);
  // kept: 2-5 (1x), 8-10 (1x), 10-14 (2x), 14-18 (1x) => 3 + 2 + 2 + 4 = 11 s
  assert.equal(segs.length, 4);
  assert.ok(Math.abs(outDuration(segs) - 11) < 1e-9);
  assert.ok(Math.abs(srcToOut(segs, 6) - 3) < 1e-9); // inside the cut: where the next piece begins
  assert.ok(Math.abs(srcToOut(segs, 12) - 6) < 1e-9);
  assert.ok(Math.abs(outToSrc(segs, 6) - 12) < 1e-9);
  assert.ok(Math.abs(outToSrc(segs, 3.5) - 8.5) < 1e-9);
  const cues = mapCues([{ start: 4, end: 9, text: 'a' }, { start: 5.5, end: 7, text: 'gone' }], segs);
  assert.equal(cues.length, 1);
  assert.ok(Math.abs(cues[0].start - 2) < 1e-9 && Math.abs(cues[0].end - 4) < 1e-9);
  assert.equal(segments({ durationMs: 5000, trim: { start: 0, end: 5 } }).length, 1);
});

test('drag, wheel and the custom key filter', () => {
  const ev = [
    { t: 1, type: 'kd', name: 'Alt', mods: { alt: true } },
    { t: 1.1, type: 'md', button: 1, x: 0.2, y: 0.2 },
    { t: 1.2, type: 'mm', x: 0.4, y: 0.4 },
    { t: 1.3, type: 'mu', button: 1, x: 0.4, y: 0.4 },
    { t: 1.4, type: 'ku', name: 'Alt' },
    { t: 3, type: 'wh', rotation: 1, x: 0.4, y: 0.4 },
    { t: 5, type: 'kd', name: 'A', mods: {} },
  ];
  const g = buildKeyGroups(ev, { mode: 'all', showMouse: true });
  assert.deepEqual(g[0].items[0].keys, ['Alt', DRAG_LABEL]);
  assert.ok(g[1].items[0].keys[0].includes('↓'));
  assert.equal(g.length, 3);
  const only = buildKeyGroups(ev, { mode: 'custom', allowed: ['Alt'], showMouse: true });
  assert.equal(only.length, 1);
  assert.equal(buildKeyGroups(ev, { mode: 'all', showMouse: false }).length, 2); // lone Alt + A
});

test('webm duration patch', () => {
  // EBML header, Segment (unknown size) > Info { TimecodeScale 1e6 } > Cluster
  const ebml = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x86, 0x81, 0x01]);
  const seg = Buffer.from([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  const info = Buffer.from([0x15, 0x49, 0xa9, 0x66, 0x87, 0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]);
  const cluster = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x84, 1, 2, 3, 4]);
  const dir = mkdtempSync(join(tmpdir(), 'kc-'));
  const file = join(dir, 'a.webm');
  writeFileSync(file, Buffer.concat([ebml, seg, info, cluster]));
  return patchWebmDuration(file, 4321).then(() => {
    const out = readFileSync(file);
    const loc = locateInfo(out);
    const body = out.subarray(loc.dataStart, loc.end);
    const i = body.indexOf(Buffer.from([0x44, 0x89, 0x88]));
    assert.ok(i >= 0);
    assert.equal(body.readDoubleBE(i + 3), 4321);
    assert.ok(out.subarray(out.length - 9).equals(cluster));
    rmSync(dir, { recursive: true });
    console.log('ok - webm duration value');
  });
});

console.log(`${passed} checks ran`);
