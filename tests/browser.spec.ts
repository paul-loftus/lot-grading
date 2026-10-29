import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function create(page: Page, name = 'Oak Lane · Lot 7') {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name').fill(name);
  await page.getByLabel('Description').fill('V0 end-to-end project');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByTestId('workspace')).toBeVisible();
}
async function clickCanvas(page: Page, x: number, y: number) {
  const box = await page.getByTestId('drawing-canvas').boundingBox();
  if (!box) throw new Error('Drawing canvas is not visible.');
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}
async function savedProject(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('lotgrade.projects.v1') ?? '[]')[0]?.entities.length,
      ),
    )
    .toBeGreaterThan(0);
  return page.evaluate(() => JSON.parse(localStorage.getItem('lotgrade.projects.v1')!)[0]);
}

test('create, draw every tool, edit, undo, save/reopen, and export the current project', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await create(page);
  await page.getByTestId('tool-contour').click();
  await page.getByTestId('drawing-elevation').fill('123.75');
  await page.getByTestId('drawing-elevation').press('Tab');
  await clickCanvas(page, 0.2, 0.7);
  await clickCanvas(page, 0.4, 0.6);
  await clickCanvas(page, 0.65, 0.7);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await savedProject(page)).entities.length).toBe(1);
  const contour = (await savedProject(page)).entities[0];
  expect(contour.kind).toBe('contour');
  expect(contour.points.every((p: { z: number }) => p.z === 123.75)).toBe(true);

  await page.getByTestId('tool-polyline').click();
  await clickCanvas(page, 0.25, 0.35);
  await clickCanvas(page, 0.5, 0.3);
  await page.keyboard.press('Enter');
  await page.getByTestId('tool-boundary').click();
  await clickCanvas(page, 0.12, 0.15);
  await clickCanvas(page, 0.85, 0.15);
  await clickCanvas(page, 0.85, 0.85);
  await clickCanvas(page, 0.12, 0.85);
  await page.keyboard.press('Enter');
  await page.getByTestId('tool-building').click();
  await clickCanvas(page, 0.4, 0.4);
  await clickCanvas(page, 0.65, 0.55);
  await page.getByTestId('tool-point').click();
  await clickCanvas(page, 0.7, 0.35);
  await expect.poll(async () => (await savedProject(page)).entities.length).toBe(5);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await savedProject(page)).entities.length).toBe(4);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(async () => (await savedProject(page)).entities.length).toBe(5);

  await page.getByRole('button', { name: /^Features/ }).click();
  await page.getByRole('button', { name: /Contour 1/ }).click();
  await page.getByLabel('Feature name', { exact: true }).fill('Checked contour');
  await page.getByLabel('Feature name', { exact: true }).press('Tab');
  await page.getByLabel('Elevation', { exact: true }).fill('-2.125');
  await page.getByLabel('Elevation', { exact: true }).press('Tab');
  await expect.poll(async () => (await savedProject(page)).entities[0].points[0].z).toBe(-2.125);

  await page.getByRole('button', { name: /^Features/ }).click();
  await page.getByRole('button', { name: /^Line 1/ }).click();
  await page.getByText('Vertex coordinates', { exact: true }).click();
  await page.getByLabel('Z · vertex 2', { exact: true }).fill('101.875');
  await page.getByLabel('Z · vertex 2', { exact: true }).press('Tab');
  await expect.poll(async () => (await savedProject(page)).entities[1].points[1].z).toBe(101.875);

  await page.getByTestId('tool-select').click();
  const current = await savedProject(page);
  const spot = current.entities.find((entity: { kind: string }) => entity.kind === 'point');
  const canvasBox = (await page.getByTestId('drawing-canvas').boundingBox())!;
  const spotX =
    canvasBox.x +
    canvasBox.width / 2 +
    (spot.points[0].x - current.view.centerX) * current.view.scale;
  const spotY =
    canvasBox.y +
    canvasBox.height / 2 -
    (spot.points[0].y - current.view.centerY) * current.view.scale;
  await page.mouse.move(spotX, spotY);
  await page.mouse.down();
  await page.mouse.move(spotX + 30, spotY + 24, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () => (await savedProject(page)).entities[4].points[0].x)
    .not.toBe(spot.points[0].x);
  expect((await savedProject(page)).entities[4].points[0].z).toBe(spot.points[0].z);
  await page.getByRole('button', { name: 'Delete selected feature' }).click();
  await expect.poll(async () => (await savedProject(page)).entities.length).toBe(4);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await savedProject(page)).entities.length).toBe(5);

  const before = (await savedProject(page)).entities;
  await page.getByTestId('tool-pan').click();
  await page.mouse.move(canvasBox.x + 100, canvasBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 145, canvasBox.y + 135);
  await page.mouse.up();
  await expect
    .poll(async () => (await savedProject(page)).view.centerX)
    .not.toBe(current.view.centerX);
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await savedProject(page)).view.scale).not.toBe(current.view.scale);
  expect((await savedProject(page)).entities).toEqual(before);

  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByText('Saved to library', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to projects' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open Oak Lane · Lot 7', exact: true }).click();
  expect((await savedProject(page)).entities).toEqual(before);

  const downloadEvent = page.waitForEvent('download');
  await page.getByTestId('export-dxf').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('Oak-Lane-Lot-7.dxf');
  const contents = await readFile((await download.path())!, 'utf8');
  expect(contents).toContain('AC1027');
  expect(contents).toContain('-2.125');
  expect(contents).toContain('FG-CONT-MINOR');
  expect(contents).toContain('BUILDING');
  expect(contents).toContain('AcDb3dPolyline');
  expect(contents).toContain('101.875');
  expect(contents.endsWith('0\r\nEOF\r\n') || contents.endsWith('0\nEOF\n')).toBe(true);

  await page.getByRole('button', { name: 'More save options' }).click();
  const saveEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project as…' }).click();
  const projectDownload = await saveEvent;
  const projectData = JSON.parse(await readFile((await projectDownload.path())!, 'utf8'));
  expect(projectData.entities).toEqual(before);
  expect(errors).toEqual([]);
});

