import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('native desktop saves, exports via native dialog, reopens, and flushes on close', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lotgrade-native-'));
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
      env: { ...environment, LOTGRADE_USER_DATA: directory },
    });
    const page = await application.firstWindow();
    await expect(page.getByRole('button', { name: 'New project', exact: true })).toBeVisible();
    return page;
  };
  try {
    let page = await launch();
    expect(
      await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require),
    ).toBe('undefined');
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByLabel('Project name').fill('Native desktop lot');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByTestId('tool-contour').click();
    await page.getByTestId('drawing-elevation').fill('206.125');
    await page.getByTestId('drawing-elevation').press('Tab');
    const box = await page.getByTestId('drawing-canvas').boundingBox();
    if (!box) throw new Error('Canvas is missing');
    await page.mouse.click(box.x + 120, box.y + 180);
    await page.mouse.click(box.x + 260, box.y + 210);
    await page.keyboard.press('Enter');
    await expect
      .poll(() =>
        page.evaluate(async () => (await window.lotgrade!.listProjects())[0].entities.length),
      )
      .toBe(1);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await expect
      .poll(() =>
        page.evaluate(async () => (await window.lotgrade!.listProjects())[0].entities.length),
      )
      .toBe(0);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+y');
    await expect
      .poll(() =>
        page.evaluate(async () => (await window.lotgrade!.listProjects())[0].entities.length),
      )
      .toBe(1);
    const exportPath = path.join(directory, 'native-export.dxf');
    await application!.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, exportPath);
    await page.getByRole('button', { name: /^Features/ }).click();
    await page.getByRole('button', { name: /Contour 1/ }).click();
    await page.getByLabel('Elevation', { exact: true }).fill('207.875');
    // Native menu accelerators do not blur the focused inspector input by themselves.
    await application!.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.send('menu:action', 'export'),
    );
    await expect
      .poll(async () => {
        try {
          return await readFile(exportPath, 'utf8');
        } catch {
          return '';
        }
      })
      .toContain('207.875');
    const exported = await readFile(exportPath, 'utf8');
    expect(exported).toContain('AC1027');
    expect(exported).not.toContain('206.125');

    // Choose a portable native file path without automating the OS file picker.
    const portablePath = path.join(directory, 'native-project.lotgrade');
    await application!.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, portablePath);
    await page.getByRole('button', { name: 'More save options' }).click();
    await page.getByRole('button', { name: 'Save project as…' }).click();
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(portablePath, 'utf8')).entities.length;
        } catch {
          return 0;
        }
      })
      .toBe(1);

    await page.getByTestId('tool-point').click();
    await page.mouse.click(box.x + 350, box.y + 260);
    await page.getByRole('button', { name: /^Features/ }).click();
    await page.getByRole('button', { name: /Spot elevation 1/ }).click();
    await page.getByLabel('Elevation', { exact: true }).fill('-43.625');
    // Close with a focused edit: the handshake commits the field and waits for saves.
    await application!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await expect
      .poll(async () => {
        const names = await readdir(path.join(directory, 'projects'));
        const project = JSON.parse(
          await readFile(
            path.join(
              directory,
              'projects',
              names.find((n) => n.endsWith('.lotgrade'))!,
            ),
            'utf8',
          ),
        );
        return {
          count: project.entities.length,
          spotElevation: project.entities.find(
            (entity: { kind: string }) => entity.kind === 'point',
          )?.points[0].z,
        };
      })
      .toEqual({ count: 2, spotElevation: -43.625 });
    await application!.close();
    application = undefined;
    page = await launch();
    await page.getByRole('button', { name: 'Open Native desktop lot', exact: true }).click();
    await expect(page.getByTestId('workspace')).toBeVisible();
    await page.getByRole('button', { name: /^Features/ }).click();
    await expect(page.getByRole('button', { name: /Contour 1/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Spot elevation 1/ })).toBeVisible();
    // Native open path parses exactly the same portable document as browser open.
    await application!.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, portablePath);
    await page.getByRole('button', { name: 'More save options' }).click();
    await page.getByRole('button', { name: 'Open project file…' }).click();
    await expect(
      page.getByRole('heading', { name: 'Native desktop lot (imported)', exact: true }),
    ).toBeVisible();
  } finally {
    if (application) await application.close();
    await rm(directory, { recursive: true, force: true });
  }
});
