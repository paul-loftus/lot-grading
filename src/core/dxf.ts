import type { DrawingEntity, Point, Project } from './types';

/**
 * Frozen public interchange contract: ASCII DXF R2013 (AC1027), world coordinates,
 * native drawing units, unsmoothed vertices, no origin shift and no Z flattening.
 * The independent ezdxf gate reads the actual output of this writer on both OSes.
 */
export const DXF_VERSION = 'AC1027';
export const DXF_CONTRACT_VERSION = 1;

type Pair = readonly [number, string | number];
type Write = (...pairs: Pair[]) => void;
const unitCodes = { meters: 6, feet: 2, 'us-survey-feet': 21 } as const;
const modelBlock = 'A';
const paperBlock = 'B';
const invalidLayerCharacters = /[<>/\\":;?*|=,\u0000-\u001f\u007f]/;

function ascii(value: string): string {
  // DXF Unicode escapes keep the complete file ASCII while preserving names.
  return value
    .replace(/\\/g, '\\U+005C')
    .replace(
      /[^\x20-\x7e]/g,
      (character) => `\\U+${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
    );
}

function validateEntity(entity: DrawingEntity): void {
  if (!entity || typeof entity !== 'object' || !Object.hasOwn(serializers, entity.kind)) {
    throw new Error(
      'This drawing contains an unsupported entity. Export was stopped to avoid losing geometry.',
    );
  }
  if (
    typeof entity.id !== 'string' ||
    !entity.id ||
    entity.id.length > 200 ||
    /[\r\n\u0000]/.test(entity.id)
  ) {
    throw new Error('Every drawing object must have a valid identifier before export.');
  }
  if (typeof entity.name !== 'string' || /[\r\n\u0000]/.test(entity.name)) {
    throw new Error('Drawing names must be single-line text.');
  }
  if (
    typeof entity.layer !== 'string' ||
    !entity.layer.trim() ||
    entity.layer.length > 255 ||
    invalidLayerCharacters.test(entity.layer)
  ) {
    throw new Error(`The layer on “${entity.name || entity.id}” is not a valid DXF layer name.`);
  }
  if (!Array.isArray(entity.points) || typeof entity.closed !== 'boolean') {
    throw new Error(`“${entity.name || entity.id}” has incomplete geometry.`);
  }
  for (const point of entity.points) {
    if (
      !point ||
      ![point.x, point.y, point.z].every(
        (coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate),
      )
    ) {
      throw new Error(`“${entity.name || entity.id}” contains a non-finite coordinate.`);
    }
  }
  if (entity.kind === 'point') {
    if (entity.points.length !== 1 || entity.closed)
      throw new Error('A spot elevation must contain exactly one point.');
  } else if (entity.points.length < (entity.closed ? 3 : 2)) {
    throw new Error(`“${entity.name || entity.id}” does not contain enough vertices.`);
  }
  if ((entity.kind === 'boundary' || entity.kind === 'building') && !entity.closed) {
    throw new Error('Lot and building outlines must be closed before export.');
  }
  if (entity.kind === 'contour' && entity.points.some((point) => point.z !== entity.points[0].z)) {
    throw new Error('A contour must have one constant elevation. Its vertices were not flattened.');
  }
}

interface EntityWriter {
  write: Write;
  common: (type: string, layer: string, owner?: string) => string;
  identity: (id: string) => void;
  textHeight: number;
}

function writePolyline(entity: DrawingEntity, writer: EntityWriter): void {
  const { write, common, identity } = writer;
  const constantElevation = entity.points.every((point) => point.z === entity.points[0].z);
  if (constantElevation) {
    common('LWPOLYLINE', entity.layer);
    write(
      [100, 'AcDbPolyline'],
      [90, entity.points.length],
      [70, entity.closed ? 1 : 0],
      [38, entity.points[0].z],
    );
    for (const point of entity.points) write([10, point.x], [20, point.y]);
    write([210, 0], [220, 0], [230, 1]);
    identity(entity.id);
    return;
  }
  const polylineHandle = common('POLYLINE', entity.layer);
  write(
    [100, 'AcDb3dPolyline'],
    [66, 1],
    [10, 0],
    [20, 0],
    [30, 0],
    [70, 8 | (entity.closed ? 1 : 0)],
  );
  identity(entity.id);
  for (const point of entity.points) {
    common('VERTEX', entity.layer, polylineHandle);
    write(
      [100, 'AcDbVertex'],
      [100, 'AcDb3dPolylineVertex'],
      [10, point.x],
      [20, point.y],
      [30, point.z],
      [70, 32],
    );
  }
  common('SEQEND', entity.layer, polylineHandle);
}

function writePoint(entity: DrawingEntity, writer: EntityWriter): void {
  const { write, common, identity, textHeight } = writer;
  const point = entity.points[0];
  common('POINT', entity.layer);
  write([100, 'AcDbPoint'], [10, point.x], [20, point.y], [30, point.z]);
  identity(entity.id);
  common('TEXT', entity.layer);
  write(
    [100, 'AcDbText'],
    [10, point.x + textHeight],
    [20, point.y + textHeight],
    [30, point.z],
    [40, textHeight],
    [1, ascii(`${entity.name ? `${entity.name} ` : ''}${point.z}`)],
    [7, 'Standard'],
    [100, 'AcDbText'],
  );
  identity(`${entity.id}:label`);
}

// Adding a domain kind is a compile error until an explicit export path exists.
const serializers = {
  polyline: writePolyline,
  contour: writePolyline,
  boundary: writePolyline,
  building: writePolyline,
  point: writePoint,
} satisfies Record<DrawingEntity['kind'], (entity: DrawingEntity, writer: EntityWriter) => void>;

/** Export all supported objects from one project revision. Invalid input throws. */
export function exportDxf(project: Project): string {
  if (!project || project.schemaVersion !== 1 || !Array.isArray(project.entities))
    throw new Error('A supported project is required for DXF export.');
  if (!Object.hasOwn(unitCodes, project.units))
    throw new Error('Select valid project units before exporting.');
  const ids = new Set<string>();
  for (const entity of project.entities) {
    validateEntity(entity);
    if (ids.has(entity.id)) throw new Error(`Duplicate drawing identifier: ${entity.id}`);
    ids.add(entity.id);
  }
  // CAD layer names are case-insensitive. Reuse the first spelling so a valid
  // project with LINE and line cannot create conflicting table records.
  const canonicalLayers = new Map<string, string>([['0', '0']]);
  for (const entity of project.entities) {
    if (!canonicalLayers.has(entity.layer.toUpperCase()))
      canonicalLayers.set(entity.layer.toUpperCase(), entity.layer);
  }
  const tags: Pair[] = [];
  const write: Write = (...pairs) => {
    tags.push(...pairs);
  };
  let nextHandle = 0x100;
  const handle = () => (nextHandle++).toString(16).toUpperCase();
  const section = (name: string) => write([0, 'SECTION'], [2, name]);
  const endSection = () => write([0, 'ENDSEC']);
  const common = (type: string, layer: string, owner = modelBlock) => {
    const entityHandle = handle();
    write(
      [0, type],
      [5, entityHandle],
      [330, owner],
      [100, 'AcDbEntity'],
      [8, ascii(canonicalLayers.get(layer.toUpperCase()) ?? layer)],
    );
    return entityHandle;
  };
  const identity = (id: string) => write([1001, 'LOTGRADE'], [1000, ascii(id)]);
  const allPoints = project.entities.flatMap((entity) => entity.points);
  const minimum: Point = { x: 0, y: 0, z: 0 };
  const maximum: Point = { x: 0, y: 0, z: 0 };
  if (allPoints.length) {
    for (const axis of ['x', 'y', 'z'] as const) {
      minimum[axis] = allPoints.reduce((value, point) => Math.min(value, point[axis]), Infinity);
      maximum[axis] = allPoints.reduce((value, point) => Math.max(value, point[axis]), -Infinity);
    }
  }

  section('HEADER');
  write(
    [9, '$ACADVER'],
    [1, DXF_VERSION],
    [9, '$DWGCODEPAGE'],
    [3, 'ANSI_1252'],
    [9, '$HANDSEED'],
    [5, '__HANDSEED__'],
    [9, '$INSBASE'],
    [10, 0],
    [20, 0],
    [30, 0],
    [9, '$EXTMIN'],
    [10, minimum.x],
    [20, minimum.y],
    [30, minimum.z],
    [9, '$EXTMAX'],
    [10, maximum.x],
    [20, maximum.y],
    [30, maximum.z],
    [9, '$INSUNITS'],
    [70, unitCodes[project.units]],
    [9, '$MEASUREMENT'],
    [70, project.units === 'meters' ? 1 : 0],
    [9, '$LUNITS'],
    [70, 2],
    [9, '$LUPREC'],
    [70, 4],
    [9, '$PDMODE'],
    [70, 35],
    [9, '$PDSIZE'],
    [40, -2],
  );
  endSection();

  section('CLASSES');
  write(
    [0, 'CLASS'],
    [1, 'LAYOUT'],
    [2, 'AcDbLayout'],
    [3, 'ObjectDBX Classes'],
    [90, 0],
    [91, 2],
    [280, 0],
    [281, 0],
  );
  endSection();

  section('TABLES');
  const table = (name: string, tableHandle: string, count: number) =>
    write(
      [0, 'TABLE'],
      [2, name],
      [5, tableHandle],
      [330, '0'],
      [100, 'AcDbSymbolTable'],
      [70, count],
    );
  const endTable = () => write([0, 'ENDTAB']);
  table('VPORT', '1', 1);
  write(
    [0, 'VPORT'],
    [5, handle()],
    [330, '1'],
    [100, 'AcDbSymbolTableRecord'],
    [100, 'AcDbViewportTableRecord'],
    [2, '*Active'],
    [70, 0],
    [10, 0],
    [20, 0],
    [11, 1],
    [21, 1],
    [12, (minimum.x + maximum.x) / 2],
    [22, (minimum.y + maximum.y) / 2],
    [16, 0],
    [26, 0],
    [36, 1],
    [17, 0],
    [27, 0],
    [37, 0],
    [40, Math.max(maximum.y - minimum.y, maximum.x - minimum.x, 20) * 1.2],
    [41, 1.5],
    [42, 50],
    [43, 0],
    [44, 0],
    [50, 0],
    [51, 0],
    [71, 0],
    [72, 100],
    [73, 1],
    [74, 3],
    [75, 0],
    [76, 0],
    [77, 0],
    [78, 0],
  );
  endTable();
  table('LTYPE', '2', 3);
  for (const name of ['ByBlock', 'ByLayer', 'Continuous']) {
    write(
      [0, 'LTYPE'],
      [5, handle()],
      [330, '2'],
      [100, 'AcDbSymbolTableRecord'],
      [100, 'AcDbLinetypeTableRecord'],
      [2, name],
      [70, 0],
      [3, ''],
      [72, 65],
      [73, 0],
      [40, 0],
    );
  }
  endTable();
  const layers = [...canonicalLayers.values()].sort();
  table('LAYER', '3', layers.length);
  const colors: Record<string, number> = {
    'FG-CONTOUR': 3,
    'FG-CONT-MAJOR': 3,
    'FG-CONT-MINOR': 8,
    'LOT-BOUNDARY': 6,
    BUILDING: 4,
    'FG-SPOT': 2,
  };
  for (const layer of layers) {
    write(
      [0, 'LAYER'],
      [5, handle()],
      [330, '3'],
      [100, 'AcDbSymbolTableRecord'],
      [100, 'AcDbLayerTableRecord'],
      [2, ascii(layer)],
      [70, 0],
      [62, colors[layer] ?? 7],
      [6, 'Continuous'],
      [370, -3],
    );
  }
  endTable();
  table('STYLE', '4', 1);
  write(
    [0, 'STYLE'],
    [5, handle()],
    [330, '4'],
    [100, 'AcDbSymbolTableRecord'],
    [100, 'AcDbTextStyleTableRecord'],
    [2, 'Standard'],
    [70, 0],
    [40, 0],
    [41, 1],
    [50, 0],
    [71, 0],
    [42, 0.25],
    [3, 'txt'],
    [4, ''],
  );
  endTable();
  for (const [name, tableHandle] of [
    ['VIEW', '5'],
    ['UCS', '6'],
  ] as const) {
    table(name, tableHandle, 0);
    endTable();
  }
  table('APPID', '7', 2);
  for (const name of ['ACAD', 'LOTGRADE']) {
    write(
      [0, 'APPID'],
      [5, handle()],
      [330, '7'],
      [100, 'AcDbSymbolTableRecord'],
      [100, 'AcDbRegAppTableRecord'],
      [2, name],
      [70, 0],
    );
  }
  endTable();
  table('DIMSTYLE', '8', 0);
  write([100, 'AcDbDimStyleTable']);
  endTable();
  table('BLOCK_RECORD', '9', 2);
  for (const [name, record, layout] of [
    ['*Model_Space', modelBlock, '23'],
    ['*Paper_Space', paperBlock, '24'],
  ] as const) {
    write(
      [0, 'BLOCK_RECORD'],
      [5, record],
      [330, '9'],
      [100, 'AcDbSymbolTableRecord'],
      [100, 'AcDbBlockTableRecord'],
      [2, name],
      [340, layout],
      [70, 0],
      [280, 1],
      [281, 0],
    );
  }
  endTable();
  endSection();

  section('BLOCKS');
  for (const [name, record] of [
    ['*Model_Space', modelBlock],
    ['*Paper_Space', paperBlock],
  ] as const) {
    common('BLOCK', '0', record);
    write(
      [100, 'AcDbBlockBegin'],
      [2, name],
      [70, 0],
      [10, 0],
      [20, 0],
      [30, 0],
      [3, name],
      [1, ''],
    );
    common('ENDBLK', '0', record);
    write([100, 'AcDbBlockEnd']);
  }
  endSection();

  section('ENTITIES');
  const writer: EntityWriter = {
    write,
    common,
    identity,
    textHeight: project.units === 'meters' ? 0.25 : 0.8,
  };
  for (const entity of project.entities) serializers[entity.kind](entity, writer);
  endSection();

  section('OBJECTS');
  write(
    [0, 'DICTIONARY'],
    [5, '20'],
    [330, '0'],
    [100, 'AcDbDictionary'],
    [281, 1],
    [3, 'ACAD_GROUP'],
    [350, '21'],
    [3, 'ACAD_LAYOUT'],
    [350, '22'],
  );
  write([0, 'DICTIONARY'], [5, '21'], [330, '20'], [100, 'AcDbDictionary'], [281, 1]);
  write(
    [0, 'DICTIONARY'],
    [5, '22'],
    [330, '20'],
    [100, 'AcDbDictionary'],
    [281, 1],
    [3, 'Model'],
    [350, '23'],
    [3, 'Layout1'],
    [350, '24'],
  );
  for (const [name, layoutHandle, blockHandle, order] of [
    ['Model', '23', modelBlock, 0],
    ['Layout1', '24', paperBlock, 1],
  ] as const) {
    write(
      [0, 'LAYOUT'],
      [5, layoutHandle],
      [330, '22'],
      [100, 'AcDbPlotSettings'],
      [1, ''],
      [4, ''],
      [6, ''],
      [40, 0],
      [41, 0],
      [42, 0],
      [43, 0],
      [44, 420],
      [45, 297],
      [46, 0],
      [47, 0],
      [48, 0],
      [49, 0],
      [140, 0],
      [141, 0],
      [142, 1],
      [143, 1],
      [70, order === 0 ? 1024 : 0],
      [72, 1],
      [73, 0],
      [74, 5],
      [7, ''],
      [75, 0],
      [76, 0],
      [77, 2],
      [78, 300],
      [147, 1],
      [148, 0],
      [149, 0],
      [100, 'AcDbLayout'],
      [1, name],
      [70, 1],
      [71, order],
      [10, 0],
      [20, 0],
      [11, 420],
      [21, 297],
      [12, 0],
      [22, 0],
      [32, 0],
      [14, minimum.x],
      [24, minimum.y],
      [34, minimum.z],
      [15, maximum.x],
      [25, maximum.y],
      [35, maximum.z],
      [146, 0],
      [13, 0],
      [23, 0],
      [33, 0],
      [16, 1],
      [26, 0],
      [36, 0],
      [17, 0],
      [27, 1],
      [37, 0],
      [76, 1],
      [330, blockHandle],
    );
  }
  endSection();
  write([0, 'EOF']);
  if (tags.some(([, value]) => typeof value === 'number' && !Number.isFinite(value))) {
    throw new Error('Drawing coordinates exceed the finite range supported by DXF export.');
  }
  return `${tags.map(([code, value]) => `${code}\r\n${value === '__HANDSEED__' ? nextHandle.toString(16).toUpperCase() : typeof value === 'number' && Object.is(value, -0) ? '0' : value}`).join('\r\n')}\r\n`;
}
