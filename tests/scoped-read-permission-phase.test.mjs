// Exact production GETs and server-only phase ports. Synthetic in-memory
// SQLite/R2/session signing only; no fake route, listener or live data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {sourceRoot} from './master-ab-auth-phase-fixture.mjs';
import {workflowFixture, routes, authKeys, selectors, copy, hash, manifest, installEnvelope, installLegacyStorage, faultRef, businessReads, assertReadOnly, get} from './scoped-workflow-read-benchmark.mjs';
import {roleProfiles, phaseFixture, requestFor, selectedPhase, healthyRoleOracle} from './scoped-read-permission-benchmark.mjs';

const definitions = [];
const register = (group, name, body) => definitions.push({group, name, body});
async function withFixture(options, body) {const f = await workflowFixture(options); try {return await body(f);} finally {f.close();}}
async function checkedGet(f, name, query = '', method = 'GET') {
  const before = f.row(), objects = [...f.objects]; f.reset();
  const result = await get(f, name, query, f.headers, method); assertReadOnly(f, before, objects); return result;
}
function noDTO(result) {assert.ok(result.status >= 400); assert.deepEqual(Object.keys(result.body), ['error'], 'no business DTO on rejection');}
function deniedSession(result, name) {noDTO(result); assert.equal(result.status, name === 'ipqc-c' ? 403 : 401); assert.equal(result.body.error, name === 'ipqc-c' ? 'FORBIDDEN' : 'LOGIN_REQUIRED');}
function permissionsOnly(name, query) {return name === 'ipqc-c' && new URLSearchParams(query).has('permissions');}
function expectedStatus(name, query) {
  const success = ['?permissions=1&versionId=missing', '?uiHistory=1&versionId=missing', '?legacyHistory=1&restoreSaveId=missing', '?history=cases&caseId=missing', '?caseId=ipqc-case&operationId=missing', '?availability=1&search-preview=1&preview=1&operationId=missing&export=missing', '?search-preview=1&preview=1&operationId=missing', '?preview=1&operationId=missing', '?operationId=routine-operation&export=missing'].includes(query);
  return success ? 200 : query.includes('before=missing') || query.includes('Before=missing') || query.includes('export=missing') ? 409 : query.includes('foreign') ? name === 'routine' ? 404 : 403 : query.includes('missing') ? 404 : 200;
}

for (const name of routes) for (const query of selectors[name]) register('selectors', name + ' exact selector fresh SQL ' + (query || '(normal)'), () => withFixture({}, async f => {
  const result = await checkedGet(f, name, query); assert.equal(result.status, expectedStatus(name, query), JSON.stringify(result.body));
  assert.equal(f.stats.state, 1); assert.equal(f.stats.revocation, permissionsOnly(name, query) ? 2 : 4); assert.equal(f.stats.sql, permissionsOnly(name, query) ? 3 : 5);
  if (permissionsOnly(name, query)) assert.deepEqual(businessReads(f), []);
}));

for (const name of routes) for (const profile of roleProfiles) register('roles', name + ' original policy parity ' + profile.id, async () => {
  const f = await phaseFixture(profile);
  try {
    const oracle = copy(await healthyRoleOracle(f, name));
    const state = await f.core.readState({keys: authKeys}), request = requestFor(f, name); state.deliveryOnly = true;
    assert.equal(state.recordStorage.partial, true);
    const phase = await f.core.createScopedWorkflowReadPermissionPhase(request, state);
    const keys = [...['view', 'edit', 'save', 'submit', 'withdraw', 'approve', 'return', 'create', 'delete', 'restore', 'settings'].map(op => name + '.' + op), 'approval.revoke', 'approval.revise', 'view:data', 'view:approval', 'users.view'];
    const old = []; for (const key of keys) old.push(await f.core.can(request, state, key));
    f.reset(); assert.deepEqual(keys.map(key => phase.allowed(key)), old); assert.equal(f.stats.sql, 0, 'evaluation is pure, not another identity read');
    const result = await checkedGet(f, name);
    if (oracle.view) {assert.equal(result.status, 200, JSON.stringify(result.body)); assert.deepEqual(result.body.permissions, oracle);}
    else {noDTO(result); assert.deepEqual(businessReads(f), []);}
    if (profile.id === 'view-settings-no-edit' && name === 'routine') {assert.equal(result.body.permissions.settings, true); assert.equal(result.body.permissions.edit, false);}
    if (profile.id === 'approve-no-revoke' && name === 'routine') {assert.equal(result.body.permissions.approve, true); assert.equal(result.body.permissions.revoke, false);}
    if (profile.id === 'admin-edit-explicit-deny' && name === 'routine') assert.equal(result.body.permissions.revise, false);
  } finally {f.close();}
});

