import { startSplash, startupLanguage } from './splash.js';

const lang = startupLanguage();
document.documentElement.lang = lang;
const boot = startSplash({
  splash: document.getElementById('kc-boot'), app: document.getElementById('app'), lang,
  retry: () => window.location.reload(),
});
import('../main.js')
  .then(({ launchStudio }) => { window.dispatchEvent(new CustomEvent('kc-stage', { detail: 0.35 })); return launchStudio(); })
  .then(boot.ready)
  .catch((error) => {
    console.error('KeyCast Studio startup:', error);
    boot.fail();
  });
