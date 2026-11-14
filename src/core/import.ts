import { entityBounds } from './geometry';
import { createProject, serializeProject, validateProject } from './project';
import type { DrawingEntity, ImportIssue, Point, Project, ReferenceSource, Units } from './types';

export const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
export type PointFormat = NonNullable<ReferenceSource['pointFormat']>;
export interface SourceFile {
  name: string;
  text: string;
  contentBase64: string;
  sha256: string;
}
export interface ImportPreview {
  entities: DrawingEntity[];
  records: ReferenceSource['records'];
  issues: ImportIssue[];
  counts: Record<string, number>;
  declaredUnits: Units | null;
  unsupportedUnits: boolean;
  unitLabel: string;
}
export interface PointTable {
  rows: { line: number; cells: string[] }[];
  width: number;
}

export async function readSource(name: string, bytes: Uint8Array): Promise<SourceFile> {
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES)
    throw new Error('Choose a nonempty source file up to 4 MB.');
  if (!name || name.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(name))
    throw new Error('The source must have a plain file name.');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      'This import supports ASCII and UTF-8 text. Save the source as UTF-8 before importing.',
    );
  }
  if (text.includes('\0') || text.startsWith('AutoCAD Binary DXF'))
    throw new Error('Binary DXF is not supported. Export an ASCII DXF from CAD.');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return {
    name,
    text,
    contentBase64: btoa(binary),
    sha256: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(''),
  };
}

const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
function numeric(value: string | undefined, label: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (value === undefined || !numberPattern.test(value.trim()) || !Number.isFinite(Number(value)))
    throw new Error(`${label} must be a finite decimal number.`);
  return Number(value);
}
function integer(value: string | undefined, label: string, fallback?: number): number {
  const result = numeric(value, label, fallback);
  if (!Number.isSafeInteger(result) || result < 0)
    throw new Error(`${label} must be a nonnegative integer.`);
  return result;
}
const decode = (text: string) =>
  text.replace(/\\U\+([a-fA-F0-9]{4})/g, (_, code: string) =>
    String.fromCharCode(parseInt(code, 16)),
  );
