import { LAYERS, type DrawingEntity, type Project, type Units } from './types';

export const MAX_PROJECT_BYTES = 20 * 1024 * 1024;
const kinds = new Set(['polyline', 'contour', 'boundary', 'building', 'point']);
const units = new Set(['meters', 'feet', 'us-survey-feet']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value.length <= max &&
  !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value);
const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
function fail(message: string): never {
  throw new Error(message);
}

/** One validation boundary shared by disk, browser storage, and the renderer. */
export function validateProject(value: unknown): Project {
  if (!isRecord(value)) fail('The project must be an object.');
  if (value.schemaVersion !== 1)
    fail('Unsupported project version. This version of LotGrade opens schema version 1.');
  if (!id(value.id)) fail('The project ID is invalid.');
  if (!text(value.name, 120) || !value.name.trim())
    fail('Give the project a name (up to 120 characters).');
  if (!text(value.description, 2000)) fail('Project description is invalid.');
  if (!units.has(value.units as string))
    fail('Choose meters, international feet, or US survey feet.');
  if (
    ![value.createdAt, value.updatedAt].every(
      (t) => typeof t === 'string' && Number.isFinite(Date.parse(t)),
    )
  )
    fail('Project dates are invalid.');
  if (!Array.isArray(value.entities) || value.entities.length > 10000)
    fail('Projects support up to 10,000 drawing objects.');
  let pointCount = 0;
  const seen = new Set<string>();
  for (const entity of value.entities) {
    if (!isRecord(entity) || !id(entity.id) || seen.has(entity.id))
      fail('Drawing object IDs must be valid and unique.');
    seen.add(entity.id);
    if (!kinds.has(entity.kind as string))
      fail('This project contains an unsupported drawing object.');
    if (!text(entity.name, 200) || /[\u0000-\u001f\u007f]/.test(entity.name))
      fail('Drawing object names must be single-line text.');
    if (
      !text(entity.layer, 100) ||
      !entity.layer.trim() ||
      /[<>/\\":;?*|=,\u0000-\u001f\u007f]/.test(entity.layer)
    )
      fail('A drawing layer name is invalid.');
    if (typeof entity.closed !== 'boolean' || !Array.isArray(entity.points))
      fail('Drawing geometry is invalid.');
    pointCount += entity.points.length;
    if (pointCount > 200000) fail('Projects support up to 200,000 drawing vertices.');
    if (entity.kind === 'point' && (entity.points.length !== 1 || entity.closed))
      fail('A spot elevation must contain exactly one point.');
    if (entity.kind !== 'point' && entity.points.length < (entity.closed ? 3 : 2))
      fail('A line needs two points; a closed shape needs three.');
    if ((entity.kind === 'boundary' || entity.kind === 'building') && !entity.closed)
      fail('Lot and building outlines must be closed.');
    for (const p of entity.points) {
      if (
        !isRecord(p) ||
        !finite(p.x) ||
        !finite(p.y) ||
        !finite(p.z) ||
        Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) > 1e12
      )
        fail('Coordinates must be finite numbers within the supported engineering range.');
    }
    if (
      entity.kind === 'contour' &&
      entity.points.some(
        (p: Record<string, unknown>) => p.z !== (entity.points as Record<string, unknown>[])[0].z,
      )
    )
      fail('Every vertex on a contour must have the same elevation.');
  }
  if (
    !isRecord(value.view) ||
    !finite(value.view.centerX) ||
    !finite(value.view.centerY) ||
    !finite(value.view.scale) ||
    value.view.scale < 0.00001 ||
    value.view.scale > 10000
  )
    fail('The drawing view is invalid.');
  if (
    !isRecord(value.settings) ||
    !finite(value.settings.gridSize) ||
    value.settings.gridSize <= 0 ||
    !finite(value.settings.contourInterval) ||
    value.settings.contourInterval <= 0 ||
    typeof value.settings.snapToGrid !== 'boolean'
  )
    fail('Drawing settings are invalid.');
  return structuredClone(value) as unknown as Project;
}

export function serializeProject(project: Project): string {
  return JSON.stringify(validateProject(project), null, 2) + '\n';
}
export function parseProject(contents: string): Project {
  if (new TextEncoder().encode(contents).length > MAX_PROJECT_BYTES)
    fail('This project exceeds the 20 MB project-file limit.');
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    fail('This is not a valid LotGrade project file.');
  }
  return validateProject(value);
}
export function createProject(
  name = 'Untitled project',
  unit: Units = 'feet',
  description = '',
): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: name.trim(),
    description: description.trim(),
    units: unit,
    createdAt: now,
    updatedAt: now,
    entities: [],
    view: { centerX: 50, centerY: 40, scale: 6 },
    settings: { gridSize: 1, snapToGrid: true, contourInterval: 1 },
  };
}

export function createDemoProject(): Project {
  const project = createProject(
    'Willow Creek · Lot 12',
    'feet',
    'An example lot to explore the drawing tools. All elevations are illustrative.',
  );
  const entity = (
    kind: DrawingEntity['kind'],
    name: string,
    coords: [number, number][],
    z: number,
    closed = false,
  ): DrawingEntity => ({
    id: crypto.randomUUID(),
    kind,
    name,
    points: coords.map(([x, y]) => ({ x, y, z })),
    closed,
    layer: LAYERS[kind],
  });
  project.entities = [
    entity(
      'boundary',
      'Lot 12 boundary',
      [
        [0, 0],
        [90, 0],
        [90, 125],
        [0, 125],
      ],
      100,
      true,
    ),
    entity(
      'building',
      'Proposed home',
      [
        [23, 39],
        [66, 39],
        [66, 80],
        [23, 80],
      ],
      103,
      true,
    ),
    entity(
      'polyline',
      'Driveway edge',
      [
        [28, 0],
        [28, 32],
        [33, 39],
      ],
      101,
    ),
    entity(
      'polyline',
      'Driveway edge',
      [
        [52, 0],
        [52, 32],
        [48, 39],
      ],
      101,
    ),
    entity(
      'contour',
      'Contour 100',
      [
        [0, 13],
        [18, 15],
        [36, 17],
        [61, 16],
        [90, 11],
      ],
      100,
    ),
    entity(
      'contour',
      'Contour 101',
      [
        [0, 28],
        [12, 30],
        [20, 35],
        [20, 84],
        [29, 91],
        [63, 91],
        [72, 83],
        [74, 35],
        [90, 26],
      ],
      101,
    ),
    entity(
      'contour',
      'Contour 102',
      [
        [0, 48],
        [12, 49],
        [15, 85],
        [26, 98],
        [65, 99],
        [79, 86],
        [82, 47],
        [90, 44],
      ],
      102,
    ),
    entity(
      'contour',
      'Contour 103',
      [
        [0, 106],
        [24, 112],
        [49, 114],
        [71, 110],
        [90, 101],
      ],
      103,
    ),
    entity('point', 'Front threshold', [[44.5, 39]], 103.5),
    entity('point', 'Street tie-in', [[44.5, 0]], 99.5),
  ];
  project.view = { centerX: 45, centerY: 62.5, scale: 4.5 };
  return project;
}

export function fileStem(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9 _-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'lotgrade-project'
  );
}
