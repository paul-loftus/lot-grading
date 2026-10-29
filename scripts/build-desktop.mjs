import { build } from 'esbuild';
import { collectNotices } from './collect-notices.mjs';

await build({
  entryPoints: ['desktop/main.ts', 'desktop/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  outdir: 'dist-desktop',
  outExtension: { '.js': '.cjs' },
  sourcemap: true,
});

await collectNotices();
