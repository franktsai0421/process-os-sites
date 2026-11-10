import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {fixture, isBaseline, sourceRoot} from './master-ab-auth-phase-fixture.mjs';

void test('AB actual compact records GET and Apply/Save SQL/R2 counters', async t => {
  const f = await fixture(); t.after(f.close);
  const before = f.row(), objects = [...f.objects];
  const read = await f.request();
  assert.equal(read.status, 200); assert.equal(read.body.control.workflow.generation, f.flow.generation);
  const get = {...f.stats};
  assert.deepEqual(f.row(), before); assert.deepEqual([...f.objects], objects);
  f.reset();
  const applied = await f.request('POST', f.command());
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const apply = {...f.stats};
  assert.equal(applied.body.control.workflow.working.products[0].name, 'Edited product');
  f.reset();
  const saved = await f.request('POST', f.command('save'));
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const save = {...f.stats};
  assert.equal(saved.body.control.workflow.saved.content.products[0].name, 'Edited product');
  const decoded = await f.decoded(), stored = JSON.parse(decoded.masterDataControl);
  for (const key of ['platformUsers', 'bomOverrides', 'processMasterData']) assert.equal(decoded[key], f.values[key]);
  assert.deepEqual(stored.workflowScopes.AB.saves.slice(0, 1), f.master.workflowScopes.AB.saves);
  assert.equal(stored.workflowScopes.AB.saved.id, saved.body.receipt.savedId);
  assert.equal(stored.workflowScopes.AB.working.products[0].name, 'Edited product');
  assert.deepEqual(stored.active, f.master.active);
  assert.deepEqual(stored.workflowScopes.AB.cases, f.master.workflowScopes.AB.cases);
  assert.equal(f.row().revision, before.revision + 2);
  t.diagnostic(JSON.stringify({sourceRoot, get, apply, save}));
  for (const [actual, expected] of [[get, {state: 2, revision: 0, cas: 0, get: 6, head: 0, put: 0}], [apply, {state: 1, revision: 1, cas: 1, get: 7, head: 0, put: 2}], [save, {state: 1, revision: 1, cas: 1, get: 8, head: 0, put: 1}]]) {
    for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, key);
    assert.equal(actual.other, 0);
  }
  if (isBaseline) {
    assert.equal(get.sql, 28); assert.equal(get.revocation, 26);
    for (const write of [apply, save]) { assert.equal(write.sql, 16); assert.equal(write.revocation, 13); }
  } else {
    assert.equal(get.sql, 6); assert.equal(get.revocation, 4);
    for (const write of [apply, save]) { assert.equal(write.sql, 7); assert.equal(write.revocation, 4); }
  }
});

async function assertUnchanged(f, operation, status) {
  const row = f.row(), objects = [...f.objects];
  const result = await operation();
  assert.equal(result.status, status, JSON.stringify(result.body));
  assert.deepEqual(f.row(), row, 'denial must not update shared state');
  assert.deepEqual([...f.objects], objects, 'denial must not write immutable bodies');
  return result;
}
const changeUser = transform => async values => {
  const users = JSON.parse(values.platformUsers); transform(users[0], users); values.platformUsers = JSON.stringify(users);
};
const authChanges = [
  ['disabled', changeUser(user => { user.enabled = false; })],
  ['logically deleted', changeUser(user => { user.deletedAt = '2026-10-31T12:00:01Z'; })],
  ['removed', changeUser((_user, users) => { users.length = 0; })],
  ['auth epoch changed', changeUser(user => { user.authEpoch++; })],
  ['unknown role', changeUser(user => { user.role = 'missing-role'; })],
  ['view override revoked', changeUser(user => { user.accessOverrides['ab.view'] = false; })],
  ['role policy revoked', values => { values.processRoleTemplateOverrides = JSON.stringify({admin: {access: {'ab.view': false}}}); }],
];

