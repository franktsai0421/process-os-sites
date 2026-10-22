// Keep the established test entry point, but run the isolated current-UI fixture.
// The older test imported a workbook into the user's Local draft; this version is read-only there.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, [path.join(project, 'scripts/test-routine-browser.cjs')],
  { cwd: project, stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status || 1;
