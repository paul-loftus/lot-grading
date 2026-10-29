import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
if (path.resolve(root) !== process.cwd()) {
  throw new Error('Run setup:hooks from the LotGrade repository root.');
}
const existing = spawnSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf8' });
if (existing.status !== 0 && existing.status !== 1) {
  throw new Error('Could not inspect the existing Git hook configuration.');
}
if (existing.stdout.trim() && existing.stdout.trim() !== '.githooks') {
  throw new Error('A custom Git hooks path is already configured. It has not been replaced.');
}
execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks']);
console.log('Installed the local pre-push build and independent DXF export gate.');
