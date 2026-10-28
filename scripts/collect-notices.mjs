import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

/** Include the actual pinned runtime dependency licenses in every production build. */
export async function collectNotices() {
  const rootManifest = path.resolve('package.json');
  const root = JSON.parse(await readFile(rootManifest, 'utf8'));
  const seen = new Set();
  const notices = [];

  async function collect(name, parentManifest) {
    const manifest = createRequire(parentManifest).resolve(`${name}/package.json`);
    if (seen.has(manifest)) return;
    seen.add(manifest);
    const metadata = JSON.parse(await readFile(manifest, 'utf8'));
    const folder = path.dirname(manifest);
    let license;
    for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md']) {
      try {
        license = await readFile(path.join(folder, filename), 'utf8');
        break;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (!license?.trim()) throw new Error(`Missing runtime license for ${metadata.name}.`);
    notices.push(`${metadata.name} ${metadata.version}\n${'='.repeat(60)}\n${license.trim()}\n`);
    for (const dependency of Object.keys(metadata.dependencies ?? {}).sort()) {
      await collect(dependency, manifest);
    }
  }

  for (const dependency of Object.keys(root.dependencies ?? {}).sort()) {
    await collect(dependency, rootManifest);
  }
  const contents = [
    'LotGrade — bundled JavaScript dependency notices',
    'Generated from the installed packages selected by package-lock.json.',
    'Electron and Chromium notices accompany the desktop bundle separately.',
    '',
    ...notices,
  ].join('\n');
  await mkdir('dist', { recursive: true });
  await writeFile('dist/THIRD_PARTY_NOTICES.txt', contents, 'utf8');
  console.log(`Included license notices for ${notices.length} runtime packages.`);
}
