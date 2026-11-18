import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  arcFromBulge,
  bulgeThroughPoint,
  entityBounds,
  entityLength,
  entitySignedArea,
  validateEntityCurves,
} from '../src/core/geometry';
import type { DrawingEntity, Point } from '../src/core/types';

const close = (actual: number, expected: number, tolerance: number) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} (±${tolerance})`);
const curve = (points: Point[], bulges: number[], closed = false): DrawingEntity => ({
  id: 'arc',
  kind: 'polyline',
  name: 'Arc',
  layer: 'CURVE',
  points,
  bulges,
  closed,
});

// Construct the oracle from a known circle, never from production bulge/arc helpers.
for (const origin of [
  { x: 0, y: 0 },
  { x: 2000000.25, y: 5000000.75 },
])
  for (const degrees of [-315, -180, -45, 45, 180, 315])
    test(`known ${degrees}° circular arc at ${origin.x === 0 ? 'local' : 'survey'} coordinates retains its circle, bounds and length`, () => {
      for (const radius of [0.125, 17.5, 2500])
        for (const startDegrees of [-170, -90, 0, 45, 179]) {
          const start = (startDegrees * Math.PI) / 180,
            sweep = (degrees * Math.PI) / 180,
            at = (t: number): Point => ({
              x: origin.x + radius * Math.cos(start + t * sweep),
              y: origin.y + radius * Math.sin(start + t * sweep),
              z: -12.375,
            }),
            entity = curve([at(0), at(1)], [Math.tan(sweep / 4), 0]),
            snapshot = structuredClone(entity),
            tolerance = origin.x === 0 ? radius * 1e-10 : 2e-7,
            arc = arcFromBulge(entity.points[0], entity.points[1], entity.bulges![0])!;
          assert.ok(arc);
          close(arc.radius, radius, tolerance);
          close(arc.center.x, origin.x, tolerance);
          close(arc.center.y, origin.y, tolerance);
          close(arc.sweep, sweep, 1e-12);
          close(entityLength(entity), radius * Math.abs(sweep), tolerance);
          assert.doesNotThrow(() => validateEntityCurves(entity));
          const bounds = entityBounds(entity);
          for (let sample = 0; sample <= 64; sample++) {
            const point = at(sample / 64);
            assert.ok(point.x >= bounds.minX - tolerance && point.x <= bounds.maxX + tolerance);
            assert.ok(point.y >= bounds.minY - tolerance && point.y <= bounds.maxY + tolerance);
          }
          // Exact extrema are endpoints plus any cardinal angles traversed by this sweep.
          const candidates = [at(0), at(1)];
          for (let cardinal = -8; cardinal <= 8; cardinal++) {
            const t = ((cardinal * Math.PI) / 2 - start) / sweep;
            if (t >= 0 && t <= 1) candidates.push(at(t));
          }
          close(bounds.minX, Math.min(...candidates.map((p) => p.x)), tolerance);
          close(bounds.maxX, Math.max(...candidates.map((p) => p.x)), tolerance);
          close(bounds.minY, Math.min(...candidates.map((p) => p.y)), tolerance);
          close(bounds.maxY, Math.max(...candidates.map((p) => p.y)), tolerance);
          assert.equal(bounds.minZ, -12.375);
          assert.equal(bounds.maxZ, -12.375);
          const reconstructed = bulgeThroughPoint(at(0), at(0.375), at(1));
          assert.notEqual(reconstructed, null);
          close(4 * Math.atan(reconstructed!), sweep, origin.x === 0 ? 1e-10 : 2e-7);
          assert.deepEqual(entity, snapshot);
        }
    });

for (const clockwise of [false, true])
  for (const sides of [3, 4, 7, 16])
    test(`${sides} exact arc segments form a ${clockwise ? 'clockwise' : 'counterclockwise'} circle with analytic area and circumference`, () => {
      const radius = 23.75,
        direction = clockwise ? -1 : 1,
        sweep = (direction * 2 * Math.PI) / sides,
        entity = curve(
          Array.from({ length: sides }, (_, i) => ({
            x: 2000000.25 + radius * Math.cos(i * sweep),
            y: 5000000.75 + radius * Math.sin(i * sweep),
            z: 100,
          })),
          Array(sides).fill(Math.tan(sweep / 4)),
          true,
        );
      close(entityLength(entity), 2 * Math.PI * radius, 1e-7);
      close(entitySignedArea(entity), direction * Math.PI * radius * radius, 1e-6);
      const bounds = entityBounds(entity);
      close(bounds.minX, 2000000.25 - radius, 1e-8);
      close(bounds.maxX, 2000000.25 + radius, 1e-8);
      close(bounds.minY, 5000000.75 - radius, 1e-8);
      close(bounds.maxY, 5000000.75 + radius, 1e-8);
    });

test('curved segment area agrees with an independent circular sector minus triangle for both sweep directions', () => {
  for (const degrees of [-315, -240, -90, -15, 15, 90, 240, 315]) {
    const radius = 30,
      sweep = (degrees * Math.PI) / 180,
      start = { x: radius, y: 0, z: 0 },
      end = { x: radius * Math.cos(sweep), y: radius * Math.sin(sweep), z: 0 },
      // A third point on the straight chord satisfies closed-path cardinality.
      midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, z: 0 },
      entity = curve([start, end, midpoint], [Math.tan(sweep / 4), 0, 0], true),
      expected = (radius * radius * (sweep - Math.sin(sweep))) / 2;
    close(entitySignedArea(entity), expected, 1e-9);
    close(
      entityLength(entity),
      radius * Math.abs(sweep) + 2 * radius * Math.abs(Math.sin(sweep / 2)),
      1e-9,
    );
  }
});

test('closed mixed line/arc paths preserve their metrics under rotation, reflection, translation and scale', () => {
  const source = curve(
    [
      { x: -5, y: -5, z: 100 },
      { x: 5, y: -5, z: 100 },
      { x: 5, y: 5, z: 100 },
      { x: -5, y: 5, z: 100 },
    ],
    [0, 1, 0, 1],
    true,
  );
  for (const reflect of [1, -1])
    for (const scale of [0.01, 1, 100])
      for (const angle of [0, Math.PI / 7, Math.PI / 2]) {
        const transformed = curve(
          source.points.map((p) => ({
            x: 2000000.25 + scale * (reflect * p.x * Math.cos(angle) - p.y * Math.sin(angle)),
            y: 5000000.75 + scale * (reflect * p.x * Math.sin(angle) + p.y * Math.cos(angle)),
            z: p.z,
          })),
          source.bulges!.map((b) => b * reflect),
          true,
        );
        close(entityLength(transformed), scale * (20 + 10 * Math.PI), 2e-7);
        close(
          entitySignedArea(transformed),
          reflect * scale * scale * (100 + 25 * Math.PI),
          Math.max(1e-8, scale * 1e-6),
        );
      }
});
