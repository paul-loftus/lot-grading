import { contextBridge, ipcRenderer } from 'electron';
import type { Project } from '../src/core/types';

contextBridge.exposeInMainWorld('lotgrade', {
  listProjects: () => ipcRenderer.invoke('projects:list'),
  openLibraryProject: (id: string) => ipcRenderer.invoke('projects:open', id),
  saveProject: (project: Project) => ipcRenderer.invoke('projects:save', project),
  deleteProject: (id: string) => ipcRenderer.invoke('projects:delete', id),
  openProjectFile: () => ipcRenderer.invoke('files:open'),
  saveProjectFile: (project: Project) => ipcRenderer.invoke('files:save', project),
  saveProjectCopy: (project: Project) => ipcRenderer.invoke('files:copy', project),
  saveWorkingFile: (project: Project) => ipcRenderer.invoke('files:save-working', project),
  getFileState: (project: Project) => ipcRenderer.invoke('files:state', project),
  revealProjectFile: (id: string) => ipcRenderer.invoke('files:reveal', id),
  relinkProjectFile: (project: Project) => ipcRenderer.invoke('files:relink', project),
  listRecentFiles: () => ipcRenderer.invoke('files:recent'),
  openRecentFile: (key: string) => ipcRenderer.invoke('files:open-recent', key),
  listRevisions: (id?: string) => ipcRenderer.invoke('revisions:list', id),
  createCheckpoint: (project: Project) => ipcRenderer.invoke('revisions:create', project),
  recoverRevision: (key: string) => ipcRenderer.invoke('revisions:recover', key),
  exportDxf: (project: Project) => ipcRenderer.invoke('files:export', project),
  closeWindow: () => ipcRenderer.invoke('app:close'),
  onMenuAction: (callback: (action: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('menu:action', listener);
    return () => ipcRenderer.removeListener('menu:action', listener);
  },
});
