import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Project } from '../src/core/types';
import { previewDxf } from '../src/core/import';

async function create(page: Page, name: string) {
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name').fill(name);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
}
async function precise(page: Page, x: number, y: number) {
  const panel = page.locator('.precision-entry');
  if (!(await panel.evaluate((e) => (e as HTMLDetailsElement).open)))
    await panel.locator('summary').click();
  await page.getByLabel('Placement X', { exact: true }).fill(String(x));
  await page.getByLabel('Placement Y', { exact: true }).fill(String(y));
  await page.getByRole('button', { name: 'Place point', exact: true }).click();
}
async function elevation(page: Page, z: number) {
  await page.getByLabel('Drawing elevation', { exact: true }).fill(String(z));
  await page.getByLabel('Drawing elevation', { exact: true }).press('Enter');
}
async function current(page: Page, name: string): Promise<Project> {
  return page.evaluate(
    async (title) =>
      (window.lotgrade
        ? await window.lotgrade.listProjects()
        : (JSON.parse(localStorage.getItem('lotgrade.projects.v1')!) as Project[])
      ).find((p) => p.name === title)!,
    name,
  );
}
async function selectGrade(page: Page, name = 'Line 1') {
  await page.getByRole('button', { name: /^Features/ }).click();
  await page.getByRole('button', { name: new RegExp(name) }).click();
  const panel = page.locator('details.grade-panel');
  if (!(await panel.evaluate((e) => (e as HTMLDetailsElement).open)))
    await panel.locator('summary').click();
}
async function pointScreen(page: Page, project: Project, x: number, y: number) {
  const box = (await page.getByTestId('drawing-canvas').boundingBox())!;
  return {
    x: box.x + box.width / 2 + (x - project.view.centerX) * project.view.scale,
    y: box.y + box.height / 2 - (y - project.view.centerY) * project.view.scale,
  };
}
async function pick(page: Page, project: Project, x: number, y: number) {
  const at = await pointScreen(page, project, x, y);
  await page.mouse.move(at.x + 3, at.y + 2);
  await page.mouse.down();
  await page.mouse.up();
}
async function downloadDxf(page: Page) {
  const event = page.waitForEvent('download');
  await page.getByTestId('export-dxf').click();
  return readFile((await (await event).path())!, 'utf8');
}

test('grade preview holds A, reports adjacent effects, applies once, undoes/redoes and exports actual vertex elevations', async ({
  page,
}, info) => {
  await page.goto('/');
  await create(page, 'Grade editor');
  await page.getByTestId('tool-polyline').click();
  await precise(page, 20.25, 40.75);
  await precise(page, 120.25, 40.75);
  await elevation(page, 101);
  await precise(page, 170.25, 40.75);
  await page.getByRole('button', { name: 'Finish line', exact: true }).click();
  await page.getByRole('button', { name: 'Fit drawing', exact: true }).click();
  const original = (await current(page, 'Grade editor')).entities;
  await selectGrade(page);
  await page.getByLabel('Target grade percent', { exact: true }).fill('2.5');
  await expect(page.getByTestId('grade-edit-preview')).toContainText('Z 100 → 102.5');
  await expect(page.getByTestId('grade-edit-preview')).toContainText('segment 2: +2% → -3%');
  await expect(page.getByTestId('grade-plan-label')).toContainText('Preview · A→B +2.5%');
  expect((await current(page, 'Grade editor')).entities).toEqual(original);
  await page.screenshot({ path: info.outputPath('grade-preview.png') });
  await page.getByRole('button', { name: 'Apply grade', exact: true }).click();
  await expect
    .poll(async () => (await current(page, 'Grade editor')).entities[0].points[1].z)
    .toBe(102.5);
  await expect(page.getByTestId('grade-percent')).toHaveText('+2.5%');
  await expect(page.getByTestId('grade-downhill-arrow')).toHaveAttribute(
    'data-direction',
    'b-to-a',
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await current(page, 'Grade editor')).entities).toEqual(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect
    .poll(async () => (await current(page, 'Grade editor')).entities[0].points[1].z)
    .toBe(102.5);
  const parsed = previewDxf(await downloadDxf(page));
  expect(parsed.entities[0].points).toEqual([
    { x: 20.25, y: 40.75, z: 100 },
    { x: 120.25, y: 40.75, z: 102.5 },
    { x: 170.25, y: 40.75, z: 101 },
  ]);
  const portable = page.waitForEvent('download');
  await page.getByRole('button', { name: 'More save options' }).click();
  await page.getByRole('button', { name: 'Save a copy…', exact: true }).click();
  const saved = JSON.parse(await readFile((await (await portable).path())!, 'utf8')) as Project;
  expect(saved.entities[0].points[1].z).toBe(102.5);
  expect(Object.keys(saved)).not.toContain('gradeOverlay');
  await page.reload();
  await page.getByRole('button', { name: 'Open Grade editor', exact: true }).click();
  expect((await current(page, 'Grade editor')).entities).toEqual(saved.entities);
  await expect(page.getByTestId('grade-overlay')).not.toBeVisible();
});

