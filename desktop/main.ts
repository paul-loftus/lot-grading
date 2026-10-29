import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exportDxf } from '../src/core/dxf';
import {
  fileStem,
  MAX_PROJECT_BYTES,
  parseProject,
  serializeProject,
  validateProject,
} from '../src/core/project';
import type { Project } from '../src/core/types';

let window: BrowserWindow | null = null;
let mayClose = false;
let quitRequested = false;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
function clearCloseTimer(): void {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;
}
function requestClose(): void {
  if (!window || closeTimer) return;
  send('close');
  closeTimer = setTimeout(() => {
    closeTimer = null;
    if (!window || window.isDestroyed() || mayClose) return;
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      title: 'Finish saving your work',
      message: 'LotGrade has not finished saving.',
      detail:
        'You can try again, keep the workspace open, or close without saving the latest changes. Previously saved project files are kept.',
      buttons: ['Keep open', 'Try saving again', 'Close without saving'],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) requestClose();
    if (choice === 2) {
      mayClose = true;
      if (quitRequested) app.quit();
      else window?.close();
    }
  }, 7000);
}
const libraryPath = () => path.join(app.getPath('userData'), 'projects');
function projectPath(id: unknown): string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))
    throw new Error('Invalid project ID.');
  return path.join(libraryPath(), id + '.lotgrade');
}
async function atomicWrite(filename: string, contents: string): Promise<void> {
  const temp = filename + '.' + crypto.randomUUID() + '.tmp';
  try {
    await writeFile(temp, contents, { encoding: 'utf8', flag: 'wx' });
    await rename(temp, filename);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
function trusted(event: Electron.IpcMainInvokeEvent): void {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw new Error('Untrusted file request.');
}
function registerIPC(): void {
  ipcMain.handle('projects:list', async (event) => {
    trusted(event);
    await mkdir(libraryPath(), { recursive: true });
    const files = (await readdir(libraryPath())).filter((file) => file.endsWith('.lotgrade'));
    return Promise.all(
      files.map(async (file) => {
        const location = path.join(libraryPath(), file);
        if ((await stat(location)).size > MAX_PROJECT_BYTES)
          throw new Error(`Project ${file} exceeds the file-size limit.`);
        return parseProject(await readFile(location, 'utf8'));
      }),
    );
  });
  ipcMain.handle('projects:save', async (event, project: unknown) => {
    trusted(event);
    const valid = validateProject(project);
    const contents = serializeProject(valid);
    if (Buffer.byteLength(contents, 'utf8') > MAX_PROJECT_BYTES)
      throw new Error('This project exceeds the 20 MB file-size limit.');
    await mkdir(libraryPath(), { recursive: true });
    await atomicWrite(projectPath(valid.id), contents);
  });
  ipcMain.handle('projects:delete', async (event, id: unknown) => {
    trusted(event);
    await unlink(projectPath(id));
  });
  ipcMain.handle('files:open', async (event) => {
    trusted(event);
    const result = await dialog.showOpenDialog(window!, {
      title: 'Open LotGrade project',
      properties: ['openFile'],
      filters: [{ name: 'LotGrade project', extensions: ['lotgrade', 'json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    if ((await stat(result.filePaths[0])).size > MAX_PROJECT_BYTES)
      throw new Error('This project exceeds the 20 MB file-size limit.');
    return parseProject(await readFile(result.filePaths[0], 'utf8'));
  });
  async function saveDialog(project: unknown, kind: 'project' | 'dxf'): Promise<string | null> {
    const valid = validateProject(project);
    const contents = kind === 'project' ? serializeProject(valid) : exportDxf(valid);
    const extension = kind === 'project' ? 'lotgrade' : 'dxf';
    const result = await dialog.showSaveDialog(window!, {
      title: kind === 'project' ? 'Save project copy' : 'Export for Civil 3D',
      defaultPath: fileStem(valid.name) + '.' + extension,
      filters: [
        {
          name: kind === 'project' ? 'LotGrade project' : 'AutoCAD / Civil 3D DXF',
          extensions: [extension],
        },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    const destination = path.extname(result.filePath)
      ? result.filePath
      : result.filePath + '.' + extension;
    await atomicWrite(destination, contents);
    return destination;
  }
  ipcMain.handle('files:save', async (event, project: Project) => {
    trusted(event);
    return saveDialog(project, 'project');
  });
  ipcMain.handle('files:export', async (event, project: Project) => {
    trusted(event);
    return saveDialog(project, 'dxf');
  });
  ipcMain.handle('app:close', (event) => {
    trusted(event);
    clearCloseTimer();
    mayClose = true;
    if (quitRequested) app.quit();
    else window?.close();
  });
}
function createWindow(): void {
  mayClose = false;
  window = new BrowserWindow({
    title: 'LotGrade',
    width: 1440,
    height: 940,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: '#f7f7f2',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.once('ready-to-show', () => window?.show());
  window.on('close', (event) => {
    if (!mayClose && window && !window.webContents.isDestroyed()) {
      event.preventDefault();
      requestClose();
    }
  });
  void window.loadFile(path.join(__dirname, '../dist/index.html'));
  window.on('closed', () => {
    clearCloseTimer();
    window = null;
  });
}
function send(action: string): void {
  window?.webContents.send('menu:action', action);
}
app.whenReady().then(() => {
  if (process.env.LOTGRADE_USER_DATA) app.setPath('userData', process.env.LOTGRADE_USER_DATA);
  registerIPC();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin'
        ? [
            {
              label: 'LotGrade',
              submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
              ],
            },
          ]
        : []),
      {
        label: 'File',
        submenu: [
          { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
          { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
          { type: 'separator' },
          { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
          {
            label: 'Save Project Copy…',
            accelerator: 'CmdOrCtrl+Shift+S',
            click: () => send('save-as'),
          },
          {
            label: 'Export Civil 3D DXF…',
            accelerator: 'CmdOrCtrl+E',
            click: () => send('export'),
          },
          { type: 'separator' },
          { role: process.platform === 'darwin' ? 'close' : 'quit' },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
          {
            label: 'Redo',
            accelerator: process.platform === 'darwin' ? 'Cmd+Shift+Z' : 'Ctrl+Y',
            click: () => send('redo'),
          },
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
          { role: 'togglefullscreen' },
          ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }]),
        ],
      },
    ]),
  );
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => {
  quitRequested = true;
});
