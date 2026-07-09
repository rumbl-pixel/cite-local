import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';

let server;

if (process.env.CITELOCAL_SMOKE_TEST === '1') {
  app.commandLine.appendSwitch('disable-gpu');
}

async function createWindow() {
  process.env.CITELOCAL_DATA_DIR = join(app.getPath('userData'), 'data');
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
    title: 'CiteLocal',
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

app.on('window-all-closed', () => {
  server?.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
