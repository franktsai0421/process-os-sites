import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Historical CLI spelling delegates to current isolated contracts; no --serve forwarding.
for (const name of ['test-user-access.mjs', 'test-demo-auth.mjs']) {
  const child = spawnSync(process.execPath, [fileURLToPath(new URL(name, import.meta.url))], {
    cwd: process.cwd(), stdio: 'inherit', windowsHide: true, timeout: 120_000,
  });
  if (child.error || child.status !== 0) {
    process.exitCode = child.status && child.status > 0 ? child.status : 1;
    throw new Error(`Current isolated child ${name} failed: ${child.error?.code || child.signal || child.status}`);
  }
}

const loadCjs = createRequire(fileURLToPath(new URL('./test-user-management.cjs', import.meta.url)));
const harness = loadCjs('./ipqc-ab-import-harness.cjs');
const db = new DatabaseSync(':memory:');
try {
  for (const file of fs.readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort((a, b) => a < b ? -1 : a > b ? 1 : 0))
    db.exec(fs.readFileSync(path.join('drizzle', file), 'utf8'));
  const objects = new Map();
  let objectWrites = 0;
  const env = {
    PROCESS_SESSION_SECRET: randomUUID(),
    DB: { prepare(sql) { let args = []; return {
      bind(...values) { args = values; return this; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
    }; } },
    STATE_ARCHIVE: {
      async put(key, value) { objectWrites++; objects.set(key, String(value)); },
      async get(key) { return objects.has(key) ? { text: async () => objects.get(key) } : null; },
      async head(key) { return objects.has(key) ? {} : null; },
    },
  };
  const load = harness(env), core = load('lib/process-state.ts');
  const api = load('app/api/user-access/route.ts'), login = load('app/api/platform-login/route.ts');
  const password = 'Synthetic-CLI-20261014!', business = JSON.stringify({ fixture: 'owned memory only' });
  const values = {
    platformUsers: JSON.stringify([
      { id: 'frank', name: 'Synthetic QA primary', role: 'admin', enabled: true, inheritRole: true, password },
      { id: 'manager', name: 'Synthetic QA peer', role: 'admin', enabled: true, inheritRole: true, password },
    ]),
    processCustomRoles: '[]', processRoleTemplateOverrides: '{}', userManagementFixture: business,
  };
  db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)')
    .run(await core.encodeValues(values), 'owned-fixture');
  const cookies = new Map();
  async function sign(id) {
    const response = await login.POST(new Request('https://fixture.test/api/platform-login', {
      method: 'POST', headers: { Origin: 'https://fixture.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password }),
    }));
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    cookies.set(id.toLowerCase(), cookie);
    return new Request('https://fixture.test/api/user-access', { headers: { Cookie: cookie } });
  }
  async function request(body, actor = 'frank') {
    return api.POST(new Request('https://fixture.test/api/user-access', {
      method: 'POST', headers: { Origin: 'https://fixture.test', Cookie: cookies.get(actor), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
  }
  const backupCount = () => Number(db.prepare('SELECT count(*) AS n FROM state_backups').get().n);
  async function mutation(body) {
    const before = await core.readState(), count = backupCount();
    const response = await request({ baseRevision: before.revision, ...body });
    assert.equal(response.status, 200, await response.clone().text());
    const after = await core.readState();
    assert.equal(after.revision, before.revision + 1);
    assert.equal(backupCount(), count + 1, 'each changed account/role mutation protects its previous revision');
    const backup = db.prepare('SELECT "values" FROM state_backups WHERE revision=?').get(before.revision);
    assert(backup);
    assert.deepEqual({ ...await core.decodeValues(backup.values) }, { ...before.values }, 'backup retains complete pre-mutation values');
    return after;
  }
  const primaryRequest = await sign('FRANK');
  assert.equal((await core.identity(primaryRequest, await core.readState())).id, 'frank');
  await sign('manager');
  await mutation({ action: 'create-role', id: 'custom_cli_case', name: 'CLI contract role', access: { 'bom.view': true, 'bom.save': true } });
  await mutation({ action: 'create-user', id: 'case.inherited', name: 'Synthetic inherited staff', role: 'custom_cli_case', password, confirmation: password });
  await mutation({ action: 'create-user', id: 'case.override', name: 'Synthetic overridden staff', role: 'custom_cli_case', password, confirmation: password, changes: { 'bom.save': false } });
  let inheritedRequest = await sign('CASE.INHERITED');
  const overriddenRequest = await sign('CASE.OVERRIDE');
  assert.equal((await core.identity(inheritedRequest, await core.readState())).id, 'case.inherited');
  let state = await core.readState();
  assert.equal(await core.can(inheritedRequest, state, 'bom.save'), true);
  assert.equal(await core.can(overriddenRequest, state, 'bom.save'), false);
  const beforeOverride = JSON.parse(state.values.platformUsers).find(user => user.id === 'case.override').accessOverrides;
  await mutation({ action: 'update-role', id: 'custom_cli_case', name: 'CLI contract role', access: { 'bom.view': true, 'bom.save': false } });
  assert.equal((await api.GET(inheritedRequest)).status, 401, 'changed role rights revoke inherited session');
  assert.equal((await api.GET(overriddenRequest)).status, 200, 'unchanged effective override retains session');
  inheritedRequest = await sign('CASE.INHERITED');
  state = await core.readState();
  assert.equal(await core.can(inheritedRequest, state, 'bom.save'), false);
  assert.deepEqual(JSON.parse(state.values.platformUsers).find(user => user.id === 'case.override').accessOverrides, beforeOverride);
  await mutation({ action: 'update-role', id: 'custom_cli_case', name: 'CLI contract role', access: { 'bom.view': true, 'bom.save': true } });
  inheritedRequest = await sign('CASE.INHERITED');
  state = await core.readState();
  assert.equal(await core.can(inheritedRequest, state, 'bom.save'), true);
  assert.equal(await core.can(overriddenRequest, state, 'bom.save'), false);
  assert.deepEqual(JSON.parse(state.values.platformUsers).find(user => user.id === 'case.override').accessOverrides, beforeOverride);
  const beforeDenied = db.prepare('SELECT * FROM shared_state').get(), count = backupCount(), writes = objectWrites;
  const denied = await request({ action: 'update-user', id: 'frank', name: 'Denied mutation', baseRevision: state.revision }, 'manager');
  assert.equal(denied.status, 403);
  const conflict = await request({ action: 'update-user', id: 'case.inherited', name: 'Stale mutation', baseRevision: state.revision - 1 });
  assert.equal(conflict.status, 409);
  assert.deepEqual(db.prepare('SELECT * FROM shared_state').get(), beforeDenied);
  assert.equal(backupCount(), count);
  assert.equal(objectWrites, writes, 'denied and stale mutations create no backup or R2 publication');
  assert.equal((await core.readState()).values.userManagementFixture, business);
  console.log('PASS current user-management CLI: current user-access and demo-auth child exits; ordinary login case normalization; complete mutation backups; role propagation; per-user override retention; no-write denial/CAS');
} finally {
  db.close();
}
