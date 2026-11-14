import type { DrawingEntity, Point, Project } from './types';
import { hasCurves, validateEntityCurves } from './geometry';

export interface GradeControl {
  point: Point;
  source: string;
}
export interface GradeOverlay {
  a: Point;
  b?: Point;
  preview?: boolean;
}
export interface GradeMeasurement {
  horizontal: number;
  deltaZ: number;
  distance3D: number;
  percent: number | null;
  horizontalPerVertical: number | null;
  condition: 'slope' | 'level' | 'vertical' | 'coincident' | 'out-of-range';
  downhill: 'a-to-b' | 'b-to-a' | null;
}
export function validateGradePoint(point: Point): void {
  if (
    !point ||
    ![point.x, point.y, point.z].every((v) => Number.isFinite(v) && Math.abs(v) <= 1e12)
  )
    throw new Error('Grade controls must have finite XYZ within the supported coordinate range.');
}
/** Signed rise B-A over horizontal XY run. Never substitute 3D distance. */
export function measureGrade(a: Point, b: Point): GradeMeasurement {
  validateGradePoint(a);
  validateGradePoint(b);
  const horizontal = Math.hypot(b.x - a.x, b.y - a.y),
    deltaZ = b.z - a.z;
  const calculated = horizontal === 0 ? null : (deltaZ * 100) / horizontal;
  const percent =
    calculated !== null && Number.isFinite(calculated) && !(calculated === 0 && deltaZ !== 0)
      ? calculated
      : null;
  const ratio = deltaZ === 0 ? null : horizontal / Math.abs(deltaZ);
  const condition =
    horizontal === 0
      ? deltaZ === 0
        ? 'coincident'
        : 'vertical'
      : deltaZ === 0
        ? 'level'
        : percent !== null && ratio !== 0 && Number.isFinite(ratio)
          ? 'slope'
          : 'out-of-range';
  return {
    horizontal,
    deltaZ,
    distance3D: Math.hypot(horizontal, deltaZ),
    percent: percent !== null && Number.isFinite(percent) ? percent : null,
    horizontalPerVertical: ratio !== null && Number.isFinite(ratio) ? ratio : null,
    condition,
    downhill: horizontal === 0 || deltaZ === 0 ? null : deltaZ < 0 ? 'a-to-b' : 'b-to-a',
  };
}
export function segmentControls(
  entity: DrawingEntity,
  segment: number,
): { a: Point; b: Point; aIndex: number; bIndex: number } {
  const count = entity.kind === 'point' ? 0 : entity.points.length - (entity.closed ? 0 : 1);
  if (!Number.isInteger(segment) || segment < 0 || segment >= count)
    throw new Error('Choose a valid path segment.');
  const aIndex = segment,
    bIndex = (segment + 1) % entity.points.length;
  const a = entity.points[aIndex],
    b = entity.points[bIndex];
  validateGradePoint(a);
  validateGradePoint(b);
  return { a, b, aIndex, bIndex };
}
export function gradeEditRestriction(entity: DrawingEntity): string | null {
  if (entity.kind !== 'polyline')
    return 'Grade edits apply to proposed polylines. Contours, boundaries, building floors and spots keep their own elevation controls.';
  if (hasCurves(entity))
    return 'This path contains circular arcs and must keep one elevation. Grade editing requires a straight polyline; no arcs will be flattened.';
  return null;
}
export interface GradeEdit {
  entity: DrawingEntity;
  heldIndex: number;
  movedIndex: number;
  beforeZ: number;
  afterZ: number;
  measurement: GradeMeasurement;
  adjacent: { segment: number; before: GradeMeasurement; after: GradeMeasurement }[];
}
/** A preview only. The caller applies the returned entity as one undoable document change. */
export function previewGradeEdit(
  project: Project,
  entityId: string,
  segment: number,
  hold: 'a' | 'b',
  percent: number,
): GradeEdit {
  const original = project.entities.find((entity) => entity.id === entityId);
  if (!original) throw new Error('Choose a proposed polyline. Reference geometry is locked.');
  const restriction = gradeEditRestriction(original);
  if (restriction) throw new Error(restriction);
  validateEntityCurves(original);
  if (!Number.isFinite(percent)) throw new Error('Enter a finite signed percent grade.');
  if (hold !== 'a' && hold !== 'b') throw new Error('Choose endpoint A or B to hold.');
  const { a, b, aIndex, bIndex } = segmentControls(original, segment);
  const run = Math.hypot(b.x - a.x, b.y - a.y);
  if (run === 0)
    throw new Error(
      'A vertical/coincident segment has no horizontal run. A percent grade cannot set its elevation.',
    );
  const heldIndex = hold === 'a' ? aIndex : bIndex,
    movedIndex = hold === 'a' ? bIndex : aIndex;
  const delta = (run * percent) / 100;
  const afterZ = original.points[heldIndex].z + (hold === 'a' ? delta : -delta);
  if (!Number.isFinite(afterZ) || Math.abs(afterZ) > 1e12)
    throw new Error('The proposed elevation is outside the supported coordinate range.');
  if (percent !== 0 && afterZ === original.points[heldIndex].z)
    throw new Error(
      'The requested elevation difference is too small at this coordinate precision.',
    );
  const entity = structuredClone(original);
  entity.points[movedIndex].z = afterZ;
  const updated = segmentControls(entity, segment);
  const adjacent: GradeEdit['adjacent'] = [];
  const count = original.points.length - (original.closed ? 0 : 1);
  for (let i = 0; i < count; i++) {
    if (i === segment) continue;
    const old = segmentControls(original, i);
    if (old.aIndex !== movedIndex && old.bIndex !== movedIndex) continue;
    const next = segmentControls(entity, i);
    adjacent.push({
      segment: i,
      before: measureGrade(old.a, old.b),
      after: measureGrade(next.a, next.b),
    });
  }
  return {
    entity,
    heldIndex,
    movedIndex,
    beforeZ: original.points[movedIndex].z,
    afterZ,
    measurement: measureGrade(updated.a, updated.b),
    adjacent,
  };
}

/** Display rounding only; calculations and saved elevations retain full double precision. */
export function gradeNumber(value: number, signed = false): string {
  if (value === 0) value = 0;
  const prefix = signed && value > 0 ? '+' : '';
  if (value !== 0 && (Math.abs(value) < 0.001 || Math.abs(value) >= 1e8))
    return prefix + value.toExponential(4);
  return prefix + value.toLocaleString('en-US', { maximumFractionDigits: 4 });
}
export function gradePercent(measurement: GradeMeasurement): string {
  return measurement.percent === null
    ? measurement.condition === 'out-of-range'
      ? 'Outside numeric range'
      : 'Undefined · no horizontal run'
    : `${gradeNumber(measurement.percent, true)}%`;
}
export function gradeRatio(measurement: GradeMeasurement): string {
  if (measurement.condition === 'level') return 'Level · V = 0';
  if (measurement.condition === 'coincident') return 'Undefined · coincident controls';
  if (measurement.condition === 'vertical') return '0 H : 1 V · vertical';
  return measurement.horizontalPerVertical === null || measurement.horizontalPerVertical === 0
    ? 'Outside numeric range'
    : `${gradeNumber(measurement.horizontalPerVertical)} H : 1 V`;
}
