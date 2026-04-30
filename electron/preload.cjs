'use strict';
// Electron contextBridge preload — exposes a safe API to the renderer (web page)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Open a native file-picker dialog; resolves to [{name, data}] (base64 data) */
  openFiles: () => ipcRenderer.invoke('open-files'),

  /**
   * Register a callback that fires when the watch-folder feature pushes a file.
   * Returns an unsubscribe function so callers can clean up the listener.
   */
  onWatchFile: (cb) => {
    const handler = (_event, file) => cb(file);
    ipcRenderer.on('watch-file', handler);
    return () => ipcRenderer.removeListener('watch-file', handler);
  },

  /** Register a callback for files supplied on the command line at startup. */
  onInitialFiles: (cb) => {
    const handler = (_event, files) => cb(files);
    ipcRenderer.once('initial-files', handler);
    return () => ipcRenderer.removeListener('initial-files', handler);
  },

  /** Remove all watch-file event listeners. */
  offWatchFile: () => ipcRenderer.removeAllListeners('watch-file'),
});
