import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Project } from '../src/core/types';

async function launch(directory: string) {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined,
    ),
  ) as Record<string, string>;
  const application = await electron.launch({
    ...(process.env.LOTGRADE_EXECUTABLE
      ? { executablePath: process.env.LOTGRADE_EXECUTABLE, args: [] }
      : { args: ['.'] }),
    env: { ...environment, LOTGRADE_USER_DATA: path.join(directory, 'profile') },
  });
  const page = await application.firstWindow();
  await expect(page.getByRole('button', { name: 'New project', exact: true })).toBeVisible();
  return { application, page };
}
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
async function destination(application: ElectronApplication, file: string) {
  await application.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, file);
}
async function saveAs(page: Page, application: ElectronApplication, file: string, copy = false) {
  await destination(application, file);
  await page.getByRole('button', { name: 'More save options' }).click();
  await page
    .getByRole('button', { name: copy ? 'Save a copy…' : 'Save project as…', exact: true })
    .click();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await readFile(file, 'utf8')).name;
      } catch {
        return '';
      }
    })
    .not.toBe('');
}
async function checkpoint(page: Page) {
  await page.getByRole('button', { name: 'Recovery / checkpoints', exact: true }).click();
  await page.getByRole('button', { name: 'Create checkpoint', exact: true }).click();
  await expect(page.getByRole('button').filter({ hasText: 'Manual checkpoint' })).toBeVisible();
  await page.getByRole('button', { name: 'Close recovery', exact: true }).click();
}
const load = async (file: string): Promise<Project> => JSON.parse(await readFile(file, 'utf8'));

