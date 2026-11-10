import type { DrawingEntity, Point } from './types';

const TAU = Math.PI * 2;
const positiveAngle = (angle: number) => ((angle % TAU) + TAU) % TAU;

export interface CircularArc {
  center: Point;
  radius: number;
  startAngle: number;
  /** Signed world-XY sweep in radians: positive is counterclockwise. */
  sweep: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export const hasCurves = (entity: Pick<DrawingEntity, 'bulges'>): boolean =>
  entity.bulges?.some((bulge) => bulge !== 0) ?? false;

/** Exact circular segment represented by the DXF outgoing-vertex bulge. */
export function arcFromBulge(start: Point, end: Point, bulge: number): CircularArc | null {
  if (!Number.isFinite(bulge) || bulge === 0) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chord = Math.hypot(dx, dy);
  if (chord === 0) return null;
  // Unit-chord construction avoids squaring large survey coordinates or bulges.
  const offset = (chord / 4) * (1 / bulge - bulge);
  const center = {
    x: start.x + dx / 2 - (dy / chord) * offset,
    y: start.y + dy / 2 + (dx / chord) * offset,
    z: start.z,
  };
  const radius = (chord / 4) * (Math.abs(bulge) + 1 / Math.abs(bulge));
  const sweep = 4 * Math.atan(bulge);
  if (
    ![center.x, center.y, radius, sweep].every(Number.isFinite) ||
    radius <= 0 ||
    Math.abs(sweep) >= TAU
  )
    return null;
  return {
    center,
    radius,
    startAngle: Math.atan2(-dy / 2 - (dx / chord) * offset, -dx / 2 + (dy / chord) * offset),
    sweep,
  };
}

/** Circle through start, through-point and end. Z is intentionally not part of plan construction. */
export function bulgeThroughPoint(start: Point, through: Point, end: Point): number | null {
  const ux = through.x - start.x;
  const uy = through.y - start.y;
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const scale = Math.max(Math.hypot(ux, uy), Math.hypot(vx, vy));
  if (!Number.isFinite(scale) || scale === 0) return null;
  const ax = ux / scale;
  const ay = uy / scale;
  const bx = vx / scale;
  const by = vy / scale;
  const cross = ax * by - ay * bx;
  if (Math.abs(cross) <= Number.EPSILON * 64) return null;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const cx = (a2 * by - b2 * ay) / (2 * cross);
  const cy = (ax * b2 - bx * a2) / (2 * cross);
  const startAngle = Math.atan2(-cy, -cx);
  const throughAngle = positiveAngle(Math.atan2(ay - cy, ax - cx) - startAngle);
  const endAngle = positiveAngle(Math.atan2(by - cy, bx - cx) - startAngle);
  const sweep = throughAngle <= endAngle ? endAngle : endAngle - TAU;
  const bulge = Math.tan(sweep / 4);
  return bulge !== 0 && Number.isFinite(bulge) && arcFromBulge(start, end, bulge) ? bulge : null;
}

function segmentCount(entity: Pick<DrawingEntity, 'points' | 'closed'>): number {
  return entity.points.length > 1 ? entity.points.length - (entity.closed ? 0 : 1) : 0;
}

/** Bounds include circular extrema between vertices, not just the chord endpoints. */
export function entityBounds(entity: Pick<DrawingEntity, 'points' | 'closed' | 'bulges'>): Bounds {
  const bounds: Bounds = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };
  const include = (point: Point) => {
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.minZ = Math.min(bounds.minZ, point.z);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.maxY = Math.max(bounds.maxY, point.y);
    bounds.maxZ = Math.max(bounds.maxZ, point.z);
  };
  for (const point of entity.points) include(point);
  for (let i = 0; i < segmentCount(entity); i++) {
    const start = entity.points[i];
    const end = entity.points[(i + 1) % entity.points.length];
    const bulge = entity.bulges?.[i] ?? 0;
    const arc = arcFromBulge(start, end, bulge);
    if (!arc) continue;
    const chord = Math.hypot(end.x - start.x, end.y - start.y);
    const tx = (end.x - start.x) / chord;
    const ty = (end.y - start.y) / chord;
    const nx = -ty;
    const ny = tx;
    const direction = Math.sign(bulge);
    const halfSweep = Math.abs(arc.sweep) / 2;
    // Work around the chord midpoint rather than subtracting a huge radius
    // from a huge center for nearly-straight arcs. Parameter gamma runs from
    // -halfSweep to +halfSweep; each axis derivative has at most two roots.
    for (const [tangent, normal] of [
      [tx, nx],
      [ty, ny],
    ]) {
      const root = Math.atan2(-tangent, direction * normal);
      for (const gamma of [root - Math.PI, root, root + Math.PI]) {
        if (Math.abs(gamma) > halfSweep) continue;
        const sinHalf = Math.sin(gamma / 2);
        const u = arc.radius * Math.sin(gamma);
        const v = -(chord * bulge) / 2 + direction * (arc.radius * sinHalf) * 2 * sinHalf;
        include({
          x: start.x + tx * (chord / 2 + u) + nx * v,
          y: start.y + ty * (chord / 2 + u) + ny * v,
          z: start.z,
        });
      }
    }
  }
  return entity.points.length ? bounds : { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
}

/** Plan length, including exact arc lengths and the closing edge where applicable. */
export function entityLength(entity: Pick<DrawingEntity, 'points' | 'closed' | 'bulges'>): number {
  let length = 0;
  for (let i = 0; i < segmentCount(entity); i++) {
    const start = entity.points[i];
    const end = entity.points[(i + 1) % entity.points.length];
    const bulge = entity.bulges?.[i] ?? 0;
    const chord = Math.hypot(end.x - start.x, end.y - start.y);
    // This form remains stable for almost-straight arcs without subtracting large centers.
    length += bulge === 0 ? chord : chord * ((1 + bulge * bulge) * (Math.atan(bulge) / bulge));
  }
  return length;
}

/** Signed enclosed plan area; circular segment areas augment the translated shoelace sum. */
export function entitySignedArea(
  entity: Pick<DrawingEntity, 'points' | 'closed' | 'bulges'>,
): number {
  if (!entity.closed || entity.points.length < 2) return 0;
  const origin = entity.points[0];
  let twiceArea = 0;
  for (let i = 0; i < entity.points.length; i++) {
    const start = entity.points[i];
    const end = entity.points[(i + 1) % entity.points.length];
    twiceArea +=
      (start.x - origin.x) * (end.y - origin.y) - (end.x - origin.x) * (start.y - origin.y);
    const bulge = entity.bulges?.[i] ?? 0;
    const arc = arcFromBulge(start, end, bulge);
    if (arc) {
      if (Math.abs(bulge) < 0.01) {
        // Small-bulge circular segment area: avoids both theta-sin(theta)
        // cancellation and radius^2 overflow on extremely shallow curves.
        const chord = Math.hypot(end.x - start.x, end.y - start.y);
        const square = bulge * bulge;
        const area =
          chord *
          (chord * bulge) *
          (1 / 3 + square * (1 / 15 + square * (-1 / 105 + square * (1 / 315 - square / 693))));
        twiceArea += 2 * area;
      } else {
        twiceArea += arc.radius * arc.radius * (arc.sweep - Math.sin(arc.sweep));
      }
    }
  }
  return twiceArea / 2;
}

/** SVG path for a north-up world-to-screen projection. Export never uses this view transform. */
export function entitySvgPath(
  entity: Pick<DrawingEntity, 'points' | 'closed' | 'bulges'>,
  project: (point: Point) => { x: number; y: number },
  scale: number,
): string {
  if (!entity.points.length) return '';
  const first = project(entity.points[0]);
  let result = `M ${first.x} ${first.y}`;
  for (let i = 0; i < segmentCount(entity); i++) {
    const start = entity.points[i];
    const end = entity.points[(i + 1) % entity.points.length];
    const last = project(end);
    const arc = arcFromBulge(start, end, entity.bulges?.[i] ?? 0);
    if (arc) {
      const radius = arc.radius * scale;
      result += ` A ${radius} ${radius} 0 ${Math.abs(arc.sweep) > Math.PI ? 1 : 0} ${arc.sweep > 0 ? 0 : 1} ${last.x} ${last.y}`;
    } else result += ` L ${last.x} ${last.y}`;
  }
  if (entity.closed) result += ' Z';
  return result;
}

/** Shared project-import and public-export boundary; invalid curves must never become chords. */
export function validateEntityCurves(entity: DrawingEntity): void {
  if (entity.bulges === undefined) return;
  if (!Array.isArray(entity.bulges) || entity.bulges.length !== entity.points.length)
    throw new Error('Curve bulges must contain one value for every vertex.');
  if (!['polyline', 'contour', 'boundary'].includes(entity.kind))
    throw new Error('Curves are supported on polylines, contours, and polygon lot boundaries.');
  if (!entity.bulges.every((value) => typeof value === 'number' && Number.isFinite(value)))
    throw new Error('Every curve bulge must be a finite number.');
  if (!entity.closed && entity.bulges.at(-1) !== 0)
    throw new Error('An open path must have a zero bulge at its last vertex.');
  if (!hasCurves(entity)) return;
  if (entity.points.some((point) => point.z !== entity.points[0].z))
    throw new Error(
      'A curved path must have one constant elevation. Its elevations were not flattened.',
    );
  for (let i = 0; i < segmentCount(entity); i++) {
    if (
      entity.bulges[i] !== 0 &&
      !arcFromBulge(
        entity.points[i],
        entity.points[(i + 1) % entity.points.length],
        entity.bulges[i],
      )
    )
      throw new Error(
        'An arc needs distinct endpoints and a finite, nondegenerate circular shape.',
      );
  }
  const bounds = entityBounds(entity);
  if (Object.values(bounds).some((value) => !Number.isFinite(value) || Math.abs(value) > 1e12))
    throw new Error(
      'The curved geometry extends beyond the supported engineering coordinate range.',
    );
}
