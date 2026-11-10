import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  arcFromBulge,
  bulgeThroughPoint,
  entityBounds,
  entityLength,
  entitySignedArea,
  entitySvgPath,
  validateEntityCurves,
} from '../src/core/geometry';
import type { DrawingEntity, Point } from '../src/core/types';

const point = (x: number, y: number, z = 12.5): Point => ({ x, y, z });
const close = (actual: number, expected: number, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const path = (points: Point[], bulges: number[], closed = false): DrawingEntity => ({
  id: 'curve',
  kind: 'polyline',
  name: 'Curve',
  layer: 'CURVE',
  points,
  bulges,
  closed,
});

test('three-point construction finds clockwise, counterclockwise, and major circular arcs', () => {
  close(bulgeThroughPoint(point(0, 0), point(5, 5), point(10, 0))!, -1);
  close(bulgeThroughPoint(point(0, 0), point(5, -5), point(10, 0))!, 1);
  close(bulgeThroughPoint(point(1, 0), point(-1, 0), point(0, 1))!, -Math.tan((3 * Math.PI) / 8));
  assert.equal(bulgeThroughPoint(point(0, 0), point(5, 0), point(10, 0)), null);
  assert.equal(bulgeThroughPoint(point(0, 0), point(0, 0), point(10, 0)), null);
  assert.equal(bulgeThroughPoint(point(0, 0), point(5, 5), point(0, 0)), null);
});

test('arc construction uses local differences at large survey coordinates and ignores Z for plan construction', () => {
  close(
    bulgeThroughPoint(
      point(2_000_000, 5_000_000, -5),
      point(2_000_005, 5_000_005, 8),
      point(2_000_010, 5_000_000, 50),
    )!,
    -1,
  );
  const arc = arcFromBulge(point(2_000_000, 5_000_000), point(2_000_010, 5_000_000), -1)!;
  assert.deepEqual(arc.center, point(2_000_005, 5_000_000));
  assert.equal(arc.radius, 5);
  close(arc.sweep, -Math.PI);
});

test('arc bounds include the curved extrema beyond endpoint bounds in both directions', () => {
  const lower = entityBounds(path([point(0, 0), point(10, 0)], [1, 0]));
  close(lower.minX, 0);
  close(lower.maxX, 10);
  close(lower.minY, -5);
  close(lower.maxY, 0);
  const upper = entityBounds(path([point(0, 0), point(10, 0)], [-1, 0]));
  close(upper.minY, 0);
  close(upper.maxY, 5);
  assert.equal(upper.minZ, 12.5);
  assert.equal(upper.maxZ, 12.5);
});

test('major arc bounds include all traversed cardinal extrema and exclude the missing quadrant', () => {
  const bounds = entityBounds(path([point(0, 0), point(10, 0)], [Math.tan((3 * Math.PI) / 8), 0]));
  close(bounds.minX, 5 - Math.sqrt(50));
  close(bounds.maxX, 5 + Math.sqrt(50));
  close(bounds.minY, -5 - Math.sqrt(50));
  close(bounds.maxY, 0);
});

test('capsule perimeter and area include both arc lengths and the curved closing edge', () => {
  const capsule = path(
    [point(-5, -5), point(5, -5), point(5, 5), point(-5, 5)],
    [0, 1, 0, 1],
    true,
  );
  close(entityLength(capsule), 20 + 10 * Math.PI);
  close(entitySignedArea(capsule), 100 + 25 * Math.PI);
  const bounds = entityBounds(capsule);
  close(bounds.minX, -10);
  close(bounds.maxX, 10);
  close(bounds.minY, -5);
  close(bounds.maxY, 5);
  const reverse = path(
    [point(-5, -5), point(-5, 5), point(5, 5), point(5, -5)],
    [-1, 0, -1, 0],
    true,
  );
  close(entityLength(reverse), entityLength(capsule));
  close(entitySignedArea(reverse), -entitySignedArea(capsule));
});

test('almost-straight arcs have finite stable metrics without collapsing source geometry', () => {
  const bulge = 1e-8;
  const curve = path([point(0, 0), point(100, 0), point(100, 10)], [bulge, 0, 0], true);
  close(entityLength(curve), 100 + 10 + Math.hypot(100, 10), 1e-8);
  assert.ok(entitySignedArea(curve) > 500);
  assert.ok(Number.isFinite(entitySignedArea(curve)));
  assert.equal(curve.bulges?.[0], bulge);
});

test('tiny nonzero bulges retain accurate sagitta bounds without huge-center cancellation', () => {
  for (const bulge of [1e-8, 1e-10, 1e-18, -1e-8, -1e-18]) {
    const curve = path([point(0, 0), point(100, 0)], [bulge, 0]);
    const bounds = entityBounds(curve);
    assert.equal(bounds.minX, 0);
    assert.equal(bounds.maxX, 100);
    close(bounds.minY, Math.min(0, -50 * bulge), Math.abs(bulge) * 1e-10);
    close(bounds.maxY, Math.max(0, -50 * bulge), Math.abs(bulge) * 1e-10);
    assert.doesNotThrow(() => validateEntityCurves(curve));
    close(entityLength(curve), 100, 1e-10);
  }
});

test('extremely shallow finite-radius curves do not overflow metrics or invent remote extrema', () => {
  const bulge = 1e-160;
  const curve = path([point(0, 0), point(1, 0), point(1, 1e-162)], [bulge, 0, 0], true);
  assert.doesNotThrow(() => validateEntityCurves(curve));
  const bounds = entityBounds(curve);
  assert.equal(bounds.minX, 0);
  assert.equal(bounds.maxX, 1);
  assert.equal(bounds.minY, -bulge / 2);
  const expectedArea = 1e-162 / 2 + bulge / 3;
  close(entitySignedArea(curve), expectedArea, expectedArea * 1e-12);
  close(entityLength(curve), 2, 1e-14);
});

test('SVG uses exact circular arcs, proper world-to-screen sweep, and closing geometry', () => {
  const project = (p: Point) => ({ x: p.x * 2, y: -p.y * 2 });
  assert.equal(
    entitySvgPath(path([point(0, 0), point(10, 0)], [1, 0]), project, 2),
    'M 0 0 A 10 10 0 0 0 20 0',
  );
  assert.equal(
    entitySvgPath(path([point(0, 0), point(10, 0)], [-1, 0]), project, 2),
    'M 0 0 A 10 10 0 0 1 20 0',
  );
  assert.match(
    entitySvgPath(path([point(0, 0), point(10, 0)], [Math.tan((3 * Math.PI) / 8), 0]), project, 2),
    / A [\d.]+ [\d.]+ 0 1 0 20 0$/,
  );
});
