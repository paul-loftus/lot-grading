/** Machine-local file information, deliberately separate from the portable Project model. */
export interface FileState {
  libraryPath: string | null;
  workingPath: string | null;
  status: 'library' | 'saved' | 'modified' | 'missing' | 'conflict';
  detail?: string;
}
export interface RecentFile {
  key: string;
  projectId: string;
  name: string;
  path: string;
  openedAt: string;
  available: boolean;
}
export interface RevisionInfo {
  key: string;
  projectId: string;
  name: string;
  savedAt: string;
  reason: string;
  objectCount: number;
}
