import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportDxf } from '../src/core/dxf';
import { measureGrade, previewGradeEdit, segmentControls } from '../src/core/grade';
import { previewDxf } from '../src/core/import';
import { createProject, parseProject, serializeProject } from '../src/core/project';
import type { Point, Project } from '../src/core/types';

function drawing(closed: boolean): Project {
  const project = createProject('Grade invariants');
  project.schemaVersion = 2;
  project.entities = [
    {
      id: 'edge',
      kind: 'polyline',
      name: 'Proposed swale',
      layer: 'FG-SWALE',
      closed,
      points: [
        { x: 2000000.25, y: 5000000.75, z: -4.5 },
        { x: 2000030.25, y: 5000040.75, z: 12.25 },
        { x: 2000090.25, y: 5000040.75, z: 8.125 },
        { x: 2000090.25, y: 5000160.75, z: 3.75 },
        { x: 2000000.25, y: 5000160.75, z: -2.25 },
      ],
      bulges: [0, 0, 0, 0, 0],
    },
    {
      id: 'benchmark',
      kind: 'point',
      name: 'Unchanged benchmark',
      layer: 'CONTROL',
      closed: false,
      points: [{ x: 2000010.25, y: 5000010.75, z: 101.125 }],
    },
  ];
  return project;
}

function freeze(value: object): void {
  Object.freeze(value);
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
}

