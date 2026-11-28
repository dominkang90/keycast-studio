import { T } from './lib/i18n.js';
const api = window.keycast;
const time = document.getElementById('time');
const label = document.getElementById('label');
const bar = document.getElementById('bar');
const pause = document.getElementById('pause');
const stop = document.getElementById('stop');

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const keys = document.getElementById('keys');
const keyrec = document.getElementById('keyrec');
const keynote = document.getElementById('keynote');
let keyRecAccel = 'Alt+Shift+L';
let keysRecorded = true;
let typing = false;
// What the recording keeps from the keyboard: shortcuts only, typing too, or nothing (paused).
function showKeyNote() {
  keynote.textContent = keysRecorded ? `· ${typing ? T('키·타이핑 기록') : T('단축키 기록')}` : `· ${T('키 기록 멈춤')}`;
  keynote.classList.toggle('off', !keysRecorded);
  keyrec.setAttribute('aria-pressed', String(!keysRecorded));
  keyrec.setAttribute('aria-label', keysRecorded ? T('키 기록 멈춤') : T('키 다시 기록'));
  keyrec.title = `${keysRecorded ? T('키 기록 멈춤 (비밀번호를 칠 때)') : T('키 다시 기록')} (${keyRecAccel})`;
}
keyrec.addEventListener('click', () => api?.toolbarAction('toggle-keyrec'));
api?.onKeysRecording?.((on) => { keysRecorded = on; showKeyNote(); });

// The page is written in Korean; put the interface language in before the first status.
document.title = T('KeyCast — 녹화 중');
label.textContent = T('녹화 중');
document.getElementById('stop-text').textContent = T('멈춤');
stop.title = T('멈추기 ({0})', 'Alt+Shift+S');
pause.title = T('일시정지 ({0})', 'Alt+Shift+P');
pause.setAttribute('aria-label', T('일시정지'));
keys.setAttribute('aria-label', T('화면 키 표시'));
keys.title = T('화면 키 표시 켜기 / 끄기');
let keyAccel = 'Alt+Shift+K';
keys.addEventListener('click', () => api?.toolbarAction('toggle-keys'));
api?.onKeysVisible?.((on, accel) => {
  if (accel) keyAccel = accel;
  keys.setAttribute('aria-pressed', String(on));
  keys.title = T('화면 키 표시 {0} ({1})', on ? T('끄기') : T('켜기'), keyAccel);
});
pause.addEventListener('click', () => api?.toolbarAction('toggle-pause'));
stop.addEventListener('click', () => {
  stop.disabled = true;
  label.textContent = T('저장 중…');
  api?.toolbarAction('stop');
});

// Small form (light, time, stop) and the usual bar. The window is as wide as the bar, so it grows
// before the bar widens and shrinks after the bar has narrowed.
const mini = document.getElementById('mini');
const tray = document.getElementById('tray');
const MORPH_MS = 420; // --morph in toolbar.html
let miniTimer = 0;
function setMini(on, instant = false) {
  clearTimeout(miniTimer);
  bar.classList.toggle('instant', instant);
  tray.tabIndex = on ? 0 : -1;
  mini.setAttribute('aria-label', on ? T('크게 보기') : T('작게 보기'));
  mini.title = on ? T('크게 보기') : T('작게 보기');
  try { localStorage.setItem('keycast.barMini', on ? '1' : ''); } catch { /* storage blocked */ }
  if (on) {
    bar.classList.add('mini');
    miniTimer = setTimeout(() => api?.toolbarMini(true, instant), instant ? 0 : MORPH_MS);
  } else {
    api?.toolbarMini(false, instant);
    miniTimer = setTimeout(() => bar.classList.remove('mini'), instant ? 0 : 60);
  }
}
mini.addEventListener('click', () => setMini(!bar.classList.contains('mini')));
// Out of the way entirely: the tray icon brings the bar back, and the shortcuts keep working.
tray.title = T('트레이로 숨기기');
tray.setAttribute('aria-label', T('트레이로 숨기기'));
tray.addEventListener('click', () => api?.toolbarHide());
let startMini = false;
try { startMini = localStorage.getItem('keycast.barMini') === '1'; } catch { /* storage blocked */ }
setMini(startMini, true);
requestAnimationFrame(() => bar.classList.remove('instant'));

api?.onStatus((s) => {
  time.textContent = fmt(s.elapsedMs);
  bar.classList.toggle('paused', s.paused);
  if (!stop.disabled) label.textContent = s.paused ? T('일시정지됨') : T('녹화 중');
  pause.classList.toggle('is-paused', s.paused);
  pause.setAttribute('aria-label', s.paused ? T('다시 시작') : T('일시정지'));
  const key = s.shortcuts?.pause || 'Alt+Shift+P';
  pause.title = s.paused ? T('다시 시작 ({0})', key) : T('일시정지 ({0})', key);
  stop.title = T('멈추기 ({0})', s.shortcuts?.stop || 'Alt+Shift+S');
  keyAccel = s.shortcuts?.keys || 'Alt+Shift+K';
  keyRecAccel = s.shortcuts?.keyRec || 'Alt+Shift+L';
  typing = !!s.typing;
  if (typeof s.keysPaused === 'boolean') keysRecorded = !s.keysPaused;
  showKeyNote();
});
