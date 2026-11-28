// Starting, pausing and stopping a recording.

import { platform, isDesktop } from '../lib/platform.js';
import { Recorder } from '../lib/recorder.js';
import { fmt } from '../lib/timeline.js';
import { h, toast, mount, topbar } from './dom.js';
import { state, shortcuts, savedLook, liveOverlaySettings } from './state.js';
import { showHome } from './home.js';
import { openEditor } from './editor.js';
import { applyPresetLook } from './presets.js';
import { T } from '../lib/i18n.js';
// ------------------------------------------------------------------ recording
export async function countdown() {
  const el = h('div', { class: 'countdown' });
  document.body.append(el);
  for (const n of [3, 2, 1]) {
    el.replaceChildren(h('span', {}, n));
    await new Promise((r) => setTimeout(r, 850));
  }
  el.remove();
}

/** Change the screen with a morph: the part named "rec" before and after glides from one shape to the other. */
function morph(update) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { update(); return Promise.resolve(); }
  return document.startViewTransition(update).finished.catch(() => {});
}

export async function startRecording() {
  const source = state.sources.find((s) => s.id === state.sourceId);
  if (!source) { toast(T('녹화할 화면을 먼저 고르세요.'), true); return; }
  const o = state.options;
  if (o.countdown && isDesktop) await countdown();
  const rec = new Recorder({
    source,
    micId: o.micId || null,
    systemAudio: o.systemAudio && state.info?.systemAudio !== false,
    webcamId: o.webcamId || null,
    liveOverlay: o.liveOverlay,
    recordTyping: !!o.recordTyping,
    hideCursor: o.hideCursor !== false && !!state.info?.ffmpeg,
    overlaySettings: liveOverlaySettings(),
    shortcuts: shortcuts(),
    settings: applyPresetLook(savedLook(), o),
    onStatus: (s) => updateRecBar(s),
    onEnded: (project) => finishRecording(project),
  });
  state.recorder = rec;
  try {
    // The record button becomes the recording bar (browser) or a small pill that the recording
    // bar window then grows out of (desktop: this window hides once the recording starts).
    const button = document.querySelector('.home .btn.rec');
    if (button) button.style.viewTransitionName = 'rec';
    await morph(() => (isDesktop
      ? mount(h('div', { class: 'rec-morph' }, h('div', { class: 'rec-pill' }, h('div', { class: 'recdot' }), h('b', {}, 'REC'))))
      : showRecBar()));
    await rec.start();
  } catch (err) {
    console.error(err);
    state.recorder = null;
    try { await platform.endRecording(); } catch { /* nothing to undo */ }
    toast(T('녹화를 시작하지 못했습니다: {0}', err.message || err), true);
    showHome();
  }
}

export let recBarTime = null;
export let recBarPause = null;
export function showRecBar() {
  recBarTime = h('b', { style: { fontSize: '28px', fontVariantNumeric: 'tabular-nums' } }, '0:00');
  recBarPause = h('button', { class: 'btn', onclick: () => state.recorder?.togglePause() }, T('일시정지'));
  mount(topbar(), h('div', { class: 'recbar' },
    h('div', { class: 'recdot' }), recBarTime, recBarPause,
    h('button', { class: 'btn rec', style: { height: '36px', fontSize: '14px' }, onclick: stopRecording }, T('■ 멈추고 편집'))));
}
export function updateRecBar(s) {
  if (recBarTime) recBarTime.textContent = fmt(s.elapsedMs / 1000);
  if (recBarPause) recBarPause.textContent = s.paused ? T('다시 시작') : T('일시정지');
}

export async function stopRecording() {
  const rec = state.recorder;
  if (!rec) return;
  try {
    const project = await rec.stop();
    finishRecording(project);
  } catch (err) {
    console.error(err);
    toast(T('녹화를 저장하지 못했습니다: {0}', err.message), true);
    state.recorder = null;
    // The recording bar, the live keys and the key listener must not stay behind.
    try { await platform.captureAbort(); await platform.endRecording(); } catch { /* nothing left to close */ }
    showHome();
  }
}

export function finishRecording(project) {
  if (!state.recorder) return;
  state.recorder = null;
  recBarTime = null;
  recBarPause = null;
  const keys = project.events.filter((e) => e.type === 'kd' && !e.repeat).length;
  toast(T('녹화 완료 · {0} · 키 {1}개 기록', fmt(project.durationMs / 1000), keys));
  openEditor(project.id, project);
}

platform.onCommand((cmd) => {
  if (!state.recorder) return;
  if (cmd === 'stop') stopRecording();
  if (cmd === 'toggle-pause') state.recorder.togglePause();
});