for (const [name, mutate] of authChanges) {
  void test('AB fresh selected-state authorization after GET preflight: ' + name, async t => {
    const f = await fixture(); t.after(f.close);
    let changed = false, stateAfterChange;
    f.hooks.set('state.before', async event => {
      if (event.count === 2) { changed = true; await f.mutateValues(mutate); stateAfterChange = f.row(); }
    });
    const result = await f.request();
    assert.equal(changed, true); assert.equal(result.status, 403, JSON.stringify(result.body));
    assert.equal(result.body.control, undefined); assert.deepEqual(f.row(), stateAfterChange); assert.equal(f.stats.put, 0);
  });
}

void test('AB legacy line assignments are not reintroduced as authorization between GET phases', async t => {
  const f = await fixture({user: {role: 'staff', lines: ['A']}}); t.after(f.close);
  f.hooks.set('state.before', async event => {
    if (event.count === 2) await f.mutateValues(changeUser(user => { user.lines = ['C']; }));
  });
  const result = await f.request();
  assert.equal(result.status, 200); assert.equal(result.body.permissions.edit, true);
  assert.equal(result.body.permissions.approve, false); assert.equal(result.body.permissions.delete, false);
  assert.deepEqual(JSON.parse((await f.decoded()).platformUsers)[0].lines, ['C']);
});

void test('AB permission decisions are not shared across requests or signed identities', async t => {
  const f = await fixture(); t.after(f.close);
  assert.equal((await f.request()).status, 200);
  const first = f.stats.revocation; assert.ok(first > 0);
  f.reset(); assert.equal((await f.request()).status, 200); assert.equal(f.stats.revocation, first);
  f.revoke(); f.reset();
  await assertUnchanged(f, () => f.request(), 403); assert.ok(f.stats.revocation > 0);
  const other = await fixture({user: {accessOverrides: {'ab.view': false}}}); t.after(other.close);
  await assertUnchanged(other, () => other.request(), 403);
  await assertUnchanged(other, () => other.request('POST', other.command()), 403);
});

for (const phase of [1, 2]) {
  void test('AB GET revocation storage failure denies phase ' + phase, async t => {
    const f = await fixture(); t.after(f.close);
    let states = 0;
    f.hooks.set('state.before', () => { states++; });
    f.hooks.set('revocation.before', () => { if (states === phase) throw Error('SYNTHETIC_REVOCATION_DB_FAILURE'); });
    const result = await assertUnchanged(f, () => f.request(), 403);
    assert.equal(result.body.control, undefined); assert.equal(f.stats.put, 0);
  });
}

for (const permission of ['view', 'edit', 'restore', 'create', 'delete']) {
  void test('AB denied ' + permission + ' does not grant or persist a command', async t => {
    const f = await fixture({user: {accessOverrides: {'ab.restore': true, ['ab.' + permission]: false}}}); t.after(f.close);
    const read = await f.request();
    if (permission === 'view') assert.equal(read.status, 403);
    else { assert.equal(read.status, 200); assert.equal(read.body.permissions[permission], false); }
    let command;
    if (permission === 'restore') command = f.command('restore', {restoreSaveId: 'save0', expectedRevision: 0});
    else if (permission === 'create') command = f.command('apply', {patches: [{op: 'insert', path: ['products'], value: {...f.master.active.AB.products[0], id: 'new-product', code: 'A2'}}], guards: []});
    else if (permission === 'delete') command = f.command('apply', {patches: [{op: 'remove', path: ['products', {id: 'product-a'}]}], guards: [{path: ['products', {id: 'product-a'}], value: f.master.active.AB.products[0]}]});
    else command = f.command();
    await assertUnchanged(f, () => f.request('POST', command), 403);
  });
}

void test('AB primary account keeps its exact existing exception, without defeating session revocation', async t => {
  const f = await fixture({primary: true, user: {accessOverrides: {'ab.view': false, 'ab.edit': false, 'ab.restore': false, 'ab.create': false, 'ab.delete': false}}}); t.after(f.close);
  const read = await f.request(); assert.equal(read.status, 200);
  for (const permission of ['view', 'edit', 'restore', 'create', 'delete']) assert.equal(read.body.permissions[permission], true);
  assert.equal((await f.request('POST', f.command())).status, 200);
  f.revoke(); await assertUnchanged(f, () => f.request('POST', f.command('save')), 401);
});

