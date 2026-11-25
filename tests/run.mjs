// Unit checks for the logic that doesn't need a window: key grouping, zoom, subtitles, WebM patching.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildKeyGroups, visibleGroups, DRAG_LABEL, keepWithoutTyping } from '../src/lib/keys.js';
import { segments, outDuration, srcToOut, outToSrc, mapCues } from '../src/lib/timemap.js';
import { autoZoomRegions, cameraAt, CursorTrack, viewRect } from '../src/lib/zoom.js';
import { shapeSubtitles, toSRT, wrapLines, cueWords, SUBTITLE_STYLES } from '../src/lib/subtitles.js';
import { drawSubtitle, drawClicks, CLICK_EFFECTS } from '../src/lib/compositor.js';
import { HangulComposer, hangulText, jamoForKey } from '../src/lib/hangul.js';
import { readExtension, applyBackground, EXAMPLE_EXTENSION } from '../src/lib/extensions.js';
import { findSilences, busyTimes } from '../src/lib/silence.js';

const require = createRequire(import.meta.url);
const { patchWebmDuration, locateInfo } = require('../electron/webm.cjs');

let passed = 0;
function test(name, fn) {
  const fail = (err) => { console.error(`FAIL - ${name}\n${err.stack}`); process.exitCode = 1; };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') r.then(() => { passed++; console.log(`ok - ${name}`); }, fail);
    else { passed++; console.log(`ok - ${name}`); }
  } catch (err) { fail(err); }
}

const ALL = { mode: 'all' };

test('shortcuts only by default: typing hidden, shortcuts and F-keys shown', () => {
  const g = buildKeyGroups([
    { t: 1, type: 'kd', name: 'H', mods: {} },
    { t: 1.1, type: 'kd', name: 'I', mods: {} },
    { t: 2, type: 'kd', name: 'S', mods: { ctrl: true } },
    { t: 4, type: 'kd', name: 'F5', mods: {} },
    { t: 6, type: 'kd', name: 'Esc', mods: {} },
    { t: 8, type: 'kd', name: 'Enter', mods: {} },
  ]);
  assert.deepEqual(g.map((x) => x.items.map((i) => i.keys.join('+')).join(' ')), ['Ctrl+S', 'F5', 'Esc']);
});

test('typing is dropped before saving unless asked for', () => {
  const ev = [
    { type: 'kd', name: 'P', mods: {} }, { type: 'ku', name: 'P' },
    { type: 'kd', name: '1', mods: { shift: true } },
    { type: 'kd', name: 'Space', mods: {} },
    { type: 'kd', name: 'Ctrl', mods: { ctrl: true } }, { type: 'kd', name: 'S', mods: { ctrl: true } },
    { type: 'kd', name: 'Enter', mods: {} }, { type: 'kd', name: 'F5', mods: {} },
    { type: 'md', button: 1, x: 0.5, y: 0.5 },
    // number pad digits, AltGr characters and unknown keys are typing too
    { type: 'kd', name: 'Num 7', mods: {} }, { type: 'kd', name: 'Num .', mods: {} },
    { type: 'kd', name: 'Q', mods: { ctrl: true, alt: true } },
    { type: 'kd', name: 'Key 999', mods: {} },
    { type: 'kd', name: 'Num 1', mods: { alt: true } },
    { type: 'kd', name: 'T', mods: { meta: true } }, { type: 'ku', name: 'T' }, { type: 'ku', name: 'Ctrl' },
  ];
  assert.deepEqual(ev.filter(keepWithoutTyping).map((e) => e.name || e.type), ['Ctrl', 'S', 'Enter', 'F5', 'md', 'T', 'Ctrl']);
});

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
  ], ALL);
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
  const g = buildKeyGroups(ev, ALL);
  assert.equal(g[0].items[0].count, 3);
  assert.deepEqual(g[1].items[0].keys, ['Win']);
  assert.equal(buildKeyGroups(ev, { mode: 'shortcuts' }).length, 0);
});

test('Hangul: the Korean layout composes syllables like the Windows IME', () => {
  const split = (s) => s.split(' ').flatMap((w) => (['Space', 'Backspace'].includes(w) ? [w] : [...w]));
  const cases = {
    dkssudgktpdy: '안녕하세요', gksrmf: '한글', rhkd: '광', dlfrdj: '읽어', ekfr: '닭', qkfqdk: '밟아', dho: '왜', dmlwk: '의자',
    'rk Space sk': '가 나', 'gksrmf Backspace': '한그', 'gksrmf Backspace Backspace Backspace': '한', 'rkskd Backspace': '가나', rt: 'ㄱㅅ',
  };
  for (const [keys, want] of Object.entries(cases)) assert.equal(hangulText(split(keys)), want, keys);
  assert.equal(hangulText(['^r', 'k', '^t', 'm']), '까쓰');
  assert.equal(jamoForKey('Q', true), 'ㅃ');
  assert.equal(jamoForKey('F1'), null);
  const h = new HangulComposer();
  for (const j of 'ㄷㅏㄹㄱ') h.type(j);
  h.backspace();
  assert.deepEqual(h.labels(), ['달']);
});

