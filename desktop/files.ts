import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import {
  MAX_PROJECT_BYTES,
  parseProject,
  serializeProject,
  validateProject,
} from '../src/core/project';
import type { Project } from '../src/core/types';
import type { FileState, RecentFile, RevisionInfo } from '../src/core/files';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
const designHash = (project: Project) =>
  hash(JSON.stringify({ ...project, view: undefined, updatedAt: undefined }));
interface Association {
  path: string;
  diskHash: string;
  projectHash: string;
}
interface Preferences {
  version: 1;
  associations: Record<string, Association>;
  recent: Omit<RecentFile, 'available'>[];
  projectFolder?: string;
  exportFolder?: string;
}
interface Revision {
  version: 1;
  savedAt: string;
  reason: string;
  project: Project;
}
export const REVISION_LIMIT = 10;
const MAX_REVISION_BYTES = 200 * 1024 * 1024;

async function contents(filename: string): Promise<string | null> {
  try {
    const info = await stat(filename);
    if (!info.isFile() || info.size > MAX_PROJECT_BYTES + 4096)
      throw new Error('The file is not a supported project or exceeds its size limit.');
    const result = await readFile(filename, 'utf8');
    if (Buffer.byteLength(result) > MAX_PROJECT_BYTES + 4096)
      throw new Error('The file exceeds its size limit.');
    return result;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}
async function canonical(filename: string): Promise<string> {
  if (!path.isAbsolute(filename)) throw new Error('Choose an absolute file location.');
  try {
    return await realpath(filename);
  } catch (error) {
    if (!isMissing(error)) throw error;
    return path.join(await realpath(path.dirname(filename)), path.basename(filename));
  }
}

/** Cooperative lock for LotGrade writers. Never remove a lock belonging to a live process. */
async function locked<T>(filename: string, action: () => Promise<T>): Promise<T> {
  const lock = filename + '.lotgrade-lock',
    owner = path.join(lock, 'owner.json');
  try {
    await mkdir(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    let stale = false;
    try {
      const data = JSON.parse(await readFile(owner, 'utf8'));
      if (Number.isSafeInteger(data.pid) && data.pid > 0) {
        try {
          process.kill(data.pid, 0);
        } catch (e) {
          stale = (e as NodeJS.ErrnoException).code === 'ESRCH';
        }
      }
    } catch {
      /* An incomplete or unknown lock is kept. */
    }
    if (!stale)
      throw new Error(
        'Another LotGrade writer is using this file. Retry after it finishes, or save a copy elsewhere.',
      );
    await unlink(owner);
    await rmdir(lock);
    await mkdir(lock);
  }
  const token = randomUUID();
  try {
    await writeFile(owner, JSON.stringify({ pid: process.pid, token }), { flag: 'wx' });
    return await action();
  } finally {
    const data = await readFile(owner, 'utf8')
      .then(JSON.parse)
      .catch(() => null);
    if (data?.token === token) {
      await unlink(owner);
      await rmdir(lock);
    }
  }
}

async function atomicWrite(
  filename: string,
  value: string,
  expected: string | null,
): Promise<void> {
  const temp = filename + '.' + randomUUID() + '.tmp';
  try {
    const handle = await open(temp, 'wx');
    try {
      await handle.writeFile(value, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    const current = await contents(filename);
    if ((current === null ? null : hash(current)) !== expected)
      throw new Error(
        'The file changed before saving. Your work was kept in memory; use Save As or inspect the external version.',
      );
    await rename(temp, filename);
  } finally {
    await unlink(temp).catch(() => {});
  }
}

/** All operations are serialized within one process; file locks coordinate other instances. */
export class FileStore {
  private preferences: Preferences = { version: 1, associations: Object.create(null), recent: [] };
  private dirtyAssociations = new Set<string>();
  private dirtyFolders = new Set<'projectFolder' | 'exportFolder'>();
  private removedRecentPaths = new Set<string>();
  private libraryHashes = new Map<string, string | null>();
  private lastAutoRevision = new Map<string, number>();
  private replaceCorrupt = new Set<string>();
  private tail: Promise<unknown> = Promise.resolve();
  private ready: Promise<void>;
  readonly libraryDirectory: string;
  readonly revisionDirectory: string;
  private preferencesFile: string;
  constructor(readonly root: string) {
    this.libraryDirectory = path.join(root, 'projects');
    this.revisionDirectory = path.join(root, 'revisions');
    this.preferencesFile = path.join(root, 'file-state.json');
    this.ready = this.initialize();
  }
  private async initialize(): Promise<void> {
    await mkdir(this.libraryDirectory, { recursive: true });
    await mkdir(this.revisionDirectory, { recursive: true });
    const raw = await contents(this.preferencesFile);
    if (raw === null) return;
    try {
      const data = JSON.parse(raw) as Preferences;
      if (data.version !== 1 || !data.associations || !Array.isArray(data.recent))
        throw new Error('Invalid local file state.');
      for (const [id, a] of Object.entries(data.associations))
        if (
          !validId(id) ||
          !path.isAbsolute(a.path) ||
          !/^[a-f0-9]{64}$/.test(a.diskHash) ||
          !/^[a-f0-9]{64}$/.test(a.projectHash)
        )
          throw new Error('Invalid file association.');
      for (const r of data.recent)
        if (
          !validId(r.key) ||
          !validId(r.projectId) ||
          !path.isAbsolute(r.path) ||
          typeof r.name !== 'string' ||
          !Number.isFinite(Date.parse(r.openedAt))
        )
          throw new Error('Invalid recent file.');
      this.preferences = {
        ...data,
        associations: Object.assign(Object.create(null), data.associations),
      };
    } catch {
      await writeFile(this.preferencesFile + '.' + randomUUID() + '.recovery', raw, { flag: 'wx' });
      // Keep a copy of invalid preferences, then start without remembered paths.
    }
  }
  private run<T>(action: () => Promise<T>): Promise<T> {
    const next = this.tail
      .catch(() => {})
      .then(async () => {
        await this.ready;
        return action();
      });
    this.tail = next;
    return next;
  }
  private projectPath(id: string): string {
    if (!validId(id)) throw new Error('Invalid project ID.');
    return path.join(this.libraryDirectory, id + '.lotgrade');
  }
  private async isManagedPath(destination: string): Promise<boolean> {
    const folders = await Promise.all([
      realpath(this.libraryDirectory),
      realpath(this.revisionDirectory),
    ]);
    return (
      folders.some(
        (folder) => destination === folder || destination.startsWith(folder + path.sep),
      ) || destination === (await canonical(this.preferencesFile))
    );
  }
  private async persistPreferences(): Promise<void> {
    await locked(this.preferencesFile, async () => {
      const raw = await contents(this.preferencesFile);
      // Merge other projects' preferences without adopting another session's baseline for ours.
      let disk: Preferences | null = null;
      try {
        if (raw) disk = JSON.parse(raw);
      } catch {
        /* Invalid bytes were preserved at initialization. */
      }
      if (
        !disk ||
        disk.version !== 1 ||
        !disk.associations ||
        typeof disk.associations !== 'object' ||
        Array.isArray(disk.associations)
      )
        disk = null;
      const associations = { ...(disk?.associations ?? {}) };
      for (const id of this.dirtyAssociations)
        Object.defineProperty(associations, id, {
          value: this.preferences.associations[id],
          enumerable: true,
          configurable: true,
          writable: true,
        });
      const recent = [
        ...this.preferences.recent,
        ...(Array.isArray(disk?.recent) ? disk.recent : []),
      ].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
      const seen = new Set<string>();
      const value: Preferences = {
        ...this.preferences,
        associations,
        recent: recent
          .filter((entry) => {
            if (seen.has(entry.path) || this.removedRecentPaths.has(entry.path)) return false;
            seen.add(entry.path);
            return true;
          })
          .slice(0, 10),
        projectFolder: this.dirtyFolders.has('projectFolder')
          ? this.preferences.projectFolder
          : (disk?.projectFolder ?? this.preferences.projectFolder),
        exportFolder: this.dirtyFolders.has('exportFolder')
          ? this.preferences.exportFolder
          : (disk?.exportFolder ?? this.preferences.exportFolder),
      };
      await atomicWrite(
        this.preferencesFile,
        JSON.stringify(value, null, 2) + '\n',
        raw === null ? null : hash(raw),
      );
      this.dirtyAssociations.clear();
      this.dirtyFolders.clear();
      this.removedRecentPaths.clear();
    });
  }
  private async associate(project: Project, filename: string, raw: string): Promise<void> {
    this.preferences.associations[project.id] = {
      path: filename,
      diskHash: hash(raw),
      projectHash: hash(serializeProject(project)),
    };
    this.dirtyAssociations.add(project.id);
    this.dirtyFolders.add('projectFolder');
    this.preferences.projectFolder = path.dirname(filename);
    this.preferences.recent = [
      {
        key: randomUUID(),
        projectId: project.id,
        name: project.name,
        path: filename,
        openedAt: new Date().toISOString(),
      },
      ...this.preferences.recent.filter((r) => r.path !== filename),
    ].slice(0, 10);
    await this.persistPreferences();
  }
  private async addRevision(project: Project, reason: string): Promise<void> {
    serializeProject(project);
    const revision: Revision = {
      version: 1,
      savedAt: new Date().toISOString(),
      reason,
      project: validateProject(project),
    };
    await writeFile(
      path.join(this.revisionDirectory, `${Date.now()}-${randomUUID()}.json`),
      JSON.stringify(revision) + '\n',
      { flag: 'wx', flush: true },
    );
    await this.pruneRevisions();
  }
  private async revisionEntries(): Promise<
    { info: RevisionInfo; bytes: number; filename: string }[]
  > {
    const rows: { info: RevisionInfo; bytes: number; filename: string }[] = [];
    for (const name of await readdir(this.revisionDirectory)) {
      if (!/^\d+-[a-zA-Z0-9_-]+\.json$/.test(name)) continue;
      const filename = path.join(this.revisionDirectory, name);
      try {
        const raw = await contents(filename);
        if (!raw) continue;
        const record = JSON.parse(raw) as Revision;
        const project = validateProject(record.project);
        if (
          record.version !== 1 ||
          typeof record.reason !== 'string' ||
          !Number.isFinite(Date.parse(record.savedAt))
        )
          continue;
        rows.push({
          filename,
          bytes: Buffer.byteLength(raw),
          info: {
            key: name.slice(0, -5),
            projectId: project.id,
            name: project.name,
            savedAt: record.savedAt,
            reason: record.reason,
            objectCount:
              project.entities.length +
              (project.references ?? []).reduce(
                (count, source) => count + source.entities.length,
                0,
              ),
          },
        });
      } catch {
        /* Damaged backups remain on disk; never offer them as valid revisions. */
      }
    }
    return rows.sort((a, b) => b.info.key.localeCompare(a.info.key));
  }
  private async pruneRevisions(): Promise<void> {
    const counts = new Map<string, number>();
    let bytes = 0,
      total = 0;
    for (const row of await this.revisionEntries()) {
      const count = (counts.get(row.info.projectId) ?? 0) + 1;
      if (count > REVISION_LIMIT || bytes + row.bytes > MAX_REVISION_BYTES || total >= 200)
        await unlink(row.filename);
      else {
        counts.set(row.info.projectId, count);
        bytes += row.bytes;
        total++;
      }
    }
  }
  listProjects(): Promise<Project[]> {
    return this.run(async () => {
      const projects: Project[] = [];
      for (const file of await readdir(this.libraryDirectory)) {
        if (!file.endsWith('.lotgrade')) continue;
        const id = file.slice(0, -9);
        if (!validId(id)) continue;
        const raw = await contents(this.projectPath(id)).catch(() => null);
        if (!this.libraryHashes.has(id))
          this.libraryHashes.set(id, raw === null ? null : hash(raw));
        try {
          if (raw) {
            const p = parseProject(raw);
            if (p.id === id) projects.push(p);
          }
        } catch {
          /* Keep damaged originals available for recovery; load other projects. */
        }
      }
      return projects;
    });
  }
  saveLibrary(project: Project): Promise<void> {
    return this.run(async () => {
      const valid = validateProject(project),
        value = serializeProject(valid),
        filename = this.projectPath(valid.id);
      await locked(filename, async () => {
        const raw = await contents(filename),
          currentHash = raw === null ? null : hash(raw);
        const expected = this.libraryHashes.get(valid.id) ?? null;
        if (currentHash !== expected)
          throw new Error(
            'The library project changed in another session. Save a portable copy of your current work before reopening it.',
          );
        if (raw === value) return;
        if (raw) {
          let previous: Project | null = null;
          try {
            previous = parseProject(raw);
          } catch (error) {
            if (!this.replaceCorrupt.has(valid.id)) throw error;
            await writeFile(filename + '.' + randomUUID() + '.recovery', raw, { flag: 'wx' });
          }
          if (
            previous &&
            designHash(previous) !== designHash(valid) &&
            Date.now() - (this.lastAutoRevision.get(valid.id) ?? 0) >= 30000
          ) {
            await this.addRevision(previous, 'Before library autosave');
            this.lastAutoRevision.set(valid.id, Date.now());
          }
        }
        await atomicWrite(filename, value, currentHash);
        this.libraryHashes.set(valid.id, hash(value));
        this.replaceCorrupt.delete(valid.id);
      });
    });
  }
  deleteLibrary(id: string): Promise<void> {
    return this.run(async () => {
      const filename = this.projectPath(id);
      await locked(filename, async () => {
        const raw = await contents(filename);
        if (!raw) return;
        if (hash(raw) !== this.libraryHashes.get(id))
          throw new Error(
            'The project changed in another session. Reopen it before deleting its library entry.',
          );
        await this.addRevision(parseProject(raw), 'Before library deletion');
        await unlink(filename);
        this.libraryHashes.delete(id);
      });
      // Keep working files, recent locations and recovery snapshots when a library entry is deleted.
    });
  }
  openFile(filename: string): Promise<Project> {
    return this.run(async () => {
      const destination = await canonical(filename);
      if (await this.isManagedPath(destination))
        throw new Error(
          'Open internal library projects from the dashboard. Choose a file outside the application library for a working-file association.',
        );
      const raw = await contents(destination);
      if (raw === null)
        throw new Error(
          'The working file is missing. Locate it with Relink, or open another project file.',
        );
      const project = parseProject(raw);
      const old = await contents(this.projectPath(project.id));
      if (old) {
        let previous: Project | null = null;
        try {
          previous = parseProject(old);
        } catch {
          this.replaceCorrupt.add(project.id);
        }
        if (previous && designHash(previous) !== designHash(project))
          await this.addRevision(previous, 'Before opening another file revision');
      }
      await this.associate(project, destination, raw);
      return project;
    });
  }
  openLibrary(id: string): Promise<Project> {
    return this.run(async () => {
      const raw = await contents(this.projectPath(id));
      if (!raw)
        throw new Error('The library project is missing. Open its working file or use recovery.');
      const project = parseProject(raw);
      if (project.id !== id)
        throw new Error('Library project identity mismatch. Use recovery or open a portable file.');
      this.libraryHashes.set(id, hash(raw));
      return project;
    });
  }
  location(id: string): Promise<string> {
    return this.run(async () => this.preferences.associations[id]?.path ?? this.projectPath(id));
  }
  state(project: Project): Promise<FileState> {
    return this.run(async () => {
      validateProject(project);
      const association = this.preferences.associations[project.id];
      const result: FileState = {
        libraryPath: this.projectPath(project.id),
        workingPath: association?.path ?? null,
        status: 'library',
      };
      if (!association) return result;
      try {
        const raw = await contents(association.path);
        if (raw === null)
          return {
            ...result,
            status: 'missing',
            detail: 'Working file missing. Relink it or use Save As to choose another location.',
          };
        if (hash(raw) !== association.diskHash)
          return {
            ...result,
            status: 'conflict',
            detail:
              'Working file changed outside this session. Save is blocked; use Save As for another file or open the external version.',
          };
        return {
          ...result,
          status:
            hash(serializeProject(project)) === association.projectHash ? 'saved' : 'modified',
        };
      } catch {
        return {
          ...result,
          status: 'conflict',
          detail:
            'Working file cannot be read. Your library copy is separate; use Save a Copy to preserve current work.',
        };
      }
    });
  }
  saveWorking(project: Project): Promise<void> {
    return this.run(async () => {
      const valid = validateProject(project),
        a = this.preferences.associations[valid.id];
      if (!a) return;
      const value = serializeProject(valid);
      await this.writeProject(valid, a.path, value, a.diskHash, 'Before working-file save');
      await this.associate(valid, a.path, value);
    });
  }
  private async writeProject(
    project: Project,
    filename: string,
    value: string,
    expected: string | null,
    reason: string,
  ): Promise<void> {
    await locked(filename, async () => {
      const raw = await contents(filename);
      if ((raw === null ? null : hash(raw)) !== expected)
        throw new Error(
          'The working file is missing or changed outside this session. Save was blocked; choose a different Save As location or relink the unchanged file.',
        );
      if (raw === value) return;
      if (raw) await this.addRevision({ ...parseProject(raw), id: project.id }, reason);
      await atomicWrite(filename, value, expected);
    });
  }
  saveAs(project: Project, filename: string, copy = false): Promise<void> {
    return this.run(async () => {
      const valid = validateProject(project),
        destination = await canonical(filename),
        a = this.preferences.associations[valid.id];
      if (await this.isManagedPath(destination))
        throw new Error(
          'Choose a working-file location outside the application library and recovery folders.',
        );
      if (copy && destination === a?.path)
        throw new Error(
          'Save a Copy needs a different path from the working file. Use Save to update the working file.',
        );
      if (
        Object.entries(this.preferences.associations).some(
          ([id, other]) => id !== valid.id && other.path === destination,
        )
      )
        throw new Error(
          'That destination is another project’s working file. Choose a different location.',
        );
      const raw = await contents(destination);
      if (raw !== null) parseProject(raw); // Do not replace an unreadable or unrelated non-project file.
      const expected = destination === a?.path ? a.diskHash : raw === null ? null : hash(raw);
      const value = serializeProject(valid);
      await this.writeProject(
        valid,
        destination,
        value,
        expected,
        copy ? 'Before Save a Copy' : 'Before Save As',
      );
      if (!copy) await this.associate(valid, destination, value);
    });
  }
  relink(project: Project, filename: string): Promise<void> {
    return this.run(async () => {
      const a = this.preferences.associations[project.id];
      if (!a) throw new Error('This project has no working file. Use Save As first.');
      const destination = await canonical(filename),
        raw = await contents(destination);
      if (!raw) throw new Error('The selected file could not be found.');
      const linked = parseProject(raw);
      if (linked.id !== project.id || hash(serializeProject(linked)) !== a.projectHash)
        throw new Error(
          'The selected file is a different revision. Open it to inspect it, or use Save As for current work. Relink only accepts the last saved revision.',
        );
      this.preferences.recent = this.preferences.recent.filter((item) => item.path !== a.path);
      if (a.path !== destination) this.removedRecentPaths.add(a.path);
      await this.associate(linked, destination, raw);
    });
  }
  recent(): Promise<RecentFile[]> {
    return this.run(async () =>
      Promise.all(
        this.preferences.recent.map(async (r) => ({
          ...r,
          available: await stat(r.path)
            .then((s) => s.isFile())
            .catch(() => false),
        })),
      ),
    );
  }
  recentPath(key: string): Promise<string> {
    return this.run(async () => {
      const item = this.preferences.recent.find((r) => r.key === key);
      if (!item) throw new Error('That recent file is no longer available.');
      return item.path;
    });
  }
  defaultFolder(kind: 'project' | 'dxf'): Promise<string | undefined> {
    return this.run(async () =>
      kind === 'project' ? this.preferences.projectFolder : this.preferences.exportFolder,
    );
  }
  rememberExport(filename: string): Promise<void> {
    return this.run(async () => {
      this.preferences.exportFolder = path.dirname(filename);
      this.dirtyFolders.add('exportFolder');
      await this.persistPreferences();
    });
  }
  exportFile(filename: string, value: string): Promise<void> {
    return this.run(async () => {
      const destination = await canonical(filename);
      if (
        Object.values(this.preferences.associations).some((a) => a.path === destination) ||
        (await this.isManagedPath(destination))
      )
        throw new Error('DXF export cannot overwrite a working project or recovery file.');
      await locked(destination, async () => {
        const raw = await contents(destination);
        await atomicWrite(destination, value, raw === null ? null : hash(raw));
      });
    });
  }
  revisions(projectId?: string): Promise<RevisionInfo[]> {
    return this.run(async () =>
      (await this.revisionEntries())
        .filter((r) => !projectId || r.info.projectId === projectId)
        .map((r) => r.info),
    );
  }
  checkpoint(project: Project): Promise<void> {
    return this.run(() => this.addRevision(project, 'Manual checkpoint'));
  }
  recover(key: string): Promise<Project> {
    return this.run(async () => {
      if (!/^\d+-[a-zA-Z0-9_-]+$/.test(key)) throw new Error('Invalid revision.');
      const raw = await contents(path.join(this.revisionDirectory, key + '.json'));
      if (!raw) throw new Error('The revision is no longer available.');
      const record = JSON.parse(raw) as Revision,
        original = validateProject(record.project),
        now = new Date().toISOString();
      if (record.version !== 1) throw new Error('Unsupported revision.');
      return {
        ...original,
        id: randomUUID(),
        name: `${original.name.slice(0, 105)} (recovered)`,
        createdAt: now,
        updatedAt: now,
      };
    });
  }
}
