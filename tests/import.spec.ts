import { expect, test, _electron as electron, type Page } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Project } from '../src/core/types';
import { previewDxf } from '../src/core/import';

const fixture = (name: string) => path.resolve('tests/fixtures/import', name);
const current = (page: Page): Promise<Project> =>
  page.evaluate(async () =>
    window.lotgrade
      ? (await window.lotgrade.listProjects())[0]
      : JSON.parse(localStorage.getItem('lotgrade.projects.v1')!)[0],
  );
async function create(page: Page, name: string, units = 'feet') {
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name').fill(name);
  await page.getByLabel('Drawing units').selectOption(units);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
}
async function choosePoints(page: Page) {
  await page.getByRole('button', { name: 'Import reference', exact: true }).click();
  await page.getByLabel('Reference source file').setInputFiles(fixture('survey-pnezd.csv'));
  await page.getByLabel('Point column preset').selectOption('pnezd');
  await page.getByLabel('First record is a header').check();
  await page.getByLabel('Source units', { exact: true }).selectOption('feet');
  await expect(page.getByText('Preview · 3 supported / 0 skipped')).toBeVisible();
}
async function confirm(page: Page) {
  await page.getByLabel('I confirmed the source units and coordinate alignment.').check();
  await page.getByRole('button', { name: 'Import locked reference', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
async function sourceCard(page: Page, file: string) {
  await page.getByRole('button', { name: /^Features/ }).click();
  const card = page
    .locator('.reference-card')
    .filter({ has: page.locator('summary').filter({ hasText: `${file} ·` }) });
  if (!(await card.evaluate((element) => (element as HTMLDetailsElement).open)))
    await card.locator(':scope > summary').click();
  return card;
}
async function exported(page: Page): Promise<string> {
  const pending = page.waitForEvent('download');
  await page.getByTestId('export-dxf').click();
  return readFile((await (await pending).path())!, 'utf8');
}

test('mapped survey preview, known control, locked snaps, undo/reopen, source preservation and independent export scope', async ({
  page,
}, info) => {
  await page.goto('/');
  await create(page, 'Imported survey workflow');
  const originalView = (await current(page)).view;
  await choosePoints(page);
  const plan = page.getByRole('img', { name: 'Reference geometry preview' });
  await expect(plan.locator('circle')).toHaveCount(3);
  const planBox = (await plan.boundingBox())!,
    markerBox = (await plan.locator('circle').first().boundingBox())!;
  expect(markerBox.width).toBeGreaterThan(0);
  expect(markerBox.x).toBeGreaterThanOrEqual(planBox.x);
  expect(markerBox.x + markerBox.width).toBeLessThanOrEqual(planBox.x + planBox.width);
  await expect(
    page.getByRole('button', { name: 'Import locked reference', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Horizontal coordinate system').fill('Illustrative local grid');
  await page.getByLabel('Vertical datum or benchmark').fill('Local BM 101');
  await page.getByLabel('Compare with a known coordinate').check();
  await page.getByLabel('Expected X', { exact: true }).fill('2000000.25');
  await page.getByLabel('Expected Y', { exact: true }).fill('5000000.75');
  await page.getByLabel('Expected Z', { exact: true }).fill('98.125');
  await expect(page.getByRole('status').filter({ hasText: 'Source − expected' })).toContainText(
    'ΔX 0, ΔY 0, ΔZ 0',
  );
  await page.getByLabel('I confirmed the source units and coordinate alignment.').check();
  await page.screenshot({ path: info.outputPath('import-preview.png') });
  await page.getByRole('button', { name: 'Import locked reference', exact: true }).click();
  await expect(page.locator('[data-reference="true"]')).toHaveCount(3);
  await expect.poll(async () => (await current(page)).schemaVersion).toBe(3);
  const original = (await current(page)).references![0];
  expect((await current(page)).entities).toHaveLength(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-reference="true"]')).toHaveCount(0);
  await expect.poll(async () => (await current(page)).view).toEqual(originalView);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('[data-reference="true"]')).toHaveCount(3);

  await sourceCard(page, 'survey-pnezd.csv');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download original', exact: true }).click();
  expect(await readFile((await (await download).path())!)).toEqual(
    await readFile(fixture('survey-pnezd.csv')),
  );
  expect(previewDxf(await exported(page)).entities).toHaveLength(0);

  const project = await current(page),
    box = (await page.getByTestId('drawing-canvas').boundingBox())!;
  const p = original.entities[0].points[0];
  const screen = {
    x: box.x + box.width / 2 + (p.x - project.view.centerX) * project.view.scale,
    y: box.y + box.height / 2 - (p.y - project.view.centerY) * project.view.scale,
  };
  // Locked sources cannot be selected or moved, even when hit directly.
  await page.mouse.move(screen.x, screen.y);
  await page.mouse.down();
  await page.mouse.move(screen.x + 25, screen.y + 15);
  await page.mouse.up();
  expect((await current(page)).references![0].entities).toEqual(original.entities);
  await expect(page.getByLabel('Feature name', { exact: true })).not.toBeVisible();
  await page.getByTestId('tool-point').click();
  await page.getByLabel('Drawing elevation', { exact: true }).fill('130.125');
  await page.getByLabel('Drawing elevation', { exact: true }).press('Enter');
  await page.mouse.move(screen.x + 3, screen.y + 3);
  await expect(page.getByTestId('snap-feedback')).toContainText('Point');
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await current(page)).entities.length).toBe(1);
  expect((await current(page)).entities[0].points[0]).toEqual({ ...p, z: 130.125 });
  expect((await current(page)).references![0].entities).toEqual(original.entities);

  await sourceCard(page, 'survey-pnezd.csv');
  await page.getByLabel('Include reference survey-pnezd.csv in DXF', { exact: true }).check();
  await page.getByLabel('Show reference survey-pnezd.csv', { exact: true }).uncheck();
  await expect(page.locator('[data-reference="true"]')).toHaveCount(0);
  expect(previewDxf(await exported(page)).entities).toHaveLength(4);
  const portable = page.waitForEvent('download');
  await page.getByRole('button', { name: 'More save options' }).click();
  await page.getByRole('button', { name: 'Save project as…' }).click();
  const saved = JSON.parse(await readFile((await (await portable).path())!, 'utf8')) as Project;
  expect(saved.references![0].contentBase64).toBe(original.contentBase64);
  expect(saved.references![0].alignment.expected).toEqual(p);
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open Imported survey workflow', exact: true }).click();
  expect((await current(page)).references![0].entities).toEqual(original.entities);
  expect((await current(page)).coordinateContext!.vertical).toBe('Local BM 101');
  await sourceCard(page, 'survey-pnezd.csv');
  await page.getByRole('button', { name: 'Remove reference', exact: true }).click();
  await expect.poll(async () => (await current(page)).references!.length).toBe(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await current(page)).references!.length).toBe(1);
});

test('DXF preview requires partial-import acknowledgment and blocks unit mismatch or broken source without changing the drawing', async ({
  page,
}) => {
  await page.goto('/');
  await create(page, 'DXF reference');
  await page.getByRole('button', { name: 'Import reference', exact: true }).click();
  await page.getByLabel('Reference source file').setInputFiles(fixture('base-plan.dxf'));
  await expect(page.getByText('Preview · 7 supported / 4 skipped')).toBeVisible();
  await expect(page.getByLabel('Source units', { exact: true })).toBeDisabled();
  await page.getByLabel('I confirmed the source units and coordinate alignment.').check();
  await expect(
    page.getByRole('button', { name: 'Import locked reference', exact: true }),
  ).toBeDisabled();
  await page.getByText('Skipped records · 4', { exact: true }).click();
  await expect(page.getByText(/INSERT is outside the supported/)).toBeVisible();
  await page.getByLabel('I reviewed the skipped records and accept a partial import.').check();
  await page.getByRole('button', { name: 'Import locked reference', exact: true }).click();
  await expect(page.locator('[data-reference="true"]')).toHaveCount(7);
  const before = await current(page);
  await page.getByRole('button', { name: 'Import reference', exact: true }).click();
  const meters = (await readFile(fixture('base-plan.dxf'), 'utf8')).replace(
    /(\$INSUNITS\r?\n\s*70\r?\n)2/,
    '$16',
  );
  await page.getByLabel('Reference source file').setInputFiles({
    name: 'meters.dxf',
    mimeType: 'application/dxf',
    buffer: Buffer.from(meters),
  });
  await expect(page.getByLabel('Source units', { exact: true })).toHaveValue('meters');
  await expect(
    page.getByRole('button', { name: 'Import locked reference', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Reference source file').setInputFiles({
    name: 'broken.dxf',
    mimeType: 'application/dxf',
    buffer: Buffer.from('0\nSECTION\n2\nENTITIES\n'),
  });
  await expect(page.getByRole('alert')).toContainText('EOF');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await current(page)).references).toEqual(before.references);
  expect((await current(page)).entities).toEqual(before.entities);
});

test('native survey import preserves source bytes and locked references through portable save and reopen', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lotgrade-import-'));
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined,
    ),
  ) as Record<string, string>;
  const application = await electron.launch({
    ...(process.env.LOTGRADE_EXECUTABLE
      ? { executablePath: process.env.LOTGRADE_EXECUTABLE, args: [] }
      : { args: ['.'] }),
    env: { ...environment, LOTGRADE_USER_DATA: directory },
  });
  try {
    const page = await application.firstWindow();
    await create(page, 'Native survey');
    await choosePoints(page);
    await confirm(page);
    await expect.poll(async () => (await current(page)).references?.length).toBe(1);
    const source = (await current(page)).references![0];
    expect(Buffer.from(source.contentBase64, 'base64')).toEqual(
      await readFile(fixture('survey-pnezd.csv')),
    );
    const portable = path.join(directory, 'reference.lotgrade');
    await application.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, portable);
    await page.getByRole('button', { name: 'More save options' }).click();
    await page.getByRole('button', { name: 'Save project as…' }).click();
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(portable, 'utf8')).references?.length;
        } catch {
          return 0;
        }
      })
      .toBe(1);
    await page.getByRole('button', { name: 'Back to projects' }).click();
    await application.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, portable);
    await page.getByRole('button', { name: 'Open project file', exact: true }).click();
    await expect(page.locator('[data-reference="true"]')).toHaveCount(3);
    expect((await current(page)).references![0]).toEqual(source);
  } finally {
    await application.close();
    await rm(directory, { recursive: true, force: true });
  }
});
