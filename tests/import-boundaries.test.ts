import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  importReference,
  previewDxf,
  previewPoints,
  readPointTable,
  readSource,
  type PointFormat,
} from '../src/core/import';
import { entityLength } from '../src/core/geometry';
import { createProject, serializeProject } from '../src/core/project';

const format: PointFormat = {
  delimiter: ',',
  header: false,
  columns: { pointNumber: 0, x: 1, y: 2, z: 3, description: 4 },
};
const dxf = (body: string) =>
  `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n2\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`;
const options = {
  format: 'points' as const,
  units: 'feet' as const,
  context: { horizontal: 'Local survey grid', vertical: 'Local benchmark' },
  pointFormat: format,
  acceptIssues: false,
  alignment: { object: 0, vertex: 0, confirmed: true },
};

test('UTF-8 source preservation and SHA-256 agree with an independent Node implementation across byte chunk boundaries', async () => {
  for (const length of [7, 8191, 8192, 8193, 16385]) {
    const bytes = Buffer.from('\uFEFF' + 'a'.repeat(length - 7) + 'é\r\n');
    assert.equal(bytes.length, length);
    // A view with a nonzero byte offset must not accidentally preserve/hash the backing buffer.
    const backing = Buffer.concat([Buffer.from('unrelated-prefix'), bytes, Buffer.from('suffix')]);
    const slice = backing.subarray(16, 16 + bytes.length),
      source = await readSource('survey.csv', slice);
    assert.deepEqual(Buffer.from(source.contentBase64, 'base64'), bytes);
    assert.equal(source.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(source.text, bytes.toString('utf8').replace(/^\uFEFF/, ''));
  }
});

test('point tables preserve empty columns, escaped quotes, comment markers inside descriptions and physical line numbers', () => {
  const table = readPointTable(
    '\uFEFF  # ignored, unmatched "\r\n\r\n1,10,20,30,"# curb, ""north""\r\nside"\r\n2,11,,31,\r\n3,12,22,32,""',
    ',',
  );
  assert.equal(table.width, 5);
  assert.deepEqual(table.rows, [
    { line: 3, cells: ['1', '10', '20', '30', '# curb, "north"\nside'] },
    { line: 5, cells: ['2', '11', '', '31', ''] },
    { line: 6, cells: ['3', '12', '22', '32', ''] },
  ]);
  const preview = previewPoints(table, format);
  assert.deepEqual(
    preview.records.map((row) => row.record),
    ['Line 3', 'Line 6'],
  );
  assert.equal(preview.records[0].description, '# curb, "north"\nside');
  assert.equal(preview.records[1].description, '');
  assert.deepEqual(
    preview.issues.map((row) => row.record),
    ['Line 5'],
  );
});

test('quoted numeric fields and decimal exponent notation parse without accepting JavaScript-only numeric syntax', () => {
  const valid = previewPoints(readPointTable('1," +.25 ",-.5,1.25e+2,"valid"\n', ','), format);
  assert.deepEqual(valid.entities[0].points[0], { x: 0.25, y: -0.5, z: 125 });
  for (const value of ['0x10', '0b10', '1_000', '1,000', 'NaN', 'Infinity', '1e999', '', '12ft']) {
    const result = previewPoints(readPointTable(`1,"${value}",20,30,bad\n`, ','), format);
    assert.equal(result.entities.length, 0, `Should reject numeric value ${JSON.stringify(value)}`);
    assert.equal(result.issues.length, 1);
    assert.match(result.issues[0].message, /finite decimal/);
  }
});

test('rejected rows do not reserve a point number, and duplicate accepted numbers report the correct row', () => {
  const result = previewPoints(
    readPointTable(
      '001,bad,20,30,rejected\n001,10,20,30,accepted\n001,11,21,31,duplicate\n1,12,22,32,distinct text ID\n',
      ',',
    ),
    format,
  );
  assert.deepEqual(
    result.records.map((record) => record.pointNumber),
    ['001', '1'],
  );
  assert.deepEqual(
    result.issues.map((issue) => issue.record),
    ['Line 1', 'Line 3'],
  );
  assert.match(result.issues[1].message, /Duplicate point number 001/);
});

test('optional point fields can be omitted while coordinate mappings remain distinct and within the actual table', () => {
  const table = readPointTable('10;20;-3.125\n', ';'),
    minimal: PointFormat = {
      delimiter: ';',
      header: false,
      columns: { x: 0, y: 1, z: 2, pointNumber: null, description: null },
    },
    result = previewPoints(table, minimal);
  assert.deepEqual(result.entities[0].points[0], { x: 10, y: 20, z: -3.125 });
  assert.equal(result.entities[0].name, 'Survey point 1');
  assert.equal(result.records[0].pointNumber, undefined);
  for (const column of [-1, 0.25, 3, NaN, Infinity])
    assert.throws(
      () => previewPoints(table, { ...minimal, columns: { ...minimal.columns, z: column } }),
      /distinct columns/,
    );
  assert.throws(
    () => previewPoints(table, { ...minimal, columns: { ...minimal.columns, description: 0 } }),
    /distinct columns/,
  );
});

test('CSV quoting errors reject the whole table instead of offering a truncated partial import', () => {
  for (const source of [
    '1,10,20,30,"unfinished',
    '1,10,20,30,"quoted"unexpected\n',
    '1,10,20,30,unquoted"quote\n',
  ])
    assert.throws(() => readPointTable(source, ','), /quoted|Quote|unfinished/);
  assert.throws(() => readPointTable('1,2,3\0', ','), /invalid/);
});

test('point column and row limits allow their documented boundary and reject the next record or column', () => {
  assert.equal(readPointTable(Array(100).fill('x').join(','), ',').width, 100);
  assert.throws(() => readPointTable(Array(101).fill('x').join(','), ','), /100 columns/);
  const body = Array.from({ length: 10000 }, (_, i) => `${i},1,2,3,point`).join('\n');
  const valid = previewPoints(readPointTable('number,x,y,z,description\n' + body, ','), {
    ...format,
    header: true,
  });
  assert.equal(valid.entities.length, 10000);
  assert.equal(valid.issues.length, 0);
  assert.equal(valid.records.at(-1)!.record, 'Line 10001');
  assert.throws(
    () => previewPoints(readPointTable(body + '\n10000,1,2,3,extra', ','), format),
    /10,000 survey points/,
  );
  assert.throws(
    () => readPointTable(body + '\n10000,1,2,3,extra\n10001,1,2,3,extra', ','),
    /10,000 data rows/,
  );
});

test('DXF comments and BOM/CRLF preserve supported geometry while unsupported records have an explicit report', () => {
  const source = dxf(
    '999\ncomment mentioning SECTION and EOF\n0\nPOINT\n5\nA1\n8\nCONTROL\n10\n2000000.25\n20\n5000000.75\n30\n-3.125\n0\nSPLINE\n5\nB1\n',
  );
  const preview = previewDxf('\uFEFF' + source.replaceAll('\n', '\r\n'));
  assert.deepEqual(preview.entities[0].points, [{ x: 2000000.25, y: 5000000.75, z: -3.125 }]);
  assert.equal(preview.entities.length, 1);
  assert.deepEqual(preview.counts, { POINT: 1, SPLINE: 1 });
  assert.equal(preview.issues.length, 1);
  assert.equal(preview.issues[0].type, 'SPLINE');
  assert.match(preview.issues[0].record, /handle B1/);
});

test('DXF ARC angles wrapping north and crossing zero retain the directed sweep rather than a full circle or reversed arc', () => {
  for (const [start, end, sweep] of [
    [350, 10, 20],
    [10, 350, 340],
    [-90, 90, 180],
    [90, -90, 180],
  ]) {
    const preview = previewDxf(
      dxf(`0\nARC\n10\n0\n20\n0\n30\n-5\n40\n12.5\n50\n${start}\n51\n${end}\n`),
    );
    assert.deepEqual(preview.issues, []);
    const entity = preview.entities[0];
    assert.ok(Math.abs(entityLength(entity) - (12.5 * sweep * Math.PI) / 180) < 1e-10);
    assert.ok(entity.bulges![0] > 0);
    assert.ok(entity.points.every((p) => p.z === -5));
  }
});

test('tilted, extruded, wide and fitted DXF geometry is reported rather than silently flattened or simplified', () => {
  const line = '0\nLINE\n10\n0\n20\n0\n11\n10\n21\n0\n';
  for (const modifier of ['210\n1\n', '230\n-1\n', '39\n1\n', '410\nLayout1\n']) {
    const preview = previewDxf(dxf(line + modifier));
    assert.equal(preview.entities.length, 0);
    assert.equal(preview.issues.length, 1);
  }
  for (const modifier of ['43\n0.5\n', '70\n2\n', '70\n4\n', '70\n256\n']) {
    const preview = previewDxf(
      dxf('0\nLWPOLYLINE\n90\n2\n' + modifier + '10\n0\n20\n0\n10\n10\n20\n0\n'),
    );
    assert.equal(preview.entities.length, 0);
    assert.equal(preview.issues.length, 1);
  }
});

test('reference import never aliases the source project, preview, metadata or earlier imports', async () => {
  const source = await readSource('controls.csv', Buffer.from('1,10,20,30,benchmark\n')),
    preview = previewPoints(readPointTable(source.text, ','), format),
    original = createProject('Atomic import'),
    before = serializeProject(original),
    next = importReference(original, source, preview, options),
    saved = structuredClone(next);
  preview.entities[0].points[0].z = 999;
  preview.records[0].description = 'Changed preview';
  assert.deepEqual(next, saved);
  assert.equal(serializeProject(original), before);
  const second = importReference(
    next,
    source,
    previewPoints(readPointTable(source.text, ','), format),
    options,
  );
  second.references![0].entities[0].points[0].x = -999;
  second.references![1].records[0].description = 'Changed second import';
  assert.deepEqual(next, saved);
  assert.notEqual(second.references![0].id, second.references![1].id);
});

test('invalid alignment targets and a twenty-first reference fail atomically with the current drawing intact', async () => {
  const source = await readSource('controls.csv', Buffer.from('1,10,20,30,benchmark\n')),
    preview = previewPoints(readPointTable(source.text, ','), format);
  let project = createProject('Reference limits');
  for (let i = 0; i < 20; i++) project = importReference(project, source, preview, options);
  const before = serializeProject(project);
  for (const [object, vertex] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [0.5, 0],
  ])
    assert.throws(
      () =>
        importReference(project, source, preview, {
          ...options,
          alignment: { object, vertex, confirmed: true },
        }),
      /valid alignment control/,
    );
  assert.throws(() => importReference(project, source, preview, options), /20 reference sources/);
  assert.equal(serializeProject(project), before);
});
