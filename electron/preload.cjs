'use strict';
// Electron contextBridge preload — exposes a safe API to the renderer (web page)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Open a native file-picker dialog; resolves to [{name, data}] (base64 data) */
  openFiles: () => ipcRenderer.invoke('open-files'),

  /** Register a callback that fires when the watch-folder feature pushes a file */
  onWatchFile: (cb) => ipcRenderer.on('watch-file', (_event, file) => cb(file)),
});