void test('AB replay and begin noop retain receipts, state and all R2 objects', async t => {
  const f = await fixture(); t.after(f.close);
  await assertUnchanged(f, () => f.request('POST', {action: 'begin'}), 200);
  const command = f.command(), applied = await f.request('POST', command);
  assert.equal(applied.status, 200); f.reset();
  const replay = await assertUnchanged(f, () => f.request('POST', command), 200);
  assert.equal(replay.body.unchanged, true); assert.deepEqual(replay.body.receipt, applied.body.receipt);
  assert.equal(f.stats.cas, 0); assert.equal(f.stats.put, 0);
  f.revoke(); await assertUnchanged(f, () => f.request('POST', command), 401);
});

for (const [name, mutate] of authChanges) {
  void test('AB stale-revision retry authorizes the new state: ' + name, async t => {
    const f = await fixture(); t.after(f.close);
    let changed = false, preserved;
    f.hooks.set('revision.before', async event => {
      if (event.count === 1) { changed = true; await f.mutateValues(mutate); preserved = f.row(); }
    });
    const result = await f.request('POST', f.command());
    assert.equal(changed, true); assert.ok([401, 403].includes(result.status), JSON.stringify(result.body));
    assert.deepEqual(f.row(), preserved); assert.equal(f.stats.state, 2);
    assert.equal(f.stats.cas, 0); assert.equal(f.stats.put, 0);
  });
}

void test('AB failed final CAS reloads identity and does not overwrite newer data', async t => {
  const f = await fixture(); t.after(f.close);
  let preserved; const originalObjects = [...f.objects];
  f.hooks.set('cas.before', async event => {
    if (event.count === 1) {
      await f.mutateValues(async values => {
        await changeUser(user => { user.enabled = false; })(values);
        values.syntheticConcurrent = JSON.stringify('retain-newer-value');
      }); preserved = f.row();
    }
  });
  const result = await f.request('POST', f.command());
  assert.equal(result.status, 401); assert.equal(f.stats.cas, 1); assert.equal(f.stats.state, 2);
  assert.deepEqual(f.row(), preserved);
  const decoded = await f.decoded(); assert.equal(JSON.parse(decoded.syntheticConcurrent), 'retain-newer-value');
  assert.deepEqual(JSON.parse(decoded.masterDataControl), f.master);
  // Failed CAS may leave immutable orphan objects; it must not replace any old body.
  for (const [key, raw] of originalObjects) assert.equal(f.objects.get(key), raw);
});

void test('AB allowed CAS retry retains concurrent data and legacy lines, commits one command', async t => {
  const f = await fixture({user: {role: 'staff', lines: ['A']}}); t.after(f.close);
  f.hooks.set('cas.before', async event => {
    if (event.count === 1) await f.mutateValues(async values => {
      await changeUser(user => { user.lines = ['C']; })(values); values.syntheticConcurrent = JSON.stringify('retained');
    });
  });
  const command = f.command(), result = await f.request('POST', command);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(f.stats.state, 2); assert.equal(f.stats.cas, 2); assert.equal(f.row().revision, 3);
  const decoded = await f.decoded(), root = JSON.parse(decoded.masterDataControl);
  assert.equal(JSON.parse(decoded.syntheticConcurrent), 'retained'); assert.deepEqual(JSON.parse(decoded.platformUsers)[0].lines, ['C']);
  assert.equal(root.workflowScopes.AB.working.products[0].name, 'Edited product');
  assert.equal(Object.keys(root.workflowScopes.AB.receipts).length, 1);
  assert.deepEqual(root.active, f.master.active); assert.deepEqual(root.workflowScopes.AB.cases, f.master.workflowScopes.AB.cases);
});

for (const scope of ['C', 'PROCESS']) {
  void test('non-AB ' + scope + ' actual route keeps legacy SQL authorization path', async t => {
    const f = await fixture({scope}); t.after(f.close);
    const read = await f.request(); assert.equal(read.status, 200);
    assert.equal(f.stats.sql, 28); assert.equal(f.stats.revocation, 26); assert.equal(f.stats.state, 2);
    f.reset(); const save = await f.request('POST', f.command('save'));
    assert.equal(save.status, 200, JSON.stringify(save.body)); assert.equal(f.stats.sql, 16); assert.equal(f.stats.revocation, 13);
    const root = JSON.parse((await f.decoded()).masterDataControl);
    assert.deepEqual(root.active, f.master.active); assert.deepEqual(root.workflowScopes[scope].cases, f.master.workflowScopes[scope].cases);
  });
}

