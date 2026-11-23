const { contextBridge, ipcRenderer } = require('electron');

function on(channel, fn) {
  const handler = (_e, ...args) => fn(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('keycast', {
  info: () => ipcRenderer.invoke('app:info'),
  listSources: () => ipcRenderer.invoke('sources:list'),
  prepareCapture: (opts) => ipcRenderer.invoke('capture:prepare', opts),
  beginRecording: (opts) => ipcRenderer.invoke('recording:begin', opts),
  endRecording: () => ipcRenderer.invoke('recording:end'),
  toolbarAction: (action) => ipcRenderer.send('toolbar:action', action),
  sendStatus: (status) => ipcRenderer.send('recorder:status', status),
  onCommand: (fn) => on('recorder:command', fn),
  onStatus: (fn) => on('recorder:status', fn),
  onLiveInput: (fn) => on('live:input', fn),
  onKeysVisible: (fn) => on('keys:visible', fn),
  createProject: () => ipcRenderer.invoke('project:create'),
  saveProject: (p) => ipcRenderer.invoke('project:save', p),
  loadProject: (id) => ipcRenderer.invoke('project:load', id),
  listProjects: () => ipcRenderer.invoke('project:list'),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),
  openFile: (opts) => ipcRenderer.invoke('file:open', opts),
  writeFile: (handle, data) => ipcRenderer.invoke('file:write', handle, data),
  closeFile: (handle, opts) => ipcRenderer.invoke('file:close', handle, opts),
  abortFile: (handle) => ipcRenderer.invoke('file:abort', handle),
  writeText: (file, text) => ipcRenderer.invoke('file:writeText', file, text),
  saveDialog: (opts) => ipcRenderer.invoke('dialog:save', opts),
  reveal: (file) => ipcRenderer.invoke('shell:reveal', file),
  openRecordingsFolder: () => ipcRenderer.invoke('shell:openFolder'),
  openHelp: () => ipcRenderer.invoke('shell:openHelp'),
  askAccess: () => ipcRenderer.invoke('access:ask'),
  captureStart: (opts) => ipcRenderer.invoke('capture:start', opts),
  captureStop: () => ipcRenderer.invoke('capture:stop'),
  captureAbort: () => ipcRenderer.invoke('capture:abort'),
  captureFinish: (opts) => ipcRenderer.invoke('capture:finish', opts),
  importProject: () => ipcRenderer.invoke('project:import'),
  importAsset: (opts) => ipcRenderer.invoke('asset:import', opts),
  listWallpapers: () => ipcRenderer.invoke('wallpapers:list'),
  listExtensions: () => ipcRenderer.invoke('extensions:list'),
  openExtensions: () => ipcRenderer.invoke('extensions:open'),
  addExampleExtension: (text) => ipcRenderer.invoke('extensions:example', text),
  openWallpapers: () => ipcRenderer.invoke('wallpapers:open'),
  toggleKeys: (opts) => ipcRenderer.invoke('keys:toggle', opts),
  keysState: () => ipcRenderer.invoke('keys:state'),
  onKeysState: (fn) => on('keys:state', fn),
  selftestShot: (name) => ipcRenderer.invoke('selftest:shot', name),
  selftestPath: (name) => ipcRenderer.invoke('selftest:path', name),
});
