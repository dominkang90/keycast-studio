// Windows over the page: key display style, shortcuts, and how every dialog takes focus.

import { buildKeyGroups } from '../lib/keys.js';
import { drawKeys } from '../lib/compositor.js';
import { h, toast, kbdLabel, accelFromEvent, switchEl } from './dom.js';
import { platform } from '../lib/platform.js';
import { readExtension } from '../lib/extensions.js';
import { OFFICIAL_EXTENSIONS } from '../lib/official-extensions.js';
import { openExtensionMaker } from './ext-maker.js';
import { store, state, shortcuts, savedLook, loadExtensions, setExtensionEnabled } from './state.js';
import { keyPanel } from './key-panel.js';
import { showHome } from './home.js';
import { T } from '../lib/i18n.js';
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
  const canvas = h('canvas', { width: 800, height: 300, style: { width: '100%', borderRadius: '10px', background: '#2b2b2e' }, role: 'img', 'aria-label': T('키 표시 미리보기') });
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
    h('h2', {}, T('키 표시 꾸미기')),
    canvas, body,
    h('div', { class: 'small muted', style: { marginTop: '10px' } }, T('여기서 고른 모양은 화면 위 키 표시와 새 녹화에 쓰입니다. 켜져 있는 키 표시는 껐다 켜면 바뀝니다.')),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => { cancelAnimationFrame(raf); bg.remove(); } }, T('닫기')))));
  document.body.append(bg);
}

/** Change the global shortcuts, and list the ones the editor uses. */
export function openShortcuts() {
  const sc = shortcuts();
  const row = (key, label) => {
    const btn = h('button', { class: 'btn small', style: { minWidth: '150px' } }, sc[key].replace('Super', 'Win'));
    btn.onclick = () => {
      btn.textContent = T('새 단축키를 누르세요…');
      const grab = (e) => {
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        window.removeEventListener('keydown', grab, true);
        const accel = e.key === 'Escape' ? null : accelFromEvent(e);
        if (accel && Object.entries(sc).some(([k, v]) => k !== key && v === accel)) toast(T('다른 기능이 이미 쓰는 단축키입니다.'), true);
        else if (accel) { sc[key] = accel; store.set('shortcuts', sc); } else if (e.key !== 'Escape') toast(T('Ctrl·Alt·Shift 중 하나와 글자·숫자 키를 함께 누르세요.'), true);
        btn.textContent = sc[key].replace('Super', 'Win');
      };
      window.addEventListener('keydown', grab, true);
    };
    return h('div', { class: 'field inline' }, h('label', {}, label), btn);
  };
  const ref = [['Space', T('재생 / 정지')], ['← →', T('한 프레임 이동 (Shift: 5초)')], ['Delete', T('선택한 구간 지우기')], ['Ctrl+Z', T('되돌리기')], ['Ctrl+Y', T('다시 하기')], ['S', T('여기서 영상 나누기(잘라낼 구간 만들기)')], ['K', T('영상에 키 표시 켜기 / 끄기')]];
  const bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal' },
    h('h2', {}, T('단축키')),
    h('div', { class: 'small muted', style: { marginBottom: '12px' } }, T('녹화 중에는 어떤 프로그램에서든 듣는 단축키입니다. 버튼을 누르고 새 조합을 누르면 바뀝니다.')),
    row('stop', T('녹화 멈추기')), row('pause', T('일시정지 / 다시 시작')), row('keys', T('화면 키 표시 켜기 / 끄기')), row('keyRec', T('키 기록 멈춤 / 다시 기록')),
    h('button', { class: 'btn small', onclick: () => { store.set('shortcuts', {}); bg.remove(); openShortcuts(); } }, T('처음 값으로')),
    h('div', { class: 'section' }, h('h3', { style: { fontSize: '14px', marginBottom: '10px' } }, T('편집 화면에서')),
      ref.map(([k, d]) => h('div', { class: 'field inline', style: { marginBottom: '8px' } }, h('label', {}, d), h('span', {}, kbdLabel(k))))),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => { bg.remove(); if (!state.editor && !state.recorder) showHome(); } }, T('닫기')))));
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
    const close = [...bg.querySelectorAll('.actions button')].find((b) => [T('닫기'), T('취소'), T('중지')].some((w) => b.textContent.includes(w)));
    if (close) { e.preventDefault(); close.click(); }
  } else if (e.key === 'Tab') {
    const stops = [...bg.querySelectorAll('button, select, input, textarea, [tabindex="0"]')].filter((el) => !el.disabled && el.offsetParent !== null);
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!bg.contains(document.activeElement)) { e.preventDefault(); first.focus(); } else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});