const close = (actual: number, expected: number, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

// Explicit distances for the five edges above: the first is a 30/40/50 triangle.
const runs = [50, 60, 120, 90, 160];
for (const closed of [false, true])
  for (const hold of ['a', 'b'] as const)
    for (const percent of [-12.5, 0, 2.375])
      test(`${closed ? 'closed' : 'open'} path: holding ${hold.toUpperCase()} at ${percent}% preserves every other coordinate on every edge`, () => {
        const project = drawing(closed),
          original = structuredClone(project),
          count = closed ? 5 : 4;
        freeze(project);
        for (let segment = 0; segment < count; segment++) {
          const next = (segment + 1) % 5,
            heldIndex = hold === 'a' ? segment : next,
            movedIndex = hold === 'a' ? next : segment;
          const expectedZ =
            original.entities[0].points[heldIndex].z +
            (hold === 'a' ? 1 : -1) * runs[segment] * (percent / 100);
          const edit = previewGradeEdit(project, 'edge', segment, hold, percent);
          assert.equal(edit.heldIndex, heldIndex);
          assert.equal(edit.movedIndex, movedIndex);
          assert.equal(edit.beforeZ, original.entities[0].points[movedIndex].z);
          close(edit.afterZ, expectedZ);
          const expected = structuredClone(original.entities[0]);
          expected.points[movedIndex].z = expectedZ;
          assert.deepEqual(edit.entity, expected);
          close(edit.measurement.percent!, percent);
          assert.equal(edit.measurement.horizontal, runs[segment]);
          const affected = Array.from({ length: count }, (_, i) => i).filter(
            (i) => i !== segment && (i === movedIndex || (i + 1) % 5 === movedIndex),
          );
          assert.deepEqual(
            edit.adjacent.map((row) => row.segment),
            affected,
          );
          for (const row of edit.adjacent) {
            const end = (row.segment + 1) % 5;
            close(
              row.before.percent!,
              ((original.entities[0].points[end].z - original.entities[0].points[row.segment].z) *
                100) /
                runs[row.segment],
            );
            close(
              row.after.percent!,
              ((expected.points[end].z - expected.points[row.segment].z) * 100) / runs[row.segment],
            );
          }
          const committed = { ...original, entities: [edit.entity, original.entities[1]] };
          assert.deepEqual(parseProject(serializeProject(committed)), committed);
          assert.deepEqual(project, original);
        }
      });

test('preview results are independent of the source and of one another, including nested vertices and bulges', () => {
  const project = drawing(true),
    original = structuredClone(project),
    first = previewGradeEdit(project, 'edge', 0, 'a', 2),
    second = previewGradeEdit(project, 'edge', 0, 'a', 2),
    expected = structuredClone(second);
  first.entity.points[0].x = -999;
  first.entity.bulges![0] = 1;
  first.entity.name = 'Changed preview';
  first.adjacent[0].after.percent = 999;
  assert.deepEqual(second, expected);
  assert.deepEqual(project, original);
});

test('grade measurement is invariant under plan rotation, translation and common XYZ scaling; reversing swaps downhill', () => {
  for (const angle of [0, Math.PI / 7, Math.PI / 2, Math.PI, -Math.PI / 3])
    for (const scale of [0.3048, 1, 1200 / 3937, 10]) {
      const a = { x: 2000000, y: -5000000, z: -100 * scale },
        b = {
          x: a.x + (60 * Math.cos(angle) - 80 * Math.sin(angle)) * scale,
          y: a.y + (60 * Math.sin(angle) + 80 * Math.cos(angle)) * scale,
          z: a.z - 7.5 * scale,
        };
      const forward = measureGrade(a, b),
        reverse = measureGrade(b, a);
      close(forward.percent!, -7.5, 1e-8);
      close(forward.horizontalPerVertical!, 100 / 7.5, 1e-8);
      assert.equal(reverse.percent, -forward.percent!);
      assert.equal(reverse.deltaZ, -forward.deltaZ);
      assert.equal(reverse.horizontal, forward.horizontal);
      assert.equal(reverse.distance3D, forward.distance3D);
      assert.equal(forward.downhill, 'a-to-b');
      assert.equal(reverse.downhill, 'b-to-a');
    }
});

test('invalid hold choices and missing targets reject without modifying any project state', () => {
  const project = drawing(false),
    before = structuredClone(project);
  assert.throws(() => previewGradeEdit(project, 'absent', 0, 'a', 2), /locked/);
  for (const hold of ['', 'A', 'both', null, undefined])
    assert.throws(() => previewGradeEdit(project, 'edge', 0, hold as 'a', 2), /endpoint A or B/);
  for (const index of [-Infinity, Infinity, NaN, -1, 4, 1.01])
    assert.throws(() => segmentControls(project.entities[0], index), /valid path segment/);
  assert.deepEqual(project, before);
});

test('both grade controls reject invalid values on every axis while exact coordinate limits remain measurable', () => {
  const valid: Point = { x: 0, y: 0, z: 0 };
  for (const axis of ['x', 'y', 'z'] as const)
    for (const value of [NaN, Infinity, -Infinity, 1e12 + 1, -1e12 - 1]) {
      const invalid = { ...valid, [axis]: value };
      assert.throws(() => measureGrade(invalid, valid), /finite XYZ/);
      assert.throws(() => measureGrade(valid, invalid), /finite XYZ/);
    }
  const result = measureGrade({ x: -1e12, y: -1e12, z: -1e12 }, { x: 1e12, y: 1e12, z: 1e12 });
  close(result.percent!, 100 / Math.sqrt(2));
  assert.equal(result.condition, 'slope');
});

test('making a two-vertex 3D segment level exports its actual common Z and does not preserve stale 3D elevations', () => {
  const project = drawing(false);
  project.entities = [
    { ...project.entities[0], points: project.entities[0].points.slice(0, 2), bulges: [0, 0] },
  ];
  const edit = previewGradeEdit(project, 'edge', 0, 'b', 0);
  const exported = exportDxf({ ...project, entities: [edit.entity] });
  assert.ok(!exported.includes('AcDb3dPolyline'));
  const reopened = previewDxf(exported);
  assert.deepEqual(reopened.issues, []);
  assert.deepEqual(reopened.entities[0].points, [
    { x: 2000000.25, y: 5000000.75, z: 12.25 },
    { x: 2000030.25, y: 5000040.75, z: 12.25 },
  ]);
});
