import {assertNoIncompleteUpdate} from './local-update-guard.mjs';
import fs from 'node:fs';
import path from 'node:path';

// Only our own constant messages may reach startup logs; runtime errors can contain data.
export class LocalSetupError extends Error {}
export function localFailureMessage(error) {
  return error instanceof LocalSetupError ? error.message : 'Local runtime initialization failed; sensitive details suppressed';
}

export const localDatabaseId = '00000000-0000-4000-8000-000000000000';
export function localPaths(root) {
  assertNoIncompleteUpdate(root);
  const project = fs.realpathSync(root);
  const directory = path.join(project, '.wrangler', 'local-only');
  const state = path.join(project, '.wrangler', 'state');
  for (const relative of ['.wrangler', '.wrangler/local-only', '.wrangler/local-only/wrangler.json', '.wrangler/local-only/session.json', '.wrangler/state']) {
    const target = path.join(project, relative);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())
      throw new LocalSetupError('Local storage must not use symbolic links');
  }
  function checkStorage(directory) {
    if (!fs.existsSync(directory)) return;
    for (const name of fs.readdirSync(directory)) {
      const target = path.join(directory, name), stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) throw new LocalSetupError('Local storage must not use symbolic links');
      if (stat.isDirectory()) checkStorage(target);
    }
  }
  checkStorage(state);
  return { project, directory, state, config: path.join(directory, 'wrangler.json'),
    session: path.join(directory, 'session.json') };
}

export function assertLocalMode(args = [], environment = process.env) {
  if (environment.NODE_ENV === 'production' || environment.CLOUDFLARE_ENV
    || environment.WRANGLER_ENV || environment.CLOUDFLARE_ACCOUNT_ID
    || environment.CLOUDFLARE_API_TOKEN || environment.CF_API_TOKEN || environment.CF_ACCOUNT_ID
    || environment.CLOUDFLARE_API_KEY || environment.CF_API_KEY || environment.WRANGLER_REMOTE_BINDINGS)
    throw new LocalSetupError('Local initialization refuses production, selected Cloudflare environments or credentials');
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === '--port' && /^\d+$/.test(args[i + 1] || '')) { i++; continue; }
    if (argument === '--host' && ['localhost', '127.0.0.1'].includes(args[i + 1])) { i++; continue; }
    throw new LocalSetupError('Only Local host/port arguments are allowed; remote/config/binding overrides are refused');
  }
}

export function localWorkerConfig() {
  return { name: 'process-local-demo', compatibility_date: '2026-05-15',
    compatibility_flags: ['nodejs_compat'],
    d1_databases: [{ binding: 'DB', database_name: 'site-creator-d1',
      database_id: localDatabaseId, remote: false }],
    r2_buckets: [{ binding: 'STATE_ARCHIVE', bucket_name: 'site-creator-r2', remote: false }],
  };
}

export function configureOfflineLocal(root) {
  const paths = localPaths(root);
  // Supported by the installed Miniflare: use its built-in Request.cf fixture.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED = 'false';
  process.env.WRANGLER_SEND_METRICS = 'false';
  process.env.WRANGLER_SEND_ERROR_REPORTS = 'false';
  process.env.WRANGLER_WRITE_LOGS = 'false';
  process.env.WRANGLER_LOG_PATH = path.join(paths.directory, 'logs');
  process.env.MINIFLARE_CACHE_DIR = path.join(paths.directory, 'cf-cache');
  process.env.MINIFLARE_REGISTRY_PATH = path.join(paths.directory, 'registry');
  process.env.WRANGLER_REGISTRY_PATH = path.join(paths.directory, 'registry');
  return paths;
}

export function readLocalSession(root) {
  const paths = localPaths(root);
  if (fs.existsSync(path.join(paths.directory, 'development-package-incomplete.json')))
    throw new LocalSetupError('Development package restore is incomplete; startup refused');
  const data = JSON.parse(fs.readFileSync(paths.session, 'utf8'));
  if (typeof data.secret !== 'string' || data.secret.length < 32)
    throw new LocalSetupError('Local Session setup is missing; run npm run dev');
  return data.secret;
}
