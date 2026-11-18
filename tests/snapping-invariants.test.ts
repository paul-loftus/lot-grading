import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSnapIndex,
  findSnapTargets,
  pointByBearing,
  snapPlacement,
} from '../src/core/snapping';
import type { DrawingEntity, Point } from '../src/core/types';

const line = (id: string, points: Point[], bulges?: number[], closed = false): DrawingEntity => ({
  id,
  name: id,
  layer: 'TEST',
  kind: 'polyline',
  points,
  bulges,
  closed,
});
const p = (x: number, y: number, z = 100): Point => ({ x, y, z });
const close = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('intersection snaps include the closing edge and interpolate its Z using the wraparound endpoints', () => {
  const outline = line('closed', [p(0, 0, 90), p(20, 0, 100), p(20, 20, 110)], undefined, true),
    crossing = line('crossing', [p(10, 5, 100), p(10, 15, 100)]),
    targets = findSnapTargets(buildSnapIndex([outline, crossing]), p(10, 10), 0.01),
    intersections = targets.filter((target) => target.kind === 'intersection');
  assert.equal(intersections.length, 1);
  assert.equal(intersections[0].source, 'closed / crossing');
  assert.deepEqual(snapPlacement(intersections[0], 999, true), p(10, 10, 100));
});

test('a line tangent to an arc produces one exact intersection, with no duplicate candidate', () => {
  const arc = line('arc', [p(0, 0), p(20, 0)], [-1, 0]),
    tangent = line('tangent', [p(0, 10), p(20, 10)]),
    hits = findSnapTargets(buildSnapIndex([arc, tangent]), p(10, 10), 0.01).filter(
      (target) => target.kind === 'intersection',
    );
  assert.equal(hits.length, 1);
  assert.deepEqual(snapPlacement(hits[0], -5, true), p(10, 10));
});

test('externally tangent arcs return a single shared endpoint and disjoint or nested circles do not invent crossings', () => {
  const first = line('first', [p(0, 0), p(20, 0)], [-1, 0]);
  const touching = line('touching', [p(20, 0), p(40, 0)], [-1, 0]);
  const hits = findSnapTargets(buildSnapIndex([first, touching]), p(20, 0), 0.01).filter(
    (target) => target.kind === 'intersection',
  );
  assert.equal(hits.length, 1);
  close(hits[0].x, 20);
  close(hits[0].y, 0);
  for (const other of [
    line('disjoint', [p(21, 0), p(41, 0)], [-1, 0]),
    line('nested', [p(5, 0), p(15, 0)], [-1, 0]),
  ]) {
    assert.ok(
      !findSnapTargets(buildSnapIndex([first, other]), p(20, 0), 30).some(
        (target) => target.kind === 'intersection',
      ),
    );
  }
});

test('semicircle intersections and their source elevations survive survey-coordinate rotation and input order', () => {
  for (const angle of [0, Math.PI / 5, Math.PI / 2, Math.PI]) {
    const transform = (point: Point): Point => ({
      x: 2000000.25 + point.x * Math.cos(angle) - point.y * Math.sin(angle),
      y: 5000000.75 + point.x * Math.sin(angle) + point.y * Math.cos(angle),
      z: point.z,
    });
    const arc = line('arc', [p(0, 0), p(20, 0)].map(transform), [-1, 0]),
      cross = line('crossing', [p(10, -20, 97), p(10, 20, 101)].map(transform)),
      expected = transform(p(10, 10));
    for (const entities of [
      [arc, cross],
      [cross, arc],
    ]) {
      const hits = findSnapTargets(buildSnapIndex(entities), expected, 0.01).filter(
        (target) => target.kind === 'intersection',
      );
      assert.equal(hits.length, 1);
      close(hits[0].x, expected.x, 2e-8);
      close(hits[0].y, expected.y, 2e-8);
      close(hits[0].z!, 100);
    }
  }
});

test('snap ordering keeps coincident targets distinct, ranks control types, and uses stable identities for cycling', () => {
  const point: DrawingEntity = { ...line('spot', [p(0, 0, 123)]), kind: 'point' },
    first = line('alpha', [p(0, 0, 100), p(10, 0, 101)]),
    second = line('beta', [p(0, 0, 200), p(0, 10, 201)]),
    a = findSnapTargets(buildSnapIndex([second, first, point]), p(0, 0), 0.1),
    b = findSnapTargets(buildSnapIndex([point, first, second]), p(0, 0), 0.1);
  assert.deepEqual(
    a.map((target) => target.kind),
    ['point', 'endpoint', 'endpoint', 'intersection'],
  );
  assert.deepEqual(
    a.map((target) => target.source),
    ['spot', 'alpha', 'beta', 'beta / alpha'],
  );
  assert.deepEqual(a.slice(0, 3), b.slice(0, 3));
  assert.equal(new Set(a.map((target) => target.key)).size, a.length);
  assert.equal(a[3].z, null);
  assert.throws(() => snapPlacement(a[3], 9, true), /different elevations/);
  assert.deepEqual(snapPlacement(a[3], 9, false), p(0, 0, 9));
});

test('query radius includes the exact boundary, excludes outside targets, caps cycling, and rejects invalid radii', () => {
  const boundary = buildSnapIndex([{ ...line('spot', [p(3, 4)]), kind: 'point' }]);
  assert.equal(findSnapTargets(boundary, p(0, 0), 5).length, 1);
  assert.equal(findSnapTargets(boundary, p(0, 0), 5 - 1e-12).length, 0);
  for (const radius of [0, -1, Infinity, -Infinity, NaN])
    assert.deepEqual(findSnapTargets(boundary, p(3, 4), radius), []);
  const many = Array.from({ length: 60 }, (_, i): DrawingEntity => ({
    ...line(`spot-${String(i).padStart(2, '0')}`, [p(i / 100, 0)]),
    kind: 'point',
  }));
  const targets = findSnapTargets(buildSnapIndex(many), p(0, 0), 1);
  assert.equal(targets.length, 24);
  assert.deepEqual(
    targets.map((target) => target.x),
    many.slice(0, 24).map((e) => e.points[0].x),
  );
});

test('zero-length paths retain endpoint controls without manufacturing intersections or nonfinite targets', () => {
  const index = buildSnapIndex([
    line('zero', [p(5, 5, 100), p(5, 5, 102)]),
    line('other', [p(0, 5), p(10, 5)]),
  ]);
  const targets = findSnapTargets(index, p(5, 5), 0.1);
  assert.equal(targets.filter((target) => target.kind === 'endpoint').length, 2);
  assert.ok(!targets.some((target) => target.kind === 'intersection'));
  assert.ok(targets.every((target) => [target.x, target.y, target.z].every(Number.isFinite)));
});

test('survey bearing distances are horizontal, reverse bearings return to the anchor, and explicit Z is independent', () => {
  const anchor = p(2000000.25, 5000000.75, -200);
  for (const bearing of [0, 0.001, 45, 89.999, 135, 225, 315, 359.999])
    for (const distance of [0.125, 10, 1234.5]) {
      const result = pointByBearing(anchor, bearing, distance, 105.625);
      close(Math.hypot(result.x - anchor.x, result.y - anchor.y), distance);
      assert.equal(result.z, 105.625);
      const back = pointByBearing(result, (bearing + 180) % 360, distance, anchor.z);
      close(back.x, anchor.x);
      close(back.y, anchor.y);
      assert.equal(back.z, anchor.z);
    }
  for (const z of [NaN, Infinity, -Infinity, 1e12 + 1, -1e12 - 1])
    assert.throws(() => pointByBearing(anchor, 45, 10, z), /supported coordinate range/);
});