const singleLine = (text: string) => text.replace(/[\u0000-\u001f\u007f]/g, ' ');
const template = () => ({ ...createProject('Import validation'), schemaVersion: 2 as const });
function validateCandidate(entity: DrawingEntity, project: Project): void {
  validateProject({ ...project, entities: [entity] });
}
function emptyPreview(): ImportPreview {
  return {
    entities: [],
    records: [],
    issues: [],
    counts: {},
    declaredUnits: null,
    unsupportedUnits: false,
    unitLabel: 'Unknown / unitless',
  };
}
function addIssue(preview: ImportPreview, record: string, type: string, error: unknown): void {
  preview.issues.push({
    record: singleLine(record).slice(0, 200),
    type: singleLine(type).slice(0, 100),
    message: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
  });
}
type Pair = { code: number; value: string };
type DxfRecord = { type: string; pairs: Pair[] };
function pairsFromText(text: string): Pair[] {
  if (new TextEncoder().encode(text).length > MAX_SOURCE_BYTES || text.includes('\0'))
    throw new Error('The DXF is binary or exceeds 4 MB.');
  const lines = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length % 2) throw new Error('Truncated DXF: every group code needs a value.');
  const result: Pair[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    if (!/^\d+$/.test(lines[i].trim()) || Number(lines[i]) > 1071)
      throw new Error(`Invalid DXF group code on line ${i + 1}.`);
    const code = Number(lines[i]);
    if (code !== 999) result.push({ code, value: lines[i + 1].trim() });
  }
  if (result.at(-1)?.code !== 0 || result.at(-1)?.value !== 'EOF')
    throw new Error('Truncated DXF: the EOF marker is missing.');
  return result;
}
function value(pairs: Pair[], code: number): string | undefined {
  return pairs.find((pair) => pair.code === code)?.value;
}
function n(pairs: Pair[], code: number, fallback?: number): number {
  return numeric(value(pairs, code), `DXF group ${code}`, fallback);
}
function point(pairs: Pair[], code = 10): Point {
  return { x: n(pairs, code), y: n(pairs, code + 10), z: n(pairs, code + 20, 0) };
}
function planar(pairs: Pair[]): void {
  if (n(pairs, 210, 0) !== 0 || n(pairs, 220, 0) !== 0 || n(pairs, 230, 1) !== 1)
    throw new Error('Tilted or reversed OCS/extrusion is outside this import subset.');
  if (n(pairs, 39, 0) !== 0) throw new Error('Extruded thickness is outside this import subset.');
}
function noWidths(pairs: Pair[]): void {
  for (const pair of pairs)
    if ([40, 41, 43].includes(pair.code) && numeric(pair.value, 'Polyline width') !== 0)
      throw new Error('Wide polylines are outside this import subset. Export zero-width linework.');
}
function supportedFlags(pairs: Pair[], mask: number): number {
  const flags = integer(value(pairs, 70), 'Polyline flags', 0);
  if (flags > 255 || (flags & ~mask) !== 0)
    throw new Error('Fitted, spline, mesh or unsupported polyline flags are outside this subset.');
  return flags;
}
function splitClosedTwoVertexArc(entity: DrawingEntity): void {
  if (!entity.closed || entity.points.length !== 2 || !entity.bulges?.some(Boolean)) return;
  const i = entity.bulges[0] ? 0 : 1;
  const a = entity.points[i],
    b = entity.points[(i + 1) % 2],
    bulge = entity.bulges[i];
  const midpoint = {
    x: (a.x + b.x) / 2 + (bulge * (b.y - a.y)) / 2,
    y: (a.y + b.y) / 2 - (bulge * (b.x - a.x)) / 2,
    z: a.z,
  };
  const half = Math.tan(Math.atan(bulge) / 2);
  entity.points.splice(i + 1, 0, midpoint);
  entity.bulges.splice(i, 1, half, half);
}
function parseEntity(record: DxfRecord, vertices: DxfRecord[], id: string): DrawingEntity {
  const p = record.pairs;
  if (
    integer(value(p, 67), 'Paper-space flag', 0) !== 0 ||
    (value(p, 410) !== undefined && value(p, 410) !== 'Model')
  )
    throw new Error('Paper-space geometry is excluded; export model-space linework.');
  planar(p);
  const layer = decode(value(p, 8) ?? '0');
  const entity: DrawingEntity = {
    id,
    kind: record.type === 'POINT' ? 'point' : 'polyline',
    name: singleLine(`${layer} · ${record.type} ${value(p, 5) ?? id}`).slice(0, 200),
    layer,
    closed: false,
    points: [],
  };
  if (record.type === 'LINE') entity.points = [point(p), point(p, 11)];
  else if (record.type === 'POINT') entity.points = [point(p)];
  else if (record.type === 'ARC' || record.type === 'CIRCLE') {
    const center = point(p),
      radius = n(p, 40);
    if (!(radius > 0)) throw new Error('An arc/circle must have a positive radius.');
    const at = (angle: number): Point => ({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
      z: center.z,
    });
    if (record.type === 'CIRCLE') {
      entity.closed = true;
      entity.points = [at(0), at(Math.PI / 2), at(Math.PI), at((3 * Math.PI) / 2)];
      entity.bulges = Array(4).fill(Math.tan(Math.PI / 8));
    } else {
      const start = n(p, 50),
        end = n(p, 51);
      if (Math.abs(start) > 360 || Math.abs(end) > 360)
        throw new Error('Arc angles must be within one turn.');
      const sweep = (((end - start) % 360) + 360) % 360;
      if (!sweep) throw new Error('An ARC must have a nonzero sweep less than one turn.');
      entity.points = [at((start * Math.PI) / 180), at((end * Math.PI) / 180)];
      entity.bulges = [Math.tan((sweep * Math.PI) / 720), 0];
    }
  } else if (record.type === 'LWPOLYLINE') {
    noWidths(p);
    entity.closed = Boolean(supportedFlags(p, 129) & 1);
    const elevation = n(p, 38, 0);
    const bulges: number[] = [];
    let vertex: Pair[] = [];
    const finish = () => {
      if (!vertex.length) return;
      if (vertex.filter((pair) => pair.code === 20).length !== 1)
        throw new Error('A polyline vertex needs exactly one Y value.');
      entity.points.push({ x: n(vertex, 10), y: n(vertex, 20), z: elevation });
      bulges.push(n(vertex, 42, 0));
    };
    for (const pair of p) {
      if (pair.code === 10) {
        finish();
        vertex = [pair];
      } else if (vertex.length) vertex.push(pair);
    }
    finish();
    if (integer(value(p, 90), 'Vertex count') !== entity.points.length)
      throw new Error('The declared DXF vertex count does not match the geometry.');
    entity.bulges = bulges;
  } else if (record.type === 'POLYLINE') {
    noWidths(p);
    const flags = supportedFlags(p, 137),
      threeD = Boolean(flags & 8),
      elevation = n(p, 30, 0);
    entity.closed = Boolean(flags & 1);
    entity.bulges = [];
    for (const vertex of vertices) {
      planar(vertex.pairs);
      noWidths(vertex.pairs);
      supportedFlags(vertex.pairs, threeD ? 32 : 0);
      const next = point(vertex.pairs),
        bulge = n(vertex.pairs, 42, 0);
      if (threeD && bulge !== 0) throw new Error('A 3D polyline cannot contain circular bulges.');
      if (!threeD && next.z !== 0)
        throw new Error(
          'A 2D POLYLINE vertex must have zero local Z; its header supplies elevation.',
        );
      entity.points.push({ ...next, z: threeD ? next.z : elevation });
      entity.bulges.push(bulge);
    }
  } else throw new Error(`${record.type} is outside the supported DXF subset.`);
  splitClosedTwoVertexArc(entity);
  return entity;
}