for (const name of routes) for (const fence of [1, 2, 3, 4]) for (const failure of ['revoke', 'store-failure']) register('fences', name + ' fresh fence ' + fence + '/' + failure, () => withFixture({}, async f => {
  f.hooks.set('revocation.before', event => {if (event.count === fence) {if (failure === 'revoke') f.revoke(); else throw Error('SYNTHETIC_REVOCATION_STORE_FAILURE');}});
  deniedSession(await checkedGet(f, name), name); assert.equal(f.stats.revocation, fence);
  if (fence <= 2) assert.deepEqual(businessReads(f), []);
}));

for (const name of routes) for (const query of selectors[name]) register('terminal', name + ' terminal revocation covers selector ' + (query || '(normal)'), () => withFixture({}, async f => {
  const fence = permissionsOnly(name, query) ? 2 : 4;
  f.hooks.set('revocation.before', event => {if (event.count === fence) f.revoke();});
  deniedSession(await checkedGet(f, name, query), name); assert.equal(f.stats.revocation, fence);
}));

for (const name of routes) for (const query of name === 'ipqc-c' ? ['', '?permissions=1', '?caseId=missing', '?uiHistory=1&versionBefore=missing', '?operationId=ipqc-foreign', '?restoreSaveId=ipqc-save'] : ['', '?availability=1', '?preview=1', '?operationId=missing', '?export=missing']) register('terminal', name + ' terminal await rejection is caught ' + (query || '(normal)'), () => withFixture({}, async f => {
  const original = f.core.createScopedWorkflowReadPermissionPhase;
  f.core.createScopedWorkflowReadPermissionPhase = async (...args) => {
    const phase = await original(...args); let calls = 0;
    return Object.freeze({...phase, current: async () => {if (++calls === (permissionsOnly(name, query) ? 1 : 3)) throw Error('SYNTHETIC_TERMINAL_PORT_FAILURE'); return phase.current();}});
  };
  const result = await checkedGet(f, name, query); noDTO(result); assert.equal(result.status, 503); assert.equal(result.body.error, name === 'ipqc-c' ? 'WORKFLOW_LOAD_FAILED' : 'FQC_READ_FAILED');
}));

for (const name of routes) for (const position of ['first-business-get', 'last-business-get']) register('fences', name + ' revocation during ' + position, () => withFixture({}, async f => {
  // Discover the exact production read closure, outside the measured request.
  await checkedGet(f, name); const keys = businessReads(f), chosen = position === 'first-business-get' ? keys[0] : keys.at(-1); assert.ok(chosen);
  f.hooks.set('r2get.before', ({key}) => {if (key === chosen) f.revoke();});
  deniedSession(await checkedGet(f, name), name); assert.equal(f.stats.revocation, 3, 'post-body fresh fence refuses before route DTO');
}));