test('native working-file Save/Save As/Copy, remembered association, focused edits and recovered curve revision', async ({}, info) => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'lotgrade-working-')));
  let { application, page } = await launch(directory);
  try {
    await create(page, 'Working lot');
    await page.getByTestId('tool-contour').click();
    await page.getByLabel('Drawing elevation', { exact: true }).fill('104.25');
    await page.getByLabel('Drawing elevation', { exact: true }).press('Enter');
    await page.getByTestId('segment-arc').click();
    await precise(page, 20, 40);
    await precise(page, 40, 60);
    await precise(page, 60, 40);
    await page.getByRole('button', { name: 'Finish line', exact: true }).click();
    const original = path.join(directory, 'original.lotgrade'),
      copy = path.join(directory, 'copy.lotgrade'),
      working = path.join(directory, 'working.lotgrade');
    await saveAs(page, application, original);
    await expect(page.getByTestId('working-file-status')).toHaveText('Working file saved');
    await page.screenshot({ path: info.outputPath('working-file.png') });
    const baseline = await load(original);
    await checkpoint(page);
    await page.getByRole('button', { name: /^Features/ }).click();
    await page.getByRole('button', { name: /Contour 1/ }).click();
    await page.getByLabel('Elevation', { exact: true }).fill('105.5');
    await page.getByLabel('Elevation', { exact: true }).press('Enter');
    await expect(page.getByTestId('working-file-status')).toHaveText(
      'Working file has unsaved changes',
    );
    expect((await load(original)).entities).toEqual(baseline.entities);
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect.poll(async () => (await load(original)).entities[0].points[0].z).toBe(105.5);
    await saveAs(page, application, copy, true);
    await expect(page.getByTestId('working-file-path')).toHaveText(original);
    await saveAs(page, application, working);
    await expect(page.getByTestId('working-file-path')).toHaveText(working);
    await page.getByLabel('Elevation', { exact: true }).fill('106.625');
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'save'),
    );
    await expect.poll(async () => (await load(working)).entities[0].points[0].z).toBe(106.625);
    expect((await load(original)).entities[0].points[0].z).toBe(105.5);
    expect((await load(copy)).entities[0].points[0].z).toBe(105.5);
    expect(await readFile(working, 'utf8')).not.toContain(directory);
    await application.close();
    ({ application, page } = await launch(directory));
    await page.getByRole('button', { name: 'Open Working lot', exact: true }).click();
    await expect(page.getByTestId('working-file-path')).toHaveText(working);
    await expect(page.getByTestId('working-file-status')).toHaveText('Working file saved');
    await page.getByRole('button', { name: 'Recovery / checkpoints', exact: true }).click();
    await page.getByRole('button').filter({ hasText: 'Manual checkpoint' }).click();
    await page.screenshot({ path: info.outputPath('recovery-chooser.png') });
    await page.getByRole('button', { name: 'Restore as recovered copy', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Working lot (recovered)', exact: true }),
    ).toBeVisible();
    const recovered = await page.evaluate(async () =>
      (await window.lotgrade!.listProjects()).find((p) => p.name.endsWith('(recovered)'))!,
    );
    expect(recovered.entities).toEqual(baseline.entities);
    expect(recovered.id).not.toBe(baseline.id);
    await expect(page.getByTestId('working-file-status')).toContainText('Library only');
    expect((await load(working)).entities[0].points[0].z).toBe(106.625);
    await expect(page.getByTestId('feature-path')).toHaveAttribute('d', /A/);
  } finally {
    await application.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('native conflicts preserve external changes, relink verifies moved files, recent files and export folders persist', async () => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'lotgrade-conflict-')));
  const { application, page } = await launch(directory);
  try {
    await create(page, 'Conflict lot');
    await page.getByTestId('tool-point').click();
    await precise(page, 12.25, 18.5);
    const file = path.join(directory, 'source.lotgrade'),
      moved = path.join(directory, 'moved.lotgrade'),
      copy = path.join(directory, 'safe-copy.lotgrade');
    await saveAs(page, application, file);
    const external = { ...(await load(file)), name: 'External revision' };
    const bytes = JSON.stringify(external, null, 2) + '\n';
    await writeFile(file, bytes);
    await page.getByRole('button', { name: 'Check file', exact: true }).click();
    await expect(page.getByTestId('working-file-status')).toContainText('changed / unavailable');
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(page.getByText(/Save was blocked; choose/)).toBeVisible();
    expect(await readFile(file, 'utf8')).toBe(bytes);
    await saveAs(page, application, copy, true);
    await expect(page.getByTestId('working-file-path')).toHaveText(file);
    await application.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
    }, file);
    await page.getByRole('button', { name: 'More save options' }).click();
    await page.getByRole('button', { name: 'Open project file…', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'External revision', exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('working-file-status')).toHaveText('Working file saved');
    await rename(file, moved);
    await page.getByRole('button', { name: 'Check file', exact: true }).click();
    await expect(page.getByTestId('working-file-status')).toHaveText('Working file missing');
    await application.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
    }, moved);
    await page.getByRole('button', { name: 'Relink working file…', exact: true }).click();
    await expect(page.getByTestId('working-file-path')).toHaveText(moved);
    await expect(page.getByTestId('working-file-status')).toHaveText('Working file saved');
    await application.evaluate(({ shell }) => {
      shell.showItemInFolder = (target) => {
        (globalThis as unknown as { revealedPath: string }).revealedPath = target;
      };
    });
    await page.getByRole('button', { name: 'Show in Finder/Explorer', exact: true }).click();
    await expect
      .poll(() =>
        application.evaluate(
          () => (globalThis as unknown as { revealedPath: string }).revealedPath,
        ),
      )
      .toBe(moved);
    const exports = path.join(directory, 'exports');
    await mkdir(exports);
    await destination(application, path.join(exports, 'first.dxf'));
    await page.getByTestId('export-dxf').click();
    await expect
      .poll(async () => {
        try {
          return (await readFile(path.join(exports, 'first.dxf'), 'utf8')).includes('AC1027');
        } catch {
          return false;
        }
      })
      .toBe(true);
    await application.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async (
        windowOrOptions: unknown,
        options?: { defaultPath?: string },
      ) => {
        (globalThis as unknown as { defaultExportPath: string }).defaultExportPath = String(
          (options ?? (windowOrOptions as { defaultPath?: string })).defaultPath,
        );
        return { canceled: true, filePath: '' };
      };
    });
    await page.getByTestId('export-dxf').click();
    await expect
      .poll(() =>
        application.evaluate(
          () => (globalThis as unknown as { defaultExportPath: string }).defaultExportPath,
        ),
      )
      .toBe(path.join(exports, 'External-revision.dxf'));
    await page.getByRole('button', { name: 'Back to projects' }).click();
    await page.getByRole('button', { name: 'Open recent External revision', exact: true }).click();
    await expect(page.getByTestId('working-file-path')).toHaveText(moved);
    await expect(page.getByTestId('working-file-status')).toHaveText('Working file saved');
  } finally {
    await application.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('browser checkpoints restore a separate copy while downloads remain portable copies', async ({
  page,
}) => {
  await page.goto('/');
  await create(page, 'Browser recovery');
  await page.getByTestId('tool-point').click();
  await precise(page, 20.25, 30.75);
  await checkpoint(page);
  await precise(page, 50.25, 60.75);
  await page.getByRole('button', { name: 'Recovery / checkpoints', exact: true }).click();
  await page.getByRole('button').filter({ hasText: 'Manual checkpoint' }).click();
  await page.getByRole('button', { name: 'Restore as recovered copy', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Browser recovery (recovered)', exact: true }),
  ).toBeVisible();
  const projects = await page.evaluate(
    () => JSON.parse(localStorage.getItem('lotgrade.projects.v1')!) as Project[],
  );
  expect(projects.find((p) => p.name === 'Browser recovery')!.entities).toHaveLength(2);
  expect(projects.find((p) => p.name.endsWith('(recovered)'))!.entities).toHaveLength(1);
  await expect(page.getByTestId('working-file-status')).toContainText('Browser library');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'More save options' }).click();
  await page.getByRole('button', { name: 'Save a copy…', exact: true }).click();
  const data = JSON.parse(await readFile((await (await download).path())!, 'utf8')) as Project;
  expect(data.entities).toHaveLength(1);
  expect(Object.keys(data)).not.toContain('workingPath');
});