/** Explicit ASCII DXF subset; unsupported records are reported, never approximated. */
export function previewDxf(text: string): ImportPreview {
  const pairs = pairsFromText(text),
    result = emptyPreview(),
    validation = template();
  let section = '',
    hasEntities = false;
  const records: DxfRecord[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    if (pair.code === 0 && pair.value === 'SECTION') {
      if (section || pairs[i + 1]?.code !== 2) throw new Error('Invalid DXF section structure.');
      section = pairs[++i].value;
      if (section === 'ENTITIES') {
        if (hasEntities) throw new Error('Duplicate DXF ENTITIES section.');
        hasEntities = true;
      }
    } else if (pair.code === 0 && pair.value === 'ENDSEC') {
      if (!section) throw new Error('Unexpected DXF ENDSEC.');
      section = '';
    } else if (section === 'HEADER' && pair.code === 9 && pair.value === '$INSUNITS') {
      const code = integer(pairs[i + 1]?.value, 'DXF units');
      if (pairs[i + 1]?.code !== 70) throw new Error('Invalid DXF unit declaration.');
      result.declaredUnits =
        ({ 2: 'feet', 6: 'meters', 21: 'us-survey-feet' } as Record<number, Units>)[code] ?? null;
      result.unsupportedUnits = code !== 0 && result.declaredUnits === null;
      result.unitLabel =
        result.declaredUnits ??
        (code === 0 ? 'Unknown / unitless' : `Unsupported $INSUNITS=${code}`);
    } else if (section === 'ENTITIES') {
      if (pair.code === 0) records.push({ type: pair.value, pairs: [] });
      else if (records.length) records.at(-1)!.pairs.push(pair);
      else throw new Error('Invalid DXF entity record.');
    } else if (pair.code === 0 && pair.value === 'EOF' && section)
      throw new Error('The DXF section was not closed.');
  }
  if (section || !hasEntities) throw new Error('The DXF needs a complete ENTITIES section.');
  let objectCount = 0,
    vertexCount = 0;
  for (let i = 0; i < records.length; i++) {
    const record = records[i],
      vertices: DxfRecord[] = [];
    let complete = true;
    if (record.type === 'POLYLINE') {
      while (records[i + 1]?.type === 'VERTEX') vertices.push(records[++i]);
      complete = records[i + 1]?.type === 'SEQEND';
      if (complete) i++;
    }
    if (++objectCount > 10000) throw new Error('A source supports up to 10,000 top-level objects.');
    result.counts[record.type] = (result.counts[record.type] ?? 0) + 1;
    const label = `Object ${objectCount}${value(record.pairs, 5) ? ` / handle ${value(record.pairs, 5)}` : ''}`;
    try {
      if (!complete) throw new Error('POLYLINE is missing its SEQEND marker.');
      const entity = parseEntity(record, vertices, `import-dxf-${objectCount}`);
      validateCandidate(entity, validation);
      vertexCount += entity.points.length;
      if (vertexCount > 200000) throw new Error('The source exceeds 200,000 vertices.');
      result.entities.push(entity);
      result.records.push({ entityId: entity.id, record: label });
    } catch (error) {
      addIssue(result, label, record.type, error);
    }
  }
  return result;
}

