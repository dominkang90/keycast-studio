// Extensions: folders in <recordings>/_extensions/<folder>/ with an extension.json that adds
// backgrounds, key themes, cursor packs, click effects and subtitle styles. They hold data only,
// never code. Picking an item copies its values into the project, so a project looks the same on
// a computer that does not have the extension. Format: docs/EXTENSIONS.md.

const HEX = /^#[0-9a-f]{6}$/i;
const IMAGE = /^[\w-][\w .-]*\.(png|jpe?g|webp)$/i;
const MAX_ITEMS = 50;

const color = (v, fallback) => (typeof v === 'string' && HEX.test(v) ? v : fallback);
const num = (v, min, max, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
const text = (v, max = 60) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) : '');
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const list = (v) => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);

function background(b, folder) {
  const name = text(b?.name);
  if (!name) return null;
  if (typeof b.image === 'string') {
    // Only a picture inside the extension's own folder.
    return IMAGE.test(b.image) ? { name, kind: 'image', image: `/_extensions/${folder}/${b.image}` } : null;
  }
  if (Array.isArray(b.gradient)) {
    const stops = b.gradient.map((c) => color(c, null)).filter(Boolean).slice(0, 6);
    return stops.length >= 2 ? { name, kind: 'gradient', stops, angle: num(b.angle, 0, 360, 135) } : null;
  }
  if (Array.isArray(b.blobs)) {
    const blobs = b.blobs.slice(0, 8)
      .filter((x) => Array.isArray(x) && x.length === 4 && HEX.test(x[3]))
      .map(([x, y, r, c]) => [num(x, -0.5, 1.5, 0.5), num(y, -0.5, 1.5, 0.5), num(r, 0.05, 1.5, 0.5), c]);
    return blobs.length ? { name, kind: 'blobs', base: color(b.base, '#101014'), blobs } : null;
  }
  return null;
}

function keyTheme(k) {
  const name = text(k?.name);
  if (!name) return null;
  return {
    name,
    custom: {
      capStyle: oneOf(k.capStyle, ['raised', 'flat', 'outline'], 'raised'),
      gradient: !!k.gradient,
      face: color(k.face, '#ffffff'),
      text: color(k.text, '#111827'),
      modHighlight: k.modFace !== undefined,
      modFace: color(k.modFace, '#3a86ff'),
      modText: color(k.modText, '#ffffff'),
      border: k.border !== false,
      borderColor: color(k.borderColor, '#1a1a1a'),
      borderWidth: num(k.borderWidth, 0, 6, 2),
      radius: num(k.radius, 0, 24, 9),
      panel: k.panel !== false,
      panelColor: color(k.panelColor, '#000000'),
      panelOpacity: num(k.panelOpacity, 0, 1, 0.55),
    },
  };
}

function cursorPack(c) {
  const name = text(c?.name);
  if (!name) return null;
  return { name, look: { fill: color(c.fill, '#ffffff'), edge: color(c.edge, '#111111'), width: num(c.width, 0.5, 3, 1.3), glow: color(c.glow, null) } };
}

function clickEffect(c) {
  const name = text(c?.name);
  if (!name) return null;
  return {
    name,
    values: {
      effect: oneOf(c.effect, ['ripple', 'echo', 'spotlight', 'burst'], 'ripple'),
      color: color(c.color, '#ffd33d'),
      clickSize: num(c.size, 0.5, 2.5, 1),
      clickDur: num(c.duration, 0.3, 1.5, 0.65),
      clickOpacity: num(c.opacity, 0.1, 1, 1),
    },
  };
}

function subtitleStyle(s) {
  const name = text(s?.name);
  if (!name) return null;
  return {
    name,
    values: {
      style: oneOf(s.style, ['box', 'outline', 'yellow', 'karaoke', 'pop', 'paper', 'minimal'], 'box'),
      textColor: color(s.textColor, '#ffffff'),
      highlight: color(s.highlight, '#ffd33d'),
      bgOpacity: num(s.bgOpacity, 0, 1, 0.68),
      anim: oneOf(s.anim, ['none', 'fade', 'rise', 'pop'], 'fade'),
      size: num(s.size, 0.6, 1.8, 1),
      position: oneOf(s.position, ['bottom', 'middle', 'top'], 'bottom'),
    },
  };
}

