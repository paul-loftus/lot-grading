import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileStore, REVISION_LIMIT } from '../desktop/files';
import { createProject, parseProject, serializeProject } from '../src/core/project';
import { importReference, previewDxf, readSource } from '../src/core/import';

async function setup() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'lotgrade-files-')));
  const store = new FileStore(path.join(root, 'app'));
  await store.listProjects();
  const project = createProject('File workflow');
  await store.saveLibrary(project);
  return { root, store, project, file: path.join(root, 'working.lotgrade') };
}
test('Save As associates a working file; autosaves stay in the library; Save updates the associated file; paths remain local', async () => {
  const { root, store, project, file } = await setup();
  try {
    assert.equal((await store.state(project)).status, 'library');
    await store.saveAs(project, file);
    assert.equal((await store.state(project)).status, 'saved');
    const modified = { ...project, name: 'Revised lot' };
    await store.saveLibrary(modified);
    assert.equal(parseProject(await readFile(file, 'utf8')).name, project.name);
    assert.equal((await store.state(modified)).status, 'modified');
    await store.saveWorking(modified);
    assert.equal(parseProject(await readFile(file, 'utf8')).name, modified.name);
    assert.equal((await store.state(modified)).status, 'saved');
    const portable = await readFile(file, 'utf8');
    assert(!portable.includes(root));
    assert(!portable.includes('workingPath'));
    const restarted = new FileStore(path.join(root, 'app'));
    const loaded = (await restarted.listProjects())[0];
    assert.equal((await restarted.state(loaded)).workingPath, file);
    assert.equal((await restarted.recent())[0].path, file);
    await restarted.rememberExport(path.join(root, 'result.dxf'));
    assert.equal(await new FileStore(path.join(root, 'app')).defaultFolder('dxf'), root);
    assert.equal(await restarted.defaultFolder('project'), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('Save a Copy leaves the working association intact and cannot overwrite it or internal library data', async () => {
  const { root, store, project, file } = await setup();
  try {
    await store.saveAs(project, file);
    const copy = path.join(root, 'copy.lotgrade');
    await store.saveAs({ ...project, name: 'Copy snapshot' }, copy, true);
    assert.equal((await store.state(project)).workingPath, file);
    assert.equal(parseProject(await readFile(file, 'utf8')).name, project.name);
    assert.equal(parseProject(await readFile(copy, 'utf8')).name, 'Copy snapshot');
    await assert.rejects(store.saveAs(project, file, true), /different path/);
    await assert.rejects(
      store.saveAs(project, path.join(store.libraryDirectory, 'internal.lotgrade')),
      /outside/,
    );
    await assert.rejects(
      store.openFile(path.join(store.libraryDirectory, project.id + '.lotgrade')),
      /dashboard/,
    );
    await assert.rejects(store.exportFile(file, 'DXF'), /cannot overwrite/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('external changes block Save and same-path Save As without altering external or in-memory data', async () => {
  const { root, store, project, file } = await setup();
  try {
    await store.saveAs(project, file);
    const external = serializeProject({ ...project, name: 'Externally revised' });
    await writeFile(file, external);
    assert.equal((await store.state(project)).status, 'conflict');
    await assert.rejects(store.saveWorking(project), /changed/);
    await assert.rejects(store.saveAs(project, file), /changed/);
    assert.equal(await readFile(file, 'utf8'), external);
    await store.saveAs(project, path.join(root, 'safe-copy.lotgrade'), true);
    assert.equal((await store.state(project)).status, 'conflict');
    assert.equal(project.name, 'File workflow');
    assert(
      !(await readdir(root)).some(
        (name) => name.endsWith('.tmp') || name.endsWith('.lotgrade-lock'),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('missing files require relinking or a new location; relink verifies the saved revision and retains current library edits', async () => {
  const { root, store, project, file } = await setup();
  try {
    await store.saveAs(project, file);
    const moved = path.join(root, 'moved.lotgrade');
    await rename(file, moved);
    assert.equal((await store.state(project)).status, 'missing');
    await assert.rejects(store.saveWorking(project), /missing/);
    const revised = { ...project, name: 'Unsaved library changes' };
    await store.saveLibrary(revised);
    const wrong = path.join(root, 'wrong.lotgrade');
    await writeFile(wrong, serializeProject(revised));
    await assert.rejects(store.relink(revised, wrong), /different revision/);
    await store.relink(revised, moved);
    assert.equal((await store.state(revised)).status, 'modified');
    await store.saveWorking(revised);
    assert.equal(parseProject(await readFile(moved, 'utf8')).name, revised.name);
    assert.equal((await store.recent())[0].path, moved);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('independent sessions cannot silently overwrite library or working-file changes; listing does not reset the guard', async () => {
  const { root, store, project, file } = await setup();
  try {
    await store.saveAs(project, file);
    const second = new FileStore(path.join(root, 'app'));
    await second.listProjects();
    await store.saveLibrary({ ...project, name: 'First session' });
    await second.listProjects();
    await assert.rejects(
      second.saveLibrary({ ...project, name: 'Second session' }),
      /another session/,
    );
    await store.saveWorking({ ...project, name: 'First session' });
    await assert.rejects(second.saveWorking({ ...project, name: 'Second session' }), /changed/);
    const fresh = await second.openLibrary(project.id);
    assert.equal(fresh.name, 'First session');
    await second.saveLibrary({ ...fresh, name: 'Reviewed latest' });
    assert.equal((await second.openLibrary(project.id)).name, 'Reviewed latest');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('unknown active writer locks stop a write and leave the destination untouched', async () => {
  const { root, store, project, file } = await setup();
  try {
    await store.saveAs(project, file);
    const original = await readFile(file, 'utf8');
    await mkdir(file + '.lotgrade-lock');
    await assert.rejects(
      store.saveWorking({ ...project, name: 'Blocked' }),
      /Another LotGrade writer/,
    );
    assert.equal(await readFile(file, 'utf8'), original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('bounded revisions recover schema 3 curves and embedded sources as a separate copy, even with a corrupt library entry', async () => {
  const { root, store, project } = await setup();
  try {
    const source = await readSource(
      'base-plan.dxf',
      await readFile(new URL('./fixtures/import/base-plan.dxf', import.meta.url)),
    );
    const imported = importReference(project, source, previewDxf(source.text), {
      format: 'dxf',
      units: 'feet',
      context: { horizontal: '', vertical: 'Illustrative benchmark' },
      acceptIssues: true,
      alignment: { object: 0, vertex: 0, confirmed: true },
    });
    await store.saveLibrary(imported);
    for (let i = 0; i < REVISION_LIMIT + 2; i++)
      await store.checkpoint({ ...imported, name: `Checkpoint ${i}` });
    const entries = await store.revisions(project.id);
    assert.equal(entries.length, REVISION_LIMIT);
    const location = path.join(store.libraryDirectory, project.id + '.lotgrade');
    await writeFile(location, '{broken');
    const restarted = new FileStore(path.join(root, 'app'));
    assert.equal((await restarted.listProjects()).length, 0);
    const restored = await restarted.recover(entries[0].key);
    assert.notEqual(restored.id, project.id);
    assert(restored.name.endsWith('(recovered)'));
    assert.deepEqual(restored.references, imported.references);
    assert.equal((await restarted.state(restored)).workingPath, null);
    await restarted.saveLibrary(restored);
    assert.equal(await readFile(location, 'utf8'), '{broken');
    assert.equal((await restarted.listProjects()).length, 1);
    const portable = path.join(root, 'good-original.lotgrade');
    await writeFile(portable, serializeProject(imported));
    await restarted.saveLibrary(await restarted.openFile(portable));
    assert.equal(parseProject(await readFile(location, 'utf8')).schemaVersion, 3);
    assert((await readdir(store.libraryDirectory)).some((n) => n.endsWith('.recovery')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('library deletion preserves the working file and provides a recoverable revision', async () => {
  const { root, store, project, file } = await setup();
  try {
    await store.saveAs(project, file);
    await store.deleteLibrary(project.id);
    assert.equal((await store.listProjects()).length, 0);
    assert.equal(parseProject(await readFile(file, 'utf8')).id, project.id);
    assert.equal((await store.revisions(project.id))[0].reason, 'Before library deletion');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('local preference updates preserve another session’s project association and valid prototype-like IDs', async () => {
  const { root, store, project, file } = await setup();
  try {
    const second = new FileStore(path.join(root, 'app'));
    await second.listProjects();
    const other = { ...createProject('Other project'), id: 'constructor' };
    await second.saveLibrary(other);
    const otherFile = path.join(root, 'other.lotgrade');
    await second.saveAs(other, otherFile);
    await store.saveAs(project, file);
    const restarted = new FileStore(path.join(root, 'app'));
    await restarted.listProjects();
    assert.equal((await restarted.state(other)).workingPath, otherFile);
    assert.equal((await restarted.state(project)).workingPath, file);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
