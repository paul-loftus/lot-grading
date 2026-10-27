import { exportDxf } from './core/dxf';
import { fileStem, parseProject, serializeProject, validateProject } from './core/project';
import type { Project } from './core/types';

export interface DesktopAPI {
  listProjects(): Promise<Project[]>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  openProjectFile(): Promise<Project | null>;
  saveProjectFile(project: Project): Promise<string | null>;
  exportDxf(project: Project): Promise<string | null>;
  closeWindow(): Promise<void>;
  onMenuAction(callback: (action: string) => void): () => void;
}
declare global {
  interface Window {
    lotgrade?: DesktopAPI;
  }
}

const STORE = 'lotgrade.projects.v1';
function readLibrary(): Project[] {
  const contents = localStorage.getItem(STORE);
  if (!contents) return [];
  try {
    const raw: unknown = JSON.parse(contents);
    if (!Array.isArray(raw)) throw new Error('Invalid project library.');
    return raw.map(validateProject);
  } catch {
    // Preserve the original bytes before recovering an otherwise unusable store.
    localStorage.setItem(STORE + '.recovery.' + Date.now(), contents);
    localStorage.removeItem(STORE);
    throw new Error(
      'The browser library could not be read. A recovery copy was preserved in browser storage. Import a saved .lotgrade project to continue.',
    );
  }
}
function download(contents: string, filename: string, type: string): string {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
export const platform: DesktopAPI = window.lotgrade ?? {
  async listProjects() {
    return readLibrary();
  },
  async saveProject(project) {
    const valid = validateProject(project);
    const projects = readLibrary();
    const index = projects.findIndex((p) => p.id === valid.id);
    if (index >= 0) projects[index] = valid;
    else projects.push(valid);
    localStorage.setItem(STORE, JSON.stringify(projects));
  },
  async deleteProject(id) {
    localStorage.setItem(STORE, JSON.stringify(readLibrary().filter((p) => p.id !== id)));
  },
  async openProjectFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.lotgrade,application/json';
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.addEventListener(
        'change',
        async () => {
          try {
            const file = input.files?.[0];
            resolve(file ? parseProject(await file.text()) : null);
          } catch (error) {
            reject(error);
          }
        },
        { once: true },
      );
      input.click();
    });
  },
  async saveProjectFile(project) {
    return download(
      serializeProject(project),
      fileStem(project.name) + '.lotgrade',
      'application/json',
    );
  },
  async exportDxf(project) {
    return download(exportDxf(project), fileStem(project.name) + '.dxf', 'application/dxf');
  },
  async closeWindow() {},
  onMenuAction() {
    return () => {};
  },
};

export const isDesktop = Boolean(window.lotgrade);