/**
 * Checks one extension.json (already parsed) and keeps only what is valid.
 * @param {string} folder the extension's folder name
 * @returns {{id:string,name:string,version:string,author:string,backgrounds:Array,keyThemes:Array,cursorPacks:Array,clickEffects:Array,subtitleStyles:Array,count:number}}
 */
export function readExtension(folder, json) {
  const id = text(folder, 80);
  const map = (key, fn) => list(json?.[key]).map((x) => fn(x, id)).filter(Boolean);
  const ext = {
    id,
    name: text(json?.name) || id,
    version: text(json?.version, 20),
    author: text(json?.author),
    description: text(json?.description, 200),
    backgrounds: map('backgrounds', background),
    keyThemes: map('keyThemes', keyTheme),
    cursorPacks: map('cursorPacks', cursorPack),
    clickEffects: map('clickEffects', clickEffect),
    subtitleStyles: map('subtitleStyles', subtitleStyle),
  };
  ext.count = ext.backgrounds.length + ext.keyThemes.length + ext.cursorPacks.length + ext.clickEffects.length + ext.subtitleStyles.length;
  return ext;
}

/** Writes a background item into the frame settings of a project. */
export function applyBackground(frame, b) {
  if (b.kind === 'image') { frame.background = 'image'; frame.image = b.image; return; }
  frame.background = 'custom';
  frame.custom = b.kind === 'gradient' ? { kind: 'gradient', stops: [...b.stops], angle: b.angle } : { kind: 'blobs', base: b.base, blobs: b.blobs.map((x) => [...x]) };
}

/** A sample extension, written to the folder by "add the example". */
export const EXAMPLE_EXTENSION = {
  name: 'KeyCast example pack',
  version: '1.0',
  author: 'KeyCast Studio',
  backgrounds: [
    { name: 'Deep sea', gradient: ['#0ea5e9', '#1e3a8a', '#0b1020'], angle: 160 },
    { name: 'Peach', gradient: ['#fde68a', '#fb923c', '#f43f5e'], angle: 120 },
    { name: 'Northern lights', base: '#04121a', blobs: [[0.2, 0.15, 0.7, '#22d3ee'], [0.85, 0.3, 0.6, '#a855f7'], [0.5, 1, 0.7, '#10b981']] },
  ],
  keyThemes: [
    { name: 'Mint', face: '#d1fae5', text: '#064e3b', modFace: '#10b981', modText: '#ffffff', borderColor: '#065f46', borderWidth: 2, radius: 10, capStyle: 'raised', panel: true, panelColor: '#022c22', panelOpacity: 0.5 },
    { name: 'Ink', face: '#111827', text: '#f9fafb', modFace: '#f59e0b', modText: '#111827', border: false, radius: 6, capStyle: 'flat', panel: false },
  ],
  cursorPacks: [
    { name: 'Lime', fill: '#a3e635', edge: '#1a2e05', width: 1.4 },
    { name: 'Glow blue', fill: '#0b1020', edge: '#60a5fa', width: 1.5, glow: '#3b82f6' },
  ],
  clickEffects: [
    { name: 'Soft blue echo', effect: 'echo', color: '#3b82f6', size: 1.2, duration: 0.8, opacity: 0.9 },
    { name: 'Orange burst', effect: 'burst', color: '#fb923c', size: 1.1, duration: 0.5, opacity: 1 },
  ],
  subtitleStyles: [
    { name: 'Big pop', style: 'pop', textColor: '#ffffff', highlight: '#facc15', anim: 'pop', size: 1.25, position: 'bottom' },
    { name: 'Calm paper', style: 'paper', bgOpacity: 0.9, anim: 'fade', size: 1, position: 'bottom' },
  ],
};