/** Delimited UTF-8 records, including quoted commas, escaped quotes and multiline descriptions. */
export function readPointTable(text: string, delimiter: PointFormat['delimiter']): PointTable {
  if (new TextEncoder().encode(text).length > MAX_SOURCE_BYTES || text.includes('\0'))
    throw new Error('The point file is invalid or exceeds 4 MB.');
  const rows: PointTable['rows'] = [];
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let cells: string[] = [],
    cell = '',
    quoted = false,
    closedQuote = false,
    line = 1,
    start = 1;
  const separator = (c: string) =>
    delimiter === 'space' ? c === ' ' || c === '\t' : c === delimiter;
  const pushCell = () => {
    cells.push(cell.trim());
    cell = '';
    closedQuote = false;
  };
  const pushRow = () => {
    pushCell();
    if (cells.some(Boolean) && !cells[0].startsWith('#')) rows.push({ line: start, cells });
    if (cells.length > 100 || rows.length > 10001)
      throw new Error('Point files support up to 100 columns and 10,000 data rows.');
    cells = [];
    start = line + 1;
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (!quoted && !closedQuote && cells.length === 0 && !cell.trim() && c === '#') {
      while (i < source.length && source[i] !== '\n') i++;
      if (i < source.length) line++;
      start = line;
      cell = '';
      continue;
    }
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        cell += c;
        if (c === '\n') line++;
      }
    } else if (c === '\n') {
      pushRow();
      line++;
    } else if (separator(c)) {
      if (delimiter !== 'space' || cell || closedQuote) pushCell();
    } else if (c === '"' && !cell.trim() && !closedQuote) {
      cell = '';
      quoted = true;
    } else {
      if (closedQuote && c.trim())
        throw new Error(`Unexpected text after a quoted value on line ${line}.`);
      if (c === '"') throw new Error(`Quote inside an unquoted field on line ${line}.`);
      if (!closedQuote) cell += c;
    }
  }
  if (quoted) throw new Error('A quoted field is unfinished. No points were imported.');
  if (cell || cells.length || closedQuote) pushRow();
  return { rows, width: rows.reduce((max, row) => Math.max(max, row.cells.length), 0) };
}

export function previewPoints(table: PointTable, format: PointFormat): ImportPreview {
  const result = emptyPreview(),
    validation = template();
  const mapped = Object.values(format.columns).filter((c): c is number => c !== null);
  if (
    mapped.some((c) => !Number.isInteger(c) || c < 0 || c >= table.width) ||
    new Set(mapped).size !== mapped.length
  )
    throw new Error(
      'Map X, Y and Z to distinct columns; optional fields must use separate columns.',
    );
  const rows = format.header ? table.rows.slice(1) : table.rows;
  if (rows.length > 10000) throw new Error('Import up to 10,000 survey points at a time.');
  const numbers = new Set<string>();
  for (const row of rows) {
    result.counts.POINT = (result.counts.POINT ?? 0) + 1;
    const record = `Line ${row.line}`;
    try {
      const c = format.columns;
      const coord: Point = {
        x: numeric(row.cells[c.x], 'X / easting'),
        y: numeric(row.cells[c.y], 'Y / northing'),
        z: numeric(row.cells[c.z], 'Z / elevation'),
      };
      const pointNumber = c.pointNumber === null ? undefined : row.cells[c.pointNumber];
      const description =
        c.description === null
          ? undefined
          : format.delimiter === 'space' && c.description === Math.max(...mapped)
            ? row.cells.slice(c.description).join(' ')
            : row.cells[c.description];
      if (c.pointNumber !== null && (!pointNumber || pointNumber.length > 200))
        throw new Error('Point number is missing or too long.');
      if (pointNumber && /[\u0000-\u001f\u007f]/.test(pointNumber))
        throw new Error('Point numbers must be single-line text without control characters.');
      if (pointNumber && numbers.has(pointNumber))
        throw new Error(`Duplicate point number ${pointNumber.slice(0, 100)}.`);
      if (c.description !== null && description === undefined)
        throw new Error('The mapped description column is missing.');
      if (description && description.length > 2000)
        throw new Error('The point description exceeds 2,000 characters.');
      if (description && /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007f]/.test(description))
        throw new Error(
          'Point descriptions cannot contain control characters other than tabs/newlines.',
        );
      const entity: DrawingEntity = {
        id: `import-point-${row.line}`,
        kind: 'point',
        name: singleLine(
          [pointNumber, description].filter(Boolean).join(' · ') || `Survey point ${row.line}`,
        ).slice(0, 200),
        layer: 'SURVEY-POINTS',
        closed: false,
        points: [coord],
      };
      validateCandidate(entity, validation);
      if (pointNumber) numbers.add(pointNumber);
      result.entities.push(entity);
      result.records.push({
        entityId: entity.id,
        record,
        ...(pointNumber === undefined ? {} : { pointNumber }),
        ...(description === undefined ? {} : { description }),
      });
    } catch (error) {
      addIssue(result, record, 'POINT', error);
    }
  }
  return result;
}