for (const name of routes) register('binding', name + ' exact request/state, frozen actor and pure phase', () => withFixture({}, async f => {
  const {request, state, phase, module} = await selectedPhase(f, name);
  assert.ok(Object.isFrozen(phase)); assert.ok(Object.isFrozen(phase.actor));
  assert.throws(() => {phase.actor.role = 'staff';}, TypeError); assert.throws(() => {phase.current = () => true;}, TypeError);
  assert.equal(module.scopedWorkflowPermissionPhase(request, state), phase);
  assert.throws(() => module.scopedWorkflowPermissionPhase(new Request(request), state), /REQUEST_MISMATCH/);
  assert.throws(() => module.scopedWorkflowPermissionPhase(request, {...state}), /MISSING_SCOPED_READ_PERMISSION_PHASE/);
  f.reset(); for (let i = 0; i < 50; i++) assert.equal(phase.allowed(name + '.view'), true); assert.equal(f.stats.sql, 0);
  assert.equal(await phase.current(), true); assert.equal(f.stats.revocation, 1);
  await assert.rejects(() => f.core.encodeValues({...state.values}, state), /delivery|partial|read.only/i);
}));

const credentialKeys = ['cookie', 'oai-authenticated-user-email', 'oai-authenticated-user-id', 'x-process-admin-id', 'x-process-admin-password'];
for (const name of routes) for (const pin of [...authKeys, 'revision', 'deliveryOnly', 'partial', ...credentialKeys.map(key => 'credential:' + key), 'method', 'url']) register('pins', name + ' phase refuses changed basis ' + pin, () => withFixture({}, async f => {
  const {request, state, phase} = await selectedPhase(f, name);
  if (authKeys.includes(pin)) state.values[pin] += ' ';
  else if (pin === 'revision') state.revision++;
  else if (pin === 'deliveryOnly') state.deliveryOnly = false;
  else if (pin === 'partial') state.recordStorage.partial = false;
  else if (pin.startsWith('credential:')) request.headers.set(pin.slice(11), 'synthetic-mutated-credential');
  else Object.defineProperty(request, pin, {value: pin === 'method' ? 'POST' : request.url + '&syntheticChanged=1'});
  f.reset(); assert.equal(phase.allowed(name + '.view'), false); assert.equal(await phase.current(), false); assert.equal(f.stats.sql, 0, 'invalid pinned basis never asks identity to bless another basis');
}));

for (const name of routes) register('binding', name + ' business-only same-state hydration does not change authority basis', () => withFixture({}, async f => {
  const {state, phase} = await selectedPhase(f, name); state.values.syntheticTarget = '{}'; f.reset();
  assert.equal(phase.allowed(name + '.view'), true); assert.equal(await phase.current(), true); assert.equal(f.stats.revocation, 1);
}));

for (const name of routes) for (const wrong of ['HEAD', 'POST', 'wrong-path', 'no-delivery-marker', 'not-partial']) register('binding', name + ' factory rejects unsupported scope ' + wrong, () => withFixture({}, async f => {
  const {state} = await selectedPhase(f, name); let request = requestFor(f, name, '', ['HEAD', 'POST'].includes(wrong) ? wrong : 'GET');
  if (wrong === 'wrong-path') request = new Request('https://fixture.invalid/api/master/workflow?scope=AB', {headers: f.headers});
  if (wrong === 'no-delivery-marker') delete state.deliveryOnly;
  if (wrong === 'not-partial') state.recordStorage.partial = false;
  f.reset(); await assert.rejects(() => f.core.createScopedWorkflowReadPermissionPhase(request, state), /INVALID_SCOPED_READ_PERMISSION_PHASE/); assert.equal(f.stats.sql, 0);
}));

for (const name of routes) register('binding', name + ' missing factory port fails closed without fallback body', () => withFixture({}, async f => {
  f.core.createScopedWorkflowReadPermissionPhase = undefined;
  const result = await checkedGet(f, name); noDTO(result); assert.equal(result.status, 503); assert.equal(f.stats.state, 1); assert.deepEqual(businessReads(f), []);
}));

