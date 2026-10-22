import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { initializeLocal } from './local-init.mjs';
import { localFailureMessage } from '../lib/local-runtime.mjs';

process.env.WRANGLER_SEND_METRICS = 'false';
process.env.WRANGLER_WRITE_LOGS = 'false';
try {
  await initializeLocal(process.cwd(), process.argv.slice(2));
  const child = spawn(process.execPath, ['--import', pathToFileURL(path.resolve('scripts/local-network-preload.mjs')).href,
    path.resolve('scripts/local-server.mjs'),
    ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
  const marker=path.resolve('.wrangler/local-only/dev-server.json');
  fs.writeFileSync(marker,JSON.stringify({pid:child.pid,host:'127.0.0.1',root:fs.realpathSync(process.cwd()),entry:'scripts/local-server.mjs',startedAt:new Date().toISOString()}));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('exit', code => { if(fs.existsSync(marker))fs.unlinkSync(marker);process.exitCode = code ?? 1; });
} catch (error) {
  console.error(localFailureMessage(error));
  console.error('Local initialization failed; dev server was not started.');
  process.exitCode = 1;
}
