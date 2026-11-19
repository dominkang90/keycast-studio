// Starts the packaged app (release/KeyCast Studio-win32-x64). Used by "npm run start:packaged",
// for computers where "npm start" (electron .) does not open a window.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const exe = path.join(__dirname, '..', 'release', 'KeyCast Studio-win32-x64', 'KeyCast Studio.exe');
if (!fs.existsSync(exe)) {
  console.error('Packaged app not found. Run "npm run build" first.');
  process.exit(1);
}
spawn(exe, process.argv.slice(2), { detached: true, stdio: 'ignore' }).unref();
