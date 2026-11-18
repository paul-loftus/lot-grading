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
  symlink,
  writeFile,
} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
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

test('a rejected queued save does not poison later operations or drop a following valid library edit', async (t) => {
  const { root, store, project } = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  const invalid = { ...project, entities: [{ id: 'broken' }] } as typeof project;
  const rejected = store.saveLibrary(invalid),
    accepted = store.saveLibrary({ ...project, name: 'Queued valid edit' });
  await assert.rejects(rejected, /unsupported drawing object/);
  await accepted;
  assert.equal((await store.openLibrary(project.id)).name, 'Queued valid edit');
  await store.saveLibrary({ ...project, name: 'Another valid edit' });
  assert.equal((await store.openLibrary(project.id)).name, 'Another valid edit');
});

test('failed Save As preserves unrelated bytes, the previous working association and the valid working file', async (t) => {
  const { root, store, project, file } = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  await store.saveAs(project, file);
  const workingBytes = await readFile(file, 'utf8'),
    unrelated = path.join(root, 'unrelated.lotgrade');
  for (const original of ['', '{broken project', 'This is an unrelated document.']) {
    await writeFile(unrelated, original);
    await assert.rejects(
      store.saveAs({ ...project, name: 'Blocked replacement' }, unrelated),
      /project file/i,
    );
    assert.equal(await readFile(unrelated, 'utf8'), original);
    assert.equal(await readFile(file, 'utf8'), workingBytes);
    assert.equal((await store.state(project)).workingPath, file);
    assert.equal((await store.state(project)).status, 'saved');
  }
  assert.ok(
    !(await readdir(root)).some((name) => name.endsWith('.tmp') || name.endsWith('.lotgrade-lock')),
  );
});

test('one project cannot overwrite another associated working file through Save As, Save a Copy or DXF export', async (t) => {
  const { root, store, project, file } = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  await store.saveAs(project, file);
  const other = createProject('Other lot'),
    otherFile = path.join(root, 'other.lotgrade');
  await store.saveLibrary(other);
  await store.saveAs(other, otherFile);
  const before = await readFile(otherFile, 'utf8');
  await assert.rejects(store.saveAs(project, otherFile), /another project/);
  await assert.rejects(store.saveAs(project, otherFile, true), /another project/);
  await assert.rejects(store.exportFile(otherFile, 'replacement DXF'), /cannot overwrite/);
  assert.equal(await readFile(otherFile, 'utf8'), before);
  assert.equal((await store.state(project)).workingPath, file);
  assert.equal((await store.state(other)).workingPath, otherFile);
});

