import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { exportDxf } from '../src/core/dxf';
import {
  createDemoProject,
  createProject,
  MAX_PROJECT_BYTES,
  parseProject,
  serializeProject,
  validateProject,
} from '../src/core/project';
import type { DrawingEntity, Project, Units } from '../src/core/types';

const contract = JSON.parse(
  readFileSync(new URL('./fixtures/export/cases.json', import.meta.url), 'utf8'),
) as {
  cases: { name: string; project: Project }[];
};
const fixture = (): Project => structuredClone(contract.cases[0].project);

test('a newly created project has a valid identity and can be saved and exported before drawing', () => {
  const project = createProject('  North lot  ', 'meters', '  Survey review  ');
  assert.equal(project.name, 'North lot');
  assert.equal(project.description, 'Survey review');
  assert.equal(project.units, 'meters');
  assert.ok(project.id.length > 0);
  assert.deepEqual(parseProject(serializeProject(project)), project);
  assert.doesNotThrow(() => exportDxf(project));
});

test('new projects have separate identities and mutable state', () => {
  const first = createProject('First');
  const second = createProject('Second');
  assert.notEqual(first.id, second.id);
  first.settings.gridSize = 7;
  first.view.centerX = 999;
  first.entities.push(fixture().entities[0]);
  assert.equal(second.entities.length, 0);
  assert.equal(second.settings.gridSize, 1);
  assert.notEqual(second.view.centerX, first.view.centerX);
});

test('the supplied example is a valid, saveable drawing with every offered entity kind', () => {
  const demo = createDemoProject();
  assert.deepEqual([...new Set(demo.entities.map((entity) => entity.kind))].sort(), [
    'boundary',
    'building',
    'contour',
    'point',
    'polyline',
  ]);
  assert.deepEqual(parseProject(serializeProject(demo)), demo);
  assert.doesNotThrow(() => exportDxf(validateProject(demo)));
});

test('every frozen export fixture remains exportable after validation and a native save/open round trip', () => {
  for (const entry of contract.cases) {
    const validated = validateProject(entry.project);
    const reopened = parseProject(serializeProject(validated));
    assert.deepEqual(
      reopened,
      entry.project,
      `${entry.name}: project content must survive save/open`,
    );
    assert.equal(
      exportDxf(reopened),
      exportDxf(entry.project),
      `${entry.name}: save/open must not change the DXF`,
    );
  }
});

test('native files preserve global XY precision, fractional/negative Z, closure, layers, and names', () => {
  const project = fixture();
  const before = structuredClone(project);
  const reopened = parseProject(serializeProject(project));
  assert.deepEqual(reopened, before);
  const line = reopened.entities.find((entity) => entity.id === 'line-flat')!;
  assert.equal(line.points[0].x, 2000001.123456789);
  assert.equal(line.points[0].y, 5000060.987654321);
  const spot = reopened.entities.find((entity) => entity.id === 'spot')!;
  assert.equal(spot.points[0].z, -2.125);
  assert.equal(spot.name, 'Café threshold');
  assert.equal(reopened.entities.find((entity) => entity.id === 'closed-3d')!.closed, true);
});

test('all supported units survive save/open without converting or relabeling coordinate values', () => {
  for (const units of ['meters', 'feet', 'us-survey-feet'] satisfies Units[]) {
    const project = fixture();
    project.units = units;
    const reopened = parseProject(serializeProject(project));
    assert.equal(reopened.units, units);
    assert.deepEqual(reopened.entities, project.entities);
    assert.equal(exportDxf(reopened), exportDxf(project));
  }
});

test('validation creates an independent deep snapshot and never edits the supplied project', () => {
  const source = fixture();
  const before = structuredClone(source);
  const validated = validateProject(source);
  assert.deepEqual(source, before);
  validated.entities[0].points[0].z = 999;
  validated.entities[0].name = 'Changed clone';
  validated.view.centerX = -123;
  validated.settings.snapToGrid = !source.settings.snapToGrid;
  assert.deepEqual(source, before);
});

test('serializing and reopening returns independent objects and leaves source and previous saves intact', () => {
  const source = fixture();
  const saved = serializeProject(source);
  const first = parseProject(saved);
  const second = parseProject(saved);
  first.entities[0].points[0].x += 40;
  first.settings.gridSize = 3;
  assert.deepEqual(second, source);
  assert.equal(serializeProject(source), saved);
  assert.notEqual(first.entities[0].points[0].x, second.entities[0].points[0].x);
});

test('malformed and truncated project files fail without changing the currently valid project', () => {
  const current = fixture();
  const before = structuredClone(current);
  for (const contents of ['', '{', '{"schemaVersion":1,', 'not JSON', '{"name":"lot",}']) {
    assert.throws(() => parseProject(contents), /not a valid LotGrade project file/i);
  }
  assert.deepEqual(current, before);
});

