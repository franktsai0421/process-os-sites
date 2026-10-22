import {withFixtureCleanup} from './fixture-cleanup.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { initializeLocal, inspectMigrations } from './local-init.mjs';
import { assertLocalMode, localPaths, readLocalSession } from '../lib/local-runtime.mjs';
import {readLocalState,writeLocalState}from'../lib/local-data.mjs';

// All mutations are restricted to fresh, disposable fixtures, never the invoking DB.
const source = process.cwd();
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'process-demo-init-fixture-'));
let proxy;
await withFixtureCleanup(async () => {
  for (const file of ['package.json', 'db/schema.ts', 'db/seed.json', 'lib/user-access.ts', 'public/process/access-policy.mjs',
    'drizzle/meta/_journal.json', ...fs.readdirSync('drizzle').filter(n => n.endsWith('.sql')).map(n => 'drizzle/' + n)]) {
    const destination = path.join(fixture, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(file, destination);
  }
  fs.symlinkSync(path.join(source, 'node_modules'), path.join(fixture, 'node_modules'), 'junction');
  fs.cpSync(path.join(source,'data/canonical'),path.join(fixture,'data/canonical'),{recursive:true});
  for (const args of [['--remote'], ['--config', 'production.json'], ['--host', '0.0.0.0'], ['--binding', 'DB']])
    assert.throws(() => assertLocalMode(args, {}));
  for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ENV', 'WRANGLER_ENV'])
    assert.throws(() => assertLocalMode([], { [key]: 'fixture' }));
  assert.throws(() => assertLocalMode([], { NODE_ENV: 'production' }));
  assertLocalMode(['--port', '5196'], {});
  const migration = path.join(fixture, 'drizzle/0001_woozy_roxanne_simpson.sql');
  const original = fs.readFileSync(migration, 'utf8');
  fs.writeFileSync(migration, original + '\nDROP TABLE shared_state;');
  assert.throws(() => inspectMigrations(fixture));
  fs.writeFileSync(migration, original.replace('NOT NULL', ''));
  assert.throws(() => inspectMigrations(fixture));
  fs.writeFileSync(migration, original);
  await initializeLocal(fixture);
  const { getPlatformProxy } = await import('wrangler');
  const open = () => getPlatformProxy({ configPath: localPaths(fixture).config,
    persist: { path: path.join(localPaths(fixture).state, 'v3') }, remoteBindings: false, envFiles: [] });
  proxy = await open();
  const _row = await proxy.env.DB.prepare('SELECT revision, "values" FROM shared_state WHERE id=1').first();
  const read=()=>readLocalState({db:proxy.env.DB,bucket:proxy.env.STATE_ARCHIVE});
  const values = (await read()).values;
  assert.equal(JSON.parse(values.platformUsers).length, 3);
  assert.equal(JSON.parse(values.masterDataControl).active.AB.products.length,299);
  assert.equal(JSON.parse(values.masterDataControl).active.C.products.length,140);
  values.dispatchBoard = JSON.stringify({ A: ['isolated-business-marker'] });
  await writeLocalState({db:proxy.env.DB,bucket:proxy.env.STATE_ARCHIVE},await read(),values);
  await proxy.dispose(); proxy = undefined;
  await initializeLocal(fixture); await initializeLocal(fixture);
  proxy = await open();
  let current = await read();
  assert.equal(JSON.stringify(current.values), JSON.stringify(values), 'startup overwrote existing fixture business state');
  await proxy.dispose(); proxy = undefined;
  const incomplete = path.join(localPaths(fixture).directory, 'development-package-incomplete.json');
  fs.writeFileSync(incomplete, JSON.stringify({ fixture: true }), {flag:'wx'});
  await assert.rejects(() => initializeLocal(fixture), /restore is incomplete/);
  assert.throws(() => readLocalSession(fixture), /restore is incomplete/);
  fs.unlinkSync(incomplete);
  proxy = await open(); current = await read();
  assert.equal(JSON.stringify(current.values), JSON.stringify(values), 'incomplete restore guard changed existing fixture data');
  const users = JSON.parse(values.platformUsers); users[0].authMode = 'platform';
  values.platformUsers = JSON.stringify(users);
  await writeLocalState({db:proxy.env.DB,bucket:proxy.env.STATE_ARCHIVE},await read(),values);
  await proxy.dispose(); proxy = undefined;
  await assert.rejects(() => initializeLocal(fixture), /ID conflict/);
  proxy = await open(); current = await read();
  assert.equal(JSON.stringify(current.values), JSON.stringify(values), 'conflict changed existing account or business data');
  await proxy.env.DB.prepare('DROP TABLE state_backups').run();
  await proxy.dispose(); proxy = undefined;
  await assert.rejects(() => initializeLocal(fixture), /incomplete/);
  console.log('PASS: disposable Local D1/R2, exact existing migrations, constraints, remote/Production refusal, idempotence, business preservation and fail-closed conflicts');
}, async () => {
  if (proxy) await proxy.dispose();
  const target = fs.realpathSync(fixture), parent = fs.realpathSync(os.tmpdir());
  if (path.dirname(target) !== parent || !path.basename(target).startsWith('process-demo-init-fixture-'))
    throw Error('Fixture cleanup target verification failed');
  fs.rmSync(target, { recursive: true, force: true });
}, async () => {
  console.error('FAIL: isolated Local initialization test (sensitive details suppressed)');
  process.exitCode = 1;
});
