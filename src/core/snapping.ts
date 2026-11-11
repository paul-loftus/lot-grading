import { arcFromBulge, entityBounds } from './geometry';
import type { DrawingEntity, Point } from './types';

export type SnapKind = 'endpoint' | 'point' | 'midpoint' | 'center' | 'intersection';
export interface SnapTarget {
  key: string;
  kind: SnapKind;
  x: number;
  y: number;
  /** Null means the intersecting features disagree on elevation. Never average them. */
  z: number | null;
  source: string;
}
interface Segment {
  key: string;
  source: string;
  start: Point;
  end: Point;
  bulge: number;
  bounds: ReturnType<typeof entityBounds>;
}
export interface SnapIndex {
  targets: SnapTarget[];
  segments: Segment[];
}
const TAU = 2 * Math.PI;
const positiveAngle = (angle: number) => ((angle % TAU) + TAU) % TAU;

/** Source-coordinate targets. The query radius, rather than the coordinates, follows zoom. */
export function buildSnapIndex(entities: DrawingEntity[]): SnapIndex {
  const targets: SnapTarget[] = [];
  const segments: Segment[] = [];
  for (const entity of entities) {
    entity.points.forEach((point, index) =>
      targets.push({
        key: `${entity.id}:vertex:${index}`,
        kind: entity.kind === 'point' ? 'point' : 'endpoint',
        ...point,
        source: entity.name,
      }),
    );
    const count = entity.kind === 'point' ? 0 : entity.points.length - (entity.closed ? 0 : 1);
    for (let i = 0; i < count; i++) {
      const start = entity.points[i];
      const end = entity.points[(i + 1) % entity.points.length];
      const bulge = entity.bulges?.[i] ?? 0;
      const key = `${entity.id}:segment:${i}`;
      const dx = end.x - start.x,
        dy = end.y - start.y;
      targets.push({
        key: `${key}:midpoint`,
        kind: 'midpoint',
        source: entity.name,
        x: start.x + dx / 2 + (bulge * dy) / 2,
        y: start.y + dy / 2 - (bulge * dx) / 2,
        z: start.z + (end.z - start.z) / 2,
      });
      const arc = arcFromBulge(start, end, bulge);
      if (arc && Math.max(Math.abs(arc.center.x), Math.abs(arc.center.y)) <= 1e12)
        targets.push({ key: `${key}:center`, kind: 'center', ...arc.center, source: entity.name });
      segments.push({
        key,
        source: entity.name,
        start,
        end,
        bulge,
        bounds: entityBounds({ points: [start, end], bulges: [bulge, 0], closed: false }),
      });
    }
  }
  return { targets, segments };
}

function fraction(segment: Segment, point: Pick<Point, 'x' | 'y'>): number | null {
  const arc = arcFromBulge(segment.start, segment.end, segment.bulge);
  let t: number;
  if (arc) {
    const angle = Math.atan2(point.y - arc.center.y, point.x - arc.center.x);
    const delta =
      arc.sweep > 0 ? positiveAngle(angle - arc.startAngle) : positiveAngle(arc.startAngle - angle);
    t = delta / Math.abs(arc.sweep);
    // Coincident start angles can wrap around by one turn due to floating-point noise.
    if (Math.hypot(point.x - segment.start.x, point.y - segment.start.y) < 1e-9) t = 0;
  } else {
    const dx = segment.end.x - segment.start.x,
      dy = segment.end.y - segment.start.y;
    const length = Math.hypot(dx, dy);
    if (!length) return null;
    t =
      ((point.x - segment.start.x) * (dx / length) + (point.y - segment.start.y) * (dy / length)) /
      length;
  }
  return t >= -1e-10 && t <= 1 + 1e-10 ? Math.max(0, Math.min(1, t)) : null;
}

