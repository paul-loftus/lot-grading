import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const localPython = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
const python =
  process.env.PYTHON ??
  (existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3');
for (const args of [[], ['--example']]) {
  const result = spawnSync(python, ['scripts/verify-dxf.py', ...args], { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