test('project imports reject scalar, null, and array roots rather than treating them as empty projects', () => {
  for (const contents of ['null', '[]', 'true', '7', '"a project"']) {
    assert.throws(() => parseProject(contents), /project must be an object/i);
  }
});

test('unknown or missing schema versions and unsupported entity kinds are rejected, never discarded', () => {
  for (const schemaVersion of [undefined, 0, 2, '1']) {
    assert.throws(
      () => validateProject({ ...fixture(), schemaVersion }),
      /unsupported project version/i,
    );
  }
  const project = fixture();
  project.entities[0].kind = 'spline' as DrawingEntity['kind'];
  assert.throws(() => parseProject(JSON.stringify(project)), /unsupported drawing object/i);
});

test('unsupported unit labels and unsafe project identities are rejected at import', () => {
  for (const units of ['inches', 'Feet', '__proto__', null]) {
    assert.throws(() => validateProject({ ...fixture(), units }), /choose meters/i);
  }
  for (const id of ['', '../another-project', 'folder/file', 'project\nname']) {
    assert.throws(() => validateProject({ ...fixture(), id }), /project ID is invalid/i);
  }
});

test('duplicate entity identities fail instead of losing an object during editing or export', () => {
  const project = fixture();
  project.entities[1].id = project.entities[0].id;
  assert.throws(() => validateProject(project), /IDs must be valid and unique/i);
});

test('nonfinite, nonnumeric, and unsupported coordinate magnitudes are rejected without coercion', () => {
  for (const coordinate of [NaN, Infinity, -Infinity, '103.5', null, 1e13]) {
    const project = fixture();
    project.entities[0].points[0].z = coordinate as number;
    assert.throws(() => validateProject(project), /coordinates must be finite numbers/i);
  }
});

test('spot points, open lines, and closed outlines enforce usable geometry cardinality', () => {
  const mutations: ((project: Project) => void)[] = [
    (project) => {
      project.entities[0].points = [];
    },
    (project) => {
      project.entities[0].closed = false;
    },
    (project) => {
      project.entities[1].closed = false;
    },
    (project) => {
      project.entities[4].points = [project.entities[4].points[0]];
    },
    (project) => {
      project.entities[7].closed = true;
    },
    (project) => {
      project.entities[7].points.push({ x: 1, y: 2, z: 3 });
    },
  ];
  for (const mutate of mutations) {
    const project = fixture();
    mutate(project);
    assert.throws(() => validateProject(project));
  }
});

test('even a tiny contour elevation discrepancy fails instead of being flattened on save', () => {
  const project = fixture();
  project.entities[2].points[1].z += 0.000000001;
  assert.throws(() => validateProject(project), /same elevation/i);
  const line = fixture();
  line.entities[4].points[1].z += 0.000000001;
  assert.deepEqual(
    parseProject(serializeProject(line)).entities[4].points,
    line.entities[4].points,
  );
});

test('every forbidden CAD layer character is rejected before a project can be saved', () => {
  const controls = Array.from({ length: 32 }, (_, code) => String.fromCharCode(code));
  for (const character of [
    ...controls,
    '\u007f',
    '<',
    '>',
    '/',
    '\\',
    '"',
    ':',
    ';',
    '?',
    '*',
    '|',
    '=',
    ',',
  ]) {
    const project = fixture();
    project.entities[0].layer = `bad${character}layer`;
    assert.throws(
      () => validateProject(project),
      /layer name is invalid/i,
      `Layer character U+${character.charCodeAt(0).toString(16)} must be rejected`,
    );
  }
});

test('feature names reject line breaks and control characters so valid saved projects remain exportable', () => {
  for (const code of [...Array.from({ length: 32 }, (_, index) => index), 127]) {
    const project = fixture();
    project.entities[7].name = `spot${String.fromCharCode(code)}name`;
    assert.throws(
      () => validateProject(project),
      /names must be single-line text/i,
      `Name character U+${code.toString(16)} must be rejected`,
    );
  }
});

test('invalid view and drawing settings fail with actionable validation errors', () => {
  for (const scale of [0, -1, Infinity, 10001]) {
    assert.throws(
      () => validateProject({ ...fixture(), view: { centerX: 0, centerY: 0, scale } }),
      /drawing view is invalid/i,
    );
  }
  for (const value of [0, -1, Infinity, NaN]) {
    const project = fixture();
    project.settings.gridSize = value;
    assert.throws(() => validateProject(project), /drawing settings are invalid/i);
  }
});

test('project-file size limits count UTF-8 bytes before attempting to parse', () => {
  const oversizedUnicode = `"${'é'.repeat(MAX_PROJECT_BYTES / 2)}"`;
  assert.ok(oversizedUnicode.length < MAX_PROJECT_BYTES);
  assert.throws(() => parseProject(oversizedUnicode), /20 MB project-file limit/i);
});
