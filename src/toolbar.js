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
let keyAccel = 'Alt+Shift+K';
keys.addEventListener('click', () => api?.toolbarAction('toggle-keys'));
api?.onKeysVisible?.((on, accel) => {
  if (accel) keyAccel = accel;
  keys.setAttribute('aria-pressed', String(on));
  keys.title = `화면 키 표시 ${on ? '끄기' : '켜기'} (${keyAccel})`;
});
pause.addEventListener('click', () => api?.toolbarAction('toggle-pause'));
stop.addEventListener('click', () => {
  stop.disabled = true;
  label.textContent = '저장 중…';
  api?.toolbarAction('stop');
});

api?.onStatus((s) => {
  time.textContent = fmt(s.elapsedMs);
  bar.classList.toggle('paused', s.paused);
  if (!stop.disabled) label.textContent = s.paused ? '일시정지됨' : '녹화 중';
  pause.classList.toggle('is-paused', s.paused);
  pause.setAttribute('aria-label', s.paused ? '다시 시작' : '일시정지');
  const key = s.shortcuts?.pause || 'Alt+Shift+P';
  pause.title = s.paused ? `다시 시작 (${key})` : `일시정지 (${key})`;
  stop.title = `멈추기 (${s.shortcuts?.stop || 'Alt+Shift+S'})`;
  keyAccel = s.shortcuts?.keys || 'Alt+Shift+K';
});
