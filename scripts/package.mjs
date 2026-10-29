import { packager } from '@electron/packager';
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const option = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const platform = option('platform') ?? process.platform;
const arch = option('arch') ?? process.arch;
if (!['darwin', 'win32', 'linux'].includes(platform) || !['arm64', 'x64'].includes(arch))
  throw new Error('Use --platform=darwin|win32|linux and --arch=arm64|x64.');
const stage = path.resolve('.package', `${platform}-${arch}`);
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp('dist', path.join(stage, 'dist'), { recursive: true });
await cp('dist-desktop', path.join(stage, 'dist-desktop'), { recursive: true });
const runtimeNotices = path.join(stage, 'runtime-notices');
await mkdir(runtimeNotices, { recursive: true });
const original = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile(
  path.join(stage, 'package.json'),
  JSON.stringify(
    {
      name: original.name,
      productName: 'LotGrade',
      version: original.version,
      description: original.description,
      main: 'dist-desktop/main.cjs',
      author: 'LotGrade',
    },
    null,
    2,
  ),
);
const electronVersion = JSON.parse(
  await readFile('node_modules/electron/package.json', 'utf8'),
).version;
const outputs = await packager({
  dir: stage,
  out: 'release',
  name: 'LotGrade',
  appBundleId: 'com.lotgrade.desktop',
  platform,
  arch,
  electronVersion,
  overwrite: true,
  asar: true,
  prune: false,
  executableName: 'LotGrade',
  appVersion: original.version,
  // The macOS Electron ZIP keeps these notices beside Electron.app. Move them
  // into resources before finalizing the app so an app-only ZIP retains them.
  afterExtract: [
    async ({ buildPath }) => {
      for (const filename of ['LICENSE', 'LICENSES.chromium.html']) {
        await cp(path.join(buildPath, filename), path.join(runtimeNotices, filename));
      }
    },
  ],
  extraResource: [path.resolve('dist/THIRD_PARTY_NOTICES.txt'), runtimeNotices],
});
for (const output of outputs) {
  const resources =
    platform === 'darwin'
      ? path.join(output, 'LotGrade.app', 'Contents', 'Resources')
      : path.join(output, 'resources');
  for (const filename of [
    'THIRD_PARTY_NOTICES.txt',
    'runtime-notices/LICENSE',
    'runtime-notices/LICENSES.chromium.html',
  ]) {
    if (!(await readFile(path.join(resources, filename))).length) {
      throw new Error(`Missing packaged notice: ${filename}`);
    }
  }
  console.log(`Packaged ${output} with dependency and runtime notices`);
}