test('canonical symlink destinations cannot bypass library protection or overwrite the associated working file as a copy', async (t) => {
  const { root, store, project, file } = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  await store.saveAs(project, file);
  const alias = path.join(root, 'working-alias.lotgrade'),
    libraryAlias = path.join(root, 'library-alias');
  try {
    await symlink(file, alias, 'file');
    await symlink(
      store.libraryDirectory,
      libraryAlias,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    t.skip('This Windows account cannot create file symlinks.');
    return;
  }
  const before = await readFile(file, 'utf8');
  await assert.rejects(store.saveAs(project, alias, true), /different path/);
  await assert.rejects(store.exportFile(alias, 'DXF'), /cannot overwrite/);
  await assert.rejects(store.saveAs(project, path.join(libraryAlias, 'new.lotgrade')), /outside/);
  assert.equal(await readFile(file, 'utf8'), before);
  await store.saveAs({ ...project, name: 'Canonical working save' }, alias);
  assert.equal((await store.state(project)).workingPath, file);
  assert.equal(parseProject(await readFile(file, 'utf8')).name, 'Canonical working save');
});

test('live and malformed writer locks remain intact and blocked writes leave no temporary files', async (t) => {
  const { root, store, project, file } = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  await store.saveAs(project, file);
  const before = await readFile(file, 'utf8'),
    lock = file + '.lotgrade-lock',
    owner = path.join(lock, 'owner.json');
  for (const data of [
    JSON.stringify({ pid: process.pid, token: 'live-owner' }),
    '{broken',
    '{}',
    JSON.stringify({ pid: -1 }),
  ]) {
    await mkdir(lock);
    await writeFile(owner, data);
    await assert.rejects(
      store.saveWorking({ ...project, name: 'Blocked edit' }),
      /Another LotGrade writer/,
    );
    assert.equal(await readFile(file, 'utf8'), before);
    assert.equal(await readFile(owner, 'utf8'), data);
    assert.ok(!(await readdir(root)).some((name) => name.endsWith('.tmp')));
    await rm(lock, { recursive: true });
  }
  await store.saveWorking({ ...project, name: 'Unblocked edit' });
  assert.equal(parseProject(await readFile(file, 'utf8')).name, 'Unblocked edit');
});

test('a lock left by a terminated process can be reclaimed and the completed write removes its own lock', async (t) => {
  const { root, store, project, file } = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  await store.saveAs(project, file);
  const child = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  assert.equal(child.status, 0);
  assert.ok(child.pid > 0);
  assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
  const lock = file + '.lotgrade-lock';
  await mkdir(lock);
  await writeFile(
    path.join(lock, 'owner.json'),
    JSON.stringify({ pid: child.pid, token: 'old-owner' }),
  );
  await store.saveWorking({ ...project, name: 'Recovered writer' });
  assert.equal(parseProject(await readFile(file, 'utf8')).name, 'Recovered writer');
  assert.ok(
    !(await readdir(root)).some((name) => name.endsWith('.tmp') || name.endsWith('.lotgrade-lock')),
  );
});

test('view-only autosaves do not consume design revisions; manual checkpoints remain independent snapshots', async (t) => {
  const { root, store, project } = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  await store.saveLibrary({
    ...project,
    view: { centerX: 999, centerY: -500, scale: 0.125 },
    updatedAt: '2026-11-13T12:00:00.000Z',
  });
  assert.deepEqual(await store.revisions(project.id), []);
  await store.checkpoint(project);
  project.name = 'Changed after checkpoint';
  const entries = await store.revisions(project.id),
    restored = await store.recover(entries[0].key);
  assert.equal(restored.name, 'File workflow (recovered)');
  assert.notEqual(restored.id, project.id);
  assert.deepEqual(restored.view, project.view);
  assert.equal((await store.listProjects()).length, 1);
});

test('invalid local preferences are preserved for inspection and do not stop a clean library from loading', async (t) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'lotgrade-preferences-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const appRoot = path.join(root, 'app');
  await mkdir(appRoot);
  const invalid = '{"version":1,"associations":{"lot":{"path":"relative"}},"recent":[]}';
  await writeFile(path.join(appRoot, 'file-state.json'), invalid);
  const store = new FileStore(appRoot);
  assert.deepEqual(await store.listProjects(), []);
  const recovery = (await readdir(appRoot)).filter((name) => name.endsWith('.recovery'));
  assert.equal(recovery.length, 1);
  assert.equal(await readFile(path.join(appRoot, recovery[0]), 'utf8'), invalid);
  const project = createProject('Clean session');
  await store.saveLibrary(project);
  await store.saveAs(project, path.join(root, 'clean.lotgrade'));
  const restarted = new FileStore(appRoot);
  assert.equal((await restarted.listProjects())[0].name, 'Clean session');
  assert.equal((await restarted.state(project)).status, 'saved');
});

test('damaged revision records stay on disk, are not offered as recovery choices and do not hide valid checkpoints', async (t) => {
  const { root, store, project } = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  await store.checkpoint(project);
  const invalid = {
    '0-broken.json': '{broken',
    '1-version.json': JSON.stringify({
      version: 99,
      project,
      savedAt: project.updatedAt,
      reason: 'bad version',
    }),
    '2-date.json': JSON.stringify({
      version: 1,
      project,
      savedAt: 'not a date',
      reason: 'bad date',
    }),
    '3-project.json': JSON.stringify({
      version: 1,
      project: { id: project.id },
      savedAt: project.updatedAt,
      reason: 'bad project',
    }),
    'unrelated.json': 'unrelated file',
  };
  for (const [name, data] of Object.entries(invalid))
    await writeFile(path.join(store.revisionDirectory, name), data);
  const revisions = await store.revisions(project.id);
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].reason, 'Manual checkpoint');
  await store.checkpoint({ ...project, name: 'Second valid revision' });
  assert.equal((await store.revisions(project.id)).length, 2);
  for (const [name, data] of Object.entries(invalid))
    assert.equal(await readFile(path.join(store.revisionDirectory, name), 'utf8'), data);
  for (const key of ['../outside', '0-broken.json', 'unknown', '0-../../outside'])
    await assert.rejects(store.recover(key), /Invalid revision/);
});

