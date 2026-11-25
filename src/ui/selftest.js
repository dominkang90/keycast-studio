// Scripted self-test (KEYCAST_SELFTEST). Not used in normal runs.

import { platform } from '../lib/platform.js';
import { autoZoomRegions } from '../lib/zoom.js';
import { newNote } from '../lib/compositor.js';
import { transcribe, decodeAudio } from '../lib/transcribe.js';
import { findSilences } from '../lib/silence.js';
import { toSRT } from '../lib/subtitles.js';
import { exportVideo, exportFormats } from '../lib/exporter.js';
import { segments, outDuration } from '../lib/timemap.js';
import { h } from './dom.js';
import { state, store, shortcuts, liveOverlaySettings } from './state.js';
import { importVideo, showHome } from './home.js';
import { openKeyStyle, openShortcuts } from './dialogs.js';
import { countdown, startRecording, stopRecording } from './recording.js';
import { derive, stopEditor } from './editor.js';
import { T } from '../lib/i18n.js';
// ------------------------------------------------------------------ self-test (desktop, scripted)
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitFor(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await sleep(100);
  }
  return false;
}
export function silentToneWav(seconds = 2, rate = 16000) {
  const n = seconds * rate;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 8) * 600), true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/** A WAV that alternates a tone and quiet: seconds of [tone, quiet, tone, ...]. */