test('Hangul typing shows growing syllables and follows the IME state', () => {
  const kd = (t, name, hangul) => ({ t, type: 'kd', name, hangul });
  const ev = [...'GKSRMF'].map((k, i) => kd(1 + i * 0.1, k, true));
  const g = buildKeyGroups(ev, { ...ALL });
  assert.equal(g.length, 1);
  const at = (t) => visibleGroups(g, t, { ...ALL, hold: 5 })[0].items.map((it) => it.keys[0]).join('');
  assert.equal(at(1.05), 'ㅎ');
  assert.equal(at(1.25), '한');
  assert.equal(at(1.55), '한글');
  // English mode (no hangul flag) keeps the letters, and 'off' ignores the flag.
  assert.equal(buildKeyGroups([...'GKS'].map((k, i) => kd(i * 0.1, k)), ALL)[0].items.length, 3);
  assert.equal(buildKeyGroups(ev, { ...ALL, hangul: 'off' })[0].items[0].keys[0], 'G');
  // 'always' reads older recordings without the flag; Backspace edits the text.
  const old = buildKeyGroups([kd(0, 'R'), kd(0.1, 'K'), kd(0.2, 'Backspace'), kd(0.3, 'H'), kd(0.4, 'Space'), kd(0.5, 'S'), kd(0.6, 'K')], { ...ALL, hangul: 'always' });
  assert.equal(visibleGroups(old, 0.7, { ...ALL, hold: 5 })[0].items.map((it) => it.keys[0]).join('|'), '고|Space|나');
  // Shortcuts mode still shows shortcuts only.
  assert.equal(buildKeyGroups(ev, { mode: 'shortcuts' }).length, 0);
});

