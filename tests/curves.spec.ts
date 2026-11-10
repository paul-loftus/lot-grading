import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Project } from '../src/core/types';

async function create(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name').fill(name);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByTestId('workspace')).toBeVisible();
}

function current(page: Page): Promise<Project> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('lotgrade.projects.v1')!)[0]);
}

async function worldPosition(page: Page, x: number, y: number) {
  const project = await current(page);
  const box = await page.getByTestId('drawing-canvas').boundingBox();
  if (!box) throw new Error('Drawing canvas is not visible.');
  return {
    x: box.x + box.width / 2 + (x - project.view.centerX) * project.view.scale,
    y: box.y + box.height / 2 - (y - project.view.centerY) * project.view.scale,
  };
}

async function clickWorld(page: Page, x: number, y: number) {
  const position = await worldPosition(page, x, y);
  await page.mouse.click(position.x, position.y);
}

async function field(page: Page, label: string, value: number) {
  await page.getByLabel(label, { exact: true }).fill(String(value));
  await page.getByLabel(label, { exact: true }).press('Enter');
}

test('draw both arc directions, hit the curve, move, undo, save/reopen, and export exact curves', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await create(page, 'Curved contour workflow');
  await page.getByTestId('tool-contour').click();
  await field(page, 'Drawing elevation', 123.75);
  await page.getByTestId('segment-arc').click();
  await clickWorld(page, 20, 30);
  await clickWorld(page, 40, 50);
  await clickWorld(page, 60, 30);
  await clickWorld(page, 80, 10);
  await clickWorld(page, 100, 30);
  expect((await current(page)).entities).toHaveLength(0);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await current(page)).entities.length).toBe(1);
  const created = (await current(page)).entities[0];
  expect(created.points).toEqual([
    { x: 20, y: 30, z: 123.75 },
    { x: 60, y: 30, z: 123.75 },
    { x: 100, y: 30, z: 123.75 },
  ]);
  expect(created.bulges?.[0]).toBeCloseTo(-1, 12);
  expect(created.bulges?.[1]).toBeCloseTo(1, 12);
  expect(created.bulges?.[2]).toBe(0);
  expect((await current(page)).schemaVersion).toBe(2);
  await expect(
    page.locator(`[data-entity-id="${created.id}"]`).getByTestId('feature-path'),
  ).toHaveAttribute('d', /A/);

  // This point is on the upper semicircle, far from the endpoint chord. Selecting
  // it exercises the curved hit path and catches an inverted SVG sweep.
  await page.getByTestId('tool-select').click();
  await clickWorld(page, 40, 50);
  await expect(page.getByLabel('Feature name', { exact: true })).toHaveValue('Contour 1');
  const start = await worldPosition(page, 40, 50);
  const end = await worldPosition(page, 45, 47);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await current(page)).entities[0].points[0].x).toBe(25);
  expect((await current(page)).entities[0].bulges).toEqual(created.bulges);
  expect((await current(page)).entities[0].points.map((point) => point.z)).toEqual([
    123.75, 123.75, 123.75,
  ]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await current(page)).entities[0].points).toEqual(created.points);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect((await current(page)).entities[0].points[0]).toEqual({ x: 25, y: 27, z: 123.75 });

  const before = (await current(page)).entities;
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await page.getByRole('button', { name: 'Back to projects' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open Curved contour workflow', exact: true }).click();
  expect((await current(page)).entities).toEqual(before);
  const exported = page.waitForEvent('download');
  await page.getByTestId('export-dxf').click();
  const dxf = await readFile((await (await exported).path())!, 'utf8');
  expect(dxf).toContain('AcDbPolyline');
  const entitySection = dxf
    .split(/0\r?\nSECTION\r?\n2\r?\nENTITIES\r?\n/)[1]
    .split(/0\r?\nENDSEC/)[0];
  const bulges = [...entitySection.matchAll(/^42\r?\n([^\r\n]+)$/gm)].map((match) =>
    Number(match[1]),
  );
  expect(bulges).toHaveLength(2);
  expect(bulges[0]).toBeCloseTo(-1, 12);
  expect(bulges[1]).toBeCloseTo(1, 12);
  expect(dxf).toContain('123.75');
  await page.getByRole('button', { name: 'More save options' }).click();
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project as…' }).click();
  const portable = JSON.parse(await readFile((await (await saved).path())!, 'utf8'));
  expect(portable.schemaVersion).toBe(2);
  expect(portable.entities).toEqual(before);
  expect(errors).toEqual([]);
});

