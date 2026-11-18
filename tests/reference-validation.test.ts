import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportDxf } from '../src/core/dxf';
import {
  importReference,
  MAX_SOURCE_BYTES,
  previewDxf,
  previewPoints,
  readPointTable,
  readSource,
  type PointFormat,
} from '../src/core/import';
import {
  createProject,
  parseProject,
  serializeProject,
  validateProject,
} from '../src/core/project';
import { exportEntities, visibleEntities } from '../src/core/references';
import type { DrawingEntity, Project, ReferenceSource } from '../src/core/types';

const mapping: PointFormat = {
  delimiter: ',',
  header: false,
  columns: { pointNumber: 0, x: 1, y: 2, z: 3, description: 4 },
};
const options = {
  format: 'points' as const,
  units: 'feet' as const,
  context: { horizontal: 'Survey grid', vertical: 'Benchmark' },
  pointFormat: mapping,
  acceptIssues: false,
  alignment: { object: 0, vertex: 0, confirmed: true },
};
async function fixture(): Promise<Project> {
  const file = await readSource(
      'controls.csv',
      Buffer.from('001,10.25,20.75,101.125,Survey control\n'),
    ),
    preview = previewPoints(readPointTable(file.text, ','), mapping),
    project = createProject('Reference validation');
  project.entities = [
    {
      id: 'proposed',
      kind: 'point',
      name: 'Proposed control',
      layer: 'FG-SPOT',
      closed: false,
      points: [{ x: 100, y: 200, z: 105 }],
    },
  ];
  return importReference(importReference(project, file, preview, options), file, preview, options);
}

test('all reference visibility/export combinations preserve proposed controls and include exactly the selected source geometry', async () => {
  const base = await fixture(),
    original = serializeProject(base);
  for (let flags = 0; flags < 16; flags++) {
    const project = structuredClone(base);
    project.references!.forEach((source, i) => {
      source.visible = Boolean(flags & (1 << (i * 2)));
      source.includeInExport = Boolean(flags & (1 << (i * 2 + 1)));
    });
    const expectedVisible = project
        .references!.filter((source) => source.visible)
        .flatMap((source) => source.entities),
      expectedExport = project
        .references!.filter((source) => source.includeInExport)
        .flatMap((source) => source.entities);
    assert.deepEqual(visibleEntities(project), [...expectedVisible, ...project.entities]);
    assert.deepEqual(exportEntities(project), [...project.entities, ...expectedExport]);
    const parsed = previewDxf(exportDxf(project));
    assert.deepEqual(
      parsed.entities.map((entity) => entity.points),
      [...project.entities, ...expectedExport].map((entity) => entity.points),
    );
    assert.deepEqual(parseProject(serializeProject(project)), project);
    assert.equal(project.references![0].contentBase64, base.references![0].contentBase64);
  }
  assert.equal(serializeProject(base), original);
});

test('broken record links and duplicate identities across proposed objects or reference groups cannot be saved or exported', async () => {
  const base = await fixture();
  const mutations: ((p: Project) => void)[] = [
    (p) => {
      p.references![1].id = p.references![0].id;
    },
    (p) => {
      p.references![0].records[0].entityId = 'missing-object';
    },
    (p) => {
      p.references![0].records = [];
    },
    (p) => {
      const source = p.references![0],
        entity = source.entities[0],
        oldId = entity.id;
      entity.id = p.entities[0].id;
      source.records[0].entityId = entity.id;
      if (source.alignment.objectId === oldId) source.alignment.objectId = entity.id;
    },
    (p) => {
      const source = p.references![1];
      source.entities[0].id = p.references![0].entities[0].id;
      source.records[0].entityId = source.entities[0].id;
      source.alignment.objectId = source.entities[0].id;
    },
    (p) => {
      p.references![0].entities = [];
      p.references![0].records = [];
    },
  ];
  for (const mutate of mutations) {
    const project = structuredClone(base);
    mutate(project);
    const before = JSON.stringify(project);
    assert.throws(() => serializeProject(project));
    assert.throws(() => exportDxf(project));
    assert.equal(JSON.stringify(project), before);
  }
  assert.equal(base.references![0].entities.length, 1);
});

test('malformed preserved bytes, digests, file names and source settings are rejected without silently dropping the reference', async () => {
  const base = await fixture();
  const mutations: ((source: ReferenceSource) => void)[] = [
    ...['', 'A===', 'AA==AA==', 'Zg=', '!!!!', 'AAAA\n'].map((value) => (s: ReferenceSource) => {
      s.contentBase64 = value;
    }),
    ...['', 'a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64)].map((value) => (s: ReferenceSource) => {
      s.sha256 = value;
    }),
    ...['../controls.csv', 'folder/controls.csv', 'folder\\controls.csv', 'bad\nname.csv'].map(
      (value) => (s: ReferenceSource) => {
        s.fileName = value;
      },
    ),
    (s) => {
      s.visible = 'false' as unknown as boolean;
    },
    (s) => {
      s.includeInExport = 1 as unknown as boolean;
    },
    (s) => {
      s.units = 'meters';
    },
    (s) => {
      s.importedAt = 'invalid-date';
    },
    (s) => {
      s.format = 'dwg' as 'dxf';
    },
    (s) => {
      s.issues = [{ record: 'Row 1', type: 'POINT', message: '\u0000invalid' }];
    },
  ];
  for (const mutate of mutations) {
    const project = structuredClone(base);
    mutate(project.references![0]);
    assert.throws(() => parseProject(JSON.stringify(project)));
    assert.throws(() => exportDxf(project));
  }
  assert.deepEqual(validateProject(base), base);
});

