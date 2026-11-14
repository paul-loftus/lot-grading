import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  importReference,
  MAX_SOURCE_BYTES,
  previewDxf,
  previewPoints,
  readPointTable,
  readSource,
} from '../src/core/import';
import type { PointFormat } from '../src/core/import';
import {
  createProject,
  parseProject,
  serializeProject,
  validateProject,
} from '../src/core/project';
import { exportDxf } from '../src/core/dxf';
import { exportEntities, visibleEntities } from '../src/core/references';
import { buildSnapIndex, findSnapTargets, snapPlacement } from '../src/core/snapping';
import { arcFromBulge, entityLength } from '../src/core/geometry';

const folder = new URL('./fixtures/import/', import.meta.url);
const pnezd: PointFormat = {
  delimiter: ',',
  header: true,
  columns: { x: 2, y: 1, z: 3, pointNumber: 0, description: 4 },
};
const options = () => ({
  format: 'dxf' as const,
  units: 'feet' as const,
  context: { horizontal: 'Illustrative local grid', vertical: 'Illustrative benchmark' },
  acceptIssues: true,
  alignment: { object: 0, vertex: 0, confirmed: true },
});
const dxf = (body: string, units = 2) =>
  `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n${units}\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`;
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) <= 1e-9, `${a} != ${b}`);

test('independently authored DXF preserves large coordinates, XY/Z, layers and exact planar arcs; reports unsupported records', async () => {
  const preview = previewDxf(await readFile(new URL('base-plan.dxf', folder), 'utf8'));
  assert.equal(preview.declaredUnits, 'feet');
  assert.equal(preview.entities.length, 7);
  assert.deepEqual(
    preview.issues.map((i) => i.type),
    ['TEXT', 'INSERT', 'CIRCLE', 'LWPOLYLINE'],
  );
  assert.equal(preview.counts.POLYLINE, 2);
  const byLayer = (layer: string) => preview.entities.find((e) => e.layer === layer)!;
  assert.deepEqual(byLayer('EXISTING-ROAD').points, [
    { x: 2000000.25, y: 5000000.75, z: 98.125 },
    { x: 2000030.25, y: 5000000.75, z: 99.625 },
  ]);
  assert.deepEqual(
    byLayer('EXISTING-3D').points.map((p) => p.z),
    [99.25, 100.75, 101.125],
  );
  assert(byLayer('EXISTING-2D').points.every((p) => p.z === 102.125));
  const curb = byLayer('EXISTING-CURB');
  close(curb.bulges![0], Math.tan(Math.PI / 8));
  const arc = byLayer('EXISTING-ARC'),
    circle = byLayer('EXISTING-TREE');
  const curve = arcFromBulge(arc.points[0], arc.points[1], arc.bulges![0])!;
  close(curve.radius, 7.5);
  close(curve.center.x, 2000040.25);
  close(curve.center.y, 5000020.75);
  close(curve.sweep, Math.PI / 2);
  assert.equal(circle.closed, true);
  close(entityLength(circle), 2 * Math.PI * 6.25);
});

test('closed two-vertex bulged DXF paths are split exactly, retaining closure and arc length', () => {
  const p = previewDxf(
    dxf('0\nLWPOLYLINE\n90\n2\n70\n1\n38\n12.5\n10\n0\n20\n0\n42\n1\n10\n20\n20\n0\n42\n1\n'),
  );
  assert.equal(p.issues.length, 0);
  assert.equal(p.entities[0].closed, true);
  assert.equal(p.entities[0].points.length, 3);
  close(entityLength(p.entities[0]), 20 * Math.PI);
});

