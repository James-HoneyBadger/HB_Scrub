'use strict';

// ─── Suppress benign Linux/Chromium startup warnings ─────────────────────────
process.noDeprecation = true;                   // suppress url.parse DEP0169
process.env.GTK_MODULES = '';                   // suppress colorreload/window-decorations GTK warnings
process.env.GTK2_RC_FILES = '';

const { app, BrowserWindow, shell, Menu, ipcMain, dialog, Tray, nativeImage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const {
  DEFAULT_PORT,
  isHbScrubServer,
  pickServerPort,
  waitForServer,
} = require('./server-utils.cjs');

// Suppress Chromium GPU/VSync and DBus noise on Linux
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('log-level', '3'); // only fatal errors

let serverPort = DEFAULT_PORT;
let mainWindow = null;
let guiServer = null;
let tray = null;
let watchHandle = null;
let ownsGuiServer = false;
let isQuitting = false;

// ─── Start the GUI HTTP server as a child process ────────────────────────────

function startServer(port) {
  const serverScript = path.join(__dirname, '..', 'dist', 'hb-scrub.gui.js');
  guiServer = spawn(process.execPath, [serverScript], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HB_SCRUB_PORT: String(port) },
  });

  guiServer.stdout.on('data', (d) => process.stdout.write(d));
  guiServer.stderr.on('data', (d) => process.stderr.write(d));

  guiServer.on('exit', (code) => {
    if (ownsGuiServer && code !== 0 && code !== null) {
      console.error(`GUI server exited with code ${code}`);
    }
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
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
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
        {
          label: 'Open Files…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (!mainWindow) return;
            mainWindow.webContents.executeJavaScript('window._electronOpenFiles && window._electronOpenFiles()');
          },
        },
        { type: 'separator' },
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

// ─── IPC: native file picker (#14) ───────────────────────────────────────────

ipcMain.handle('open-files', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Images & Documents',
        extensions: [
          'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg',
          'tiff', 'tif', 'heic', 'heif', 'avif',
          'pdf', 'mp4', 'mov', 'dng', 'raw', 'nef', 'cr2', 'arw',
        ],
      },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (!result.filePaths || result.filePaths.length === 0) return [];
  return Promise.all(
    result.filePaths.map(async (fp) => {
      const buf = await fs.promises.readFile(fp);
      return { name: path.basename(fp), data: buf.toString('base64') };
    })
  );
});

// ─── Watch folder (#15) ───────────────────────────────────────────────────────

function stopWatch() {
  if (watchHandle) {
    watchHandle.close();
    watchHandle = null;
  }
}

const SUPPORTED_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg',
  '.tiff', '.tif', '.heic', '.heif', '.avif',
  '.pdf', '.mp4', '.mov', '.dng', '.raw', '.nef', '.cr2', '.arw',
]);

function startWatch(dir) {
  stopWatch();
  watchHandle = fs.watch(dir, { persistent: false }, async (event, filename) => {
    if (!filename) return;
    const ext = path.extname(filename).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) return;
    const fp = path.join(dir, filename);
    // Debounce — wait briefly for the file write to complete
    setTimeout(async () => {
      try {
        const buf = await fs.promises.readFile(fp);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('watch-file', {
            name: path.basename(fp),
            data: buf.toString('base64'),
          });
        }
      } catch {
        // File may not be accessible yet; silently skip
      }
    }, 400);
  });
}

// ─── System tray (#15) ───────────────────────────────────────────────────────

function updateTrayMenu(watchingDir = null) {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    {
      label: 'Open HB Scrub',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Watch Folder…',
      click: async () => {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        if (!result.filePaths || result.filePaths.length === 0) return;
        const dir = result.filePaths[0];
        startWatch(dir);
        updateTrayMenu(dir);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.executeJavaScript(
            `window._showToast && window._showToast('Watching: ${dir.replace(/'/g, "\\'")}', '')`
          );
        }
      },
    },
    {
      label: watchingDir ? `Stop Watching (${path.basename(watchingDir)})` : 'Stop Watching',
      enabled: watchingDir !== null,
      click: () => {
        stopWatch();
        updateTrayMenu(null);
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  // Use a small inline PNG icon; replace electron/icon.png for a custom icon
  const iconPath = path.join(__dirname, 'icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) icon = nativeImage.createEmpty();
  } catch {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip('HB Scrub — Metadata Remover');
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
  updateTrayMenu(null);
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  serverPort = await pickServerPort(DEFAULT_PORT);
  ownsGuiServer = !(await isHbScrubServer(serverPort));

  if (ownsGuiServer) {
    startServer(serverPort);
  } else {
    console.log(`Reusing an existing HB Scrub service on http://127.0.0.1:${serverPort}/`);
  }

  try {
    await waitForServer(serverPort);
  } catch (err) {
    console.error(err);
    dialog.showErrorBox(
      'HB Scrub startup failed',
      `The desktop app could not reach its local service on port ${serverPort}.`
    );
    app.quit();
    return;
  }

  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') {
    return;
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await waitForServer(serverPort).catch(() => undefined);
    createWindow();
  } else if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  stopWatch();
  if (ownsGuiServer && guiServer) {
    guiServer.kill();
    guiServer = null;
  }
});
