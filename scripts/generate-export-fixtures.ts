import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exportDxf } from '../src/core/dxf';
import type { Project } from '../src/core/types';

const root = resolve(import.meta.dirname, '..');
const contractPath = resolve(root, 'tests/fixtures/export/cases.json');
const contract = JSON.parse(await readFile(contractPath, 'utf8')) as {
  cases: { name: string; project: Project }[];
};
const output = resolve(root, 'tests/.generated');
await mkdir(output, { recursive: true });
for (const testCase of contract.cases) {
  await writeFile(resolve(output, `${testCase.name}.dxf`), exportDxf(testCase.project), 'ascii');
}
console.log(
  `Generated ${contract.cases.length} DXF fixtures from the current exporter in tests/.generated.`,
);