for (const name of routes) register('binding', name + ' missing marked-scoped binding cannot fall back to ordinary permissions', () => withFixture({}, async f => {
  const reader = f.load('lib/scoped-workflow-read.ts'), original = reader.readScopedWorkflowState;
  reader.readScopedWorkflowState = async (...args) => ({...await original(...args)});
  const result = await checkedGet(f, name); noDTO(result); assert.equal(result.status, 503); assert.equal(f.stats.state, 1);
}));

for (const name of routes) register('isolation', name + ' independent requests have four fresh identities and no actor cache', () => withFixture({}, async f => {
  assert.equal((await checkedGet(f, name)).status, 200); assert.equal(f.stats.revocation, 4);
  assert.equal((await checkedGet(f, name)).status, 200); assert.equal(f.stats.revocation, 4);
  f.revoke(); deniedSession(await checkedGet(f, name), name); assert.equal(f.stats.revocation, 1); assert.deepEqual(businessReads(f), []);
}));

for (const name of routes) for (const change of ['view-revoked', 'auth-epoch']) register('snapshot', name + ' documented same-row authority boundary ' + change, () => withFixture({}, async f => {
  const businessKey = manifest(f).__processRecords.values[name === 'ipqc-c' ? 'ipqcCMasterControl' : 'routineFqcEnabled'].key;
  let changed = false;
  f.hooks.set('r2get.before', async ({key}) => {if (key === businessKey && !changed) {changed = true; await f.mutateValues(values => {const users = JSON.parse(values.platformUsers); if (change === 'view-revoked') users[0].accessOverrides[name + '.view'] = false; else users[0].authEpoch++; values.platformUsers = JSON.stringify(users);});}});
  f.reset(); const first = await get(f, name); assert.equal(changed, true); assert.equal(first.status, 200, 'same selected authority snapshot, not a fresh DB role lookup'); assert.equal(f.stats.state, 1); assert.equal(f.stats.revocation, 4); assert.equal(f.stats.cas, 0); assert.equal(f.stats.put, 0);
  f.hooks.clear(); const second = await checkedGet(f, name); noDTO(second); assert.deepEqual(businessReads(f), []);
}));

for (const name of routes) for (const mode of ['head', 'inline', 'legacy-r2', 'legacy-chunks', 'unsupported-envelope']) register('compatibility', name + ' legacy/HEAD never enters scoped phase ' + mode, () => withFixture({inline: mode === 'inline'}, async f => {
  if (mode.startsWith('legacy-')) await installLegacyStorage(f, mode);
  if (mode === 'unsupported-envelope') {const value = manifest(f); value.syntheticUnsupportedExtension = true; installEnvelope(f, value);}
  f.core.createScopedWorkflowReadPermissionPhase = () => {throw Error('LEGACY_MUST_NOT_CREATE_SCOPED_PHASE');};
  const result = await checkedGet(f, name, '', mode === 'head' ? 'HEAD' : 'GET'); assert.equal(result.status, 200, JSON.stringify(result.body));
  if (mode === 'head') {assert.equal(f.stats.sql, name === 'ipqc-c' ? 14 : 12); assert.equal(f.stats.get, 26);}
  const state = await f.core.readState(); assert.equal(f.load('lib/scoped-workflow-read.ts').scopedWorkflowPermissionPhase(requestFor(f, name), state), null);
}));

for (const name of routes) register('compatibility', name + ' HEAD preserves original unrelated-body integrity failure', () => withFixture({}, async f => {
  faultRef(f, manifest(f).__processRecords.values.toolingMasterControl, 'missing');
  const result = await checkedGet(f, name, '', 'HEAD'); noDTO(result); assert.equal(result.status, 503);
}));