test('survey column mappings and known alignment controls cannot be lost or redirected in a portable file', async () => {
  const base = await fixture();
  const mutations: ((source: ReferenceSource) => void)[] = [
    (s) => {
      delete s.pointFormat;
    },
    (s) => {
      s.pointFormat!.columns.x = s.pointFormat!.columns.z;
    },
    (s) => {
      s.pointFormat!.columns.description = s.pointFormat!.columns.pointNumber;
    },
    (s) => {
      s.pointFormat!.columns.z = -1;
    },
    (s) => {
      s.pointFormat!.columns.z = 100;
    },
    (s) => {
      s.pointFormat!.columns.z = 0.5;
    },
    (s) => {
      s.alignment.objectId = 'absent';
    },
    (s) => {
      s.alignment.objectId = base.references![1].entities[0].id;
    },
    (s) => {
      s.alignment.vertex = -1;
    },
    (s) => {
      s.alignment.vertex = 1;
    },
    (s) => {
      s.alignment.vertex = 0.5;
    },
    (s) => {
      s.alignment.confirmed = false as true;
    },
    (s) => {
      s.alignment.expected = { x: 1e12 + 1, y: 0, z: 0 };
    },
  ];
  for (const mutate of mutations) {
    const project = structuredClone(base);
    mutate(project.references![0]);
    assert.throws(() => serializeProject(project));
  }
  const valid = structuredClone(base);
  valid.references![0].pointFormat!.columns = {
    x: 1,
    y: 2,
    z: 3,
    pointNumber: null,
    description: null,
  };
  valid.references![0].alignment.expected = { ...valid.references![0].entities[0].points[0] };
  assert.deepEqual(parseProject(serializeProject(valid)), valid);
});

test('aggregate object limits include locked hidden sources, even when none of the source geometry is selected for export', async () => {
  const project = await fixture(),
    source = project.references![0],
    template = project.entities[0];
  project.references = [source];
  project.entities = Array.from({ length: 5000 }, (_, i) => ({ ...template, id: `proposed-${i}` }));
  source.entities = Array.from({ length: 5000 }, (_, i) => ({ ...template, id: `reference-${i}` }));
  source.records = source.entities.map((entity) => ({ entityId: entity.id, record: entity.id }));
  source.alignment.objectId = source.entities[0].id;
  source.visible = false;
  source.includeInExport = false;
  assert.equal(validateProject(project).entities.length, 5000);
  project.entities.push({ ...template, id: 'one-too-many' });
  assert.throws(() => serializeProject(project), /10,000 objects including references/);
  assert.throws(() => exportDxf(project), /10,000 objects including references/);
});

test('aggregate vertex limits count proposed paths and locked reference paths together without rounding or truncation', async () => {
  const project = await fixture(),
    source = project.references![0];
  project.references = [source];
  const path = (id: string, count: number): DrawingEntity => ({
    id,
    kind: 'polyline',
    name: id,
    layer: 'PATH',
    closed: false,
    points: Array.from({ length: count }, (_, i) => ({ x: i * 0.125, y: 0, z: 100.125 })),
  });
  project.entities = [path('proposed-path', 100000)];
  source.entities = [path('source-path', 100000)];
  source.records = [{ entityId: 'source-path', record: 'Source path' }];
  source.alignment.objectId = 'source-path';
  assert.equal(validateProject(project).references![0].entities[0].points.length, 100000);
  project.entities[0].points.push({ x: 12500, y: 0, z: 100.125 });
  assert.throws(() => serializeProject(project), /200,000 drawing vertices/);
  assert.equal(source.entities[0].points.length, 100000);
});

test('exactly 4 MB sources are preserved while an import exceeding the portable project byte limit fails atomically', async () => {
  const prefix = '001,10.25,20.75,101.125,Survey control\n#',
    bytes = Buffer.from(prefix + 'a'.repeat(MAX_SOURCE_BYTES - prefix.length)),
    file = await readSource('large-controls.csv', bytes),
    preview = previewPoints(readPointTable(file.text, ','), mapping);
  assert.equal(Buffer.from(file.contentBase64, 'base64').length, MAX_SOURCE_BYTES);
  assert.equal(preview.entities.length, 1);
  let project = createProject('Portable source limits');
  for (let i = 0; i < 3; i++) project = importReference(project, file, preview, options);
  const before = serializeProject(project);
  assert.throws(() => importReference(project, file, preview, options), /20 MB project-file limit/);
  assert.equal(serializeProject(project), before);
  assert.equal(project.references!.length, 3);
  assert.deepEqual(Buffer.from(project.references![2].contentBase64, 'base64'), bytes);
});
