import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exportDxf } from '../src/core/dxf';
import { createDemoProject, serializeProject } from '../src/core/project';

const project = createDemoProject();
project.id = 'willow-creek-lot-12';
project.createdAt = '2026-10-26T00:00:00.000Z';
project.updatedAt = project.createdAt;
const identifiers = [
  'lot-boundary',
  'home-footprint',
  'driveway-west',
  'driveway-east',
  'contour-100',
  'contour-101',
  'contour-102',
  'contour-103',
  'front-threshold',
  'street-tie-in',
];
if (identifiers.length !== project.entities.length) {
  throw new Error(
    'The example geometry changed. Review stable identities and receiving checks before regenerating.',
  );
}
project.entities.forEach((entity, index) => {
  entity.id = `willow-${identifiers[index]}`;
});
const directory = resolve(import.meta.dirname, '../examples');
await mkdir(directory, { recursive: true });
const stem = resolve(directory, 'Willow-Creek-Lot-12');
await writeFile(`${stem}.lotgrade`, serializeProject(project), 'utf8');
await writeFile(`${stem}.dxf`, exportDxf(project), 'ascii');
console.log('Generated deterministic Willow Creek project and DXF receiving sample in examples/.');