function intersections(a: Segment, b: Segment): Pick<Point, 'x' | 'y'>[] {
  const first = arcFromBulge(a.start, a.end, a.bulge);
  const second = arcFromBulge(b.start, b.end, b.bulge);
  if (!first && !second) {
    const dx = a.end.x - a.start.x,
      dy = a.end.y - a.start.y;
    const ex = b.end.x - b.start.x,
      ey = b.end.y - b.start.y;
    const divisor = dx * ey - dy * ex;
    if (Math.abs(divisor) <= Number.EPSILON * 64 * Math.hypot(dx, dy) * Math.hypot(ex, ey))
      return [];
    const t = ((b.start.x - a.start.x) * ey - (b.start.y - a.start.y) * ex) / divisor;
    return [{ x: a.start.x + t * dx, y: a.start.y + t * dy }];
  }
  if (!first || !second) {
    const line = first ? b : a;
    const circle = first ?? second!;
    const length = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
    if (!length) return [];
    const ux = (line.end.x - line.start.x) / length,
      uy = (line.end.y - line.start.y) / length;
    const cx = circle.center.x - line.start.x,
      cy = circle.center.y - line.start.y;
    const projection = cx * ux + cy * uy;
    const perpendicular = cx * uy - cy * ux;
    const difference =
      (circle.radius - Math.abs(perpendicular)) * (circle.radius + Math.abs(perpendicular));
    if (difference < -1e-10) return [];
    const offset = Math.sqrt(Math.max(0, difference));
    return [...new Set([projection - offset, projection + offset])].map((t) => ({
      x: line.start.x + t * ux,
      y: line.start.y + t * uy,
    }));
  }
  const dx = second.center.x - first.center.x,
    dy = second.center.y - first.center.y;
  const distance = Math.hypot(dx, dy);
  if (
    !distance ||
    distance > first.radius + second.radius + 1e-9 ||
    distance < Math.abs(first.radius - second.radius) - 1e-9
  )
    return [];
  const along =
    (((first.radius - second.radius) * (first.radius + second.radius)) / distance + distance) / 2;
  const heightSquared = (first.radius - Math.abs(along)) * (first.radius + Math.abs(along));
  if (heightSquared < -1e-9) return [];
  const height = Math.sqrt(Math.max(0, heightSquared));
  return [...new Set([-height, height])].map((offset) => ({
    x: first.center.x + (along * dx) / distance - (offset * dy) / distance,
    y: first.center.y + (along * dy) / distance + (offset * dx) / distance,
  }));
}

export function findSnapTargets(
  index: SnapIndex,
  cursor: Pick<Point, 'x' | 'y'>,
  radius: number,
  includeIntersections = true,
): SnapTarget[] {
  if (!(radius > 0) || !Number.isFinite(radius)) return [];
  const near = (point: Pick<Point, 'x' | 'y'>) =>
    Math.hypot(point.x - cursor.x, point.y - cursor.y) <= radius;
  const targets = index.targets.filter(near);
  if (includeIntersections) {
    // Limit pairwise work to nearby segments. Never scan every pair in a full survey.
    const local = index.segments
      .filter(
        ({ bounds }) =>
          cursor.x >= bounds.minX - radius &&
          cursor.x <= bounds.maxX + radius &&
          cursor.y >= bounds.minY - radius &&
          cursor.y <= bounds.maxY + radius,
      )
      .slice(0, 128);
    for (let i = 0; i < local.length; i++)
      for (let j = i + 1; j < local.length; j++) {
        const a = local[i],
          b = local[j];
        for (const [number, point] of intersections(a, b).entries()) {
          if (!near(point)) continue;
          const ta = fraction(a, point),
            tb = fraction(b, point);
          if (ta === null || tb === null) continue;
          const za = a.start.z + ta * (a.end.z - a.start.z),
            zb = b.start.z + tb * (b.end.z - b.start.z);
          targets.push({
            key: `${a.key}:${b.key}:intersection:${number}`,
            kind: 'intersection',
            ...point,
            z: Math.abs(za - zb) <= 1e-9 ? za : null,
            source: `${a.source} / ${b.source}`,
          });
        }
      }
  }
  const rank: Record<SnapKind, number> = {
    point: 0,
    endpoint: 1,
    intersection: 2,
    midpoint: 3,
    center: 4,
  };
  return targets
    .sort(
      (a, b) =>
        Math.hypot(a.x - cursor.x, a.y - cursor.y) - Math.hypot(b.x - cursor.x, b.y - cursor.y) ||
        rank[a.kind] - rank[b.kind] ||
        a.key.localeCompare(b.key),
    )
    .slice(0, 24);
}

export function snapPlacement(
  target: SnapTarget,
  drawingElevation: number,
  acquireElevation: boolean,
): Point {
  if (acquireElevation && target.z === null)
    throw new Error(
      'These features have different elevations at the intersection. Turn off Match target elevation to snap XY only.',
    );
  return { x: target.x, y: target.y, z: acquireElevation ? target.z! : drawingElevation };
}

/** Survey azimuth: decimal degrees clockwise from north; distance is horizontal. */
export function pointByBearing(
  anchor: Point,
  bearing: number,
  distance: number,
  elevation: number,
): Point {
  if (
    !Number.isFinite(bearing) ||
    bearing < 0 ||
    bearing >= 360 ||
    !Number.isFinite(distance) ||
    distance <= 0
  )
    throw new Error('Enter a bearing from 0 up to 360 degrees and a positive horizontal distance.');
  const radians = (bearing * Math.PI) / 180;
  const point = {
    x: anchor.x + distance * Math.sin(radians),
    y: anchor.y + distance * Math.cos(radians),
    z: elevation,
  };
  if (Object.values(point).some((value) => !Number.isFinite(value) || Math.abs(value) > 1e12))
    throw new Error('The point is outside the supported coordinate range.');
  return point;
}