for (const effect of ['create', 'delete', 'resurrect']) for (const allow of [false, true]) register('restore', 'ipqc-c restore ' + effect + '/grant=' + allow, () => withFixture({user: {role: 'staff', inheritRole: false, accessOverrides: {'ipqc-c.view': true, 'ipqc-c.edit': true, 'ipqc-c.restore': true, 'ipqc-c.create': allow, 'ipqc-c.delete': allow}}}, async f => {
  await f.mutateValues(values => {const c = JSON.parse(values.ipqcCMasterControl), saved = c.workflow.saves.find(s => s.id === 'ipqc-save');
    if (effect === 'create') saved.content.items.push({...copy(saved.content.items[0]), id: 'new-historical-item', code: 'C-C1-CUT-L1-02'});
    if (effect === 'delete') saved.content.items = [];
    if (effect === 'resurrect') c.workflow.working.items[0].deleted = true;
    values.ipqcCMasterControl = JSON.stringify(c);
  }, false);
  const result = await checkedGet(f, 'ipqc-c', '?restoreSaveId=ipqc-save'); assert.equal(result.status, allow ? 200 : 403, JSON.stringify(result.body));
  if (!allow) {noDTO(result); assert.equal(result.body.error, effect === 'delete' ? 'RESTORE_DELETE_PERMISSION_REQUIRED' : 'RESTORE_CREATE_PERMISSION_REQUIRED');}
  assert.equal(f.stats.sql, 5);
}));

register('restore', 'restore default checker keeps original can semantics while scoped checker is pure', () => withFixture({}, async f => {
  const {request, state, phase} = await selectedPhase(f, 'ipqc-c'), restore = f.load('lib/draft-restore-access.ts');
  const before = {items: [{id: 'a'}]}, after = {items: [{id: 'a'}, {id: 'b'}]};
  f.reset(); const original = copy(await restore.assertRestoreAccess(request, state, before, after)); assert.equal(f.stats.revocation, 4);
  f.reset(); const explicit = copy(await restore.assertRestoreAccess(request, state, before, after, key => f.core.can(request, state, key))); assert.equal(f.stats.revocation, 4); assert.deepEqual(explicit, original);
  f.reset(); assert.deepEqual(copy(await restore.assertRestoreAccess(request, state, before, after, phase.allowed)), original); assert.equal(f.stats.sql, 0);
}));