test('holding B keeps the A-to-B sign, zero run is explicit, and contours/curve-bearing paths stay protected', async ({
  page,
}) => {
  await page.goto('/');
  await create(page, 'Grade edge cases');
  await page.getByTestId('tool-polyline').click();
  await precise(page, 20, 20);
  await elevation(page, 102);
  await precise(page, 120, 20);
  await page.getByRole('button', { name: 'Finish line', exact: true }).click();
  await selectGrade(page);
  await page.getByLabel('Held grade endpoint').selectOption('b');
  await page.getByLabel('Target grade percent').fill('3');
  await expect(page.getByTestId('grade-edit-preview')).toContainText('Z 100 → 99');
  await page.getByRole('button', { name: 'Apply grade', exact: true }).click();
  await expect
    .poll(async () => (await current(page, 'Grade edge cases')).entities[0].points[0].z)
    .toBe(99);
  await page.getByLabel('Target grade percent').fill('-4');
  await page.getByRole('button', { name: 'Apply grade', exact: true }).click();
  await expect
    .poll(async () => (await current(page, 'Grade edge cases')).entities[0].points[0].z)
    .toBe(106);
  expect((await current(page, 'Grade edge cases')).entities[0].points[1].z).toBe(102);
  await expect(page.getByTestId('grade-percent')).toHaveText('-4%');
  await expect(page.getByTestId('grade-downhill-arrow')).toHaveAttribute(
    'data-direction',
    'a-to-b',
  );
  await page.getByText('Vertex coordinates', { exact: true }).click();
  await page.getByLabel('X · vertex 2', { exact: true }).fill('20');
  await page.getByLabel('X · vertex 2', { exact: true }).press('Enter');
  await expect(page.getByTestId('grade-percent')).toContainText('Undefined');
  await expect(page.getByTestId('grade-ratio')).toContainText('vertical');
  await page.getByLabel('Target grade percent').fill('2');
  await expect(page.getByRole('alert').filter({ hasText: 'no horizontal run' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply grade', exact: true })).toBeDisabled();
  await page.getByTestId('tool-contour').click();
  await precise(page, 20, 50);
  await precise(page, 120, 50);
  await page.getByRole('button', { name: 'Finish line', exact: true }).click();
  await selectGrade(page, 'Contour 1');
  await expect(
    page.getByText('Grade edits apply to proposed polylines.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel('Target grade percent')).not.toBeVisible();
  await page.getByTestId('tool-polyline').click();
  await page.getByTestId('segment-arc').click();
  await precise(page, 20, 80);
  await precise(page, 40, 100);
  await precise(page, 60, 80);
  await page.getByTestId('segment-line').click();
  await precise(page, 100, 80);
  await page.getByRole('button', { name: 'Finish line', exact: true }).click();
  const curve = (await current(page, 'Grade edge cases')).entities[2];
  await selectGrade(page, 'Line 2');
  await page.getByLabel('Grade segment').selectOption('1');
  await expect(page.getByText(/This path contains circular arcs/)).toBeVisible();
  await expect(page.getByLabel('Target grade percent')).not.toBeVisible();
  expect((await current(page, 'Grade edge cases')).entities[2]).toEqual(curve);
});

test('Grade check acquires reference XYZ, keeps geometry/export unchanged, clears on a third pick, and rejects ambiguous intersection Z', async ({
  page,
}, info) => {
  await page.goto('/');
  await create(page, 'Grade controls');
  await page.getByRole('button', { name: 'Import reference', exact: true }).click();
  await page.getByLabel('Reference source file').setInputFiles({
    name: 'grade-controls.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'number,x,y,z,description\n1,2000000.25,5000000.75,100,Street\n2,2000100.25,5000000.75,102,Garage\n3,2000100.25,5000030.75,101,Yard\n',
    ),
  });
  await page.getByLabel('Point column preset').selectOption('penzd');
  await page.getByLabel('First record is a header').check();
  await page.getByLabel('Source units', { exact: true }).selectOption('feet');
  await page.getByLabel('I confirmed the source units and coordinate alignment.').check();
  await page.getByRole('button', { name: 'Import locked reference', exact: true }).click();
  const project = await current(page, 'Grade controls'),
    before = await downloadDxf(page);
  await page.getByTestId('tool-grade').click();
  await pick(page, project, 2000000.25, 5000000.75);
  await pick(page, project, 2000100.25, 5000000.75);
  await expect(page.getByTestId('grade-run')).toHaveText('100 ft');
  await expect(page.getByTestId('grade-rise')).toHaveText('+2 ft');
  await expect(page.getByTestId('grade-percent')).toHaveText('+2%');
  await expect(page.getByTestId('grade-ratio')).toHaveText('50 H : 1 V');
  await expect(page.getByTestId('grade-downhill-arrow')).toHaveAttribute(
    'data-direction',
    'b-to-a',
  );
  await page.screenshot({ path: info.outputPath('grade-check.png') });
  const box = (await page.getByTestId('drawing-canvas').boundingBox())!;
  await page.keyboard.down('Space');
  await page.mouse.move(box.x + 200, box.y + 180);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 190);
  await page.mouse.up();
  await page.keyboard.up('Space');
  await expect(page.getByTestId('grade-percent')).toHaveText('+2%');
  expect(await downloadDxf(page)).toBe(before);
  const after = await current(page, 'Grade controls');
  expect(after.entities).toEqual(project.entities);
  expect(after.references).toEqual(project.references);
  await pick(page, after, 2000100.25, 5000030.75);
  await expect(page.getByText('Choose control B.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('grade-percent')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('grade-overlay')).not.toBeVisible();
  await page.getByTestId('tool-polyline').click();
  await elevation(page, 100);
  await precise(page, 2000000.25, 5000040.75);
  await precise(page, 2000100.25, 5000040.75);
  await page.getByRole('button', { name: 'Finish line', exact: true }).click();
  await elevation(page, 110);
  await precise(page, 2000050.25, 5000020.75);
  await precise(page, 2000050.25, 5000080.75);
  await page.getByRole('button', { name: 'Finish line', exact: true }).click();
  await page.getByRole('button', { name: 'Fit drawing', exact: true }).click();
  await page.getByTestId('tool-grade').click();
  const now = await current(page, 'Grade controls');
  await pick(page, now, 2000050.25, 5000040.75);
  await expect(
    page.getByRole('alert').filter({ hasText: 'source elevations disagree' }),
  ).toBeVisible();
  await expect(page.getByText('Choose control A.', { exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('snap-feedback')).toContainText('Midpoint');
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByText('Choose control B.', { exact: true })).toBeVisible();
  expect((await current(page, 'Grade controls')).entities).toHaveLength(2);
});

test('native grade preview is excluded from export; Apply persists true 3D elevations and reopening resets temporary checks', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lotgrade-grade-'));
  let application: ElectronApplication | undefined;
  const launch = async () => {
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined,
      ),
    ) as Record<string, string>;
    application = await electron.launch({
      ...(process.env.LOTGRADE_EXECUTABLE
        ? { executablePath: process.env.LOTGRADE_EXECUTABLE, args: [] }
        : { args: ['.'] }),
      env: { ...environment, LOTGRADE_USER_DATA: path.join(directory, 'profile') },
    });
    return application.firstWindow();
  };
  try {
    let page = await launch();
    await create(page, 'Native grades');
    await page.getByTestId('tool-polyline').click();
    await precise(page, 2000000.25, 5000000.75);
    await elevation(page, 102);
    await precise(page, 2000100.25, 5000000.75);
    await page.getByRole('button', { name: 'Finish line', exact: true }).click();
    await page.getByRole('button', { name: 'Fit drawing', exact: true }).click();
    const portable = path.join(directory, 'grade.lotgrade'),
      exportPath = path.join(directory, 'grade.dxf');
    await application!.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, portable);
    await page.getByRole('button', { name: 'More save options' }).click();
    await page.getByRole('button', { name: 'Save project as…' }).click();
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(portable, 'utf8')).entities.length;
        } catch {
          return 0;
        }
      })
      .toBe(1);
    await selectGrade(page);
    await page.getByLabel('Held grade endpoint').selectOption('b');
    await page.getByLabel('Target grade percent').fill('-3.25');
    await expect(page.getByTestId('grade-edit-preview')).toContainText('105.25');
    await application!.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, exportPath);
    await application!.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'export'),
    );
    await expect
      .poll(async () => {
        try {
          return previewDxf(await readFile(exportPath, 'utf8')).entities[0].points[0].z;
        } catch {
          return null;
        }
      })
      .toBe(100);
    await page.getByRole('button', { name: 'Apply grade', exact: true }).click();
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect
      .poll(async () => JSON.parse(await readFile(portable, 'utf8')).entities[0].points[0].z)
      .toBe(105.25);
    await page.getByTestId('export-dxf').click();
    await expect
      .poll(async () => previewDxf(await readFile(exportPath, 'utf8')).entities[0].points[0].z)
      .toBe(105.25);
    expect(previewDxf(await readFile(exportPath, 'utf8')).entities[0].points[1].z).toBe(102);
    await application!.close();
    application = undefined;
    page = await launch();
    await page.getByRole('button', { name: 'Open Native grades', exact: true }).click();
    await page.getByTestId('tool-grade').click();
    const data = await current(page, 'Native grades');
    await pick(page, data, 2000000.25, 5000000.75);
    await pick(page, data, 2000100.25, 5000000.75);
    await expect(page.getByTestId('grade-percent')).toHaveText('-3.25%');
    await application!.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, portable);
    await page.getByRole('button', { name: 'More save options' }).click();
    await page.getByRole('button', { name: 'Open project file…' }).click();
    await expect(page.getByTestId('tool-grade')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('grade-overlay')).not.toBeVisible();
  } finally {
    if (application) await application.close();
    await rm(directory, { recursive: true, force: true });
  }
});
