import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { importReference, previewDxf, readSource } from '../src/core/import';
import { createProject, serializeProject } from '../src/core/project';
import { exportDxf } from '../src/core/dxf';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'tests/.generated');
await mkdir(output, { recursive: true });
const file = await readSource(
  'base-plan.dxf',
  await readFile(resolve(root, 'tests/fixtures/import/base-plan.dxf')),
);
const project = importReference(
  createProject('Independent reference round trip'),
  file,
  previewDxf(file.text),
  {
    format: 'dxf',
    units: 'feet',
    context: { horizontal: '', vertical: '' },
    acceptIssues: true,
    alignment: { object: 0, vertex: 0, confirmed: true },
  },
);
await writeFile(resolve(output, 'reference-excluded.dxf'), exportDxf(project));
project.references![0].includeInExport = true;
await writeFile(resolve(output, 'reference-round-trip.dxf'), exportDxf(project));
await writeFile(resolve(output, 'reference-round-trip.lotgrade'), serializeProject(project));
console.log(
  'Generated explicit reference inclusion/exclusion DXFs for independent source comparison.',
);
