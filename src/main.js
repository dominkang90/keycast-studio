// KeyCast Studio renderer entry point. The screens live in ./ui/ (see docs/ARCHITECTURE.md).

import { platform } from './lib/platform.js';
import { T } from './lib/i18n.js';
import { state } from './ui/state.js';
import { showHome } from './ui/home.js';
// imported for what they set up when loaded: recorder commands, dialog focus handling, self-test hook
import './ui/recording.js';
import './ui/dialogs.js';
import './ui/selftest.js';

document.title = T('KeyCast Studio — 키 표시·자막 화면 녹화');

// Closing the window right after an edit must not lose it.
window.addEventListener('beforeunload', () => {
  const ed = state.editor;
  if (ed?.dirty) { ed.dirty = false; platform.saveProject(ed.project).catch(() => {}); }
});

export function launchStudio() { return showHome(); }