test('cancel incomplete arcs and mix straight/arc segments without losing the draft', async ({
  page,
}) => {
  await create(page, 'Mixed path workflow');
  await page.getByTestId('tool-polyline').click();
  await page.getByTestId('segment-arc').click();
  await clickWorld(page, 20, 30);
  await clickWorld(page, 40, 50);
  await page.keyboard.press('Enter');
  expect((await current(page)).entities).toHaveLength(0);
  await page.keyboard.press('Escape');
  expect((await current(page)).entities).toHaveLength(0);
  expect((await current(page)).schemaVersion).toBe(1);

  await clickWorld(page, 20, 30);
  await clickWorld(page, 40, 30);
  await clickWorld(page, 60, 30);
  await expect(page.getByRole('alert')).toContainText('do not define a circular arc');
  expect((await current(page)).entities).toHaveLength(0);
  await page.keyboard.press('Escape');

  await page.getByTestId('segment-line').click();
  await clickWorld(page, 20, 30);
  await clickWorld(page, 40, 30);
  await page.getByTestId('segment-arc').click();
  await clickWorld(page, 60, 50);
  await clickWorld(page, 80, 30);
  await page.getByTestId('segment-line').click();
  await clickWorld(page, 100, 30);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await current(page)).entities.length).toBe(1);
  const path = (await current(page)).entities[0];
  expect(path.points.map((point) => [point.x, point.y])).toEqual([
    [20, 30],
    [40, 30],
    [80, 30],
    [100, 30],
  ]);
  expect(path.bulges?.[0]).toBe(0);
  expect(path.bulges?.[1]).toBeCloseTo(-1, 12);
  expect(path.bulges?.slice(2)).toEqual([0, 0]);
  expect((await current(page)).schemaVersion).toBe(2);

  await page.getByTestId('tool-building').click();
  await expect(page.getByTestId('segment-arc')).not.toBeVisible();
  await page.getByTestId('tool-point').click();
  await expect(page.getByTestId('segment-arc')).not.toBeVisible();
  await page.getByTestId('tool-boundary').click();
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await expect(page.getByTestId('segment-arc')).not.toBeVisible();
});

test('curved boundaries measure and fit the true arc and support precise segment edits', async ({
  page,
}) => {
  await create(page, 'Curved boundary workflow');
  await page.getByTestId('tool-boundary').click();
  await page.getByTestId('segment-arc').click();
  await clickWorld(page, 20, 30);
  await clickWorld(page, 0, 50);
  await clickWorld(page, 20, 70);
  await page.getByTestId('segment-line').click();
  await clickWorld(page, 80, 70);
  await clickWorld(page, 80, 30);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await current(page)).entities.length).toBe(1);
  const boundary = (await current(page)).entities[0];
  expect(boundary.closed).toBe(true);
  expect(boundary.bulges?.[0]).toBeCloseTo(-1, 12);
  await page.getByRole('button', { name: 'Fit drawing', exact: true }).click();
  expect((await current(page)).view.centerX).toBeCloseTo(40, 8);
  await page.getByRole('button', { name: /^Features/ }).click();
  await page.getByRole('button', { name: /^Lot boundary 1/ }).click();
  await expect(page.locator('.feature-measurements')).toContainText('3,028.32');
  await expect(page.locator('.feature-measurements')).toContainText('222.83');

  await page.getByText('Segments and curves', { exact: true }).click();
  await page.getByLabel('Segment 4 type', { exact: true }).selectOption('arc');
  await field(page, 'Radius · segment 4', 30);
  await page.getByLabel('Direction · segment 4', { exact: true }).selectOption('cw');
  expect((await current(page)).entities[0].bulges?.[3]).toBeCloseTo(-1, 12);
  await page.getByRole('button', { name: 'Fit drawing', exact: true }).click();
  expect((await current(page)).view.centerY).toBeCloseTo(35, 8);
  await expect(page.locator('.feature-measurements')).toContainText('4,442.04');

  // Editing an arc's vertex Z keeps the complete path planar instead of turning
  // it into silently flattened 3D chords during export.
  await page.getByText('Vertex coordinates', { exact: true }).click();
  await field(page, 'Z · vertex 1', 104.875);
  expect((await current(page)).entities[0].points.every((point) => point.z === 104.875)).toBe(true);
  expect((await current(page)).entities[0].bulges?.[3]).toBeCloseTo(-1, 12);
  if (process.env.LOTGRADE_CURVE_SCREENSHOTS) {
    await page.getByRole('button', { name: 'Fit drawing', exact: true }).click();
    await page.screenshot({
      path: path.join(process.env.LOTGRADE_CURVE_SCREENSHOTS, 'lotgrade-curves-ui.png'),
    });
    await page.setViewportSize({ width: 1050, height: 700 });
    await page.getByRole('button', { name: 'Fit drawing', exact: true }).click();
    await page.screenshot({
      path: path.join(process.env.LOTGRADE_CURVE_SCREENSHOTS, 'lotgrade-curves-ui-small.png'),
    });
  }
});