void test('AB inline legacy state retains read/write and immutable history semantics', async t => {
  const f = await fixture({inline: true}); t.after(f.close);
  const read = await f.request(); assert.equal(read.status, 200); assert.equal(f.stats.state, 1);
  f.reset(); assert.equal((await f.request('POST', f.command())).status, 200);
  assert.equal(f.stats.get, 0); assert.equal(f.stats.put, 0);
  const root = JSON.parse((await f.decoded()).masterDataControl);
  assert.deepEqual(root.active, f.master.active); assert.deepEqual(root.workflowScopes.AB.cases, f.master.workflowScopes.AB.cases);
});

void test('AB signed-session failure cannot use forged hosted identity headers', async t => {
  const f = await fixture(); t.after(f.close);
  const headers = {...f.headers, Cookie: 'process_demo=invalid', 'oai-authenticated-user-id': 'forged', 'oai-authenticated-user-email': 'franktsai0421@gmail.com', 'x-process-admin-id': 'frank'};
  await assertUnchanged(f, () => f.request('GET', undefined, '', headers), 403);
  await assertUnchanged(f, () => f.request('POST', f.command(), '', headers), 401);
});

for (const phase of [1, 2]) {
  void test('AB revocation during GET authorization phase ' + phase + ' denies disclosure', async t => {
    const f = await fixture(); t.after(f.close);
    let states = 0, injected = false;
    f.hooks.set('state.before', () => { states++; });
    f.hooks.set('revocation.after', () => {
      if (!injected && states === phase) { injected = true; f.revoke(); }
    });
    const result = await assertUnchanged(f, () => f.request(), 403);
    assert.equal(injected, true); assert.equal(result.body.control, undefined);
  });
}

void test('AB revocation during POST authorization cannot turn a cached permission into a grant', async t => {
  const f = await fixture(); t.after(f.close);
  f.hooks.set('revocation.after', event => { if (event.count === 1) f.revoke(); });
  const before = f.row(), objects = [...f.objects];
  const result = await f.request('POST', f.command());
  assert.ok([401, 403].includes(result.status), JSON.stringify(result.body));
  assert.deepEqual(f.row(), before); assert.deepEqual([...f.objects], objects);
});

for (const boundary of ['fingerprint.before', 'revision.after']) {
  void test('AB final fresh session gate: revoke at ' + boundary, async t => {
    const f = await fixture(); t.after(f.close);
    let injected = false;
    f.hooks.set(boundary, () => { injected = true; f.revoke(); });
    const result = await assertUnchanged(f, () => f.request('POST', f.command()), 401);
    assert.equal(injected, true); assert.equal(result.body.error, 'LOGIN_REQUIRED');
    assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
  });
}

void test('AB final fresh session gate: revocation DB failure after command fingerprint fails closed', async t => {
  const f = await fixture(); t.after(f.close);
  let fingerprinted = false;
  f.hooks.set('fingerprint.before', () => { fingerprinted = true; });
  f.hooks.set('revocation.before', () => { if (fingerprinted) throw Error('SYNTHETIC_FINAL_REVOCATION_FAILURE'); });
  const result = await assertUnchanged(f, () => f.request('POST', f.command()), 401);
  assert.equal(fingerprinted, true); assert.equal(result.body.error, 'LOGIN_REQUIRED');
  assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
});

void test('AB second GET phase emits newly restricted edit/restore/create/delete policy, not preflight grants', async t => {
  const f = await fixture(); t.after(f.close);
  f.hooks.set('state.before', async event => {
    if (event.count === 2) await f.mutateValues(changeUser(user => {
      for (const permission of ['edit', 'restore', 'create', 'delete']) user.accessOverrides['ab.' + permission] = false;
    }));
  });
  const result = await f.request(); assert.equal(result.status, 200);
  assert.equal(result.body.permissions.view, true);
  for (const permission of ['edit', 'restore', 'create', 'delete']) assert.equal(result.body.permissions[permission], false);
  await assertUnchanged(f, () => f.request('POST', f.command()), 403);
});

