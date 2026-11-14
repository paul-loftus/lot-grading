import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createProject, serializeProject } from '../src/core/project';
import { previewGradeEdit } from '../src/core/grade';
import { exportDxf } from '../src/core/dxf';

const project = createProject('Applied grade exchange', 'feet');
project.entities = [
  {
    id: 'hold-a',
    kind: 'polyline',
    name: 'Hold A',
    layer: 'FG-BREAKLINE',
    closed: false,
    points: [
      { x: 2000000.25, y: 5000000.75, z: 100 },
      { x: 2000100.25, y: 5000000.75, z: 100 },
      { x: 2000150.25, y: 5000000.75, z: 101 },
    ],
  },
  {
    id: 'hold-b',
    kind: 'polyline',
    name: 'Hold B',
    layer: 'FG-BREAKLINE',
    closed: false,
    points: [
      { x: 2000000.25, y: 5000020.75, z: 100 },
      { x: 2000100.25, y: 5000020.75, z: 102 },
    ],
  },
  {
    id: 'benchmark',
    kind: 'point',
    name: 'Benchmark',
    layer: 'FG-SPOT',
    closed: false,
    points: [{ x: 2000010.25, y: 5000030.75, z: 100.5 }],
  },
];
for (const [id, hold, grade] of [
  ['hold-a', 'a', 2.5],
  ['hold-b', 'b', -3.25],
] as const) {
  const edit = previewGradeEdit(project, id, 0, hold, grade);
  project.entities = project.entities.map((entity) => (entity.id === id ? edit.entity : entity));
}
const output = resolve(import.meta.dirname, '../tests/.generated');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'applied-grade.lotgrade'), serializeProject(project));
await writeFile(resolve(output, 'applied-grade.dxf'), exportDxf(project));
console.log('Generated applied-grade project and DXF for independent elevation verification.');
