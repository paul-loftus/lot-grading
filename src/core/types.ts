export type Units = 'meters' | 'feet' | 'us-survey-feet';
export type EntityKind = 'polyline' | 'contour' | 'boundary' | 'building' | 'point';

/** Source/project coordinates. Rendering must never change these values. */
export interface Point {
  x: number;
  y: number;
  z: number;
}
export interface DrawingEntity {
  id: string;
  kind: EntityKind;
  name: string;
  points: Point[];
  /** Signed tan(sweep / 4) for the segment starting at each vertex; omitted means straight. */
  bulges?: number[];
  closed: boolean;
  layer: string;
}
export interface Project {
  schemaVersion: 1 | 2 | 3;
  id: string;
  name: string;
  description: string;
  units: Units;
  createdAt: string;
  updatedAt: string;
  entities: DrawingEntity[];
  view: { centerX: number; centerY: number; scale: number };
  settings: { gridSize: number; snapToGrid: boolean; contourInterval: number };
  /** Schema 3 keeps locked source geometry separate from proposed drawing objects. */
  references?: ReferenceSource[];
  /** Empty labels mean unknown; labels never transform coordinates. */
  coordinateContext?: { horizontal: string; vertical: string };
}

export interface ImportIssue {
  record: string;
  type: string;
  message: string;
}
export interface ReferenceSource {
  id: string;
  fileName: string;
  format: 'dxf' | 'points';
  contentBase64: string;
  sha256: string;
  units: Units;
  importedAt: string;
  visible: boolean;
  includeInExport: boolean;
  entities: DrawingEntity[];
  records: { entityId: string; record: string; pointNumber?: string; description?: string }[];
  issues: ImportIssue[];
  pointFormat?: {
    delimiter: ',' | ';' | '\t' | 'space';
    header: boolean;
    columns: {
      x: number;
      y: number;
      z: number;
      pointNumber: number | null;
      description: number | null;
    };
  };
  alignment: { objectId: string; vertex: number; expected?: Point; confirmed: true };
}

export const UNIT_LABELS: Record<Units, string> = {
  meters: 'Meters',
  feet: 'International feet',
  'us-survey-feet': 'US survey feet',
};
export const UNIT_SYMBOLS: Record<Units, string> = {
  meters: 'm',
  feet: 'ft',
  'us-survey-feet': 'ftUS',
};
export const LAYERS: Record<EntityKind, string> = {
  polyline: 'FG-BREAKLINE',
  contour: 'FG-CONT-MINOR',
  boundary: 'FG-LIMIT',
  building: 'BUILDING',
  point: 'FG-SPOT',
};
