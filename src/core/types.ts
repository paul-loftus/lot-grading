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
  closed: boolean;
  layer: string;
}
export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  units: Units;
  createdAt: string;
  updatedAt: string;
  entities: DrawingEntity[];
  view: { centerX: number; centerY: number; scale: number };
  settings: { gridSize: number; snapToGrid: boolean; contourInterval: number };
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
