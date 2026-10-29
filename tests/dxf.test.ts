import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DXF_CONTRACT_VERSION, DXF_VERSION, exportDxf } from '../src/core/dxf';
import type { DrawingEntity, Project } from '../src/core/types';

const contract = JSON.parse(
  readFileSync(new URL('./fixtures/export/cases.json', import.meta.url), 'utf8'),
) as {
  contractVersion: number;
  cases: { name: string; project: Project; expected: Record<string, number> }[];
};
const base = () => structuredClone(contract.cases[0].project);
function pairs(dxf: string): [number, string][] {
  const lines = dxf.trimEnd().split(/\r?\n/);
  assert.equal(lines.length % 2, 0);
  return Array.from({ length: lines.length / 2 }, (_, index) => [
    Number(lines[index * 2]),
    lines[index * 2 + 1],
  ]);
}

test('DXF public export contract version is explicit', () => {
  assert.equal(DXF_CONTRACT_VERSION, contract.contractVersion);
  assert.equal(DXF_VERSION, 'AC1027');
});

test('committed Civil 3D receiving sample matches the current lossless export contract', () => {
  const project = JSON.parse(
    readFileSync(new URL('../examples/Willow-Creek-Lot-12.lotgrade', import.meta.url), 'utf8'),
  ) as Project;
  const expected = readFileSync(
    new URL('../examples/Willow-Creek-Lot-12.dxf', import.meta.url),
    'ascii',
  );
  assert.equal(project.id, 'willow-creek-lot-12');
  assert.equal(project.createdAt, '2026-10-26T00:00:00.000Z');
  assert.equal(project.entities.length, 10);
  assert.equal(exportDxf(project), expected);
});

for (const fixture of contract.cases) {
  test(`exports ${fixture.name} deterministically without changing its project`, () => {
    const project = structuredClone(fixture.project);
    const original = JSON.stringify(project);
    const first = exportDxf(project);
    assert.equal(exportDxf(project), first);
    assert.equal(JSON.stringify(project), original);
    assert.match(first, /^0\r\nSECTION\r\n2\r\nHEADER\r\n/);
    assert.match(first, /0\r\nEOF\r\n$/);
    assert.ok([...first].every((character) => character.charCodeAt(0) <= 127));
    const tags = pairs(first);
    const units = tags.findIndex(([code, value]) => code === 9 && value === '$INSUNITS');
    assert.deepEqual(tags[units + 1], [70, fixture.expected.insunits.toString()]);
    const seed = tags.findIndex(([code, value]) => code === 9 && value === '$HANDSEED');
    const allHandles = tags
      .filter(([code]) => code === 5)
      .map(([, value]) => Number.parseInt(value, 16));
    assert.equal(
      new Set(allHandles).size,
      allHandles.length,
      'Every CAD handle including HANDSEED must be unique',
    );
    assert.equal(Number.parseInt(tags[seed + 1][1], 16), Math.max(...allHandles));
  });
}

test('every supported drawing kind and a closed 3D line have explicit export coverage', () => {
  const project = base();
  assert.deepEqual([...new Set(project.entities.map((entity) => entity.kind))].sort(), [
    'boundary',
    'building',
    'contour',
    'point',
    'polyline',
  ]);
  const tags = pairs(exportDxf(project));
  assert.ok(tags.some(([code, value]) => code === 100 && value === 'AcDb3dPolyline'));
  assert.ok(
    tags.some(([code, value]) => code === 70 && value === '9'),
    'Closed 3D polyline has closure and 3D flags',
  );
  assert.ok(
    tags.some(([code, value]) => code === 38 && value === '-3.75'),
    'Negative contour elevation survives',
  );
});

test('keeps tiny nonzero elevation changes as true 3D geometry', () => {
  const project = base();
  project.entities = [
    {
      id: 'tiny-z',
      name: 'Tiny change',
      kind: 'polyline',
      layer: 'LINE',
      closed: false,
      points: [
        { x: 1, y: 2, z: 100 },
        { x: 3, y: 4, z: 100.000000001 },
      ],
    },
  ];
  const tags = pairs(exportDxf(project));
  assert.ok(tags.some(([code, value]) => code === 100 && value === 'AcDb3dPolyline'));
  assert.ok(tags.some(([code, value]) => code === 30 && value === '100.000000001'));
});

test('rejects nonfinite coordinates, unknown units/kinds, malformed shapes, and duplicate IDs', () => {
  const invalid: ((project: Project) => void)[] = [
    (project) => {
      project.entities[0].points[0].x = NaN;
    },
    (project) => {
      project.entities[0].points[0].z = Infinity;
    },
    (project) => {
      project.units = 'inches' as Project['units'];
    },
    (project) => {
      project.units = 'toString' as Project['units'];
    },
    (project) => {
      project.entities[0].kind = 'spline' as DrawingEntity['kind'];
    },
    (project) => {
      project.entities[0].kind = 'constructor' as DrawingEntity['kind'];
    },
    (project) => {
      project.entities[0].points = [];
    },
    (project) => {
      project.entities[0].closed = false;
    },
    (project) => {
      project.entities[2].points[1].z = 999;
    },
    (project) => {
      project.entities[1].id = project.entities[0].id;
    },
    (project) => {
      project.entities[0].layer = 'injected\n0\nEOF';
    },
    (project) => {
      project.entities[0].layer = 'bad/layer';
    },
    (project) => {
      project.entities[0].name = 'injected\n0\nEOF';
    },
    (project) => {
      project.entities[7].points.push({ x: 0, y: 0, z: 0 });
    },
  ];
  for (const mutate of invalid) {
    const project = base();
    mutate(project);
    assert.throws(() => exportDxf(project));
  }
});

test('exports high precision global coordinates directly, with no view origin/zoom dependence', () => {
  const project = base();
  const before = exportDxf(project);
  project.view = { centerX: -34567890.2, centerY: 7893456789.7, scale: 500 };
  assert.equal(exportDxf(project), before);
  assert.ok(before.includes('2000001.123456789'));
  assert.ok(before.includes('5000060.987654321'));
});

test('coalesces case-insensitive CAD layer names instead of creating duplicate records', () => {
  const project = base();
  project.entities[0].layer = 'shared-layer';
  project.entities[5].layer = 'SHARED-LAYER';
  const tags = pairs(exportDxf(project));
  assert.equal(
    tags.filter(([code, value]) => code === 2 && value.toUpperCase() === 'SHARED-LAYER').length,
    1,
  );
  assert.equal(tags.filter(([code, value]) => code === 8 && value === 'SHARED-LAYER').length, 0);
  assert.ok(tags.some(([code, value]) => code === 8 && value === 'shared-layer'));
});

test('escapes literal backslashes in text so they cannot become a DXF Unicode sequence', () => {
  const project = base();
  project.entities[7].name = 'Literal \\U+0041';
  assert.ok(exportDxf(project).includes('Literal \\U+005CU+0041 -2.125'));
});
