import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';

let server;
let smokeDataDir;

if (process.env.CITELOCAL_SMOKE_TEST === '1') {
  app.commandLine.appendSwitch('disable-gpu');
}

async function createWindow() {
  // Deliberately do NOT set CITELOCAL_DATA_DIR here for normal runs: server.js's
  // own default (computeDefaultDataDir) already resolves to the exact same
  // per-OS user-data path Electron's app.getPath('userData') would give —
  // same app-name folder, same convention. Leaving it unset means the browser
  // dev server, `electron .`, and every packaged build all converge on one
  // identical library file instead of silently forking into separate ones
  // (see the July 2026 "duplicate bibliographies" incident).
  if (process.env.CITELOCAL_SMOKE_TEST === '1') {
    // Exception: smoke tests get an isolated, disposable directory so they
    // never read or write the real user's library.
    smokeDataDir = join(tmpdir(), `citelocal-smoke-${process.pid}`);
    process.env.CITELOCAL_DATA_DIR = smokeDataDir;
  }
  process.env.CITELOCAL_NO_AUTO_START = '1';

  const { startServer } = await import('../server.js');
  server = await startServer(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 4747;

  const win = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: 'Study Toolbelt',
    backgroundColor: '#111820',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await win.loadURL(`http://127.0.0.1:${port}`);

  if (process.env.CITELOCAL_SMOKE_TEST === '1') {
    console.log('CITELOCAL_DESKTOP_READY');
    setTimeout(() => {
      win.close();
      app.quit();
    }, 500);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  server?.close();
  if (smokeDataDir) await rm(smokeDataDir, { recursive: true, force: true });
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