/** Installed extensions: turn each on or off, open the folder, add the example pack. */
export async function openExtensions() {
  const installed = h('div', { class: 'ext-list' }, h('div', { class: 'small muted' }, T('불러오는 중…')));
  const official = h('div', { class: 'ext-list' });
  const kinds = [['backgrounds', T('배경')], ['keyThemes', T('키 테마')], ['cursorPacks', T('커서 묶음')], ['clickEffects', T('클릭 효과')], ['subtitleStyles', T('자막 스타일')]];
  const counts = (e) => kinds.filter(([k]) => e[k]?.length).map(([k, n]) => `${n} ${e[k].length}`).join(' · ');
  const draw = async (reload) => {
    const list = await loadExtensions(reload);
    installed.replaceChildren(...(list.length ? list.map((e) => h('div', { class: 'ext-item' },
      h('div', { class: 'grow' },
        h('b', {}, e.name), e.version ? h('span', { class: 'small muted' }, ` ${e.version}`) : null,
        e.author ? h('div', { class: 'small muted' }, e.author) : null,
        e.error
          ? h('div', { class: 'small', style: { color: 'var(--danger)' } }, T('읽지 못했습니다: {0}', e.error))
          : h('div', { class: 'small muted' }, counts(e) || T('쓸 수 있는 항목이 없습니다'))),
      e.error ? null : switchEl(e.enabled, (v) => setExtensionEnabled(e.id, v))))
      : [h('div', { class: 'empty' }, T('설치된 확장이 없습니다. 아래 공식 확장을 넣거나 새로 만들어 보세요.'))]));
    const have = new Set(list.map((e) => e.id));
    official.replaceChildren(...OFFICIAL_EXTENSIONS.map(({ folder, json }) => {
      const e = readExtension(folder, json);
      return h('div', { class: 'ext-item' },
        h('div', { class: 'grow' },
          h('b', {}, e.name), h('span', { class: 'small muted' }, ` ${e.version}`),
          e.description ? h('div', { class: 'small muted' }, e.description) : null,
          h('div', { class: 'small muted' }, counts(e))),
        h('button', { class: `btn small${have.has(folder) ? '' : ' primary'}`, onclick: async () => {
          await platform.installExtension(folder, JSON.stringify(json, null, 2));
          await draw(true);
          toast(T('"{0}" 확장을 넣었습니다.', e.name));
        } }, have.has(folder) ? T('다시 넣기') : T('넣기')));
    }));
  };
  const bg = h('div', { class: 'modal-bg' }, h('div', { class: 'modal modal-wide' },
    h('h2', {}, T('확장 기능')),
    h('div', { class: 'small muted', style: { marginBottom: '12px' } }, T('확장은 배경·키 테마·커서 묶음·클릭 효과·자막 스타일을 더합니다. 코드는 실행하지 않고 설정 값만 읽습니다. 고른 항목은 프로젝트에 복사되어 확장을 지워도 영상은 그대로입니다.')),
    h('h3', { class: 'ext-head' }, T('설치된 확장')),
    installed,
    h('div', { class: 'row', style: { marginTop: '10px', flexWrap: 'wrap' } },
      h('button', { class: 'btn small primary', onclick: () => { bg.remove(); openExtensionMaker(); } }, T('✏ 새 확장 만들기')),
      h('button', { class: 'btn small', onclick: () => platform.openExtensions() }, T('📁 확장 폴더 열기')),
      h('button', { class: 'btn small', onclick: () => draw(true) }, T('↻ 다시 읽기'))),
    h('h3', { class: 'ext-head' }, T('공식 확장')),
    official,
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => { bg.remove(); if (state.editor) state.editor.redrawPanel?.(); } }, T('닫기')))));
  document.body.append(bg);
  draw(true);
}
