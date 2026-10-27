import { contextBridge, ipcRenderer } from 'electron';
import type { Project } from '../src/core/types';

contextBridge.exposeInMainWorld('lotgrade', {
  listProjects: () => ipcRenderer.invoke('projects:list'),
  saveProject: (project: Project) => ipcRenderer.invoke('projects:save', project),
  deleteProject: (id: string) => ipcRenderer.invoke('projects:delete', id),
  openProjectFile: () => ipcRenderer.invoke('files:open'),
  saveProjectFile: (project: Project) => ipcRenderer.invoke('files:save', project),
  exportDxf: (project: Project) => ipcRenderer.invoke('files:export', project),
  closeWindow: () => ipcRenderer.invoke('app:close'),
  onMenuAction: (callback: (action: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('menu:action', listener);
    return () => ipcRenderer.removeListener('menu:action', listener);
  },
});