test('manage project details, duplicate, search, and delete with confirmation', async ({
  page,
}) => {
  await create(page, 'First lot');
  await page.getByRole('button', { name: 'Back to projects' }).click();
  await page.getByRole('button', { name: 'Options for First lot' }).click();
  await page.getByRole('button', { name: 'Rename / details' }).click();
  await page.getByLabel('Project name').fill('Renamed lot');
  await page.getByRole('button', { name: 'Save details' }).click();
  await page.getByRole('button', { name: 'Options for Renamed lot' }).click();
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open Renamed lot (copy)', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Search projects').fill('copy');
  await expect(
    page.getByRole('button', { name: 'Open Renamed lot', exact: true }),
  ).not.toBeVisible();
  await page.getByLabel('Search projects').clear();
  await page.getByRole('button', { name: 'Options for Renamed lot (copy)' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Keep project' }).click();
  await expect(
    page.getByRole('button', { name: 'Open Renamed lot (copy)', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Options for Renamed lot (copy)' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open Renamed lot (copy)', exact: true }),
  ).not.toBeVisible();
});

test('import saved portable project, preserve geometry, reject unsupported versions', async ({
  page,
}) => {
  await page.goto('/');
  const fixtures = JSON.parse(await readFile('tests/fixtures/export/cases.json', 'utf8'));
  const project = fixtures.cases[0].project;
  const fileChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open project file', exact: true }).click();
  await (
    await fileChooser
  ).setFiles({
    name: 'Survey.lotgrade',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByTestId('workspace')).toBeVisible();
  expect((await savedProject(page)).entities).toEqual(project.entities);
  await page.getByRole('button', { name: 'Back to projects' }).click();
  const badChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open project file', exact: true }).click();
  await (
    await badChooser
  ).setFiles({
    name: 'Future.lotgrade',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...project, schemaVersion: 99 })),
  });
  await expect(page.getByRole('status')).toContainText('Unsupported project version');
  await expect(page.getByTestId('workspace')).not.toBeVisible();
});

test('a project-library save failure never blocks portable save or DXF export of current geometry', async ({
  page,
}) => {
  await create(page, 'Recovery lot');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'lotgrade.projects.v1')
        throw new DOMException('Project library is full.', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.getByTestId('tool-point').click();
  await page.getByTestId('drawing-elevation').fill('-42.625');
  await page.getByTestId('drawing-elevation').press('Tab');
  await clickCanvas(page, 0.45, 0.45);
  await expect(page.getByText('Save failed', { exact: true })).toBeVisible();
  const exportEvent = page.waitForEvent('download');
  await page.getByTestId('export-dxf').click();
  const dxf = await exportEvent;
  expect(await readFile((await dxf.path())!, 'utf8')).toContain('-42.625');
  await page.getByRole('button', { name: 'More save options' }).click();
  const saveEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project as…' }).click();
  const portable = await saveEvent;
  const recovered = JSON.parse(await readFile((await portable.path())!, 'utf8'));
  expect(recovered.entities).toHaveLength(1);
  expect(recovered.entities[0].points[0].z).toBe(-42.625);
});