void test('AB ordinary admin keeps restore permission separate while retired preview stays unavailable', async t => {
  const f = await fixture({user: {accessOverrides: {}}}); t.after(f.close);
  const result = await f.request(); assert.equal(result.status, 200);
  assert.equal(result.body.permissions.edit, true); assert.equal(result.body.permissions.restore, false);
  const preview = await assertUnchanged(f, () => f.request('GET', undefined, '&restoreSaveId=save0'), 422);
  assert.equal(preview.body.error, 'DRAFT_RESTORE_NOT_SUPPORTED');
  assert.equal(preview.body.control, undefined);
  await assertUnchanged(f, () => f.request('POST', f.command('restore', {restoreSaveId: 'save0', expectedRevision: 0})), 403);
});

void test('AB explicit restore grant cannot create a new restore preview or write after retirement', async t => {
  const f = await fixture({user: {accessOverrides: {'ab.restore': true}}}); t.after(f.close);
  const read = await f.request(); assert.equal(read.status, 200);
  assert.equal(read.body.permissions.restore, true, 'retained permission still gates historical receipt access');
  f.reset();
  for (const operation of [
    () => f.request('GET', undefined, '&restoreSaveId=save0'),
    () => f.request('POST', f.command('restore', {restoreSaveId: 'save0', expectedRevision: 0})),
  ]) {
    const result = await assertUnchanged(f, operation, 422);
    assert.equal(result.body.error, 'DRAFT_RESTORE_NOT_SUPPORTED');
    assert.equal(result.body.control, undefined);
  }
  assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
});

void test('AB failed authorization is not reused by a later healthy request', async t => {
  const f = await fixture(); t.after(f.close);
  f.hooks.set('revocation.before', () => { throw Error('SYNTHETIC_TRANSIENT_READ_FAILURE'); });
  await assertUnchanged(f, () => f.request(), 403);
  f.hooks.delete('revocation.before'); f.reset();
  assert.equal((await f.request()).status, 200); assert.ok(f.stats.revocation > 0);
});

void test('AB same module instance isolates concurrent signed actors and caller-supplied scope metadata', async t => {
  const f = await fixture(); t.after(f.close);
  await f.mutateValues(values => {
    const users = JSON.parse(values.platformUsers);
    users.push({id: 'denied', name: 'Synthetic denied', role: 'staff', enabled: true, authEpoch: 1, accessOverrides: {'ab.view': false}});
    values.platformUsers = JSON.stringify(users);
  });
  const token = await f.core.demoSession(new Request(f.url), 'denied', false, 1);
  const deniedHeaders = {...f.headers, Cookie: f.core.sessionCookie(new Request(f.url), token).split(';')[0], 'x-process-auth-phase': 'master:AB', 'x-process-admin-id': 'frank'};
  f.reset();
  const [allowed, denied] = await Promise.all([f.request(), f.request('GET', undefined, '', deniedHeaders)]);
  assert.equal(allowed.status, 200); assert.equal(denied.status, 403); assert.equal(denied.body.control, undefined);
  assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
});

for (const suffix of ['&permissions=1', '&since=state:1']) {
  void test('AB preflight-only ' + suffix + ' finishes authorization before returning', async t => {
    const f = await fixture(); t.after(f.close);
    f.hooks.set('revocation.after', event => { if (event.count === 1) f.revoke(); });
    const result = await assertUnchanged(f, () => f.request('GET', undefined, suffix), 403);
    assert.equal(result.body.control, undefined); assert.equal(result.body.permissions, undefined);
  });
}

void test('AB begin noop cannot expose control after authorization-phase revocation', async t => {
  const f = await fixture(); t.after(f.close);
  f.hooks.set('revocation.after', event => { if (event.count === 1) f.revoke(); });
  const before = f.row(), objects = [...f.objects], result = await f.request('POST', {action: 'begin'});
  assert.ok([401, 403].includes(result.status), JSON.stringify(result.body));
  assert.equal(result.body.control, undefined); assert.deepEqual(f.row(), before); assert.deepEqual([...f.objects], objects);
});