function talkPauseWav(parts, rate = 16000) {
  const n = Math.round(parts.reduce((a, b) => a + b, 0) * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  let i = 0;
  parts.forEach((sec, k) => {
    for (let j = 0; j < Math.round(sec * rate); j++, i++) v.setInt16(44 + i * 2, k % 2 ? Math.round((Math.random() - 0.5) * 60) : Math.round(Math.sin((2 * Math.PI * 440 * j) / rate) * 9000), true);
  });
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export async function selfTest() {
  const api = window.keycast;
  let failed = false;
  const ok = (name, cond, extra = '') => {
    if (!cond) failed = true;
    console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`);
  };
  let projectId = null;
  try {
    await waitFor(() => state.sources.length, 15000);
    ok('sources listed', state.sources.length > 0, `${state.sources.length} (${state.sources.filter((s) => s.kind === 'screen').length} screens)`);
    ok('input hook loaded', !!state.info?.inputHook);
    await api.selftestShot('home');
    // v2.5: the small start window and back, and the tray icon.
    const wasCompact = store.get('compact', false);
    store.set('compact', true);
    await showHome();
    await waitFor(() => document.querySelector('.compact-home .hero-rec') && window.innerWidth < 500, 5000);
    ok('small start window', !!document.querySelector('.compact-home .hero-rec') && window.innerWidth < 500, `${window.innerWidth}x${window.innerHeight}`);
    await sleep(300);
    await api.selftestShot('compact');
    store.set('compact', false);
    await showHome();
    await waitFor(() => document.querySelector('.card.hero') && window.innerWidth > 900, 5000);
    ok('back to the full window', !!document.querySelector('.card.hero') && window.innerWidth > 900, `${window.innerWidth}x${window.innerHeight}`);
    store.set('compact', wasCompact);
    ok('tray icon', (await api.info()).tray === true);
    const src = state.sources.find((s) => s.kind === 'screen');
    state.sourceId = src.id;
    state.options = { micId: '', systemAudio: false, webcamId: '', liveOverlay: true, countdown: false };
    await startRecording();
    ok('recording started', !!state.recorder?.startEpoch);
    await sleep(600);
    await api.selftestShot('toolbar');
    await sleep(3200);
    await stopRecording();
    await waitFor(() => state.editor, 15000);
    const ed = state.editor;
    const p = ed.project;
    projectId = p.id;
    ok('project saved', p.durationMs > 2500, { durationMs: p.durationMs, hooked: p.inputHooked, events: p.events.length });
    await waitFor(() => ed.screen.readyState >= 2, 15000);
    ok('video loads', ed.screen.readyState >= 2, `${ed.screen.videoWidth}x${ed.screen.videoHeight} duration=${ed.screen.duration}`);
    ok('duration written into file', Number.isFinite(ed.screen.duration) && Math.abs(ed.screen.duration - p.durationMs / 1000) < 0.6, String(ed.screen.duration));
    ed.screen.currentTime = 2.0;
    await new Promise((r) => { ed.screen.addEventListener('seeked', r, { once: true }); setTimeout(r, 5000); });
    ok('seek works', Math.abs(ed.screen.currentTime - 2.0) < 0.3, String(ed.screen.currentTime));

    // Synthetic input to check the overlays draw (real keys come from the global hook).
    const synth = [
      { t: 0.30, type: 'kd', name: 'Ctrl', modifier: true, mods: { ctrl: true } },
      { t: 0.35, type: 'kd', name: 'S', mods: { ctrl: true } },
      { t: 0.45, type: 'ku', name: 'S' },
      { t: 0.50, type: 'ku', name: 'Ctrl' },
      ...'HELLO'.split('').map((c, i) => ({ t: 1.0 + i * 0.12, type: 'kd', name: c, mods: {} })),
      { t: 0.70, type: 'mm', x: 0.4, y: 0.4 },
      { t: 0.80, type: 'md', button: 1, x: 0.45, y: 0.42 },
      { t: 1.60, type: 'mm', x: 0.55, y: 0.5 },
      // a second click far away: the camera has to travel from one zoom to the next
      { t: 2.30, type: 'mm', x: 0.85, y: 0.8 },
      { t: 2.40, type: 'md', button: 1, x: 0.85, y: 0.8 },
    ];
    p.events = [...p.events, ...synth].sort((a, b) => a.t - b.t);
    p.zooms = autoZoomRegions(p.events, p.durationMs / 1000, p.settings.zoom.scale);
    p.subtitles = [{ id: 's1', start: 0.5, end: 2.9, text: T('안녕하세요, 키캐스트 스튜디오 자막 테스트입니다.') }];
    p.settings.keys.mode = 'all'; // typing is part of what this check draws
    ed.derived = derive(p);
    ok('key bubbles', ed.derived.groups.length >= 2, ed.derived.groups.map((g) => g.items.map((i) => i.keys.join('+')).join(' ')).join(' | '));
    ok('auto zoom', p.zooms.length >= 1, p.zooms.map((z) => `${z.start.toFixed(2)}-${z.end.toFixed(2)}`).join(','));
    ed.screen.currentTime = 1.5;
    await sleep(700);
    await api.selftestShot('editor');

    const formats = exportFormats();
    ok('export formats', formats.length > 0, formats.map((f) => f.mime).join(' | '));
    for (const format of formats) {
      const writer = await platform.writerForPath(await api.selftestPath(`export.${format.ext}`));
      const started = performance.now();
      const file = await exportVideo({
        project: p, derived: ed.derived, screenUrl: ed.screenUrl, webcamUrl: ed.webcamUrl, format, url: (n) => platform.mediaUrl(p.id, n),
        longSide: format.ext === 'gif' ? 480 : 1280, fps: format.ext === 'gif' ? 10 : 30, burnSubtitles: true, writer, signal: new AbortController().signal,
      });
      ok(`export ${format.ext}`, !!file && writer.bytes > 20000, `${writer.bytes} bytes in ${Math.round(performance.now() - started)}ms`);
    }
    ok('srt', toSRT(p.subtitles).includes('00:00:00,500 --> 00:00:02,900'));

    // The newer editing tools together: cut-out part, speed region, notes, redrawn cursor, crop, wallpaper.
    const total = p.durationMs / 1000;
    p.cuts = [{ id: 'c1', start: 1.0, end: 2.0 }];
    p.speeds = [{ id: 'v1', start: 2.5, end: Math.min(total, 4.5), speed: 2 }];
    p.annotations = [
      { id: 'n1', ...newNote('text', 0, total), y: 0.2 },
      { id: 'n2', ...newNote('arrow', 0, total), x: 0.3, y: 0.4 },
      { id: 'n3', ...newNote('box', 0, total), x: 0.7, y: 0.4 },
      { id: 'n4', ...newNote('blur', 0, total), x: 0.5, y: 0.7 },
    ];
    Object.assign(p.settings.cursor, { show: true, size: 2.5 });
    Object.assign(p.settings.frame, { background: 'wp-dawn', blur: 10, crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } });
    Object.assign(p.settings.keys, { theme: 'custom', anim: 'zoom', position: 'top-right', showMouse: true });
    ed.derived = derive(p);
    const segs = segments(p);
    const expected = outDuration(segs);
    ok('time map', Math.abs(expected - (total - 1 - (Math.min(total, 4.5) - 2.5) / 2)) < 0.01, `${expected.toFixed(2)}s from ${total.toFixed(2)}s`);
    ed.screen.currentTime = 0.9;
    await sleep(700);
    await api.selftestShot('editor2');
    {
      const format = formats[0];
      const writer = await platform.writerForPath(await api.selftestPath(`edited.${format.ext}`));
      const file = await exportVideo({
        project: p, derived: ed.derived, screenUrl: ed.screenUrl, webcamUrl: ed.webcamUrl, format, url: (n) => platform.mediaUrl(p.id, n),
        longSide: 1280, fps: 30, burnSubtitles: true, writer, signal: new AbortController().signal,
      });
      ok('export with cuts and speed', !!file && writer.bytes > 20000, `${writer.bytes} bytes, expected ${expected.toFixed(2)}s`);
    }

    // Files brought in from outside: a sound, a picture (as background and as a note) and a webcam video.
    {
      const sound = await platform.importAsset(p.id, 'audio', 'sound');
      const pic = await platform.importAsset(p.id, 'image', 'bg');
      const cam = await platform.importAsset(p.id, 'video', 'webcam');
      ok('files copied into the project', !!sound && !!pic && !!cam, [sound?.name, pic?.name, cam?.name].join(' '));
      if (sound && pic && cam) {
        p.cuts = [];
        p.speeds = [];
        p.audios = [{ id: 'a1', start: 0.5, end: 2.5, file: sound.name, name: sound.label, volume: 1, offset: 0 }];
        p.annotations = [{ id: 'n5', ...newNote('image', 0, total), file: pic.name, x: 0.2, y: 0.25, w: 0.2 }];
        Object.assign(p.settings.frame, { background: 'image', image: pic.name, blur: 6, crop: { x: 0, y: 0, w: 1, h: 1 } });
        p.files.webcam = cam.name;
        Object.assign(p.settings.webcam, { enabled: true, position: 'custom', x: 0.95, y: 0.1, roundness: 40, mirror: false });
        const format = formats[0];
        const writer = await platform.writerForPath(await api.selftestPath(`media.${format.ext}`));
        const file = await exportVideo({
          project: p, derived: ed.derived, screenUrl: ed.screenUrl, webcamUrl: platform.mediaUrl(p.id, cam.name), format, url: (n) => platform.mediaUrl(p.id, n),
          longSide: 1280, fps: 30, burnSubtitles: false, writer, signal: new AbortController().signal,
        });
        ok('export with added sound, picture and webcam', !!file && writer.bytes > 20000, `${writer.bytes} bytes`);
        p.files.webcam = null;
        p.audios = [];
      }
    }

    // Every settings tab must draw, with and without something selected.
    {
      const errors = [];
      const onErr = (e) => errors.push(e.message || String(e.reason));
      window.addEventListener('error', onErr);
      window.addEventListener('unhandledrejection', onErr);
      p.audios = [];
      const picks = { [T('자르기')]: [{ kind: 'cut', id: 'c1' }, { kind: 'speed', id: 'v1' }], [T('주석')]: ['n1', 'n2', 'n3', 'n4'].map((id) => ({ kind: 'note', id })), [T('줌')]: [{ kind: 'zoom', id: p.zooms[0]?.id }] };
      const drawn = [];
      // every group tab, then every section pill inside it (the pills are redrawn on each click)
      const groupCount = document.querySelectorAll('.side-tabs button').length;
      for (let g = 0; g < groupCount; g++) {
        document.querySelectorAll('.side-tabs button')[g].click();
        await sleep(30);
        const pillCount = document.querySelectorAll('.side-sub button').length;
        for (let i = 0; i < pillCount; i++) {
          const name = document.querySelectorAll('.side-sub button')[i].textContent.replace(/[^\p{L} ]/gu, '').trim();
          for (const sel of [null, ...(picks[name] || [])]) {
            ed.selected = sel;
            document.querySelectorAll('.side-sub button')[i].click();
            await sleep(30);
            // open every "More" fold so the folded controls are drawn too
            document.querySelectorAll('.side-body details.more').forEach((d) => { d.open = true; });
            if (sel === (picks[name] || [null]).slice(-1)[0]) await api.selftestShot(`panel-${drawn.length}`);
            drawn.push(`${name}:${document.querySelector('.side-body').children.length}`);
          }
        }
      }
      ok('editor groups and sections', groupCount === 3 && drawn.length >= 9, `${groupCount} groups, ${drawn.length} panels`);
      ed.selected = null;
      ok('all panels draw', !errors.length && drawn.every((d) => Number(d.split(':')[1]) > 1), errors.length ? errors.join(' | ') : drawn.join(' '));
      openKeyStyle();
      openShortcuts();
      await sleep(400);
      const modals = document.querySelectorAll('.modal-bg').length;
      await api.selftestShot('modals');
      document.querySelectorAll('.modal-bg .btn.primary').forEach((b) => b.click());
      ok('settings windows open', modals === 2 && !errors.length, errors.join(' | '));
      // the export window draws real controls for every file type
      [...document.querySelectorAll('.topbar button')].find((b) => b.textContent.includes(T('내보내기'))).click();
      await sleep(300);
      const shown = [];
      for (const id of ['mp4', 'webm', 'gif']) {
        const s = document.querySelector('.modal select');
        s.value = id;
        s.dispatchEvent(new Event('change'));
        await sleep(100);
        const m = document.querySelector('.modal');
        shown.push(`${id}:${m.querySelectorAll('select, .seg, .switch').length}${m.innerText.includes('[object') ? '!' : ''}`);
      }
      document.querySelector('.modal-bg .actions .btn').click();
      ok('export window controls', shown.every((x) => !x.includes('!') && Number(x.split(':')[1]) >= 3), shown.join(' '));
      const on = await platform.toggleKeys({ overlay: liveOverlaySettings(), shortcut: shortcuts().keys });
      await sleep(800);
      const off = await platform.toggleKeys({});
      ok('keys-only overlay turns on and off', on === true && off === false && !errors.length, errors.join(' | '));
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onErr);
    }

    console.log(`webgpu available: ${!!navigator.gpu}`);
    const subs = await transcribe({
      url: silentToneWav(), model: 'onnx-community/whisper-tiny', language: 'english', preferGpu: false, duration: 2,
      onProgress: (s) => { if (s.stage !== 'downloading') console.log(`asr ${s.stage} ${s.device || ''} ${s.message || ''}`); },
    });
    ok('speech model runs', Array.isArray(subs), JSON.stringify(subs).slice(0, 200));
    // v2.6: quiet parts found in sound decoded by the browser (1 s tone, 2 s quiet, 1 s tone).
    const quiet = findSilences(await decodeAudio(talkPauseWav([1, 2, 1])), 16000, { minGap: 1, pad: 0.25 });
    ok('quiet parts found', quiet.cuts.length === 1 && Math.abs(quiet.cuts[0].start - 1.25) < 0.1 && Math.abs(quiet.cuts[0].end - 2.75) < 0.1, quiet.cuts);
  } catch (err) {
    ok('no exceptions', false, err?.stack || String(err));
  }
  if (projectId) {
    stopEditor();
    await platform.deleteProject(projectId).catch(() => {});
  }
  // Opening a video made elsewhere as a new recording.
  try {
    await importVideo();
    await waitFor(() => state.editor?.project.source.kind === 'file', 15000);
    const ed2 = state.editor;
    await waitFor(() => ed2?.screen.readyState >= 2, 15000);
    ok('outside video opens in the editor', !!ed2 && ed2.project.source.kind === 'file' && ed2.screen.readyState >= 2 && ed2.project.durationMs > 1000,
      ed2 ? `${ed2.project.name} ${ed2.screen.videoWidth}x${ed2.screen.videoHeight} ${ed2.project.durationMs}ms` : 'no editor');
    await api.selftestShot('imported');
    const importedId = ed2?.project.id;
    stopEditor();
    if (importedId) await platform.deleteProject(importedId).catch(() => {});
  } catch (err) {
    ok('outside video opens in the editor', false, err?.stack || String(err));
  }
  console.log(`SELFTEST_DONE ${failed ? 'FAIL' : 'OK'}`);
}

if (location.hash === '#selftest') window.__keycastSelfTest = selfTest;