test('DXF rejects malformed structure, nonfinite coordinates, incomplete sequences, paper space and unsupported unit declarations', () => {
  for (const text of [
    'not a dxf',
    '0\nSECTION\n2\nENTITIES\n0\nEOF\n',
    dxf('').replace('EOF', 'BROKEN'),
    '0\nSECTION\n2\nENTITIES\n10\n',
  ])
    assert.throws(() => previewDxf(text));
  for (const body of [
    '0\nLINE\n10\nNaN\n20\n0\n11\n1\n21\n1\n',
    '0\nLINE\n10\n0\n20\n0\n11\nInfinity\n21\n1\n',
    '0\nPOLYLINE\n70\n8\n0\nVERTEX\n10\n1\n20\n2\n30\n3\n',
    '0\nPOINT\n67\n1\n10\n1\n20\n2\n',
    '0\nLWPOLYLINE\n90\n3\n10\n0\n20\n0\n10\n10\n20\n10\n',
    '0\nPOLYLINE\n70\n64\n0\nSEQEND\n',
  ]) {
    const p = previewDxf(dxf(body));
    assert.equal(p.entities.length, 0);
    assert(p.issues.length > 0);
  }
  assert.equal(previewDxf(dxf('', 4)).unsupportedUnits, true);
  assert.equal(previewDxf(dxf('', 0)).declaredUnits, null);
  assert.equal(previewDxf(dxf('', 21)).declaredUnits, 'us-survey-feet');
});

test('mapped survey points retain point IDs/descriptions and swapped northing/easting without rounding; source bytes survive BOM and CRLF', async () => {
  const bytes = await readFile(new URL('survey-pnezd.csv', folder));
  assert.equal(bytes.subarray(0, 3).toString('hex'), 'efbbbf');
  assert.ok(bytes.includes(Buffer.from('\r\n')), 'The source fixture must retain its CRLF bytes.');
  const file = await readSource('survey-pnezd.csv', bytes);
  assert.deepEqual(Buffer.from(file.contentBase64, 'base64'), bytes);
  assert.match(file.sha256, /^[0-9a-f]{64}$/);
  const p = previewPoints(readPointTable(file.text, ','), pnezd);
  assert.equal(p.entities.length, 3);
  assert.equal(p.issues.length, 0);
  assert.deepEqual(p.entities[0].points[0], { x: 2000000.25, y: 5000000.75, z: 98.125 });
  assert.equal(p.records[0].pointNumber, '101');
  assert.equal(p.records[0].description, 'Road, benchmark');
  assert.throws(
    () =>
      previewPoints(readPointTable(file.text, ','), {
        ...pnezd,
        columns: { ...pnezd.columns, x: 1 },
      }),
    /distinct/,
  );
});

test('survey delimiters, quoted fields and multiline descriptions work; duplicate and invalid points produce row reports', () => {
  const format: PointFormat = { ...pnezd, header: false };
  const p = previewPoints(
    readPointTable(
      '1,10,20,30,"Fence, ""north""\nside"\n2,11,,31,missing X\n1,12,22,32,duplicate\n3,12,22,Infinity,bad Z\n',
      ',',
    ),
    format,
  );
  assert.equal(p.entities.length, 1);
  assert.equal(p.issues.length, 3);
  assert.equal(p.records[0].description, 'Fence, "north"\nside');
  assert.deepEqual(
    p.issues.map((i) => i.record),
    ['Line 3', 'Line 4', 'Line 5'],
  );
  assert.throws(() => readPointTable('1,2,"unfinished', ','), /unfinished/);
  const comments = previewPoints(
    readPointTable('# comment with an unmatched "\n1,10,20,30,valid\n', ','),
    format,
  );
  assert.equal(comments.entities.length, 1);
  assert.equal(comments.records[0].record, 'Line 2');
  const controls = previewPoints(
    readPointTable(
      '1,10,20,30,valid\n"bad\nnumber",10,20,30,test\n2,10,20,30,bad\u0001description\n',
      ',',
    ),
    format,
  );
  assert.equal(controls.entities.length, 1);
  assert.equal(controls.issues.length, 2);
  for (const delimiter of [';', '\t', 'space'] as const) {
    const text =
      delimiter === 'space'
        ? '# survey\n1  10 20 30 curb edge\n'
        : `1${delimiter}10${delimiter}20${delimiter}30${delimiter}curb edge\n`;
    const result = previewPoints(readPointTable(text, delimiter), { ...format, delimiter });
    assert.equal(result.entities.length, 1);
    assert.equal(result.records[0].description, 'curb edge');
  }
});

