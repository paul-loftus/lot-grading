import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  gradeNumber,
  gradePercent,
  gradeRatio,
  measureGrade,
  previewGradeEdit,
  segmentControls,
} from '../src/core/grade';
import {
  createProject,
  parseProject,
  serializeProject,
  validateProject,
} from '../src/core/project';
import { exportDxf } from '../src/core/dxf';
import { importReference, previewDxf, readSource } from '../src/core/import';
import type { DrawingEntity, Point, Units } from '../src/core/types';

const p = (x: number, y: number, z: number): Point => ({ x, y, z });
const close = (a: number, b: number, tolerance = 1e-10) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const fixture = () => {
  const project = createProject('Grade checks');
  const entity: DrawingEntity = {
    id: 'driveway',
    kind: 'polyline',
    name: 'Driveway edge',
    layer: 'FG-BREAKLINE',
    closed: false,
    points: [p(0, 0, 100), p(100, 0, 100), p(150, 0, 101)],
  };
  project.entities = [entity];
  return project;
};

test('grade uses horizontal XY run and signed B-A rise, not the three-dimensional length', () => {
  const m = measureGrade(p(0, 0, 100), p(100, 0, 102));
  assert.equal(m.horizontal, 100);
  assert.equal(m.deltaZ, 2);
  assert.equal(m.percent, 2);
  assert.equal(m.horizontalPerVertical, 50);
  assert.equal(m.downhill, 'b-to-a');
  assert(m.distance3D > 100);
  assert.notEqual((2 / m.distance3D) * 100, m.percent);
  const reverse = measureGrade(p(100, 0, 102), p(0, 0, 100));
  assert.equal(reverse.percent, -2);
  assert.equal(reverse.downhill, 'a-to-b');
  assert.equal(reverse.horizontalPerVertical, 50);
  assert.equal(gradePercent(m), '+2%');
  assert.equal(gradeRatio(m), '50 H : 1 V');
});
test('diagonal and large-coordinate controls retain precision; common unit scaling leaves percent and H:V unchanged', () => {
  const a = p(2000000.25, 5000000.75, 100.125),
    b = p(2000060.25, 5000080.75, 95.125);
  const m = measureGrade(a, b);
  assert.equal(m.horizontal, 100);
  assert.equal(m.percent, -5);
  assert.equal(m.horizontalPerVertical, 20);
  for (const factor of [1, 0.3048, 1200 / 3937]) {
    const scaled = measureGrade(p(0, 0, 100 * factor), p(60 * factor, 80 * factor, 95 * factor));
    close(scaled.percent!, -5);
    close(scaled.horizontalPerVertical!, 20);
  }
});
test('level, vertical and coincident controls have explicit ratio/grade states without invented zero grades', () => {
  const level = measureGrade(p(0, 0, 100), p(50, 0, 100));
  assert.equal(level.percent, 0);
  assert.equal(level.condition, 'level');
  assert.equal(level.downhill, null);
  assert.match(gradeRatio(level), /Level/);
  const vertical = measureGrade(p(20, 30, 100), p(20, 30, 105));
  assert.equal(vertical.percent, null);
  assert.equal(vertical.condition, 'vertical');
  assert.match(gradePercent(vertical), /Undefined/);
  assert.match(gradeRatio(vertical), /0 H : 1 V/);
  assert.equal(vertical.downhill, null);
  const coincident = measureGrade(p(20, 30, 100), p(20, 30, 100));
  assert.equal(coincident.condition, 'coincident');
  assert.equal(coincident.percent, null);
  assert.match(gradeRatio(coincident), /coincident/);
});
test('numeric boundaries reject invalid controls and report nonrepresentable measurements without displaying Infinity or false zero', () => {
  for (const bad of [p(NaN, 0, 0), p(0, Infinity, 0), p(0, 0, 1e13)])
    assert.throws(() => measureGrade(bad, p(1, 0, 0)), /finite XYZ/);
  const overflow = measureGrade(p(0, 0, 0), p(Number.MIN_VALUE, 0, 100));
  assert.equal(overflow.percent, null);
  assert.equal(overflow.condition, 'out-of-range');
  assert.match(gradePercent(overflow), /numeric range/);
  const underflow = measureGrade(p(0, 0, 0), p(1e12, 0, Number.MIN_VALUE));
  assert.equal(underflow.percent, null);
  assert.match(gradeRatio(underflow), /numeric range/);
  assert.notEqual(gradeNumber(1e-9), '0');
  assert.equal(gradeNumber(-0), '0');
});
test('holding A changes only B Z and previews the adjacent segment with one immutable proposed entity', () => {
  const project = fixture(),
    before = serializeProject(project);
  const edit = previewGradeEdit(project, 'driveway', 0, 'a', 2);
  assert.equal(edit.heldIndex, 0);
  assert.equal(edit.movedIndex, 1);
  assert.equal(edit.afterZ, 102);
  assert.deepEqual(edit.entity.points, [p(0, 0, 100), p(100, 0, 102), p(150, 0, 101)]);
  assert.equal(edit.entity.id, 'driveway');
  assert.equal(edit.entity.layer, 'FG-BREAKLINE');
  assert.equal(edit.adjacent.length, 1);
  assert.equal(edit.adjacent[0].segment, 1);
  assert.equal(edit.adjacent[0].before.percent, 2);
  assert.equal(edit.adjacent[0].after.percent, -2);
  assert.equal(serializeProject(project), before);
});
test('holding B retains the same A-to-B sign convention for both positive and negative requests', () => {
  const project = fixture();
  project.entities[0].points[1].z = 102;
  const rise = previewGradeEdit(project, 'driveway', 0, 'b', 3);
  assert.equal(rise.afterZ, 99);
  assert.equal(rise.entity.points[1].z, 102);
  assert.equal(rise.measurement.percent, 3);
  const fall = previewGradeEdit(project, 'driveway', 0, 'b', -4);
  assert.equal(fall.afterZ, 106);
  assert.equal(fall.entity.points[1].z, 102);
  assert.equal(fall.measurement.percent, -4);
  assert.equal(fall.measurement.downhill, 'a-to-b');
});
test('closing segments are measured and edited with correct wraparound and adjacent-edge effects', () => {
  const project = fixture();
  project.entities[0].closed = true;
  project.entities[0].points = [p(0, 0, 100), p(100, 0, 100), p(100, 100, 100)];
  const controls = segmentControls(project.entities[0], 2);
  assert.equal(controls.aIndex, 2);
  assert.equal(controls.bIndex, 0);
  const edit = previewGradeEdit(project, 'driveway', 2, 'b', 2);
  assert.equal(edit.movedIndex, 2);
  assert.equal(edit.entity.points[0].z, 100);
  close(edit.measurement.percent!, 2);
  assert.equal(edit.adjacent[0].segment, 1);
});
test('protected kinds and any curve-bearing path reject grade edits without flattening or changing source geometry', () => {
  const project = fixture();
  for (const kind of ['contour', 'boundary', 'building', 'point'] as const) {
    project.entities[0].kind = kind;
    assert.throws(() => previewGradeEdit(project, 'driveway', 0, 'a', 2), /proposed polylines/);
  }
  project.entities[0] = {
    ...fixture().entities[0],
    bulges: [0, 0.5, 0],
    points: [p(0, 0, 100), p(100, 0, 100), p(150, 0, 100)],
  };
  const before = JSON.stringify(project.entities);
  assert.throws(() => previewGradeEdit(project, 'driveway', 0, 'a', 2), /circular arcs/);
  assert.equal(JSON.stringify(project.entities), before);
});
test('invalid segments, zero run, nonfinite grades, out-of-range Z and unrepresentable changes reject explicitly', () => {
  const project = fixture();
  for (const segment of [-1, 0.5, 2, NaN])
    assert.throws(
      () => previewGradeEdit(project, 'driveway', segment, 'a', 2),
      /valid path segment/,
    );
  for (const grade of [NaN, Infinity, -Infinity])
    assert.throws(() => previewGradeEdit(project, 'driveway', 0, 'a', grade), /finite signed/);
  project.entities[0].points[0].z = 1e12;
  assert.throws(() => previewGradeEdit(project, 'driveway', 0, 'a', 2), /outside/);
  assert.throws(() => previewGradeEdit(project, 'driveway', 0, 'a', 1e-12), /too small/);
  project.entities[0].points[1] = { ...project.entities[0].points[0] };
  assert.throws(() => previewGradeEdit(project, 'driveway', 0, 'a', 2), /no horizontal run/);
});
test('reference geometry is never an editable grade target and committed grades survive serialization/export in every unit', async () => {
  const file = await readSource(
    'base-plan.dxf',
    await readFile(new URL('./fixtures/import/base-plan.dxf', import.meta.url)),
  );
  const project = importReference(fixture(), file, previewDxf(file.text), {
    format: 'dxf',
    units: 'feet',
    context: { horizontal: '', vertical: '' },
    acceptIssues: true,
    alignment: { object: 0, vertex: 0, confirmed: true },
  });
  const source = structuredClone(project.references);
  assert.throws(
    () => previewGradeEdit(project, project.references![0].entities[0].id, 0, 'a', 2),
    /Reference geometry is locked/,
  );
  const edit = previewGradeEdit(project, 'driveway', 0, 'a', 2.375);
  const committed = validateProject({ ...project, entities: [edit.entity] });
  assert.deepEqual(parseProject(serializeProject(committed)), committed);
  assert.deepEqual(committed.references, source);
  for (const units of ['meters', 'feet', 'us-survey-feet'] satisfies Units[]) {
    const standalone = { ...fixture(), units, entities: [edit.entity] };
    assert.equal(parseProject(serializeProject(standalone)).entities[0].points[1].z, 102.375);
    assert.match(exportDxf(standalone), /AcDb3dPolyline/);
  }
});