test('visible groups fade out', () => {
  const g = buildKeyGroups([{ t: 1, type: 'kd', name: 'A', mods: {} }], ALL);
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

test('word times cover the cue in order; text without spaces is cut', () => {
  const w = cueWords({ start: 2, end: 6, text: '안녕하세요 오늘은 단축키를' });
  assert.deepEqual(w.map((x) => x.text), ['안녕하세요', '오늘은', '단축키를']);
  assert.equal(w[0].start, 2);
  assert.ok(Math.abs(w[2].end - 6) < 1e-9);
  for (let i = 1; i < w.length; i++) assert.ok(w[i].start >= w[i - 1].start && Math.abs(w[i].start - w[i - 1].end) < 1e-9);
  const ja = cueWords({ start: 0, end: 3, text: '今日はショートカットを紹介します' });
  assert.ok(ja.length >= 4 && ja.every((x) => x.text.length <= 3));
  assert.equal(ja.map((x) => x.text).join(''), '今日はショートカットを紹介します');
  assert.ok(!ja[1].space);
  const given = cueWords({ start: 0, end: 2, text: 'a b', words: [{ text: 'a', start: 0, end: 0.5 }, { text: 'b', start: 1, end: 2 }] });
  assert.equal(given[1].start, 1);
});

test('pointer spring settles on the target and kinds are looked up by time', () => {
  const c = new CursorTrack([
    { t: 0, type: 'mm', x: 0.1, y: 0.1 }, { t: 1, type: 'mm', x: 0.9, y: 0.5 },
    { t: 0.2, type: 'ct', cursor: 'arrow' }, { t: 1.5, type: 'ct', cursor: 'pointer' }, { t: 3, type: 'ct', cursor: 'text' },
  ]);
  const sp = { stiffness: 170, damping: 26, mass: 1 };
  const mid = c.springAt(1, sp);
  assert.ok(mid.x < c.at(1).x, 'the spring lags behind a moving pointer');
  const end = c.springAt(2.5, sp);
  assert.ok(Math.abs(end.x - 0.9) < 0.01 && Math.abs(end.y - 0.5) < 0.01, 'and settles where it stopped');
  assert.deepEqual(c.springAt(1, sp), mid, 'the same answer every time (export = preview)');
  assert.equal(c.kindAt(0.1), 'arrow');
  assert.equal(c.kindAt(2), 'pointer');
  assert.equal(c.kindAt(9), 'text');
  assert.equal(new CursorTrack([]).kindAt(1), 'arrow');
});

test('pointer rest time', () => {
  const c = new CursorTrack([{ t: 1, type: 'mm', x: 0.1, y: 0.1 }, { t: 2, type: 'mm', x: 0.2, y: 0.2 }]);
  assert.equal(c.idleFor(0.5), 0);
  assert.equal(c.idleFor(1.5), 0.5);
  assert.equal(c.idleFor(5), 3);
});

test('every subtitle style and click effect draws without errors', () => {
  const calls = [];
  const ctx = new Proxy({ measureText: (s) => ({ width: String(s).length * 10 }), createRadialGradient: () => ({ addColorStop() {} }) }, {
    get: (o, k) => (k in o ? o[k] : (...a) => calls.push(k)),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  const subs = [{ id: 'a', start: 1, end: 4, text: '이 문장은 자막 스타일을 시험하려고 조금 길게 적은 문장입니다' }];
  for (const st of SUBTITLE_STYLES) {
    for (const position of ['bottom', 'middle', 'top']) {
      for (const anim of ['none', 'fade', 'rise', 'pop']) {
        const used = drawSubtitle(ctx, 1920, 1080, 2, subs, { enabled: true, style: st.id, position, anim, size: 1 }, 1);
        assert.equal(used > 0, position === 'bottom');
      }
    }
  }
  assert.ok(calls.includes('fillText'));
  const rect = { x: 0, y: 0, w: 1920, h: 1080 };
  const view = { x: 0, y: 0, w: 1, h: 1 };
  for (const e of CLICK_EFFECTS) {
    drawClicks(ctx, 1.2, [{ t: 1, x: 0.5, y: 0.5, button: 1 }, { t: 1.1, x: 0.4, y: 0.4, button: 2 }], rect, view, { effect: e.id, color: '#ffd33d' }, 1, 1);
  }
});

test('extensions keep only valid data and copy their values into the project', () => {
  const ext = readExtension('mine', {
    name: 'Pack', version: '2', author: 'me',
    backgrounds: [
      { name: 'G', gradient: ['#112233', 'red', '#445566'], angle: 999 },
      { name: 'Pic', image: 'sea.jpg' },
      { name: 'Escape', image: '../../secret.png' },
      { name: 'Blob', base: '#000000', blobs: [[0.5, 0.5, 0.4, '#ff0000'], [1, 1, 1, 'nope']] },
      { gradient: ['#000000', '#ffffff'] },
    ],
    keyThemes: [{ name: 'K', face: '#abcdef', borderWidth: 99, capStyle: 'weird' }],
    cursorPacks: [{ name: 'C', fill: '#00ff00', glow: 'javascript:alert(1)' }],
    clickEffects: [{ name: 'E', effect: 'boom', size: 9 }],
    subtitleStyles: [{ name: 'S', style: 'pop', position: 'side' }],
    unknown: [{ name: 'x' }],
  });
  assert.equal(ext.name, 'Pack');
  assert.deepEqual(ext.backgrounds.map((b) => b.name), ['G', 'Pic', 'Blob']);
  assert.deepEqual(ext.backgrounds[0].stops, ['#112233', '#445566']);
  assert.equal(ext.backgrounds[0].angle, 360);
  assert.equal(ext.backgrounds[1].image, '/_extensions/mine/sea.jpg');
  assert.equal(ext.backgrounds[2].blobs.length, 1);
  assert.equal(ext.keyThemes[0].custom.borderWidth, 6);
  assert.equal(ext.keyThemes[0].custom.capStyle, 'raised');
  assert.equal(ext.cursorPacks[0].look.glow, null);
  assert.equal(ext.clickEffects[0].values.effect, 'ripple');
  assert.equal(ext.clickEffects[0].values.clickSize, 2.5);
  assert.equal(ext.subtitleStyles[0].values.position, 'bottom');
  assert.equal(ext.count, 7);
  const frame = { background: 'aurora' };
  applyBackground(frame, ext.backgrounds[0]);
  assert.deepEqual(frame, { background: 'custom', custom: { kind: 'gradient', stops: ['#112233', '#445566'], angle: 360 } });
  ext.backgrounds[0].stops.push('#ffffff');
  assert.equal(frame.custom.stops.length, 2, 'the project gets its own copy');
  assert.equal(readExtension('ex', EXAMPLE_EXTENSION).count, 11);
});

// Talk, pause, talk: a 1 kHz tone at speech level with faint noise in between.
function talkAndPause(parts, rate = 16000) {
  const total = parts.reduce((s, [d]) => s + d, 0);
  const out = new Float32Array(Math.round(total * rate));
  let i = 0;
  let seed = 7;
  const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (const [d, talk] of parts) {
    for (let n = 0; n < Math.round(d * rate); n++, i++) out[i] = talk ? 0.3 * Math.sin((2 * Math.PI * 1000 * n) / rate) : 0.002 * noise();
  }
  return out;
}

test('quiet parts are found, padded, and short pauses stay', () => {
  const s = talkAndPause([[1, true], [2, false], [1, true], [0.5, false], [1, true], [1.5, false]]);
  const { cuts, clear } = findSilences(s, 16000, { minGap: 1, pad: 0.25 });
  assert.ok(clear);
  // the 2 s pause (padded on both sides) and the quiet end (no pad at the very end); the 0.5 s pause stays
  assert.equal(cuts.length, 2, JSON.stringify(cuts));
  assert.ok(Math.abs(cuts[0].start - 1.25) < 0.05 && Math.abs(cuts[0].end - 2.75) < 0.05, JSON.stringify(cuts[0]));
  assert.ok(Math.abs(cuts[1].start - 5.75) < 0.05 && Math.abs(cuts[1].end - 7) < 0.05, JSON.stringify(cuts[1]));
  // the microphone starting 0.5 s after the picture moves everything
  const late = findSilences(s, 16000, { minGap: 1, pad: 0.25, offset: 0.5 }).cuts;
  assert.ok(Math.abs(late[0].start - 1.75) < 0.05);
});

test('quiet parts with typing or clicks are kept', () => {
  const s = talkAndPause([[1, true], [4, false], [1, true]]);
  const busy = busyTimes([{ t: 3, type: 'kd', name: 'A' }, { t: 3.2, type: 'ku', name: 'A' }, { t: 3.3, type: 'md', button: 1 }], 0.5);
  assert.deepEqual(busy.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]), [[2.5, 3.8]]);
  const { cuts } = findSilences(s, 16000, { minGap: 1, pad: 0.25, busy });
  assert.equal(cuts.length, 2, JSON.stringify(cuts));
  assert.ok(cuts[0].end <= 2.5 && cuts[1].start >= 3.8, JSON.stringify(cuts));
});

test('a recording without clear talk gets no cuts', () => {
  assert.equal(findSilences(new Float32Array(16000 * 3), 16000).cuts.length, 0);
  assert.equal(findSilences(talkAndPause([[3, true]]), 16000).cuts.length, 0);
});

test('every interface text has an English translation', async () => {
  const { default: en } = await import('../src/i18n/en.js');
  const { readdirSync } = await import('node:fs');
  const root = new URL('../src/', import.meta.url);
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const u = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
      if (e.isDirectory()) { if (e.name !== 'i18n') walk(u); } else if (e.name.endsWith('.js')) files.push(u);
    }
  };
  walk(root);
  const missing = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bT\('((?:[^'\\]|\\.)*)'/g)) {
      const key = m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      if (!(key in en)) missing.push(key);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
  // Other languages may lag behind (missing entries show the Korean text), but what they have
  // must keep the same {0} placeholders. The shipped tables are complete today.
  const { LANGUAGE_TABLES, LANGS, matchLanguage } = await import('../src/lib/i18n.js');
  const holes = (s) => (s.match(/\{\d+\}/g) || []).sort().join();
  for (const [code, table] of Object.entries(LANGUAGE_TABLES)) {
    const wrong = Object.keys(table).filter((k) => k in en && holes(table[k]) !== holes(en[k]));
    assert.deepEqual(wrong, [], `${code} changes placeholders`);
  }
  assert.equal(LANGS.length, 12);
  assert.ok(LANGS.every((l) => l.id === 'ko' || LANGUAGE_TABLES[l.id]));
  assert.equal(matchLanguage('zh-HK'), 'zh-TW');
  assert.equal(matchLanguage('pt-PT'), 'pt-BR');
  assert.equal(matchLanguage('sv-SE'), 'en');
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

test('every official extension in extensions/ is valid and loses nothing', () => {
  const dir = new URL('../extensions/', import.meta.url);
  const folders = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  assert.ok(folders.length >= 6, 'official packs are present');
  const kinds = ['backgrounds', 'keyThemes', 'cursorPacks', 'clickEffects', 'subtitleStyles'];
  for (const folder of folders) {
    assert.match(folder, /^[a-z0-9-]+$/, `${folder}: folder names are lowercase words joined by -`);
    const json = JSON.parse(readFileSync(new URL(`${folder}/extension.json`, dir), 'utf8'));
    const ext = readExtension(folder, json);
    assert.ok(ext.name && ext.version && ext.author && ext.description, `${folder}: name, version, author and description`);
    for (const k of kinds) assert.equal(ext[k].length, (json[k] || []).length, `${folder}: every ${k} entry is valid`);
    assert.ok(ext.count > 0);
  }
});