test('flatten a varying-elevation line explicitly before enabling a circular arc', async ({
  page,
}) => {
  await create(page, 'Planar arc conversion');
  await page.getByTestId('tool-polyline').click();
  await page.getByTestId('segment-line').click();
  await clickWorld(page, 20, 30);
  await clickWorld(page, 60, 30);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await current(page)).entities.length).toBe(1);
  await page.getByRole('button', { name: /^Features/ }).click();
  await page.getByRole('button', { name: /^Line 1/ }).click();
  await page.getByText('Vertex coordinates', { exact: true }).click();
  await field(page, 'Z · vertex 2', 101);
  expect((await current(page)).entities[0].points.map((point) => point.z)).toEqual([100, 101]);
  await page.getByText('Segments and curves', { exact: true }).click();
  const segmentType = page.getByLabel('Segment 1 type', { exact: true });
  await expect(segmentType.getByRole('option', { name: 'Arc', exact: true })).toHaveJSProperty(
    'disabled',
    true,
  );

  // Focusing and leaving this field must preserve the sloping line. Explicitly
  // committing its current first-vertex Z is an intentional flatten operation.
  await page.getByLabel('Set all elevations', { exact: true }).click();
  await page.getByLabel('Feature name', { exact: true }).click();
  expect((await current(page)).entities[0].points.map((point) => point.z)).toEqual([100, 101]);
  await field(page, 'Set all elevations', 100);
  expect((await current(page)).entities[0].points.map((point) => point.z)).toEqual([100, 100]);
  await expect(segmentType.getByRole('option', { name: 'Arc', exact: true })).toHaveJSProperty(
    'disabled',
    false,
  );
  await segmentType.selectOption('arc');
  expect((await current(page)).entities[0].bulges?.[0]).toBeGreaterThan(0);
  expect((await current(page)).schemaVersion).toBe(2);
});

test('close a polygon with a three-point arc without duplicating its first vertex', async ({
  page,
}) => {
  await create(page, 'Curved closing gesture');
  await page.getByTestId('tool-boundary').click();
  await page.getByTestId('segment-line').click();
  for (const [x, y] of [
    [20, 30],
    [80, 30],
    [80, 70],
    [20, 70],
  ]) {
    await clickWorld(page, x, y);
  }
  await page.getByTestId('segment-arc').click();
  await clickWorld(page, 0, 50);
  await clickWorld(page, 20, 30);
  await expect.poll(async () => (await current(page)).entities.length).toBe(1);
  const boundary = (await current(page)).entities[0];
  expect(boundary.closed).toBe(true);
  expect(boundary.points.map((point) => [point.x, point.y])).toEqual([
    [20, 30],
    [80, 30],
    [80, 70],
    [20, 70],
  ]);
  expect(boundary.bulges?.slice(0, 3)).toEqual([0, 0, 0]);
  expect(boundary.bulges?.[3]).toBeCloseTo(1, 12);
  expect((await current(page)).schemaVersion).toBe(2);
});
