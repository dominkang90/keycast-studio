// Line icons drawn for this app (24px grid, 1.75px stroke). Emoji are not used as icons:
// they render differently on every system and fight with the rest of the interface.

const PATHS = {
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8"/><path d="M12 17h.01"/>',
  mouse: '<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 7v4"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.7-.5-1.2 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><path d="M7.5 12h.01M9.5 7.5h.01M14.5 7.5h.01"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>',
  zoom: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M11 8.5v5M8.5 11h5"/>',
  captions: '<path d="M20 5H4v11h4v3.5l4.5-3.5H20z"/><path d="M8 9.5h8M8 12.5h5"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z"/>',
  folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2.5h8.5A1.5 1.5 0 0 1 21 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4M4 4v3.5h3.5M4 13a8 8 0 0 0 14.5 4M20 20v-3.5h-3.5"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="3"/>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15.5l-5-5-8.5 8.5"/>',
  scissors: '<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="M8.6 8.5L20 17M8.6 15.5L20 7"/>',
  pen: '<path d="M4 20l1-4.5L16.5 4a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M14.5 6l3.5 3.5"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  volume: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  fast: '<path d="M4 6.5v11l8-5.5zM12.5 6.5v11l8-5.5z"/>',
  music: '<path d="M9.5 17.5V6l10-2v11.5"/><circle cx="7" cy="17.5" r="2.5"/><circle cx="17" cy="15.5" r="2.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  undo: '<path d="M8 5L4 9l4 4"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="M16 5l4 4-4 4"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  download: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14"/>',
  upload: '<path d="M12 16V5M7.5 9L12 4.5 16.5 9M5 20h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z"/>',
  spark: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  record: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  mute: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  camera: '<rect x="3" y="6.5" width="13" height="11" rx="2"/><path d="M16 10.5l5-3v9l-5-3z"/>',
  puzzle: '<path d="M9 4.5a2 2 0 0 1 4 0V6h4.5v4.5H19a2 2 0 0 1 0 4h-1.5V19H13v-1.5a2 2 0 0 0-4 0V19H4.5v-4.5H6a2 2 0 0 0 0-4H4.5V6H9z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5"/>',
};

// The marks that used to stand in for icons, and the icon each one becomes.
const MARKS = {
  '❓': 'help', '🖱': 'mouse', '🖥': 'monitor', '🎨': 'palette', '⌨': 'keyboard', '🔍': 'zoom', '💬': 'captions',
  '🎬': 'film', '📁': 'folder', '📂': 'folder', '⏱': 'clock', '↻': 'refresh', '■': 'stop', '▶': 'play', '❚❚': 'pause',
  '🖼': 'image', '✂': 'scissors', '✏': 'pen', '🙂': 'user', '🔊': 'volume', '⏩': 'fast', '♪': 'music', '🎙': 'mic',
  '✅': 'check', '←': 'back', '↶': 'undo', '↷': 'redo', '⤓': 'download', '⤒': 'upload', '✕': 'x',
  '🎓': 'book', '🚀': 'spark', '⏺': 'record', '👁': 'eye', '🔇': 'mute', '📷': 'camera', '⚙': 'gear', '🧩': 'puzzle',
};
const MARK_RE = new RegExp(`^(${Object.keys(MARKS).sort((a, b) => b.length - a.length).join('|')})\\uFE0F?(?: +(.+))?$`, 's');

export function icon(name) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
  return span;
}

/** Text that begins with one of the old marks becomes [icon, text]; anything else is returned as it is. */
export function withIcon(text) {
  const m = MARK_RE.exec(text);
  if (!m) return [text];
  return m[2] ? [icon(MARKS[m[1]]), m[2]] : [icon(MARKS[m[1]])];
}

/** Replace what a button shows, turning a leading mark into an icon. */
export function setLabel(el, text) {
  el.replaceChildren(...withIcon(text).map((c) => (c instanceof Node ? c : document.createTextNode(c))));
}
