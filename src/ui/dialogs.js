// Windows over the page: key display style, shortcuts, and how every dialog takes focus.

import { buildKeyGroups } from '../lib/keys.js';
import { drawKeys } from '../lib/compositor.js';
import { h, toast, kbdLabel, accelFromEvent } from './dom.js';
import { store, state, shortcuts, savedLook } from './state.js';
import { keyPanel } from './key-panel.js';
import { showHome } from './home.js';
/** Settings for the live key display, with a moving sample. */
export function openKeyStyle() {
  const look = savedLook();
  const sample = [
    { t: 0.3, type: 'kd', name: 'Ctrl', mods: { ctrl: true } }, { t: 0.4, type: 'kd', name: 'Shift', mods: { ctrl: true, shift: true } },
    { t: 0.5, type: 'kd', name: 'S', mods: { ctrl: true, shift: true } }, { t: 0.6, type: 'ku', name: 'S' }, { t: 0.65, type: 'ku', name: 'Shift' }, { t: 0.7, type: 'ku', name: 'Ctrl' },
    ...'HELLO'.split('').map((ch, i) => ({ t: 1.6 + i * 0.14, type: 'kd', name: ch, mods: {} })),
    { t: 2.6, type: 'kd', name: 'Enter', mods: {} },
    { t: 3.2, type: 'kd', name: 'Alt', mods: { alt: true } }, { t: 3.3, type: 'md', button: 1, x: 0.5, y: 0.5 }, { t: 3.4, type: 'mu', button: 1, x: 0.5, y: 0.5 }, { t: 3.5, type: 'ku', name: 'Alt' },
    { t: 4.0, type: 'wh', rotation: 1, x: 0.5, y: 0.5 },
  ];
  const canvas = h('canvas', { width: 800, height: 300, style: { width: '100%', borderRadius: '10px', background: '#2b2b2e' }, role: 'img', 'aria-label': '키 표시 미리보기' });
  const ctx = canvas.getContext('2d');
  let groups = buildKeyGroups(sample, look.keys);
  const body = h('div', { style: { maxHeight: '48vh', overflow: 'auto', marginTop: '14px', paddingRight: '6px' } });
  const save = (rebuild) => {
    if (rebuild) groups = buildKeyGroups(sample, look.keys);
    const all = store.get('look', {});
    all.keys = look.keys;
    store.set('look', all);
  };
  const draw = () => body.replaceChildren(...keyPanel(look.keys, save, draw).flat(Infinity).filter(Boolean));
  draw();
  const started = performance.now();
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    ctx.clearRect(0, 0, 800, 300);
    // Shown at the size it will have on a 1080p screen, in a strip of that screen.
    const t = ((performance.now() - started) / 1000) % 6.5;
    ctx.save();
    ctx.scale(800 / 1920, 800 / 1920);
    drawKeys(ctx, 1920, 720, t, groups, { ...look.keys, enabled: true }, 1, 0);
    ctx.restore();
  };
  loop();
  const bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal', style: { width: '560px' } },
    h('h2', {}, '키 표시 꾸미기'),
    canvas, body,
    h('div', { class: 'small muted', style: { marginTop: '10px' } }, '여기서 고른 모양은 화면 위 키 표시와 새 녹화에 쓰입니다. 켜져 있는 키 표시는 껐다 켜면 바뀝니다.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => { cancelAnimationFrame(raf); bg.remove(); } }, '닫기'))));
  document.body.append(bg);
}

/** Change the global shortcuts, and list the ones the editor uses. */
export function openShortcuts() {
  const sc = shortcuts();
  const row = (key, label) => {
    const btn = h('button', { class: 'btn small', style: { minWidth: '150px' } }, sc[key].replace('Super', 'Win'));
    btn.onclick = () => {
      btn.textContent = '새 단축키를 누르세요…';
      const grab = (e) => {
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        window.removeEventListener('keydown', grab, true);
        const accel = e.key === 'Escape' ? null : accelFromEvent(e);
        if (accel && Object.entries(sc).some(([k, v]) => k !== key && v === accel)) toast('다른 기능이 이미 쓰는 단축키입니다.', true);
        else if (accel) { sc[key] = accel; store.set('shortcuts', sc); } else if (e.key !== 'Escape') toast('Ctrl·Alt·Shift 중 하나와 글자·숫자 키를 함께 누르세요.', true);
        btn.textContent = sc[key].replace('Super', 'Win');
      };
      window.addEventListener('keydown', grab, true);
    };
    return h('div', { class: 'field inline' }, h('label', {}, label), btn);
  };
  const ref = [['Space', '재생 / 정지'], ['← →', '한 프레임 이동 (Shift: 5초)'], ['Delete', '선택한 구간 지우기'], ['Ctrl+Z', '되돌리기'], ['Ctrl+Y', '다시 하기'], ['S', '여기서 영상 나누기(잘라낼 구간 만들기)'], ['K', '영상에 키 표시 켜기 / 끄기']];
  const bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal' },
    h('h2', {}, '단축키'),
    h('div', { class: 'small muted', style: { marginBottom: '12px' } }, '녹화 중에는 어떤 프로그램에서든 듣는 단축키입니다. 버튼을 누르고 새 조합을 누르면 바뀝니다.'),
    row('stop', '녹화 멈추기'), row('pause', '일시정지 / 다시 시작'), row('keys', '화면 키 표시 켜기 / 끄기'),
    h('button', { class: 'btn small', onclick: () => { store.set('shortcuts', {}); bg.remove(); openShortcuts(); } }, '처음 값으로'),
    h('div', { class: 'section' }, h('h3', { style: { fontSize: '14px', marginBottom: '10px' } }, '편집 화면에서'),
      ref.map(([k, d]) => h('div', { class: 'field inline', style: { marginBottom: '8px' } }, h('label', {}, d), h('span', {}, kbdLabel(k))))),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => { bg.remove(); if (!state.editor && !state.recorder) showHome(); } }, '닫기'))));
  document.body.append(bg);
}

// Windows over the page behave like dialogs: focus moves in, Tab stays inside, Esc closes,
// and focus returns to the button that opened them.
export const topModal = () => [...document.querySelectorAll('.modal-bg')].pop();
new MutationObserver((changes) => {
  for (const c of changes) {
    for (const n of c.addedNodes) {
      if (!n.classList?.contains('modal-bg')) continue;
      n.returnTo = document.activeElement;
      requestAnimationFrame(() => n.querySelector('.modal select, .modal input, .modal button')?.focus({ preventScroll: true }));
    }
    for (const n of c.removedNodes) if (n.classList?.contains('modal-bg') && n.returnTo?.isConnected) n.returnTo.focus({ preventScroll: true });
  }
}).observe(document.body, { childList: true });
window.addEventListener('keydown', (e) => {
  const bg = topModal();
  if (!bg) return;
  if (e.key === 'Escape') {
    const close = [...bg.querySelectorAll('.actions button')].find((b) => /닫기|취소|중지/.test(b.textContent));
    if (close) { e.preventDefault(); close.click(); }
  } else if (e.key === 'Tab') {
    const stops = [...bg.querySelectorAll('button, select, input, textarea, [tabindex="0"]')].filter((el) => !el.disabled && el.offsetParent !== null);
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!bg.contains(document.activeElement)) { e.preventDefault(); first.focus(); } else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