test('reference import is atomic, schema 3 preserves source and alignment, and mismatched units/partial imports require explicit decisions', async () => {
  const file = await readSource('base-plan.dxf', await readFile(new URL('base-plan.dxf', folder)));
  const p = previewDxf(file.text),
    project = createProject('Proposed lot'),
    before = serializeProject(project);
  assert.throws(
    () => importReference(project, file, p, { ...options(), acceptIssues: false }),
    /acknowledge/,
  );
  assert.throws(
    () => importReference(project, file, p, { ...options(), units: 'meters' }),
    /units/,
  );
  assert.throws(
    () =>
      importReference(project, file, p, {
        ...options(),
        alignment: { object: 0, vertex: 0, confirmed: false },
      }),
    /Confirm/,
  );
  assert.equal(serializeProject(project), before);
  const next = importReference(project, file, p, options());
  assert.equal(next.schemaVersion, 3);
  assert.equal(next.entities.length, 0);
  assert.equal(next.references!.length, 1);
  const reopened = parseProject(serializeProject(next));
  assert.deepEqual(reopened, next);
  assert.equal(reopened.references![0].contentBase64, file.contentBase64);
  assert.equal(reopened.references![0].includeInExport, false);
  const second = importReference(next, file, p, options());
  assert.equal(new Set(second.references!.flatMap((s) => s.entities.map((e) => e.id))).size, 14);
  assert.throws(() => validateProject({ ...next, schemaVersion: 2 }), /schema version 3/);
  assert.throws(
    () =>
      validateProject({
        ...next,
        references: [{ ...next.references![0], fileName: '/absolute/source.dxf' }],
      }),
    /file name/,
  );
  assert.throws(() =>
    validateProject({
      ...next,
      references: [
        {
          ...next.references![0],
          entities: [{ ...next.references![0].entities[0], points: [{ x: NaN, y: 0, z: 0 }] }],
        },
      ],
    }),
  );
});

test('hidden references do not snap; export inclusion is separate from visibility and preserves source elevations', async () => {
  const file = await readSource('base-plan.dxf', await readFile(new URL('base-plan.dxf', folder))),
    p = previewDxf(file.text);
  const project = importReference(createProject('Reference test'), file, p, options());
  assert.equal(visibleEntities(project).length, 7);
  assert.equal(exportEntities(project).length, 0);
  const target = findSnapTargets(
    buildSnapIndex(visibleEntities(project)),
    { x: 2000000.25, y: 5000000.75 },
    0.1,
  )[0];
  assert.equal(snapPlacement(target, 125, false).z, 125);
  assert.equal(snapPlacement(target, 125, true).z, 98.125);
  assert.equal(previewDxf(exportDxf(project)).entities.length, 0);
  project.references![0] = { ...project.references![0], visible: false, includeInExport: true };
  assert.equal(visibleEntities(project).length, 0);
  assert.equal(exportEntities(project).length, 7);
  const exported = previewDxf(exportDxf(project));
  assert.equal(exported.entities.length, 7);
  assert.equal(exported.entities.find((e) => e.layer === 'EXISTING-ROAD')!.points[1].z, 99.625);
});

test('source handling rejects binary, invalid encoding, paths and excessive files without retaining unusable content', async () => {
  await assert.rejects(readSource('bad.dxf', new Uint8Array([0, 1, 2])), /Binary/);
  await assert.rejects(readSource('bad.csv', new Uint8Array([0xff, 0xff])), /UTF-8/);
  await assert.rejects(readSource('large.csv', new Uint8Array(MAX_SOURCE_BYTES + 1)), /4 MB/);
  await assert.rejects(
    readSource('/private/source.csv', new TextEncoder().encode('1,2,3')),
    /plain file name/,
  );
});