export function importReference(
  project: Project,
  file: SourceFile,
  preview: ImportPreview,
  options: {
    format: 'dxf' | 'points';
    units: Units;
    context: NonNullable<Project['coordinateContext']>;
    pointFormat?: PointFormat;
    acceptIssues: boolean;
    alignment: { object: number; vertex: number; expected?: Point; confirmed: boolean };
  },
): Project {
  if (!preview.entities.length) throw new Error('The source has no supported objects to import.');
  if (
    preview.unsupportedUnits ||
    options.units !== project.units ||
    (preview.declaredUnits && preview.declaredUnits !== options.units)
  )
    throw new Error(
      'Source units must match project units. Convert the source explicitly in CAD before importing.',
    );
  if (preview.issues.length && !options.acceptIssues)
    throw new Error('Review and acknowledge the skipped-record report first.');
  if (!options.alignment.confirmed)
    throw new Error('Confirm the units and known-coordinate alignment first.');
  const control = preview.entities[options.alignment.object];
  if (!control?.points[options.alignment.vertex])
    throw new Error('Choose a valid alignment control.');
  const id = crypto.randomUUID();
  const ids = new Map(preview.entities.map((entity, i) => [entity.id, `${id}-${i}`]));
  const reference: ReferenceSource = {
    id,
    fileName: file.name,
    contentBase64: file.contentBase64,
    sha256: file.sha256,
    format: options.format,
    units: options.units,
    importedAt: new Date().toISOString(),
    visible: true,
    includeInExport: false,
    entities: preview.entities.map((entity) => ({
      ...structuredClone(entity),
      id: ids.get(entity.id)!,
    })),
    records: preview.records.map((record) => ({ ...record, entityId: ids.get(record.entityId)! })),
    issues: structuredClone(preview.issues),
    ...(options.pointFormat ? { pointFormat: structuredClone(options.pointFormat) } : {}),
    alignment: {
      objectId: ids.get(control.id)!,
      vertex: options.alignment.vertex,
      confirmed: true,
      ...(options.alignment.expected ? { expected: options.alignment.expected } : {}),
    },
  };
  const entities = [
    ...project.entities,
    ...reference.entities,
    ...(project.references ?? []).flatMap((s) => s.entities),
  ];
  const bounds = entities.reduce(
    (b, entity) => {
      const e = entityBounds(entity);
      return {
        minX: Math.min(b.minX, e.minX),
        minY: Math.min(b.minY, e.minY),
        maxX: Math.max(b.maxX, e.maxX),
        maxY: Math.max(b.maxY, e.maxY),
      };
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const next = validateProject({
    ...project,
    schemaVersion: 3,
    references: [...(project.references ?? []), reference],
    coordinateContext: options.context,
    updatedAt: new Date().toISOString(),
    view: {
      centerX: (bounds.minX + bounds.maxX) / 2,
      centerY: (bounds.minY + bounds.maxY) / 2,
      scale: Math.max(
        0.00001,
        Math.min(1000, 650 / Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 10)),
      ),
    },
  });
  serializeProject(next); // Reject oversize portable projects before changing the current drawing.
  return next;
}
