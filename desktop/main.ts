import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import path from 'node:path';
import { exportDxf } from '../src/core/dxf';
import { fileStem, serializeProject, validateProject } from '../src/core/project';
import type { Project } from '../src/core/types';
import { FileStore } from './files';

let files: FileStore;

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
    return files.listProjects();
  });
  ipcMain.handle('projects:save', async (event, project: unknown) => {
    trusted(event);
    await files.saveLibrary(validateProject(project));
  });
  ipcMain.handle('projects:delete', async (event, id: unknown) => {
    trusted(event);
    if (typeof id !== 'string') throw new Error('Invalid project ID.');
    await files.deleteLibrary(id);
  });
  ipcMain.handle('projects:open', async (event, id: string) => {
    trusted(event);
    return files.openLibrary(id);
  });
  ipcMain.handle('files:open', async (event) => {
    trusted(event);
    const result = await dialog.showOpenDialog(window!, {
      title: 'Open LotGrade project',
      properties: ['openFile'],
      filters: [{ name: 'LotGrade project', extensions: ['lotgrade', 'json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return files.openFile(result.filePaths[0]);
  });
  async function saveDialog(
    project: unknown,
    kind: 'project' | 'copy' | 'dxf',
  ): Promise<string | null> {
    const valid = validateProject(project);
    const contents = kind === 'dxf' ? exportDxf(valid) : serializeProject(valid);
    const extension = kind === 'dxf' ? 'dxf' : 'lotgrade';
    const folder = await files.defaultFolder(kind === 'dxf' ? 'dxf' : 'project');
    const result = await dialog.showSaveDialog(window!, {
      title:
        kind === 'dxf'
          ? 'Export for Civil 3D'
          : kind === 'copy'
            ? 'Save project copy'
            : 'Save project as',
      defaultPath: path.join(
        folder ?? app.getPath('documents'),
        fileStem(valid.name) + '.' + extension,
      ),
      filters: [
        {
          name: kind === 'dxf' ? 'AutoCAD / Civil 3D DXF' : 'LotGrade project',
          extensions: [extension],
        },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    const destination = path.extname(result.filePath)
      ? result.filePath
      : result.filePath + '.' + extension;
    if (kind === 'dxf' && path.extname(destination).toLowerCase() !== '.dxf')
      throw new Error('Choose a .dxf filename for DXF export.');
    if (kind !== 'dxf' && !['.lotgrade', '.json'].includes(path.extname(destination).toLowerCase()))
      throw new Error('Choose a .lotgrade filename for the project.');
    if (kind === 'dxf') {
      await files.exportFile(destination, contents);
      await files.rememberExport(destination);
    } else await files.saveAs(valid, destination, kind === 'copy');
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
  ipcMain.handle('files:copy', async (event, project: Project) => {
    trusted(event);
    return saveDialog(project, 'copy');
  });
  ipcMain.handle('files:save-working', async (event, project: Project) => {
    trusted(event);
    await files.saveWorking(project);
  });
  ipcMain.handle('files:state', async (event, project: Project) => {
    trusted(event);
    return files.state(project);
  });
  ipcMain.handle('files:reveal', async (event, id: string) => {
    trusted(event);
    shell.showItemInFolder(await files.location(id));
  });
  ipcMain.handle('files:relink', async (event, project: Project) => {
    trusted(event);
    validateProject(project);
    const result = await dialog.showOpenDialog(window!, {
      title: 'Locate the last saved working file',
      properties: ['openFile'],
      filters: [{ name: 'LotGrade project', extensions: ['lotgrade', 'json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return false;
    await files.relink(project, result.filePaths[0]);
    return true;
  });
  ipcMain.handle('files:recent', async (event) => {
    trusted(event);
    return files.recent();
  });
  ipcMain.handle('files:open-recent', async (event, key: string) => {
    trusted(event);
    return files.openFile(await files.recentPath(key));
  });
  ipcMain.handle('revisions:list', async (event, id?: string) => {
    trusted(event);
    return files.revisions(id);
  });
  ipcMain.handle('revisions:create', async (event, project: Project) => {
    trusted(event);
    await files.checkpoint(validateProject(project));
  });
  ipcMain.handle('revisions:recover', async (event, key: string) => {
    trusted(event);
    return files.recover(key);
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
  files = new FileStore(app.getPath('userData'));
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
            label: 'Save As…',
            accelerator: 'CmdOrCtrl+Shift+S',
            click: () => send('save-as'),
          },
          { label: 'Save a Copy…', click: () => send('save-copy') },
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
