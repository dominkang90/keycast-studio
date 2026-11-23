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
});
