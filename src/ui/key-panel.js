// The key display settings, shared by the editor and the live key window.

import { platform, keyNameOf } from '../lib/platform.js';
import { KEY_DEFAULTS } from '../lib/keys.js';
import { KEY_THEMES } from '../lib/compositor.js';
import { h, toast, inlineSwitch, rangeField, segField, colorField, ALL_POSITIONS, positionField } from './dom.js';
/**
 * Everything about how keys look and which keys show. Shared by the editor and the
 * live-overlay settings. `change(rebuild)` is called after each edit; `redraw` after edits
 * that add or remove controls.
 */
export function keyPanel(k, change, redraw) {
  k.custom = { ...KEY_DEFAULTS.custom, ...(k.custom || {}) };
  k.allowed = k.allowed || [...KEY_DEFAULTS.allowed];
  const c = k.custom;
  const names = { Click: '🖱 클릭', Drag: '🖱 드래그', Wheel: '🖱 휠' };
  const chips = h('div', { class: 'chips' }, k.allowed.map((name) => h('span', { class: 'chip' }, names[name] || name,
    h('button', { class: 'chip-x', title: '빼기', onclick: () => { k.allowed = k.allowed.filter((n) => n !== name); change(true); redraw(); } }, '✕'))));
  const addKey = h('button', { class: 'btn small' }, '+ 키 추가');
  addKey.onclick = () => {
    addKey.textContent = '추가할 키를 누르세요…';
    const grab = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener('keydown', grab, true);
      const name = keyNameOf(e);
      if (!k.allowed.includes(name)) k.allowed.push(name);
      change(true);
      redraw();
    };
    window.addEventListener('keydown', grab, true);
  };
  return [
    segField('무엇을 보여줄까요', k.mode, [{ id: 'all', name: '모든 키' }, { id: 'shortcuts', name: '단축키만' }, { id: 'custom', name: '고른 키만' }], (v) => { k.mode = v; change(true); redraw(); }),
    k.mode === 'custom' ? h('div', { class: 'field' },
      h('label', {}, '이 키로 시작하는 입력만 보여줍니다'),
      chips,
      h('div', { class: 'row', style: { flexWrap: 'wrap' } }, addKey,
        ['Click', 'Drag', 'Wheel'].filter((n) => !k.allowed.includes(n)).map((n) => h('button', { class: 'btn small', onclick: () => { k.allowed.push(n); change(true); redraw(); } }, `+ ${names[n]}`)))) : null,
    inlineSwitch('마우스 클릭·드래그·휠도 표시', k.showMouse, (v) => { k.showMouse = v; change(true); }),
    positionField('위치', k.position, ALL_POSITIONS, (v) => { k.position = v; change(); }),
    rangeField('가장자리 여백 (가로)', k.marginX ?? 36, 0, 300, 2, (v) => { k.marginX = v; change(); }, (v) => `${v}px`),
    rangeField('가장자리 여백 (세로)', k.marginY ?? 36, 0, 300, 2, (v) => { k.marginY = v; change(); }, (v) => `${v}px`),
    h('div', { class: 'field' }, h('label', {}, '모양'),
      h('div', { class: 'swatches' },
        Object.entries(KEY_THEMES).map(([id, th]) => h('div', {
          class: `swatch${k.theme === id ? ' on' : ''}`,
          style: { background: th.face, border: `2px solid ${th.edge}`, color: th.text, display: 'grid', placeItems: 'center', fontWeight: 700, boxShadow: th.glow ? `0 0 10px ${th.glow}` : null },
          onclick: () => { k.theme = id; change(); redraw(); },
        }, { dark: 'Ctrl', light: 'Shift', neon: 'Alt', key: 'Enter' }[id] || id)),
        h('div', { class: `swatch${k.theme === 'custom' ? ' on' : ''}`, style: { background: c.face, color: c.text, border: `2px solid ${c.borderColor}`, display: 'grid', placeItems: 'center', fontWeight: 700, gridColumn: 'span 2' }, onclick: () => { k.theme = 'custom'; change(); redraw(); } }, '직접 꾸미기'))),
    k.theme === 'custom' ? [
      segField('키 모양', c.capStyle, [{ id: 'raised', name: '입체' }, { id: 'flat', name: '납작' }, { id: 'outline', name: '테두리만' }], (v) => { c.capStyle = v; change(); }),
      colorField('키 색', c.face, (v) => { c.face = v; change(); }),
      inlineSwitch('키에 입체감(그라데이션)', !!c.gradient, (v) => { c.gradient = v; change(); }),
      colorField('글자 색', c.text, (v) => { c.text = v; change(); }),
      inlineSwitch('조합키(Ctrl·Alt…)는 다른 색', c.modHighlight, (v) => { c.modHighlight = v; change(); redraw(); }),
      c.modHighlight ? [colorField('조합키 색', c.modFace, (v) => { c.modFace = v; change(); }), colorField('조합키 글자 색', c.modText, (v) => { c.modText = v; change(); })] : null,
      inlineSwitch('테두리', c.border, (v) => { c.border = v; change(); redraw(); }),
      c.border ? [colorField('테두리 색', c.borderColor, (v) => { c.borderColor = v; change(); }),
        rangeField('테두리 두께', c.borderWidth, 1, 6, 0.5, (v) => { c.borderWidth = v; change(); }, (v) => `${v}px`)] : null,
      rangeField('모서리 둥글기', c.radius, 0, 23, 1, (v) => { c.radius = v; change(); }, (v) => `${v}px`),
      inlineSwitch('뒤에 바탕 깔기', c.panel, (v) => { c.panel = v; change(); redraw(); }),
      c.panel ? [colorField('바탕 색', c.panelColor, (v) => { c.panelColor = v; change(); }),
        rangeField('바탕 진하기', c.panelOpacity, 0.1, 1, 0.05, (v) => { c.panelOpacity = v; change(); }, (v) => `${Math.round(v * 100)}%`)] : null,
    ] : null,
    segField('조합키 표기', k.modLabel || 'text', [{ id: 'text', name: 'Ctrl' }, { id: 'symbol', name: '⌃ 기호' }, { id: 'both', name: '⌃ Ctrl' }], (v) => { k.modLabel = v; change(); }),
    segField('글자', k.caps || 'upper', [{ id: 'upper', name: '대문자 A' }, { id: 'lower', name: '소문자 a' }], (v) => { k.caps = v; change(); }),
    inlineSwitch('여러 번 누르면 ×3 처럼 세기', k.showCount !== false, (v) => { k.showCount = v; change(); }),
    rangeField('크기', k.size, 0.6, 1.8, 0.05, (v) => { k.size = v; change(); }, (v) => `${Math.round(v * 100)}%`),
    segField('나타나고 사라지는 방식', k.anim || 'fade', [{ id: 'none', name: '없음' }, { id: 'fade', name: '흐리게' }, { id: 'zoom', name: '커지며' }, { id: 'float', name: '떠오르며' }, { id: 'slide', name: '옆에서' }], (v) => { k.anim = v; change(); }),
    rangeField('움직임 길이', k.animDur ?? 0.25, 0.1, 0.8, 0.05, (v) => { k.animDur = v; change(); }, (v) => `${v.toFixed(2)}초`),
    rangeField('사라지기까지', k.hold, 0.5, 5, 0.1, (v) => { k.hold = v; change(); }, (v) => `${v.toFixed(1)}초`),
    rangeField('이전 입력 남겨 두기', k.maxGroups, 1, 5, 1, (v) => { k.maxGroups = v; change(); }, (v) => (v === 1 ? '안 함' : `${v}줄`)),
    h('div', { class: 'row', style: { marginTop: '6px' } },
      h('button', { class: 'btn small grow', title: '지금 키 모양을 파일로 저장', onclick: async () => {
        const { enabled: _on, ...style } = k;
        const file = await platform.saveText('키-모양.json', JSON.stringify({ keycastKeyStyle: 1, ...style }, null, 2), 'json');
        if (file) toast('키 모양을 저장했습니다.');
      } }, '⤓ 모양 저장'),
      h('button', { class: 'btn small grow', title: '저장해 둔 키 모양 파일 불러오기', onclick: () => {
        const input = h('input', { type: 'file', accept: '.json,application/json', onchange: async () => {
          try {
            const data = JSON.parse(await input.files[0].text());
            if (!data || data.keycastKeyStyle !== 1 || typeof data.theme !== 'string') throw new Error('키 모양 파일이 아닙니다.');
            const { keycastKeyStyle: _v, enabled: _on, ...style } = data;
            Object.assign(k, style);
            change(true);
            redraw();
            toast('키 모양을 불러왔습니다.');
          } catch (err) {
            toast(`불러오지 못했습니다: ${err.message}`, true);
          }
        } });
        input.click();
      } }, '⤒ 모양 불러오기')),
  ];
}