for (const failure of ['revoke', 'revocation storage failure']) {
  void test('AB final CAS authorization after immutable encode: ' + failure, async t => {
    const f = await fixture(); t.after(f.close);
    const before = f.row(), originalObjects = [...f.objects];
    let encoded = false;
    f.hooks.set('r2put.before', () => { encoded = true; if (failure === 'revoke') f.revoke(); });
    f.hooks.set('revocation.before', () => { if (encoded && failure !== 'revoke') throw Error('SYNTHETIC_POST_ENCODE_REVOCATION_FAILURE'); });
    const result = await f.request('POST', f.command());
    assert.equal(encoded, true); assert.equal(result.status, 401, JSON.stringify(result.body));
    assert.equal(result.body.error, 'LOGIN_REQUIRED'); assert.equal(result.body.control, undefined);
    assert.deepEqual(f.row(), before); assert.equal(f.stats.cas, 0); assert.ok(f.stats.put > 0);
    // The state manifest remains authoritative. Immutable orphan bodies are not rolled back.
    for (const [key, raw] of originalObjects) assert.equal(f.objects.get(key), raw);
    assert.deepEqual(JSON.parse((await f.decoded()).masterDataControl), f.master);
  });
}


void test('AB complete permission matrix projection for baseline/current comparison', async t => {
  // Run this same case once per real source root. Compare the emitted rows,
  // not independently handwritten expected policies or elapsed test durations.
  const operations = ['view', 'create', 'edit', 'delete', 'save', 'submit', 'withdraw', 'approve', 'return', 'exchange', 'restore'];
  const projected = ['approve', 'create', 'delete', 'edit', 'history', 'restore', 'return', 'save', 'submit', 'view', 'withdraw'];
  const custom = {id: 'custom-fixture', name: 'Synthetic custom role', lines: ['A'], views: ['data', 'approval'], permissions: ['approval.withdraw'],
    access: Object.fromEntries(operations.map(op => ['ab.' + op, ['view', 'edit', 'save', 'withdraw', 'exchange'].includes(op)]))};
  const presets = [
    {name: 'primary', options: {primary: true, user: {accessOverrides: {}}}},
    {name: 'admin', options: {user: {role: 'admin', accessOverrides: {}}}},
    {name: 'staff', options: {user: {role: 'staff', accessOverrides: {}}}},
    {name: 'rd', options: {user: {role: 'rd', accessOverrides: {}}}},
    {name: 'custom', options: {user: {role: custom.id, accessOverrides: {}}, values: {processCustomRoles: JSON.stringify([custom])}}},
    {name: 'non-inheriting-reviewer', options: {user: {role: 'staff', inheritRole: false, lines: ['C'], views: ['approval'], permissions: ['approval.approve', 'approval.withdraw'], accessOverrides: {}}}},
    {name: 'non-inheriting-editor', options: {user: {role: 'rd', inheritRole: false, lines: [], views: ['data'], permissions: [], accessOverrides: {}}}},
  ];
  const cases = [];
  for (const preset of presets) {
    cases.push(preset);
    for (const operation of operations) for (const value of [false, true]) {
      const options = structuredClone(preset.options);
      options.user.accessOverrides['ab.' + operation] = value;
      cases.push({name: preset.name + ':' + operation + '=' + value, options});
    }
  }
  const allDenied = Object.fromEntries(operations.map(op => ['ab.' + op, false]));
  cases.push(
    {name: 'primary-explicit-all-denied', options: {primary: true, user: {accessOverrides: allDenied}}},
    {name: 'admin-role-policy-denied', options: {user: {accessOverrides: {}}, values: {processRoleTemplateOverrides: JSON.stringify({admin: {access: allDenied}})}}},
    {name: 'admin-user-overrides-role-policy', options: {user: {accessOverrides: Object.fromEntries(operations.map(op => ['ab.' + op, true]))}, values: {processRoleTemplateOverrides: JSON.stringify({admin: {access: allDenied}})}}},
    {name: 'view-denied-other-operations-true', options: {user: {accessOverrides: Object.fromEntries(operations.map(op => ['ab.' + op, op !== 'view']))}}},
    {name: 'edit-denied-restore-create-delete-true', options: {user: {accessOverrides: {'ab.edit': false, 'ab.restore': true, 'ab.create': true, 'ab.delete': true}}}},
    {name: 'legacy-lines-A', options: {user: {role: 'staff', lines: ['A'], accessOverrides: {}}}},
    {name: 'legacy-lines-C', options: {user: {role: 'staff', lines: ['C'], accessOverrides: {}}}},
    {name: 'legacy-lines-empty', options: {user: {role: 'staff', lines: [], accessOverrides: {}}}},
    {name: 'disabled', options: {user: {enabled: false, accessOverrides: {}}}},
    {name: 'deleted', options: {user: {deletedAt: '2026-10-31T12:00:01Z', accessOverrides: {}}}},
    {name: 'unknown-role', options: {user: {role: 'not-a-role', accessOverrides: {}}}},
  );
  const rows = [], baselineRows = [], f = await fixture(); t.after(f.close);
  for (const item of cases) {
      // Reuse one loaded application, but replace only this synthetic fixture's
      // state and issue a newly signed session for every independent matrix row.
      const user = {...f.user, ...item.options.user, id: item.options.primary ? 'frank' : 'fixture'};
      await f.mutateValues(values => {
        for (const key of Object.keys(values)) delete values[key];
        Object.assign(values, f.values, item.options.values);
        values.platformUsers = JSON.stringify([user]);
      });
      const token = await f.core.demoSession(new Request(f.url), user.id, false, user.authEpoch);
      assert.ok(token, item.name + ': actual signed session');
      const headers = {...f.headers, Cookie: f.core.sessionCookie(new Request(f.url), token).split(';')[0]};
      f.reset();
      const before = f.row(), result = await f.request('GET', undefined, '', headers);
      assert.ok([200, 403].includes(result.status), item.name + ': ' + JSON.stringify(result.body));
      if (result.status === 200) {
        assert.deepEqual(Object.keys(result.body.permissions).sort(), projected, item.name);
        for (const [permission, value] of Object.entries(result.body.permissions)) assert.equal(typeof value, 'boolean', item.name + ':' + permission);
      } else {
        assert.equal(result.body.error, 'FORBIDDEN', item.name);
        assert.equal(result.body.permissions, undefined, item.name);
        assert.equal(result.body.control, undefined, item.name);
      }
      rows.push({name: item.name, status: result.status, hasPermissions: Object.hasOwn(result.body, 'permissions'),
        ...(result.status === 200 ? {permissions: result.body.permissions} : {error: result.body.error})});
      const baselineRow=structuredClone(rows.at(-1));
      if(result.status===200){
        const access=f.load('lib/user-access.ts').effectiveAccess(user,await f.decoded()),legacySave=access.cells['ab.save']===true;
        assert.equal(result.body.permissions.save,isBaseline?legacySave:legacySave||result.body.permissions.edit,item.name+': edit implies Save only');
        baselineRow.permissions.save=legacySave;
      }
      baselineRows.push(baselineRow);
      assert.deepEqual(f.row(), before, item.name + ': read must not persist');
      assert.equal(f.stats.put, 0, item.name); assert.equal(f.stats.cas, 0, item.name);
  }
  const lineRows = rows.filter(row => row.name.startsWith('legacy-lines-'));
  assert.deepEqual(lineRows[0].permissions, lineRows[1].permissions);
  assert.deepEqual(lineRows[0].permissions, lineRows[2].permissions);
  const digest = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  // Exact 172-row production-route projection from public baseline 1a98ba36944327f82805a167ff0a6feea9bc0570.
  // Includes complete permission DTOs and the no-DTO denial shape; not a candidate-generated expected value.
  assert.equal(createHash('sha256').update(JSON.stringify(baselineRows)).digest('hex'), 'a80751bb12f51ef0685bc05a1ee12c6989dbb425abafe3e948d2136143ed3633', 'reversing only the authorized edit-implies-Save cell retains the exact public baseline');
  t.diagnostic('MASTER_AB_PERMISSION_MATRIX ' + JSON.stringify({sourceRoot, count: rows.length, digest, rows}));
});
