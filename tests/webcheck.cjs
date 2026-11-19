// Opens the one-file browser version from disk (file://) in a plain Chromium window,
// records console output and errors, and saves a screenshot. Usage: electron tests/webcheck.cjs
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const out = path.join(__dirname, 'out-web');
fs.mkdirSync(out, { recursive: true });
const log = [];

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1366, height: 820, show: false });
  win.webContents.on('console-message', (_e, level, message) => log.push(`[${level}] ${message}`));
  win.webContents.on('render-process-gone', (_e, d) => log.push(`gone ${d.reason}`));
  win.loadURL(pathToFileURL(path.join(__dirname, '..', 'web', 'index.html')).href);
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      const info = await win.webContents.executeJavaScript(`({
        title: document.title,
        cards: document.querySelectorAll('.feature').length,
        recordButton: !!document.querySelector('.btn.rec'),
        banner: document.querySelector('.banner')?.textContent || '',
        text: document.body.innerText.slice(0, 200)
      })`);
      log.push(`INFO ${JSON.stringify(info)}`);
      fs.writeFileSync(path.join(out, 'web.png'), (await win.webContents.capturePage()).toPNG());
      fs.writeFileSync(path.join(out, 'web.log'), log.join('\n'));
      app.exit(0);
    }, 2500);
  });
});
