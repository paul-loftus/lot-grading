import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSnapIndex,
  findSnapTargets,
  pointByBearing,
  snapPlacement,
} from '../src/core/snapping';
import type { DrawingEntity } from '../src/core/types';

const line = (id: string, points: number[][], bulges?: number[]): DrawingEntity => ({
  id,
  name: id,
  layer: 'TEST',
  kind: 'polyline',
  closed: false,
  points: points.map(([x, y, z = 100]) => ({ x, y, z })),
  ...(bulges ? { bulges } : {}),
});
const close = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('snap targets retain exact fractional endpoints, source identity, and interpolated midpoint Z', () => {
  const entity = line('driveway', [
    [20.25, 30.75, 99],
    [60.25, 30.75, 103],
  ]);
  const original = JSON.stringify(entity);
  const index = buildSnapIndex([entity]);
  const endpoint = findSnapTargets(index, { x: 20.4, y: 30.9 }, 0.5)[0];
  assert.equal(endpoint.kind, 'endpoint');
  assert.equal(endpoint.source, 'driveway');
  assert.deepEqual(snapPlacement(endpoint, 120, false), { x: 20.25, y: 30.75, z: 120 });
  assert.deepEqual(snapPlacement(endpoint, 120, true), { x: 20.25, y: 30.75, z: 99 });
  assert.equal(findSnapTargets(index, { x: 40.25, y: 30.75 }, 0.1)[0].z, 101);
  assert.equal(JSON.stringify(entity), original);
});

test('arc midpoint follows the arc rather than its chord, including major arcs and survey coordinates', () => {
  for (const bulge of [-1, 1, 2.414213562373095]) {
    const targets = buildSnapIndex([
      line(
        'arc',
        [
          [2000000, 5000000, 123.75],
          [2000020, 5000000, 123.75],
        ],
        [bulge, 0],
      ),
    ]).targets;
    const midpoint = targets.find((target) => target.kind === 'midpoint')!;
    close(midpoint.x, 2000010);
    close(midpoint.y, 5000000 - bulge * 10);
    assert.equal(midpoint.z, 123.75);
    assert.ok(targets.some((target) => target.kind === 'center'));
  }
});

test('line intersections are clipped to finite segments and preserve Z disagreement explicitly', () => {
  const first = line('first', [
    [10, 0, 90],
    [30, 0, 110],
  ]);
  const compatible = line('second', [
    [20, -10, 100],
    [20, 10, 100],
  ]);
  const intersection = findSnapTargets(
    buildSnapIndex([first, compatible]),
    { x: 20, y: 0 },
    0.1,
  ).find((target) => target.kind === 'intersection')!;
  assert.deepEqual(snapPlacement(intersection, 12, true), { x: 20, y: 0, z: 100 });
  const conflicting = line('second', [
    [20, -10, 200],
    [20, 10, 200],
  ]);
  const conflict = findSnapTargets(buildSnapIndex([first, conflicting]), { x: 20, y: 0 }, 0.1).find(
    (target) => target.kind === 'intersection',
  )!;
  assert.equal(conflict.z, null);
  assert.throws(() => snapPlacement(conflict, 12, true), /different elevations/);
  assert.deepEqual(snapPlacement(conflict, 12, false), { x: 20, y: 0, z: 12 });
  const outside = line('outside', [
    [40, -10],
    [40, 10],
  ]);
  assert.equal(
    findSnapTargets(buildSnapIndex([first, outside]), { x: 40, y: 0 }, 0.1).filter(
      (target) => target.kind === 'intersection',
    ).length,
    0,
  );
});

test('line/arc and arc/arc intersection snaps exclude the unused half of each circle', () => {
  const arc = line(
    'arc',
    [
      [0, 0],
      [20, 0],
    ],
    [-1, 0],
  );
  const crossing = line('crossing', [
    [10, -20],
    [10, 20],
  ]);
  const index = buildSnapIndex([arc, crossing]);
  const upper = findSnapTargets(index, { x: 10, y: 10 }, 0.1).find(
    (target) => target.kind === 'intersection',
  )!;
  close(upper.x, 10);
  close(upper.y, 10);
  assert.ok(
    !findSnapTargets(index, { x: 10, y: -10 }, 0.1).some(
      (target) => target.kind === 'intersection',
    ),
  );
  const second = line(
    'second',
    [
      [10, 0],
      [30, 0],
    ],
    [-1, 0],
  );
  const point = findSnapTargets(
    buildSnapIndex([arc, second]),
    { x: 15, y: Math.sqrt(75) },
    0.1,
  ).find((target) => target.kind === 'intersection')!;
  close(point.x, 15);
  close(point.y, Math.sqrt(75));
});

test('coincident/parallel lines do not manufacture intersections, and queries honor their radius and switch', () => {
  const index = buildSnapIndex([
    line('a', [
      [0, 0],
      [20, 0],
    ]),
    line('b', [
      [0, 0],
      [20, 0],
    ]),
  ]);
  assert.ok(
    !findSnapTargets(index, { x: 5, y: 0 }, 1).some((target) => target.kind === 'intersection'),
  );
  assert.deepEqual(findSnapTargets(index, { x: 500, y: 500 }, 1), []);
  assert.deepEqual(findSnapTargets(index, { x: 0, y: 0 }, NaN), []);
  const cross = buildSnapIndex([
    line('a', [
      [0, 0],
      [20, 0],
    ]),
    line('b', [
      [5, -10],
      [5, 10],
    ]),
  ]);
  assert.ok(
    !findSnapTargets(cross, { x: 5, y: 0 }, 0.1, false).some(
      (target) => target.kind === 'intersection',
    ),
  );
});

test('survey bearings run clockwise from north without grid rounding, and reject invalid inputs', () => {
  const anchor = { x: 2000000.25, y: 5000000.75, z: 0 };
  for (const [bearing, dx, dy] of [
    [0, 0, 10.5],
    [90, 10.5, 0],
    [180, 0, -10.5],
    [270, -10.5, 0],
  ]) {
    const result = pointByBearing(anchor, bearing, 10.5, 123.75);
    close(result.x, anchor.x + dx);
    close(result.y, anchor.y + dy);
    assert.equal(result.z, 123.75);
  }
  for (const [bearing, distance] of [
    [-1, 10],
    [360, 10],
    [NaN, 10],
    [90, 0],
    [90, -1],
  ])
    assert.throws(() => pointByBearing(anchor, bearing, distance, 100));
  assert.throws(() => pointByBearing({ x: 1e12, y: 0, z: 0 }, 90, 100, 100), /range/);
});
