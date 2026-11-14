import { exportDxf } from './core/dxf';
import { fileStem, parseProject, serializeProject, validateProject } from './core/project';
import type { Project } from './core/types';
import type { FileState, RecentFile, RevisionInfo } from './core/files';

export interface DesktopAPI {
  listProjects(): Promise<Project[]>;
  openLibraryProject(id: string): Promise<Project>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  openProjectFile(): Promise<Project | null>;
  saveProjectFile(project: Project): Promise<string | null>;
  saveProjectCopy(project: Project): Promise<string | null>;
  saveWorkingFile(project: Project): Promise<void>;
  getFileState(project: Project): Promise<FileState>;
  revealProjectFile(id: string): Promise<void>;
  relinkProjectFile(project: Project): Promise<boolean>;
  listRecentFiles(): Promise<RecentFile[]>;
  openRecentFile(key: string): Promise<Project>;
  listRevisions(projectId?: string): Promise<RevisionInfo[]>;
  createCheckpoint(project: Project): Promise<void>;
  recoverRevision(key: string): Promise<Project>;
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
const REVISIONS = 'lotgrade.revisions.v1';
type BrowserRevision = RevisionInfo & { project: Project };
function browserRevisions(): BrowserRevision[] {
  const value: unknown = JSON.parse(localStorage.getItem(REVISIONS) ?? '[]');
  if (!Array.isArray(value)) throw new Error('Browser recovery data could not be read.');
  return value;
}
function browserCheckpoint(project: Project, reason: string): void {
  const valid = validateProject(project);
  const revision: BrowserRevision = {
    key: crypto.randomUUID(),
    projectId: valid.id,
    name: valid.name,
    savedAt: new Date().toISOString(),
    reason,
    objectCount:
      valid.entities.length + (valid.references ?? []).reduce((n, s) => n + s.entities.length, 0),
    project: valid,
  };
  let size = 0;
  const counts = new Map<string, number>();
  const retained = [revision, ...browserRevisions()]
    .filter((row) => {
      const bytes = new TextEncoder().encode(JSON.stringify(row)).length;
      if ((counts.get(row.projectId) ?? 0) >= 5 || size + bytes > 2 * 1024 * 1024) return false;
      size += bytes;
      counts.set(row.projectId, (counts.get(row.projectId) ?? 0) + 1);
      return true;
    })
    .slice(0, 10);
  if (!retained.includes(revision))
    throw new Error(
      'This project is too large for browser recovery. Save a portable copy or use desktop recovery.',
    );
  localStorage.setItem(REVISIONS, JSON.stringify(retained));
}
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
  async openLibraryProject(id) {
    const project = readLibrary().find((p) => p.id === id);
    if (!project) throw new Error('The library project is no longer available.');
    return project;
  },
  async saveProject(project) {
    const valid = validateProject(project);
    const projects = readLibrary();
    const index = projects.findIndex((p) => p.id === valid.id);
    if (
      index >= 0 &&
      JSON.stringify({ ...projects[index], view: null, updatedAt: '' }) !==
        JSON.stringify({ ...valid, view: null, updatedAt: '' })
    ) {
      // Small browser previews keep bounded recovery; desktop has a separate disk store.
      if (new TextEncoder().encode(JSON.stringify(projects[index])).length < 1024 * 1024)
        browserCheckpoint(projects[index], 'Before browser library save');
    }
    if (index >= 0) projects[index] = valid;
    else projects.push(valid);
    localStorage.setItem(STORE, JSON.stringify(projects));
  },
  async deleteProject(id) {
    const project = readLibrary().find((p) => p.id === id);
    if (project && new TextEncoder().encode(JSON.stringify(project)).length < 1024 * 1024)
      browserCheckpoint(project, 'Before browser library deletion');
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
  async saveProjectCopy(project) {
    return download(
      serializeProject(project),
      fileStem(project.name) + '.lotgrade',
      'application/json',
    );
  },
  async saveWorkingFile() {},
  async getFileState() {
    return { libraryPath: null, workingPath: null, status: 'library' };
  },
  async revealProjectFile() {
    throw new Error('Folder reveal is available in the desktop app.');
  },
  async relinkProjectFile() {
    throw new Error('Working-file relinking is available in the desktop app.');
  },
  async listRecentFiles() {
    return [];
  },
  async openRecentFile() {
    throw new Error('Recent working files are available in the desktop app.');
  },
  async listRevisions(projectId) {
    return browserRevisions()
      .filter((row) => !projectId || row.projectId === projectId)
      .map(({ project: _project, ...info }) => info);
  },
  async createCheckpoint(project) {
    browserCheckpoint(project, 'Manual checkpoint');
  },
  async recoverRevision(key) {
    const revision = browserRevisions().find((row) => row.key === key);
    if (!revision) throw new Error('The revision is no longer available.');
    const project = validateProject(revision.project),
      now = new Date().toISOString();
    return {
      ...project,
      id: crypto.randomUUID(),
      name: `${project.name.slice(0, 105)} (recovered)`,
      createdAt: now,
      updatedAt: now,
    };
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
