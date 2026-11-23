// Draws the animated pictures used in the README files (docs/readme/*.svg), one set per language.
// GitHub shows SVG images with their CSS animations but runs no scripts and loads no web fonts,
// so everything here is plain SVG + CSS keyframes with system fonts.
// Run: node scripts/readme-art.cjs
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'readme');
const FONT = "'Segoe UI Variable Display','Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,'Malgun Gothic','Apple SD Gothic Neo','Noto Sans CJK KR','Hiragino Sans','Microsoft YaHei',sans-serif";
const MONO = "'Cascadia Mono',Consolas,'SF Mono',Menlo,monospace";
const C = {
  bg: '#0f0f10', surface: '#19191b', raised: '#232325', line: 'rgba(237,237,237,0.10)',
  text: '#ededed', text2: '#a1a1a6', text3: '#85858b', accent: '#5b9dff', rec: '#ff453a', click: '#ffd33d', ok: '#4cc38a',
};
const EASE = 'cubic-bezier(0.22,1,0.36,1)';

// ------------------------------------------------------------------ words per language
const L = {
  en: {
    title: 'KeyCast Studio',
    tag: ['Screen recordings that show', 'every shortcut you press'],
    sub: 'Key bubbles · zoom on clicks · subtitles from your voice',
    chips: ['Windows · macOS · Linux', 'Free & open source', 'Works offline'],
    save: 'Save', words: ['Press', 'Ctrl+S', 'to', 'save'],
    cards: {
      keys: ['Every shortcut, on screen', 'Shortcuts only by default — typing stays private'],
      zoom: ['Zoom where you click', 'Smooth camera that follows the pointer'],
      subs: ['Subtitles from your voice', 'Transcribed on your PC, 7 styles incl. karaoke'],
      pointer: ['A pointer worth watching', '7 shapes · ripple, echo, glow, burst'],
    },
    subWords: ['Cut', 'the', 'clip', 'with', 'one', 'key'],
    flow: [['Record', 'screen, mic, webcam, keys'], ['Edit', 'zoom, cut, notes, subtitles'], ['Export', 'MP4, WebM, GIF, SRT']],
    privacy: ['What gets saved', 'Typed letters are dropped before saving. Shortcuts stay.'],
    typed: 'typed', kept: 'saved',
    size: ['Windows download, v1.1 and today', 'Installer', 'Installed', 'MB'],
  },
  ko: {
    title: 'KeyCast Studio',
    tag: ['누른 단축키가 그대로 보이는', '화면 녹화 프로그램'],
    sub: '키 말풍선 · 클릭하면 확대 · 목소리로 자막',
    chips: ['Windows · macOS · Linux', '무료 · 오픈 소스', '인터넷 없이 동작'],
    save: '저장', words: ['Ctrl+S로', '바로', '저장하세요'],
    cards: {
      keys: ['누른 단축키를 화면에', '기본은 단축키만 · 타이핑한 글자는 저장 안 함'],
      zoom: ['클릭한 곳으로 확대', '커서를 부드럽게 따라가는 카메라'],
      subs: ['목소리로 자막', '내 컴퓨터에서 받아쓰기 · 노래방 등 7가지 스타일'],
      pointer: ['보기 좋은 커서', '모양 7종 · 물결·겹물결·빛 번짐·터짐'],
    },
    subWords: ['단축키', '하나로', '영상을', '자릅니다'],
    flow: [['녹화', '화면·마이크·웹캠·키'], ['편집', '확대·자르기·주석·자막'], ['내보내기', 'MP4·WebM·GIF·SRT']],
    privacy: ['무엇이 저장될까요', '혼자 친 글자는 저장 전에 버리고, 단축키만 남깁니다.'],
    typed: '입력', kept: '저장',
    size: ['Windows 설치 파일, v1.1과 지금', '설치 파일', '설치 후', 'MB'],
  },
  ja: {
    title: 'KeyCast Studio',
    tag: ['押したショートカットが', 'そのまま映る画面録画'],
    sub: 'キー表示 · クリックでズーム · 声から字幕',
    chips: ['Windows · macOS · Linux', '無料 · オープンソース', 'オフラインで動作'],
    save: '保存', words: ['Ctrl+Sで', 'すぐに', '保存'],
    cards: {
      keys: ['ショートカットを画面に', '既定はショートカットのみ · 入力文字は保存しない'],
      zoom: ['クリックした所へズーム', 'ポインターを滑らかに追うカメラ'],
      subs: ['声から字幕', 'PC 内で文字起こし · カラオケなど 7 スタイル'],
      pointer: ['見やすいポインター', '7 種類の形 · 波紋・二重波紋・光・はじけ'],
    },
    subWords: ['キー', 'ひとつで', '動画を', 'カット'],
    flow: [['録画', '画面・マイク・カメラ・キー'], ['編集', 'ズーム・カット・注釈・字幕'], ['書き出し', 'MP4・WebM・GIF・SRT']],
    privacy: ['何が保存される？', '単独で打った文字は保存前に捨て、ショートカットだけ残します。'],
    typed: '入力', kept: '保存',
    size: ['Windows 版のサイズ：v1.1 と現在', 'インストーラー', 'インストール後', 'MB'],
  },
  'zh-CN': {
    title: 'KeyCast Studio',
    tag: ['把你按下的每个快捷键', '都录进视频'],
    sub: '按键气泡 · 点击即放大 · 语音生成字幕',
    chips: ['Windows · macOS · Linux', '免费 · 开源', '离线可用'],
    save: '保存', words: ['按', 'Ctrl+S', '保存'],
    cards: {
      keys: ['快捷键显示在画面上', '默认只显示快捷键 · 打字内容不保存'],
      zoom: ['点哪里放大哪里', '平滑跟随指针的镜头'],
      subs: ['语音生成字幕', '在本机转写 · 卡拉 OK 等 7 种样式'],
      pointer: ['好看的指针', '7 种形状 · 波纹、回声、光晕、迸发'],
    },
    subWords: ['一个', '按键', '剪掉', '片段'],
    flow: [['录制', '屏幕、麦克风、摄像头、按键'], ['编辑', '放大、剪切、注释、字幕'], ['导出', 'MP4、WebM、GIF、SRT']],
    privacy: ['会保存什么', '单独输入的字符在保存前丢弃，只保留快捷键。'],
    typed: '输入', kept: '保存',
    size: ['Windows 版大小：v1.1 与现在', '安装包', '安装后', 'MB'],
  },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svg(w, h, title, css, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>
text{font-family:${FONT}}
.mono{font-family:${MONO}}
*{transform-box:view-box}
${css}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}
</style>
${body}
</svg>
`;
}

// A key cap; returns its markup and width.
function keycap(x, y, label, opt = {}) {
  const fs = opt.size || 20;
  const w = Math.max(fs * 1.9, label.length * fs * 0.62 + fs * 1.1);
  const h = fs * 1.9;
  const face = opt.face || '#26292f';
  const edge = opt.edge || '#0a0b0d';
  const fg = opt.fg || '#ffffff';
  return {
    w,
    h,
    s: `<g>
<rect x="${x}" y="${y + 3}" width="${w}" height="${h}" rx="${fs * 0.42}" fill="${edge}"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${fs * 0.42}" fill="${face}" stroke="rgba(255,255,255,0.10)"/>
<text x="${x + w / 2}" y="${y + h / 2 + fs * 0.36}" text-anchor="middle" font-size="${fs}" font-weight="650" fill="${fg}" class="mono">${esc(label)}</text>
</g>`,
  };
}

function combo(x, y, keys, opt = {}) {
  let cx = x;
  const parts = [];
  const fs = opt.size || 20;
  keys.forEach((k, i) => {
    if (i) {
      parts.push(`<text x="${cx + fs * 0.55}" y="${y + fs * 1.3}" text-anchor="middle" font-size="${fs * 0.9}" fill="rgba(255,255,255,0.6)">+</text>`);
      cx += fs * 1.1;
    }
    const mod = /^(Ctrl|Alt|Shift|Win)$/.test(k);
    const kc = keycap(cx, y, k, { ...opt, face: mod && opt.modFace ? opt.modFace : opt.face });
    parts.push(kc.s);
    cx += kc.w;
  });
  return { w: cx - x, s: parts.join('\n') };
}

const ARROW = 'M0 0 L0 17.2 L4.4 13.4 L7.3 20 L10 18.8 L7.1 12.4 L12.6 12.4 Z';
const HAND = 'M0.6 -0.2 C1.9 -0.2 2.6 0.7 2.6 2 L2.6 7.4 C3.2 6.9 4.6 6.9 5.2 7.9 C5.9 7.3 7.4 7.4 7.9 8.6 C8.7 8.1 10.4 8.4 10.4 10 L10.4 14.6 C10.4 18.2 8.4 20.4 5 20.4 L3.2 20.4 C0.8 20.4 -0.6 19.2 -2 17 L-5 12.2 C-5.8 10.9 -4.3 9.6 -3 10.6 L-1.4 12 L-1.4 2 C-1.4 0.7 -0.7 -0.2 0.6 -0.2 Z';

// Soft colour blobs drifting behind a picture.
function blobs(w, h, list, id) {
  return `<defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${Math.round(Math.min(w, h) * 0.12)}"/></filter></defs>
<g filter="url(#${id})" opacity="0.55">${list.map(([x, y, r, c], i) => `<circle class="blob b${i}" cx="${x * w}" cy="${y * h}" r="${r * Math.min(w, h)}" fill="${c}"/>`).join('')}</g>`;
}
const BLOB_CSS = `
.blob{animation:drift 18s ease-in-out infinite alternate}
.b1{animation-duration:22s;animation-delay:-6s}.b2{animation-duration:26s;animation-delay:-11s}.b3{animation-duration:20s;animation-delay:-3s}
@keyframes drift{0%{transform:translate(0,0)}50%{transform:translate(40px,-30px)}100%{transform:translate(-30px,25px)}}`;

// ------------------------------------------------------------------ hero
function hero(t) {
  const W = 1280;
  const H = 560;
  // the mock window
  const wx = 640;
  const wy = 86;
  const ww = 580;
  const wh = 380;
  const btn = { x: wx + 404, y: wy + 216, w: 120, h: 44 };
  const tx = btn.x + btn.w / 2;
  const ty = btn.y + btn.h / 2;
  const keys = combo(0, 0, ['Ctrl', 'S'], { size: 22, modFace: '#2f6fd6' });
  const kx = wx + ww / 2 - keys.w / 2;
  const ky = wy + wh - 112;
  const subW = t.words.join(' ').length * 15 + 40;
  let sx = wx + ww / 2 - subW / 2 + 20;
  const subY = wy + wh - 30;
  const words = t.words.map((w, i) => {
    const s = `<tspan class="w w${i}">${esc(w)}</tspan>`;
    return s;
  }).join(' ');
  const css = `${BLOB_CSS}
.zoom{transform-origin:${tx}px ${ty}px;animation:zoom 8s ${EASE} infinite}
@keyframes zoom{0%,27%{transform:scale(1)}40%,64%{transform:scale(1.55)}80%,100%{transform:scale(1)}}
.cur{animation:cur 8s ${EASE} infinite}
@keyframes cur{0%{transform:translate(${wx + 120}px,${wy + 330}px)}20%,72%{transform:translate(${tx}px,${ty}px)}90%,100%{transform:translate(${wx + 120}px,${wy + 330}px)}}
.press{transform-origin:${tx}px ${ty}px;animation:press 8s infinite}
@keyframes press{0%,24%{transform:scale(1)}25.5%{transform:scale(0.78)}28%,100%{transform:scale(1)}}
.rip{transform-origin:${tx}px ${ty}px;animation:rip 8s ${EASE} infinite;opacity:0}
.rip2{animation-delay:0.18s}
@keyframes rip{0%,24.9%{transform:scale(0.2);opacity:0}25%{transform:scale(0.2);opacity:0.95}34%,100%{transform:scale(1.6);opacity:0}}
.btn{animation:btn 8s infinite}
@keyframes btn{0%,24%{fill:${C.accent}}26%,60%{fill:#7db2ff}70%,100%{fill:${C.accent}}}
.bubble{transform-origin:${wx + ww / 2}px ${ky + 20}px;animation:bubble 8s ${EASE} infinite}
@keyframes bubble{0%,25%{opacity:0;transform:translateY(14px) scale(0.86)}30%,70%{opacity:1;transform:translateY(0) scale(1)}76%,100%{opacity:0;transform:translateY(-6px) scale(0.96)}}
.subs{animation:subs 8s infinite}
@keyframes subs{0%,28%{opacity:0}31%,84%{opacity:1}88%,100%{opacity:0}}
.w{fill:#ffffff;animation:word 8s infinite}
${t.words.map((_, i) => `.w${i}{animation-name:word${i}}@keyframes word${i}{0%,${32 + i * 9}%{fill:#ffffff}${33 + i * 9}%,100%{fill:${C.click}}}`).join('\n')}
.rec{animation:rec 1.6s ease-in-out infinite}
@keyframes rec{0%,100%{opacity:1}50%{opacity:0.35}}
.ring{transform-origin:84px 98px;animation:ring 2.4s ease-out infinite}
@keyframes ring{0%{transform:scale(0.6);opacity:0.7}100%{transform:scale(1.9);opacity:0}}
.in{animation:in 1s ${EASE} both}
.in1{animation-delay:0.1s}.in2{animation-delay:0.22s}.in3{animation-delay:0.34s}.in4{animation-delay:0.46s}
@keyframes in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.win{animation:win 1.2s ${EASE} 0.2s both}
@keyframes win{from{opacity:0;transform:translateY(24px) scale(0.97)}to{opacity:1;transform:none}}
.scan{animation:scan 8s linear infinite}
@keyframes scan{from{transform:translateX(0)}to{transform:translateX(${ww - 28}px)}}`;

  const lines = [];
  for (let i = 0; i < 6; i++) {
    const y = wy + 70 + i * 26;
    lines.push(`<rect x="${wx + 30}" y="${y}" width="${[300, 240, 330, 200, 280, 160][i]}" height="10" rx="5" fill="rgba(255,255,255,${i === 0 ? 0.32 : 0.12})"/>`);
  }
  const fit = (s) => Math.min(46, 540 / Math.max(...t.tag.map((x) => [...x].reduce((w, ch) => w + (/[　-鿿가-힯]/.test(ch) ? 1 : 0.56), 0))));
  const tagSize = fit();
  const chipsX = [72];
  const chipW = t.chips.map((c) => c.length * (/[가-힣ぁ-ん一-龥]/.test(c) ? 15 : 8.6) + 34);
  for (let i = 1; i < chipW.length; i++) chipsX.push(chipsX[i - 1] + chipW[i - 1] + 10);

  const body = `
<rect width="${W}" height="${H}" rx="24" fill="${C.bg}"/>
<clipPath id="hc"><rect width="${W}" height="${H}" rx="24"/></clipPath>
<g clip-path="url(#hc)">
${blobs(W, H, [[0.12, 0.2, 0.38, '#6d5efc'], [0.85, 0.1, 0.34, '#c254d8'], [0.75, 0.95, 0.4, '#f7797d'], [0.3, 0.95, 0.3, '#2b6bff']], 'hb')}
<rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>
</g>
<defs>
<pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="rgba(255,255,255,0.04)"/></pattern>
<linearGradient id="tg" x1="0" x2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9d8ff"/></linearGradient>
<clipPath id="wc"><rect x="${wx}" y="${wy + 40}" width="${ww}" height="${wh - 40}" rx="0"/></clipPath>
</defs>

<g class="in in0">
<circle class="ring" cx="84" cy="98" r="16" fill="none" stroke="${C.rec}" stroke-width="3"/>
<circle cx="84" cy="98" r="18" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="3"/>
<circle class="rec" cx="84" cy="98" r="9" fill="${C.rec}"/>
<text x="116" y="107" font-size="26" font-weight="700" fill="${C.text}">KeyCast <tspan fill="${C.text2}" font-weight="400">Studio</tspan></text>
</g>
<g class="in in1"><text x="72" y="214" font-size="${tagSize}" font-weight="750" fill="url(#tg)" letter-spacing="-0.5">${esc(t.tag[0])}</text></g>
<g class="in in2"><text x="72" y="${214 + tagSize * 1.26}" font-size="${tagSize}" font-weight="750" fill="url(#tg)" letter-spacing="-0.5">${esc(t.tag[1])}</text></g>
<g class="in in3"><text x="72" y="326" font-size="20" fill="${C.text2}">${esc(t.sub)}</text></g>
<g class="in in4">
${t.chips.map((c, i) => `<rect x="${chipsX[i]}" y="372" width="${chipW[i]}" height="36" rx="18" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)"/>
<circle cx="${chipsX[i] + 17}" cy="390" r="4" fill="${[C.ok, C.accent, C.click][i]}"/>
<text x="${chipsX[i] + 28}" y="396" font-size="15" fill="${C.text}">${esc(c)}</text>`).join('\n')}
</g>

<g class="win">
<rect x="${wx - 2}" y="${wy + 10}" width="${ww + 4}" height="${wh}" rx="16" fill="rgba(0,0,0,0.45)" filter="url(#hb)" opacity="0.6"/>
<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="14" fill="#16171a" stroke="rgba(255,255,255,0.14)"/>
<circle cx="${wx + 22}" cy="${wy + 20}" r="6" fill="#ff5f57"/><circle cx="${wx + 42}" cy="${wy + 20}" r="6" fill="#febc2e"/><circle cx="${wx + 62}" cy="${wy + 20}" r="6" fill="#28c840"/>
<rect x="${wx + ww - 110}" y="${wy + 10}" width="92" height="20" rx="10" fill="rgba(255,69,58,0.16)"/>
<circle class="rec" cx="${wx + ww - 96}" cy="${wy + 20}" r="4.5" fill="${C.rec}"/>
<text x="${wx + ww - 84}" y="${wy + 25}" font-size="12" fill="#ff8a82" class="mono">REC 0:08</text>
<line x1="${wx}" y1="${wy + 40}" x2="${wx + ww}" y2="${wy + 40}" stroke="rgba(255,255,255,0.08)"/>
<g clip-path="url(#wc)">
<g class="zoom">
<rect x="${wx}" y="${wy + 40}" width="${ww}" height="${wh - 40}" fill="#1b1c20"/>
${lines.join('\n')}
<rect x="${wx + 30}" y="${wy + 236}" width="320" height="70" rx="10" fill="rgba(91,157,255,0.10)" stroke="rgba(91,157,255,0.28)"/>
<rect x="${wx + 46}" y="${wy + 254}" width="180" height="10" rx="5" fill="rgba(255,255,255,0.22)"/>
<rect x="${wx + 46}" y="${wy + 274}" width="240" height="10" rx="5" fill="rgba(255,255,255,0.12)"/>
<g class="press"><rect class="btn" x="${btn.x}" y="${btn.y}" width="${btn.w}" height="${btn.h}" rx="10" fill="${C.accent}"/>
<text x="${tx}" y="${ty + 6}" text-anchor="middle" font-size="17" font-weight="650" fill="#0b1220">${esc(t.save)}</text></g>
<circle class="rip" cx="${tx}" cy="${ty}" r="34" fill="rgba(255,211,61,0.25)" stroke="${C.click}" stroke-width="3.5"/>
<circle class="rip rip2" cx="${tx}" cy="${ty}" r="34" fill="none" stroke="${C.click}" stroke-width="2"/>
<g class="cur"><g transform="scale(1.7)"><path d="${ARROW}" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></g></g>
</g>
</g>
<g class="bubble"><rect x="${kx - 14}" y="${ky - 12}" width="${keys.w + 28}" height="66" rx="14" fill="rgba(13,17,23,0.78)" stroke="rgba(255,255,255,0.08)"/>
<g transform="translate(${kx},${ky})">${keys.s}</g></g>
<g class="subs"><rect x="${wx + ww / 2 - subW / 2}" y="${subY - 22}" width="${subW}" height="34" rx="8" fill="rgba(0,0,0,0.72)"/>
<text x="${wx + ww / 2}" y="${subY + 1}" text-anchor="middle" font-size="17" font-weight="650">${words}</text></g>
<rect class="scan" x="${wx + 14}" y="${wy + wh - 4}" width="14" height="2" rx="1" fill="${C.rec}" opacity="0.8"/>
<rect x="${wx + 14}" y="${wy + wh - 4}" width="${ww - 28}" height="2" rx="1" fill="rgba(255,255,255,0.08)"/>
</g>`;
  void sx;
  return svg(W, H, `${t.title} — ${t.tag.join(' ')}`, css, body);
}

// ------------------------------------------------------------------ feature cards
function cardFrame(W, H, title, caption, accent, art) {
  return `<rect width="${W}" height="${H}" rx="20" fill="${C.surface}" stroke="rgba(255,255,255,0.08)"/>
<clipPath id="cc"><rect width="${W}" height="${H}" rx="20"/></clipPath>
<g clip-path="url(#cc)">
<circle cx="${W * 0.85}" cy="-20" r="190" fill="${accent}" opacity="0.10"/>
${art}
</g>
<rect x="28" y="${H - 92}" width="4" height="56" rx="2" fill="${accent}"/>
<text x="46" y="${H - 62}" font-size="24" font-weight="700" fill="${C.text}">${esc(title)}</text>
<text x="46" y="${H - 34}" font-size="15" fill="${C.text2}">${esc(caption)}</text>`;
}

const CW = 620;
const CH = 380;

function cardKeys(t) {
  // Three combos appear one after another and stack, like the app's bubbles.
  const rows = [['Ctrl', 'C'], ['Ctrl', 'V'], ['Ctrl', 'Shift', 'T']];
  const typed = ['h', 'e', 'l', 'l', 'o'];
  const css = `
.k{opacity:0;animation:k 7s ${EASE} infinite}
.k0{animation-delay:0s}.k1{animation-delay:0.9s}.k2{animation-delay:1.8s}
@keyframes k{0%{opacity:0;transform:translateY(18px) scale(0.9)}8%,60%{opacity:1;transform:none}70%,100%{opacity:0;transform:translateY(-10px)}}
.cnt{opacity:0;animation:cnt 7s infinite;animation-delay:0.9s}
@keyframes cnt{0%,10%{opacity:0}12%,58%{opacity:1}68%,100%{opacity:0}}
.t{animation:t 7s infinite}
${typed.map((_, i) => `.t${i}{animation-delay:${2.8 + i * 0.22}s}`).join('')}
@keyframes t{0%{opacity:0;transform:translateY(0)}2%{opacity:0.9}8%{opacity:0;transform:translateY(-26px)}100%{opacity:0}}
.drop{animation:drop 7s infinite;animation-delay:2.8s;opacity:0}
@keyframes drop{0%{opacity:0}3%,20%{opacity:1}26%,100%{opacity:0}}`;
  const parts = rows.map((r, i) => {
    const c = combo(0, 0, r, { size: 19, modFace: '#2f6fd6' });
    const x = CW / 2 - c.w / 2;
    const y = 52 + i * 62;
    return `<g class="k k${i}" style="transform-origin:${CW / 2}px ${y + 18}px"><rect x="${x - 12}" y="${y - 10}" width="${c.w + 24}" height="58" rx="13" fill="rgba(13,17,23,0.85)" stroke="rgba(255,255,255,0.07)"/>
<g transform="translate(${x},${y})">${c.s}</g>${i === 1 ? `<text class="cnt" x="${x + c.w + 22}" y="${y + 26}" font-size="18" font-weight="700" fill="${C.click}">×2</text>` : ''}</g>`;
  });
  const tx0 = CW - 150;
  const typedS = typed.map((ch, i) => `<text class="t t${i}" x="${tx0 + i * 22}" y="230" font-size="22" fill="${C.text2}" opacity="0" font-family="${MONO}">${ch}</text>`).join('');
  const art = `${parts.join('\n')}
<g>${typedS}</g>
<g class="drop"><rect x="${tx0 - 12}" y="240" width="124" height="24" rx="12" fill="rgba(229,72,77,0.15)"/><text x="${tx0 + 50}" y="257" text-anchor="middle" font-size="13" fill="#ff8a8e">✕ ${esc(t.typed)}</text></g>`;
  return svg(CW, CH, t.cards.keys[0], css, cardFrame(CW, CH, t.cards.keys[0], t.cards.keys[1], C.accent, art));
}

function cardZoom(t) {
  const sx = 70;
  const sy = 30;
  const sw = 480;
  const sh = 230;
  const px = sx + 360;
  const py = sy + 150;
  const css = `
.cam{transform-origin:${px}px ${py}px;animation:cam 7s ${EASE} infinite}
@keyframes cam{0%,22%{transform:scale(1)}36%,62%{transform:scale(1.9)}80%,100%{transform:scale(1)}}
.cur{animation:cur 7s ${EASE} infinite}
@keyframes cur{0%{transform:translate(${sx + 80}px,${sy + 60}px)}18%,70%{transform:translate(${px}px,${py}px)}88%,100%{transform:translate(${sx + 80}px,${sy + 60}px)}}
.rip{transform-origin:${px}px ${py}px;opacity:0;animation:rip 7s ${EASE} infinite}
@keyframes rip{0%,21.9%{opacity:0;transform:scale(0.2)}22%{opacity:1;transform:scale(0.2)}33%,100%{opacity:0;transform:scale(1.4)}}
.vf{transform-origin:${px}px ${py}px;opacity:0;animation:vf 7s ${EASE} infinite}
@keyframes vf{0%,20%{opacity:0;transform:scale(1.9)}34%{opacity:1;transform:scale(1)}60%{opacity:0.0}100%{opacity:0}}
.tl{animation:tl 7s linear infinite}
@keyframes tl{from{transform:translateX(0)}to{transform:translateX(${sw}px)}}`;
  const art = `
<clipPath id="zc"><rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="10"/></clipPath>
<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="10" fill="#1b1c20" stroke="rgba(255,255,255,0.12)"/>
<g clip-path="url(#zc)"><g class="cam">
${[0, 1, 2, 3, 4].map((i) => `<rect x="${sx + 24}" y="${sy + 26 + i * 28}" width="${[200, 150, 230, 120, 180][i]}" height="9" rx="4.5" fill="rgba(255,255,255,${i ? 0.12 : 0.3})"/>`).join('')}
<rect x="${px - 60}" y="${py - 20}" width="120" height="40" rx="9" fill="${C.ok}"/>
<rect x="${px - 34}" y="${py - 4}" width="68" height="8" rx="4" fill="rgba(0,0,0,0.35)"/>
<circle class="rip" cx="${px}" cy="${py}" r="30" fill="rgba(255,211,61,0.2)" stroke="${C.click}" stroke-width="3"/>
<g class="cur"><g transform="scale(1.4)"><path d="${ARROW}" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></g></g>
</g></g>
<rect class="vf" x="${px - sw / 3.8}" y="${py - sh / 3.8}" width="${sw / 1.9}" height="${sh / 1.9}" rx="8" fill="none" stroke="${C.ok}" stroke-width="2" stroke-dasharray="7 6"/>
<rect x="${sx}" y="${sy + sh + 14}" width="${sw}" height="8" rx="4" fill="rgba(255,255,255,0.07)"/>
<rect x="${sx + sw * 0.22}" y="${sy + sh + 14}" width="${sw * 0.48}" height="8" rx="4" fill="rgba(76,195,138,0.55)"/>
<rect class="tl" x="${sx - 1}" y="${sy + sh + 8}" width="2" height="20" rx="1" fill="${C.rec}"/>`;
  return svg(CW, CH, t.cards.zoom[0], css, cardFrame(CW, CH, t.cards.zoom[0], t.cards.zoom[1], C.ok, art));
}

function cardSubs(t) {
  const n = 34;
  const bars = [];
  for (let i = 0; i < n; i++) {
    const h = 10 + Math.round(Math.abs(Math.sin(i * 1.7) * 38 + Math.cos(i * 0.6) * 18));
    bars.push(`<rect class="bar" style="animation-delay:${(i * 0.07).toFixed(2)}s;transform-origin:${80 + i * 14 + 4}px 110px" x="${80 + i * 14}" y="${110 - h / 2}" width="8" height="${h}" rx="4" fill="${C.accent}" opacity="${0.35 + 0.6 * ((i % 5) / 5)}"/>`);
  }
  const ws = t.subWords;
  const dur = 6;
  const css = `
.bar{animation:bar 1.1s ease-in-out infinite alternate}
@keyframes bar{from{transform:scaleY(0.35)}to{transform:scaleY(1)}}
.play{animation:play ${dur}s linear infinite}
@keyframes play{from{transform:translateX(0)}to{transform:translateX(${n * 14}px)}}
.w{fill:#ffffff}
${ws.map((_, i) => {
    const a = 8 + i * (70 / ws.length);
    const b = a + 70 / ws.length;
    return `.w${i}{animation:w${i} ${dur}s infinite}@keyframes w${i}{0%,${a.toFixed(1)}%{fill:#ffffff;font-size:26px}${(a + 1).toFixed(1)}%,${b.toFixed(1)}%{fill:${C.click};font-size:29px}${(b + 1).toFixed(1)}%,90%{fill:${C.click};font-size:26px}96%,100%{fill:#ffffff;font-size:26px}}`;
  }).join('\n')}
.arrow{animation:arrow 1.6s ease-in-out infinite}
@keyframes arrow{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}`;
  const art = `
<text x="80" y="58" font-size="13" fill="${C.text3}" class="mono">voice.m4a</text>
${bars.join('\n')}
<rect class="play" x="78" y="66" width="2" height="88" rx="1" fill="${C.rec}"/>
<g class="arrow"><path d="M${CW / 2 - 8} 166 L${CW / 2} 176 L${CW / 2 + 8} 166" fill="none" stroke="${C.text3}" stroke-width="2" stroke-linecap="round"/></g>
<rect x="${CW / 2 - 200}" y="192" width="400" height="54" rx="12" fill="rgba(0,0,0,0.55)"/>
<text x="${CW / 2}" y="229" text-anchor="middle" font-size="26" font-weight="750" stroke="rgba(0,0,0,0.85)" stroke-width="5" paint-order="stroke">${ws.map((w, i) => `<tspan class="w w${i}">${esc(w)}</tspan>`).join(' ')}</text>`;
  return svg(CW, CH, t.cards.subs[0], css, cardFrame(CW, CH, t.cards.subs[0], t.cards.subs[1], C.click, art));
}

function cardPointer(t) {
  const cols = [130, 310, 490];
  const y = 140;
  const css = `
.e{opacity:0;animation:e 2.4s ${EASE} infinite}
.r1{animation-delay:0.25s}.r2{animation-delay:0.5s}
@keyframes e{0%{opacity:0.95;transform:scale(0.25)}70%,100%{opacity:0;transform:scale(1.5)}}
.ray{animation:ray 2.4s ${EASE} infinite;opacity:0}
@keyframes ray{0%{opacity:1;transform:scale(0.4)}60%,100%{opacity:0;transform:scale(1.35)}}
.glow{animation:glow 2.4s ease-out infinite}
@keyframes glow{0%{opacity:0.9;transform:scale(0.6)}70%,100%{opacity:0;transform:scale(1.25)}}
.c{animation:c 2.4s infinite}
@keyframes c{0%,100%{transform:scale(1)}6%{transform:scale(0.8)}14%{transform:scale(1)}}
.shape{animation:shape 9s infinite}
.s1{animation-delay:-3s}.s2{animation-delay:-6s}
@keyframes shape{0%,30%{opacity:1}34%,96%{opacity:0}100%{opacity:1}}`;
  const o = (x) => `style="transform-origin:${x}px ${y}px"`;
  const cursorAt = (x, i) => `<g ${o(x)} class="c"><g transform="translate(${x},${y}) scale(2)">
<path class="shape s0" d="${ARROW}" fill="${['#111', '#fff', C.accent][i]}" stroke="${['#fff', '#111', '#fff'][i]}" stroke-width="1.2" stroke-linejoin="round"/>
<path class="shape s1" d="${HAND}" fill="#fff" stroke="#111" stroke-width="1" stroke-linejoin="round"/>
<path class="shape s2" d="${ARROW}" fill="rgba(255,255,255,0.08)" stroke="${[C.click, C.accent, C.ok][i]}" stroke-width="1.4" stroke-linejoin="round"/>
</g></g>`;
  const ripple = `<circle class="e" ${o(cols[0])} cx="${cols[0]}" cy="${y}" r="44" fill="rgba(255,211,61,0.18)" stroke="${C.click}" stroke-width="3.5"/>`;
  const echo = [0, 1, 2].map((i) => `<circle class="e r${i}" ${o(cols[1])} cx="${cols[1]}" cy="${y}" r="44" fill="none" stroke="${C.accent}" stroke-width="${i ? 2 : 3.5}"/>`).join('');
  const rays = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    rays.push(`<line x1="${cols[2] + Math.cos(a) * 22}" y1="${y + Math.sin(a) * 22}" x2="${cols[2] + Math.cos(a) * 46}" y2="${y + Math.sin(a) * 46}" stroke="${C.ok}" stroke-width="4" stroke-linecap="round"/>`);
  }
  const art = `
<defs><radialGradient id="gl"><stop offset="0" stop-color="${C.accent}" stop-opacity="0.7"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></radialGradient></defs>
${ripple}
${echo}
<g class="ray" ${o(cols[2])}>${rays.join('')}</g>
${cols.map((x, i) => cursorAt(x, i)).join('\n')}
${['Ripple', 'Echo', 'Burst'].map((n, i) => `<text x="${cols[i]}" y="${y + 92}" text-anchor="middle" font-size="13" fill="${C.text3}" class="mono">${n}</text>`).join('')}`;
  return svg(CW, CH, t.cards.pointer[0], css, cardFrame(CW, CH, t.cards.pointer[0], t.cards.pointer[1], C.rec, art));
}

// ------------------------------------------------------------------ flow
function flow(t) {
  const W = 1280;
  const H = 230;
  const xs = [190, 640, 1090];
  const y = 96;
  const icons = [
    `<circle r="13" fill="${C.rec}"/><circle r="22" fill="none" stroke="${C.rec}" stroke-width="2.5" opacity="0.5"/>`,
    `<path d="M-14 12 L6 -8 L12 -2 L-8 18 L-16 20 Z" fill="${C.accent}"/><rect x="5" y="-20" width="9" height="12" rx="2" transform="rotate(45 9 -14)" fill="${C.accent}" opacity="0.7"/>`,
    `<path d="M0 -18 L0 8 M-10 -2 L0 8 L10 -2" fill="none" stroke="${C.ok}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M-16 14 L16 14" stroke="${C.ok}" stroke-width="4" stroke-linecap="round"/>`,
  ];
  const colors = [C.rec, C.accent, C.ok];
  const css = `
.dash{stroke-dasharray:6 10;animation:dash 1.2s linear infinite}
@keyframes dash{to{stroke-dashoffset:-32}}
.dot{animation:dot 3.6s ${EASE} infinite}
@keyframes dot{0%{transform:translateX(0);opacity:0}8%{opacity:1}45%{transform:translateX(${xs[1] - xs[0]}px);opacity:1}50%{transform:translateX(${xs[1] - xs[0]}px);opacity:1}92%{transform:translateX(${xs[2] - xs[0]}px);opacity:1}100%{transform:translateX(${xs[2] - xs[0]}px);opacity:0}}
.node{animation:node 3.6s infinite}
.n1{animation-delay:1.6s}.n2{animation-delay:3.3s}
@keyframes node{0%,100%{transform:scale(1)}6%{transform:scale(1.08)}14%{transform:scale(1)}}
.halo{animation:halo 3.6s ease-out infinite;opacity:0}
.h1{animation-delay:1.6s}.h2{animation-delay:3.3s}
@keyframes halo{0%{opacity:0.6;transform:scale(0.9)}25%,100%{opacity:0;transform:scale(1.5)}}`;
  const body = `
<rect width="${W}" height="${H}" rx="22" fill="${C.surface}" stroke="rgba(255,255,255,0.08)"/>
<line class="dash" x1="${xs[0] + 50}" y1="${y}" x2="${xs[2] - 50}" y2="${y}" stroke="rgba(255,255,255,0.22)" stroke-width="2.5"/>
<circle class="dot" cx="${xs[0]}" cy="${y}" r="6" fill="#fff"/>
${xs.map((x, i) => `<g>
<circle class="halo h${i}" style="transform-origin:${x}px ${y}px" cx="${x}" cy="${y}" r="44" fill="none" stroke="${colors[i]}" stroke-width="2"/>
<g class="node n${i}" style="transform-origin:${x}px ${y}px"><circle cx="${x}" cy="${y}" r="44" fill="${C.raised}" stroke="${colors[i]}" stroke-opacity="0.6" stroke-width="2"/>
<g transform="translate(${x},${y})">${icons[i]}</g></g>
<text x="${x}" y="${y + 84}" text-anchor="middle" font-size="22" font-weight="700" fill="${C.text}">${i + 1}. ${esc(t.flow[i][0])}</text>
<text x="${x}" y="${y + 110}" text-anchor="middle" font-size="15" fill="${C.text2}">${esc(t.flow[i][1])}</text>
</g>`).join('\n')}`;
  return svg(W, H, t.flow.map((f) => f[0]).join(' → '), css, body);
}

// ------------------------------------------------------------------ privacy filter
function privacy(t) {
  const W = 1280;
  const H = 210;
  const stream = ['h', 'i', 'Ctrl+C', 'p', 'w', 'Ctrl+V', '1', '2', 'F5', 'x'];
  const dur = 8;
  const gate = 700;
  const css = `
.it{animation:move ${dur}s linear infinite}
@keyframes move{from{transform:translateX(0)}to{transform:translateX(${W - 120}px)}}
.typed{animation:typed ${dur}s linear infinite}
@keyframes typed{0%,${((gate - 60) / (W - 120) * 100).toFixed(1)}%{opacity:1;transform:translateY(0)}${((gate) / (W - 120) * 100).toFixed(1)}%,100%{opacity:0;transform:translateY(26px)}}
.gate{animation:gate 1.4s ease-in-out infinite alternate}
@keyframes gate{from{opacity:0.55}to{opacity:1}}`;
  const items = stream.map((s, i) => {
    const kc = keycap(0, 0, s, { size: 17, face: s.length > 2 ? '#2f6fd6' : '#2a2d33' });
    const delay = -(i * (dur / stream.length));
    const isTyped = s.length === 1;
    return `<g class="it" style="animation-delay:${delay}s"><g class="${isTyped ? 'typed' : ''}" style="animation-delay:${delay}s"><g transform="translate(40,${84})">${kc.s}</g></g></g>`;
  });
  const body = `
<rect width="${W}" height="${H}" rx="22" fill="${C.surface}" stroke="rgba(255,255,255,0.08)"/>
<clipPath id="pc"><rect x="20" y="60" width="${W - 40}" height="90"/></clipPath>
<text x="40" y="44" font-size="22" font-weight="700" fill="${C.text}">${esc(t.privacy[0])}</text>
<text x="${W - 40}" y="44" text-anchor="end" font-size="15" fill="${C.text2}">${esc(t.privacy[1])}</text>
<g clip-path="url(#pc)">${items.join('\n')}</g>
<g class="gate"><rect x="${gate}" y="64" width="6" height="86" rx="3" fill="${C.ok}"/>
<rect x="${gate - 40}" y="60" width="86" height="94" rx="10" fill="rgba(76,195,138,0.07)" stroke="rgba(76,195,138,0.35)"/></g>
<text x="${gate - 60}" y="182" text-anchor="end" font-size="14" fill="${C.text3}">${esc(t.typed)} →</text>
<text x="${gate + 66}" y="182" font-size="14" fill="${C.ok}">→ ${esc(t.kept)}</text>`;
  return svg(W, H, t.privacy.join(' — '), css, body);
}

// ------------------------------------------------------------------ size chart
function sizes(t) {
  const W = 1280;
  const H = 250;
  // Windows installer and installed folder, measured for each release (v2.0.0: 108 MB and 363 MB).
  const rows = [[t.size[1], 142, 108], [t.size[2], 529, 363]];
  const max = 560;
  const x0 = 220;
  const bw = W - x0 - 140;
  const css = `
.bar{transform-origin:${x0}px 0;animation:grow 1.6s ${EASE} both}
.d1{animation-delay:0.25s}.d2{animation-delay:0.5s}.d3{animation-delay:0.75s}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.lab{animation:fade 0.8s ease both}
.l0{animation-delay:1.1s}.l1{animation-delay:1.35s}.l2{animation-delay:1.6s}.l3{animation-delay:1.85s}
@keyframes fade{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}`;
  let k = 0;
  const body = `
<rect width="${W}" height="${H}" rx="22" fill="${C.surface}" stroke="rgba(255,255,255,0.08)"/>
<text x="40" y="48" font-size="22" font-weight="700" fill="${C.text}">${esc(t.size[0])}</text>
<g font-size="13" fill="${C.text3}"><rect x="${W - 260}" y="34" width="12" height="12" rx="3" fill="rgba(255,255,255,0.22)"/><text x="${W - 242}" y="45">v1.1</text>
<rect x="${W - 180}" y="34" width="12" height="12" rx="3" fill="${C.accent}"/><text x="${W - 162}" y="45">v2.0</text></g>
${rows.map((r, i) => {
    const y = 84 + i * 80;
    const a = (r[1] / max) * bw;
    const b = (r[2] / max) * bw;
    const out = `<text x="40" y="${y + 26}" font-size="17" fill="${C.text2}">${esc(r[0])}</text>
<rect class="bar d${k}" x="${x0}" y="${y}" width="${a}" height="22" rx="6" fill="rgba(255,255,255,0.16)"/>
<text class="lab l${k++}" x="${x0 + a + 12}" y="${y + 17}" font-size="15" fill="${C.text3}">${r[1]} ${t.size[3]}</text>
<rect class="bar d${k}" x="${x0}" y="${y + 28}" width="${b}" height="22" rx="6" fill="${C.accent}"/>
<text class="lab l${k++}" x="${x0 + b + 12}" y="${y + 45}" font-size="15" font-weight="700" fill="${C.text}">${r[2]} ${t.size[3]}  <tspan fill="${C.ok}">−${Math.round((1 - r[2] / r[1]) * 100)}%</tspan></text>`;
    return out;
  }).join('\n')}`;
  return svg(W, H, t.size[0], css, body);
}

module.exports = { L };
if (require.main === module) {
fs.mkdirSync(OUT, { recursive: true });
for (const [lang, t] of Object.entries(L)) {
  const files = {
    hero: hero(t), keys: cardKeys(t), zoom: cardZoom(t), subtitles: cardSubs(t), pointer: cardPointer(t),
    flow: flow(t), privacy: privacy(t), size: sizes(t),
  };
  for (const [name, s] of Object.entries(files)) fs.writeFileSync(path.join(OUT, `${name}.${lang}.svg`), s);
}
console.log(`Wrote ${Object.keys(L).length * 8} pictures to docs/readme`);
}