test('stale sessions cannot delete another session’s newer library revision and a failed delete keeps recovery intact', async (t) => {
  const { root, store, project, file } = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  await store.saveAs(project, file);
  const other = new FileStore(path.join(root, 'app'));
  await other.listProjects();
  await store.saveLibrary({ ...project, name: 'Newer library revision' });
  const revisions = await store.revisions(project.id);
  await assert.rejects(other.deleteLibrary(project.id), /changed in another session/);
  assert.equal((await store.openLibrary(project.id)).name, 'Newer library revision');
  assert.deepEqual(await store.revisions(project.id), revisions);
  assert.equal(parseProject(await readFile(file, 'utf8')).name, 'File workflow');
});

test('recent paths reflect missing files, remain bounded and reject obsolete lookup keys', async (t) => {
  const { root, store, project } = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (let i = 0; i < 12; i++)
    await store.saveAs(project, path.join(root, `revision-${i}.lotgrade`));
  const recent = await store.recent();
  assert.equal(recent.length, 10);
  assert.equal(new Set(recent.map((entry) => entry.path)).size, 10);
  assert.ok(!recent.some((entry) => /revision-[01]\.lotgrade$/.test(entry.path)));
  await rm(recent[0].path);
  assert.equal(
    (await store.recent()).find((entry) => entry.key === recent[0].key)!.available,
    false,
  );
  assert.equal(await store.recentPath(recent[0].key), recent[0].path);
  await assert.rejects(store.recentPath('no-longer-present'), /no longer available/);
  const restarted = new FileStore(path.join(root, 'app'));
  assert.equal((await restarted.recent()).length, 10);
  assert.equal((await restarted.state(project)).status, 'missing');
});

test('failed project opens preserve the current library, working association, recent list and recovery history', async (t) => {
  const { root, store, project, file } = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  await store.saveAs(project, file);
  await store.checkpoint(project);
  const baseline = {
    library: await store.openLibrary(project.id),
    state: await store.state(project),
    recent: await store.recent(),
    revisions: await store.revisions(project.id),
    working: await readFile(file, 'utf8'),
  };
  const invalid = path.join(root, 'invalid.lotgrade');
  for (const bytes of [
    '{truncated',
    JSON.stringify({ ...project, schemaVersion: 999 }),
    JSON.stringify({ ...project, units: 'inches' }),
  ]) {
    await writeFile(invalid, bytes);
    await assert.rejects(store.openFile(invalid));
    assert.equal(await readFile(invalid, 'utf8'), bytes);
    assert.deepEqual(await store.openLibrary(project.id), baseline.library);
    assert.deepEqual(await store.state(project), baseline.state);
    assert.deepEqual(await store.recent(), baseline.recent);
    assert.deepEqual(await store.revisions(project.id), baseline.revisions);
    assert.equal(await readFile(file, 'utf8'), baseline.working);
  }
  await assert.rejects(store.openFile(path.join(root, 'missing.lotgrade')), /missing/);
  assert.deepEqual(await store.state(project), baseline.state);
  assert.deepEqual(await store.recent(), baseline.recent);
});

test('overwriting an existing valid project with Save As first preserves the displaced project as a recoverable revision', async (t) => {
  const { root, store, project, file } = await setup();
  t.after(() => rm(root, { recursive: true, force: true }));
  const displaced = createProject('Displaced portable revision');
  displaced.entities = [
    {
      id: 'original-control',
      kind: 'point',
      name: 'Original benchmark',
      layer: 'CONTROL',
      closed: false,
      points: [{ x: 2000000.25, y: 5000000.75, z: 103.125 }],
    },
  ];
  await writeFile(file, serializeProject(displaced));
  await store.saveAs(project, file);
  assert.equal(parseProject(await readFile(file, 'utf8')).id, project.id);
  const entries = await store.revisions(project.id);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].reason, 'Before Save As');
  const recovered = await store.recover(entries[0].key);
  assert.equal(recovered.name, 'Displaced portable revision (recovered)');
  assert.deepEqual(recovered.entities, displaced.entities);
  assert.notEqual(recovered.id, project.id);
  assert.notEqual(recovered.id, displaced.id);
  assert.equal((await store.state(recovered)).status, 'library');
});
