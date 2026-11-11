import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/core/types';

const current = (page: Page): Promise<Project> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('lotgrade.projects.v1')!)[0]);
async function create(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name').fill(name);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
}
async function precise(page: Page, x: number, y: number) {
  const details = page.locator('.precision-entry');
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open)))
    await details.locator('summary').click();
  await page.getByLabel('Placement X', { exact: true }).fill(String(x));
  await page.getByLabel('Placement Y', { exact: true }).fill(String(y));
  await page.getByRole('button', { name: 'Place point', exact: true }).click();
}
async function elevation(page: Page, z: number) {
  await page.getByLabel('Drawing elevation', { exact: true }).fill(String(z));
  await page.getByLabel('Drawing elevation', { exact: true }).press('Enter');
}
async function location(page: Page, x: number, y: number) {
  const project = await current(page),
    box = (await page.getByTestId('drawing-canvas').boundingBox())!;
  return {
    x: box.x + box.width / 2 + (x - project.view.centerX) * project.view.scale,
    y: box.y + box.height / 2 - (y - project.view.centerY) * project.view.scale,
  };
}
async function near(page: Page, x: number, y: number) {
  const point = await location(page, x, y);
  await page.mouse.move(point.x + 5, point.y + 3);
}
async function matchZ(page: Page, checked: boolean) {
  const details = page.locator('.snap-options');
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open)))
    await details.locator('summary').click();
  await page.getByLabel('Match target elevation', { exact: true }).setChecked(checked);
}

test('exact placement bypasses the grid; object snaps distinguish XY from explicit elevation acquisition', async ({
  page,
}) => {
  await create(page, 'Precise endpoints');
  await page.getByTestId('tool-polyline').click();
  await elevation(page, 100);
  await precise(page, 20.25, 20.75);
  await precise(page, 60.25, 20.75);
  await page.getByRole('button', { name: 'Finish line', exact: true }).click();
  await expect.poll(async () => (await current(page)).entities.length).toBe(1);
  expect((await current(page)).entities[0].points).toEqual([
    { x: 20.25, y: 20.75, z: 100 },
    { x: 60.25, y: 20.75, z: 100 },
  ]);

  await page.getByTestId('tool-point').click();
  await elevation(page, 130);
  await near(page, 20.25, 20.75);
  await expect(page.getByTestId('snap-feedback')).toContainText('Endpoint');
  await expect(page.getByTestId('snap-marker')).toBeVisible();
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await current(page)).entities.length).toBe(2);
  expect((await current(page)).entities[1].points[0]).toEqual({ x: 20.25, y: 20.75, z: 130 });

  await near(page, 20.25, 20.75);
  await expect(page.getByTestId('snap-feedback')).toContainText('Point');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('snap-feedback')).toContainText('Endpoint');

  await matchZ(page, true);
  await near(page, 60.25, 20.75);
  await expect(page.getByTestId('snap-feedback')).toContainText('Match XYZ');
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await current(page)).entities.length).toBe(3);
  expect((await current(page)).entities[2].points[0]).toEqual({ x: 60.25, y: 20.75, z: 100 });

  await matchZ(page, false);
  await near(page, 40.25, 20.75);
  await expect(page.getByTestId('snap-feedback')).toContainText('Midpoint');
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await current(page)).entities.length).toBe(4);
  expect((await current(page)).entities[3].points[0]).toEqual({ x: 40.25, y: 20.75, z: 130 });
  const snapshot = (await current(page)).entities;
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open Precise endpoints', exact: true }).click();
  expect((await current(page)).entities).toEqual(snapshot);
  const download = page.waitForEvent('download');
  await page.getByTestId('export-dxf').click();
  const dxf = await readFile((await (await download).path())!, 'utf8');
  expect(dxf).toContain('20.25');
  expect(dxf).toContain('20.75');
  expect(dxf).toContain('130');
});

test('polar placement uses survey bearings and exact small boundaries do not close from pixel proximity', async ({
  page,
}) => {
  await create(page, 'Bearing entry');
  await page.getByTestId('tool-polyline').click();
  await precise(page, 10.5, 60.25);
  await page.getByRole('button', { name: 'Bearing / distance', exact: true }).click();
  await page.getByLabel('Placement bearing', { exact: true }).fill('90');
  await page.getByLabel('Placement distance', { exact: true }).fill('10.25');
  await page.getByRole('button', { name: 'Place point', exact: true }).click();
  await page.getByRole('button', { name: 'Finish line', exact: true }).click();
  await expect.poll(async () => (await current(page)).entities.length).toBe(1);
  const points = (await current(page)).entities[0].points;
  expect(points[1].x).toBeCloseTo(20.75, 10);
  expect(points[1].y).toBeCloseTo(60.25, 10);
  await page.getByTestId('tool-boundary').click();
  await page.getByRole('button', { name: 'Coordinates', exact: true }).click();
  for (const [x, y] of [
    [10.1, 10.1],
    [10.6, 10.1],
    [10.6, 10.6],
    [10.1, 10.6],
  ])
    await precise(page, x, y);
  expect((await current(page)).entities).toHaveLength(1);
  await page.getByRole('button', { name: 'Finish boundary', exact: true }).click();
  await expect.poll(async () => (await current(page)).entities.length).toBe(2);
  expect((await current(page)).entities[1].points).toHaveLength(4);
});

test('true arc midpoints/centers and intersections produce visible snap targets, with an Alt override', async ({
  page,
}, testInfo) => {
  await create(page, 'Curve snapping');
  await page.getByTestId('tool-contour').click();
  await elevation(page, 110);
  await page.getByTestId('segment-arc').click();
  for (const [x, y] of [
    [20, 40],
    [40, 60],
    [60, 40],
  ])
    await precise(page, x, y);
  await page.getByRole('button', { name: 'Finish line', exact: true }).click();
  await page.getByTestId('tool-point').click();
  await elevation(page, 150);
  await near(page, 40, 60);
  await expect(page.getByTestId('snap-feedback')).toContainText('Midpoint');
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await current(page)).entities.length).toBe(2);
  expect((await current(page)).entities[1].points[0].y).toBeCloseTo(60, 10);
  await near(page, 40, 40);
  await expect(page.getByTestId('snap-feedback')).toContainText('Arc center');
  await matchZ(page, true);
  await near(page, 40, 40);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await current(page)).entities.length).toBe(3);
  expect((await current(page)).entities[2].points[0].z).toBe(110);
  await expect(page.getByLabel('Drawing elevation', { exact: true })).toHaveValue('150');
  await matchZ(page, false);
  await near(page, 40, 40);
  await page.keyboard.down('Alt');
  await expect(page.getByTestId('snap-feedback')).not.toBeVisible();
  await page.keyboard.up('Alt');
  await page.getByTestId('tool-polyline').click();
  await page.getByTestId('segment-line').click();
  for (const [x, y] of [
    [20, 10],
    [80, 10],
  ])
    await precise(page, x, y);
  await page.getByRole('button', { name: 'Finish line', exact: true }).click();
  for (const [x, y] of [
    [50, 0],
    [50, 30],
  ])
    await precise(page, x, y);
  await page.getByRole('button', { name: 'Finish line', exact: true }).click();
  await page.getByTestId('tool-point').click();
  await near(page, 50, 10);
  await expect(page.getByTestId('snap-feedback')).toContainText('Intersection');
  await page.screenshot({ path: testInfo.outputPath('precision-preview.png') });
});
