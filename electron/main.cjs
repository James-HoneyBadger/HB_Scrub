'use strict';

const { app, BrowserWindow, shell, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = 3777;
let mainWindow = null;
let guiServer = null;

// ─── Start the GUI HTTP server as a child process ────────────────────────────

function startServer() {
  const serverScript = path.join(__dirname, '..', 'dist', 'hb-scrub.gui.js');
  guiServer = spawn(process.execPath, [serverScript], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  guiServer.stdout.on('data', (d) => process.stdout.write(d));
  guiServer.stderr.on('data', (d) => process.stderr.write(d));

  guiServer.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`GUI server exited with code ${code}`);
    }
  });
}

// ─── Wait for the server to be ready ────────────────────────────────────────

function waitForServer(retries = 30, delay = 200) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (retries-- > 0) {
          setTimeout(attempt, delay);
        } else {
          reject(new Error('GUI server did not start in time'));
        }
      });
      req.setTimeout(500, () => req.destroy());
    };
    attempt();
  });
}

// ─── Create the main window ──────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    title: 'HB Scrub — Metadata Remover',
    backgroundColor: '#0f1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}/`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in the default browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // ─── Menu ──────────────────────────────────────────────────────────────────
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer();
  } catch (err) {
    console.error(err);
    app.quit();
    return;
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await waitForServer();
    createWindow();
  }
});

app.on('will-quit', () => {
  if (guiServer) {
    guiServer.kill();
    guiServer = null;
  }
});