register('source', 'default POST and public-main AB/FQC phase bytes plus exact bidirectional integration proofs', () => {
  const ts = createRequire(import.meta.url)('typescript');
  // POST/can/evaluator are unchanged across the reviewed closure and public
  // main848. Its AB/FQC/common factory bytes are pinned independently below.
  // No private b625/8286 Git object is required by this test.
  const functionPins = {
    'app/api/ipqc-c/workflow/route.ts:POST': 'c796df75b51af0438db1c626010c6fac94d0fdf7d0f5462916b6b2addc4fe41c',
    'app/api/routine-fqc/route.ts:POST': 'a0c89e805307a75056433d46670a046b5108cc6f75b2f6730e13a3a1d545128f',
    'lib/process-state.ts:can': 'b7faedcbe468449997c8c2ec5b599207177ba556cb00c50607be4ef88f61c064',
    'lib/process-state.ts:permissionEvaluator': '383daa2feea1a5c4422416831875094a1f6a4b5f559da615c6c469286735d4ab',
    'lib/process-state.ts:createMasterABPermissionPhase': '260bd74dec943664fde8d435f47d04a6889fbc39100ac9c8a1943082f366d1d8',
    'lib/process-state.ts:createFqcPermissionPhase': '3b2ee39e45df5589354644c752d78f32da609b40a0b3d89a972512e7bf34fea5',
    'lib/process-state.ts:createWorkflowPermissionPhase': '0d5697c4be09ab22be034dd2615b92c83406a7a9388c206a72dac52818c88e9f',
  };
  const filePins = {
    'lib/state-records.ts': '2140595b11d54ae37ed979ae6d176bb739193ec3117da30023861a1346a7a6ce',
    // Parent maintained only exact new identity-count expectations after real REDs.
    // These two oracle files are pinned to that reviewed maintenance, not called unchanged.
    'tests/scoped-workflow-read.test.mjs': '743ee6e625119e004cafbc837c06630a31b27df505c1dc7b7b9b6caf233571f6',
    // Only explicit pinned main848 CLI/provenance and its proof dependency added.
    'tests/scoped-workflow-read-benchmark.mjs': 'af0bb4c474cd5f1669b5b93854fecf32d2097a523cead984aa050f37e743b403',
  };
  const now = file => fs.readFileSync(path.join(sourceRoot, file), 'utf8');
  const declaration = (file, text, name) => {const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true); const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name); assert.ok(node, name); return node.getText(ast);};
  for (const file of ['app/api/ipqc-c/workflow/route.ts', 'app/api/routine-fqc/route.ts']) {
    assert.equal(hash(declaration(file, now(file), 'POST')), functionPins[file + ':POST']);
    assert.ok(!declaration(file, now(file), 'GET').includes('recordJSONResponse'), 'buffered GET only; no streamed POST claim');
  }
  for (const name of ['can', 'permissionEvaluator', 'createMasterABPermissionPhase', 'createFqcPermissionPhase', 'createWorkflowPermissionPhase']) assert.equal(hash(declaration('lib/process-state.ts', now('lib/process-state.ts'), name)), functionPins['lib/process-state.ts:' + name]);
  for (const [file, expected] of Object.entries(filePins)) assert.equal(hash(now(file)), expected, file);
  // Preserve the complete older backend AND current public FQC program. A
  // whole-file pin is replaced by two exact whole-file projections, not removed.
  const integration = createRequire(import.meta.url)('../scripts/scoped-fqc-integration-source-contract.cjs');
  const projections = {
    'lib/process-state.ts': {slowWeb: '7c85447d20338e23811c1d041bd9b7bd0a39a5841e3b8ddc5616845d81c655f9', main848: 'a9ac65e8a0cac0b7346b88e7b33271aa0b10dcdf69ebd99c616c96a220d66937', negatives: 12},
    'lib/versioned-shared-workflow.ts': {slowWeb: '6381ddeac9dd0e7fde04a5265c4a41c6908074100fe56c470d5a86f49f9672b6', main848: 'cdcea56246d15e811cc5d648f475e33b6ee8a4bc291d0a17a431fa90de772c72', negatives: 28},
  };
  assert.deepEqual([...integration.integrationSourcePaths].sort((a,b)=>a<b?-1:a>b?1:0), Object.keys(projections).sort((a,b)=>a<b?-1:a>b?1:0));
  for (const [file, pins] of Object.entries(projections)) {
    const current = fs.readFileSync(path.join(sourceRoot, file));
    assert.equal(hash(integration.withoutFqcIntegration(file, current)), pins.slowWeb, file + ' exact 8286 bytes');
    assert.equal(hash(integration.withoutSlowWebIntegration(file, current)), pins.main848, file + ' exact public main848 bytes');
    assert.equal(integration.assertIntegratedSourceContract(file, current), pins.negatives);
  }
});

const shardText = process.env.PHASE_READ_SHARD, shard = shardText ? shardText.split('/').map(Number) : [1, 1];
assert.ok(shard.length === 2 && shard.every(Number.isSafeInteger) && shard[0] >= 1 && shard[0] <= shard[1] && shard[1] >= 1, 'PHASE_READ_SHARD must be n/total');
assert.equal(new Set(definitions.map(d => d.name)).size, definitions.length);
const selected = definitions.filter((_definition, index) => index % shard[1] === shard[0] - 1);
if (process.argv.includes('--manifest')) console.log(JSON.stringify({total: definitions.length, shard: shardText || 'all', all: definitions.map(({group, name}) => ({group, name})), selected: selected.map(d => d.name)}));
else for (const {name, body} of selected) test(name, body);
