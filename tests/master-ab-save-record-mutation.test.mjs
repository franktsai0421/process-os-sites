// Actual canonical Master AB Save handler and private record capability.
// Ephemeral synthetic fixtures only; no mock Save handler, socket or live data.
import nativeTest from 'node:test';
import assert from 'node:assert/strict';
import {saveFixture, copy, hash, manifest, aggregate, immutableRef, installEnvelope, assertUnrelatedPreserved, masterReads} from './master-ab-save-record-benchmark.mjs';

// Registration only: every original callback/assertion below remains unchanged.
// Fixtures are created inside each callback and closed by that callback's t.after.
const definitions = [];
function test(name, body) {definitions.push({name, body});}

function replaceRawAggregate(f, key, raw) {
  const envelope = manifest(f), sha256 = hash(raw), ref = {key: 'state-records/v1/' + sha256 + '.json', sha256};
  f.objects.set(ref.key, raw); envelope.__processRecords.values[key] = ref;
  if (key === 'platformUsers' || key === 'maintenanceMode') envelope[key] = raw;
  installEnvelope(f, envelope);
}
const checkNoWrite = (f, before, objects) => {
  assert.deepEqual(f.row(), before); assert.deepEqual([...f.objects], objects);
  assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
};
async function denied(f, headers = f.headers) {
  const before = f.row(), objects = [...f.objects]; f.reset();
  const reply = await f.request('POST', f.command('save', {expectedRevision: 3}), '', headers);
  assert.ok(reply.status >= 400, JSON.stringify(reply.body)); checkNoWrite(f, before, objects);
  assert.equal(masterReads(f), 0, 'authorization refusal must precede master aggregate GET');
  assert.equal(reply.body.control, undefined); assert.equal(reply.body.receipt, undefined);
  return reply;
}

test('canonical Save saves the whole AB working snapshot and preserves unrelated refs/bytes', async t => {
  const f = await saveFixture(); t.after(f.close);
  const before = f.row(), objects = [...f.objects], root = aggregate(f); f.reset();
  const reply = await f.request('POST', f.command('save', {expectedRevision: 3, reason: 'Synthetic manual save'}));
  assert.equal(reply.status, 200, JSON.stringify(reply.body)); assert.equal(reply.body.receipt.unchanged, false);
  assert.equal(reply.body.control.workflow.saved.content.products[0].name, 'Synthetic unsaved AB product');
  assert.equal(reply.body.control.workflow.saved.reason, 'Synthetic manual save');
  assert.equal(f.stats.state, 1, 'auth and target use one selected shared-state row');
  assert.equal(f.stats.cas, 1); assert.equal(f.stats.revision, 1);
  assertUnrelatedPreserved(f, before, objects);
  const after = aggregate(f);
  assert.deepEqual(after.active.C, root.active.C); assert.deepEqual(after.active.PROCESS, root.active.PROCESS);
  for (const key of ['toolingMasterControl', 'routineEquipmentControl', 'syntheticRetainedSentinel']) assert.ok(!f.events.some(e => e.name === 'r2get.before' && e.key === manifest(f).__processRecords.values[key].key), key + ' aggregate excluded');
});

test('Save-only permission remains sufficient without edit permission', async t => {
  const f = await saveFixture({user: {inheritRole: false, accessOverrides: {'ab.view': true, 'ab.save': true, 'ab.edit': false}}}); t.after(f.close);
  const reply = await f.request('POST', f.command('save', {expectedRevision: 3}));
  assert.equal(reply.status, 200, JSON.stringify(reply.body)); assert.equal(reply.body.receipt.unchanged, false);
});

for (const kind of ['no-cookie', 'forged-headers', 'revoked', 'disabled', 'deleted', 'epoch', 'no-view', 'no-save', 'maintenance', 'revocation-store-failure']) test('auth-first refusal: ' + kind + ' reads no master aggregate', async t => {
  const f = await saveFixture(); t.after(f.close);
  let headers = f.headers;
  if (kind === 'no-cookie') headers = {};
  if (kind === 'forged-headers') headers = {'oai-authenticated-user-id': 'forged', 'x-process-admin-id': 'frank'};
  if (kind === 'revoked') f.revoke();
  if (kind === 'revocation-store-failure') f.hooks.set('revocation.before', () => {throw Error('SYNTHETIC_REVOCATION_READ_FAILURE');});
  if (['disabled', 'deleted', 'epoch', 'no-view', 'no-save', 'maintenance'].includes(kind)) await f.mutateValues(values => {
    if (kind === 'maintenance') values.maintenanceMode = '1';
    else {
      const users = JSON.parse(values.platformUsers), user = users[0];
      if (kind === 'disabled') user.enabled = false;
      if (kind === 'deleted') user.deletedAt = '2026-10-31T12:00:01.000Z';
      if (kind === 'epoch') user.authEpoch++;
      if (kind === 'no-view') user.accessOverrides['ab.view'] = false;
      if (kind === 'no-save') user.accessOverrides['ab.save'] = false;
      values.platformUsers = JSON.stringify(users);
    }
  });
  await denied(f, headers);
});

for (const kind of ['missing', 'corrupt', 'malformed-json']) test('required auth aggregate ' + kind + ' does not fall back into business reads', async t => {
  const f = await saveFixture(); t.after(f.close);
  const key = manifest(f).__processRecords.values.platformUsers.key;
  if (kind === 'missing') f.objects.delete(key);
  if (kind === 'corrupt') f.objects.set(key, 'corrupt');
  if (kind === 'malformed-json') replaceRawAggregate(f, 'platformUsers', '{broken');
  await denied(f);
});

for (const primary of [false, true]) for (const key of ['processCustomRoles', 'processRoleTemplateOverrides', 'processAccessControl', 'maintenanceMode']) test('required authority valid-SHA malformed JSON fails before business reads: ' + key + ' primary=' + primary, async t => {
  const f = await saveFixture({primary}); t.after(f.close);
  replaceRawAggregate(f, key, '{broken');
  assert.equal(manifest(f).__processRecords.values[key].sha256, hash('{broken'));
  if (key === 'maintenanceMode') assert.equal(manifest(f).maintenanceMode, '{broken', 'matching mirror must not mask syntax validation');
  await denied(f);
});

for (const key of ['platformUsers', 'maintenanceMode']) for (const raw of ['{broken', 0, null, {}]) test('defined inline authority mirror cannot bypass syntax/type validation: ' + key + ' ' + JSON.stringify(raw), async t => {
  const f = await saveFixture(); t.after(f.close);
  const envelope = manifest(f); envelope[key] = raw; installEnvelope(f, envelope);
  await denied(f);
});

for (const target of ['master-aggregate', 'ab-active', 'ab-working', 'master-c', 'master-process']) for (const kind of ['missing', 'corrupt']) test('required ' + target + ' ' + kind + ' stays fail-closed without writes', async t => {
  const f = await saveFixture(); t.after(f.close);
  const key = target === 'master-aggregate' ? manifest(f).__processRecords.values.masterDataControl.key
    : immutableRef(f, model => target === 'ab-active' ? model.active.AB : target === 'master-c' ? model.active.C : target === 'master-process' ? model.active.PROCESS : model.workflowScopes.AB.working).key;
  if (kind === 'missing') f.objects.delete(key); else f.objects.set(key, 'corrupt');
  const before = f.row(), objects = [...f.objects]; f.reset();
  const reply = await f.request('POST', f.command('save', {expectedRevision: 3}));
  assert.ok(reply.status >= 400, JSON.stringify(reply.body)); checkNoWrite(f, before, objects);
});

for (const target of ['aggregate', 'body']) for (const kind of ['missing', 'corrupt', 'malformed-json']) test('approved unrelated-fault isolation: ' + target + ' ' + kind + ' remains referenced but does not block AB Save', async t => {
  const f = await saveFixture(); t.after(f.close);
  const key = 'toolingMasterControl';
  if (target === 'aggregate') {
    const ref = manifest(f).__processRecords.values[key];
    if (kind === 'missing') f.objects.delete(ref.key);
    else if (kind === 'corrupt') f.objects.set(ref.key, 'corrupt');
    else replaceRawAggregate(f, key, '{broken');
  } else {
    const ref = immutableRef(f, model => model.versions[0].snapshot, key);
    if (kind === 'missing') f.objects.delete(ref.key);
    else if (kind === 'corrupt') f.objects.set(ref.key, 'corrupt');
    else {
      const raw = '{broken', sha256 = hash(raw), next = {key: 'state-records/v1/' + sha256 + '.json', sha256};
      f.objects.set(next.key, raw); const model = aggregate(f, key); model.versions[0].snapshot = {__immutableBody: next}; replaceRawAggregate(f, key, JSON.stringify(model));
    }
  }
  const before = f.row(), objects = [...f.objects]; f.reset();
  const reply = await f.request('POST', f.command('save', {expectedRevision: 3}));
  assert.equal(reply.status, 200, JSON.stringify(reply.body)); assertUnrelatedPreserved(f, before, objects);
  assert.ok(!f.events.some(e => e.name === 'r2get.before' && e.key === JSON.parse(before.values).__processRecords.values[key].key));
});

test('same-ID Save replay returns the original receipt without another write', async t => {
  const f = await saveFixture(); t.after(f.close);
  const command = f.command('save', {expectedRevision: 3}), saved = await f.request('POST', command);
  assert.equal(saved.status, 200);
  const before = f.row(), objects = [...f.objects]; f.reset();
  const replay = await f.request('POST', command);
  assert.equal(replay.status, 200); assert.equal(replay.body.unchanged, true);
  assert.deepEqual(replay.body.receipt, saved.body.receipt); checkNoWrite(f, before, objects);
});

test('unchanged Save keeps the successful snapshot and still records the new operation', async t => {
  const f = await saveFixture({saved: true}); t.after(f.close);
  const before = copy(await f.decoded()), root = JSON.parse(before.masterDataControl); f.reset();
  const reply = await f.request('POST', f.command('save', {expectedRevision: 3}));
  assert.equal(reply.status, 200); assert.equal(reply.body.receipt.unchanged, true);
  assert.equal(reply.body.receipt.savedId, 'synthetic-current-save');
  const after = JSON.parse((await f.decoded()).masterDataControl);
  assert.equal(after.workflowScopes.AB.saves.length, root.workflowScopes.AB.saves.length);
  assert.equal(after.workflowScopes.AB.revision, root.workflowScopes.AB.revision);
});

for (const pinned of [false, true]) test('CAS retry reselects current working with expectedRevision pin=' + pinned, async t => {
  const f = await saveFixture(); t.after(f.close);
  let changed = false;
  f.hooks.set('cas.before', async () => {
    if (changed) return; changed = true;
    await f.mutateValues(values => {const root = JSON.parse(values.masterDataControl), flow = root.workflowScopes.AB; flow.working.products[0].name = 'Synthetic concurrent working'; flow.revision++; values.masterDataControl = JSON.stringify(root);});
  });
  const reply = await f.request('POST', f.command('save', pinned ? {expectedRevision: 3} : {}));
  assert.equal(changed, true); assert.equal(reply.status, pinned ? 409 : 200, JSON.stringify(reply.body));
  assert.equal(f.stats.state, 2, 'retry must select another row and authorization phase');
  if (!pinned) assert.equal(reply.body.control.workflow.saved.content.products[0].name, 'Synthetic concurrent working');
  else assert.equal(reply.body.error, 'DRAFT_REVISION_CHANGED_RECONFIRM');
});

test('late failed acknowledgement remains recoverable by operation receipt GET, without resending Save', async t => {
  const f = await saveFixture(); t.after(f.close);
  const command = f.command('save', {expectedRevision: 3}); let committed = false;
  f.hooks.set('cas.after', event => {if (!committed && event.result.changes === 1) {committed = true; throw Error('SYNTHETIC_RESULT_LOST_AFTER_COMMIT');}});
  const reply = await f.request('POST', command); assert.equal(committed, true); assert.equal(reply.status, 500);
  f.hooks.delete('cas.after'); const before = f.row(); f.reset();
  const receipt = await f.request('GET', undefined, '&operationId=' + command.operationId);
  assert.equal(receipt.status, 200); assert.equal(receipt.body.receipt.operationId, command.operationId);
  assert.deepEqual(f.row(), before); assert.equal(f.stats.cas, 0); assert.equal(f.stats.put, 0);
});

for (const gate of [1, 2, 3, 4, 5]) test('Save fresh revocation gate ' + gate + ' cannot commit or disclose control', async t => {
  const f = await saveFixture(); t.after(f.close);
  const before = f.row(), objects = [...f.objects]; let reached = false;
  f.hooks.set('revocation.before', event => {if (event.count === gate) {reached = true; f.revoke();}});
  const reply = await f.request('POST', f.command('save', {expectedRevision: 3}));
  assert.equal(reached, true); assert.equal(reply.status, 401); assert.deepEqual(f.row(), before); assert.equal(f.stats.cas, 0);
  assert.equal(reply.body.control, undefined); assert.equal(reply.body.receipt, undefined);
  for (const [key, raw] of objects) assert.equal(f.objects.get(key), raw, 'old immutable bytes retained');
  if (gate <= 2) assert.equal(masterReads(f), 0, 'pre-business fresh gate denies before master');
  if (gate < 5) assert.equal(f.stats.put, 0);
  // The final gate follows encoding; unreferenced immutable PUTs may already
  // exist, but no CAS may publish them after logout/revocation.
});

test('Save exhausted CAS retries never publishes an unconfirmed receipt', async t => {
  const f = await saveFixture(); t.after(f.close);
  f.hooks.set('cas.before', () => {f.sqlite.prepare('UPDATE shared_state SET revision=revision+1 WHERE id=1').run();});
  const original = JSON.parse(f.row().values), reply = await f.request('POST', f.command('save', {expectedRevision: 3}));
  assert.equal(reply.status, 409); assert.equal(f.stats.cas, 4); assert.equal(f.stats.state, 4);
  assert.deepEqual(JSON.parse(f.row().values), original); assert.equal(reply.body.receipt, undefined);
});

async function capability(f, authorize = async () => {}) {
  return f.codec.readMasterABSaveRecordMutation(f.env.STATE_ARCHIVE, manifest(f), f.row().revision, authorize);
}
const modelOf = selected => selected.state.recordStorage.models.get('masterDataControl');
async function encodeCapability(f, selected, model = modelOf(selected), changes = {}) {
  const state = selected.state;
  return f.codec.encodeMasterABSaveRecordMutation(changes.bucket || f.env.STATE_ARCHIVE,
    changes.handle || selected.handle, changes.revision ?? state.revision,
    changes.values || {...state.values}, changes.storage || state.recordStorage, model);
}

test('private reader authorizes after auth5 and before master, retaining exactly the same State object', async t => {
  const f = await saveFixture(); t.after(f.close); f.reset();
  let authorizedState;
  const selected = await capability(f, async state => {
    authorizedState = state;
    assert.deepEqual(Object.keys(state.values).sort(), ['maintenanceMode', 'platformUsers', 'processAccessControl', 'processCustomRoles', 'processRoleTemplateOverrides'].sort());
    assert.equal(masterReads(f), 0); assert.equal(state.revision, f.row().revision);
  });
  assert.ok(selected); assert.equal(selected.state, authorizedState);
  assert.ok(modelOf(selected)); assert.equal(selected.state.recordStorage.partial, true);
  assert.equal(masterReads(f), 1);
});

test('private authorization callback rejection never reads master or writes records', async t => {
  const f = await saveFixture(); t.after(f.close); f.reset();
  await assert.rejects(capability(f, async () => {throw Error('SYNTHETIC_AUTHORIZATION_DENIED');}), /SYNTHETIC_AUTHORIZATION_DENIED/);
  assert.equal(masterReads(f), 0); assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
});

for (const kind of ['revision', 'values-identity', 'authority-value', 'known', 'original-values', 'partial', 'models', 'allocations']) test('authorization await cannot alter its selected authority basis: ' + kind, async t => {
  const f = await saveFixture(); t.after(f.close); f.reset();
  await assert.rejects(capability(f, async state => {
    if (kind === 'revision') state.revision++;
    if (kind === 'values-identity') state.values = {...state.values};
    if (kind === 'authority-value') state.values.platformUsers = '[]';
    if (kind === 'known') state.recordStorage.known.add('a'.repeat(64));
    if (kind === 'original-values') state.recordStorage.originalValues.platformUsers = '[]';
    if (kind === 'partial') state.recordStorage.partial = false;
    if (kind === 'models') state.recordStorage.models.set('masterDataControl', {});
    if (kind === 'allocations') state.recordStorage.allocations.set('masterDataControl', {});
  }), /authorization basis changed/);
  assert.equal(masterReads(f), 0); assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
});

test('canonical command classifier does not admit other actions or caller-selected scope fields', async t => {
  const f = await saveFixture(); t.after(f.close);
  const helper = f.load('lib/master-ab-save-record-mutation.ts'), command = f.command('save', {expectedRevision: 3});
  assert.equal(helper.masterABSaveCommand(command), true);
  for (const changes of [{action: 'apply'}, {action: 'submit'}, {patches: []}, {caseId: 'history'}, {keys: ['masterDataControl']}, {operationId: 'x'}, {clientId: 'x'}, {sequence: 0}, {expectedRevision: -1}, {reason: 1}, {source: false}]) assert.equal(helper.masterABSaveCommand({...command, ...changes}), false);
});

test('high-level wrapper pins command across read/authorization awaits', async t => {
  const f = await saveFixture(); t.after(f.close);
  const helper = f.load('lib/master-ab-save-record-mutation.ts'), command = f.command('save', {expectedRevision: 3}); f.reset();
  await assert.rejects(helper.readMasterABSaveMutationState(command, async () => {command.action = 'apply';}), /Master Save command changed/);
  assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
});

test('high-level wrapper rechecks command before encoding', async t => {
  const f = await saveFixture(); t.after(f.close);
  const helper = f.load('lib/master-ab-save-record-mutation.ts'), command = f.command('save', {expectedRevision: 3});
  const state = await helper.readMasterABSaveMutationState(command, async () => {}); assert.ok(state);
  command.source = 'Changed after selection'; f.reset();
  await assert.rejects(helper.encodeMasterABSaveMutationState(state, {...state.values}, new Map([['masterDataControl', state.recordStorage.models.get('masterDataControl')]])), /Invalid master AB Save mutation state/);
  assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
});

test('ordinary encoder still rejects selected Save state; opaque handle is single-use', async t => {
  const f = await saveFixture(); t.after(f.close);
  const selected = await capability(f); assert.ok(selected); f.reset();
  await assert.rejects(f.core.encodeValues(selected.state.values, selected.state), /Partial read cannot be saved/);
  assert.equal(f.stats.put, 0);
  const encoded = await encodeCapability(f, selected);
  assert.deepEqual(JSON.parse(encoded), manifest(f), 'unchanged capability encode preserves the exact manifest values');
  await assert.rejects(encodeCapability(f, selected), /Invalid .*Save mutation/);
});

for (const kind of ['forged-handle', 'bucket', 'revision', 'manifest-ref', 'legacy-sources', 'allocation-ref', 'mirror', 'values', 'original-values', 'known', 'models', 'allocations']) test('private capability refuses ' + kind + ' tampering before PUT', async t => {
  const f = await saveFixture(); t.after(f.close);
  const selected = await capability(f); assert.ok(selected);
  const state = selected.state, model = modelOf(selected), changes = {};
  if (kind === 'forged-handle') changes.handle = {};
  if (kind === 'bucket') changes.bucket = {...f.env.STATE_ARCHIVE};
  if (kind === 'revision') changes.revision = state.revision + 1;
  if (kind === 'manifest-ref') state.recordStorage.envelope.__processRecords.values.syntheticRetainedSentinel = {key: 'foreign', sha256: 'a'.repeat(64)};
  if (kind === 'legacy-sources') state.recordStorage.envelope.__processRecords.legacySources.syntheticRetainedSentinel = {key: 'foreign', sha256: 'a'.repeat(64)};
  if (kind === 'allocation-ref') state.recordStorage.envelope.__processRecords.allocations = {};
  if (kind === 'mirror') state.recordStorage.envelope.platformUsers = '[]';
  if (kind === 'values') changes.values = {...state.values, syntheticRetainedSentinel: '"injected"'};
  if (kind === 'original-values') state.recordStorage.originalValues.platformUsers = '[]';
  if (kind === 'known') state.recordStorage.known.add('a'.repeat(64));
  if (kind === 'models') state.recordStorage.models.clear();
  if (kind === 'allocations') state.recordStorage.allocations.set('masterDataControl', {});
  f.reset(); await assert.rejects(encodeCapability(f, selected, model, changes), /Invalid .*Save mutation/);
  assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
});

for (const kind of ['ab-working', 'ab-flow-active', 'c-active', 'process-active', 'c-workflow', 'other-version', 'old-save', 'old-case', 'foreign-body']) test('Save capability cannot mutate immutable or unrelated model region: ' + kind, async t => {
  const f = await saveFixture(); t.after(f.close);
  const selected = await capability(f); assert.ok(selected); const model = modelOf(selected);
  if (kind === 'ab-working') model.workflowScopes.AB.working.products[0].name = 'Unauthorized working change';
  if (kind === 'ab-flow-active') model.workflowScopes.AB.active.content.products[0].name = 'Unauthorized active change';
  if (kind === 'c-active') model.active.C = {products: [], lines: [], categoryGroups: [], injected: true};
  if (kind === 'process-active') model.active.PROCESS.injected = [];
  if (kind === 'c-workflow') model.workflowScopes.C = {injected: true};
  if (kind === 'other-version') model.versions.push({id: 'foreign-scope-version', scope: 'C', status: 'draft', snapshot: {injected: true}});
  if (kind === 'old-save') model.workflowScopes.AB.saves[0].reason = 'Unauthorized history rewrite';
  if (kind === 'old-case') model.workflowScopes.AB.cases[0].reason = 'Unauthorized case rewrite';
  if (kind === 'foreign-body') model.workflowScopes.AB.working = {__immutableBody: immutableRef(f, root => root.versions[0].snapshot, 'toolingMasterControl')};
  f.reset(); await assert.rejects(encodeCapability(f, selected, model), /Invalid .*Save mutation|Untrusted immutable/);
  assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
});

for (const kind of ['saved', 'contributors', 'revision']) test('Save capability without appended save cannot change ' + kind, async t => {
  const f = await saveFixture(); t.after(f.close);
  const selected = await capability(f), model = modelOf(selected), flow = model.workflowScopes.AB;
  const length = flow.saves.length;
  if (kind === 'saved') flow.saved = {...flow.saved, reason: 'Unauthorized current saved replacement'};
  if (kind === 'contributors') flow.contributors = {};
  if (kind === 'revision') flow.revision++;
  assert.equal(flow.saves.length, length);
  f.reset(); await assert.rejects(encodeCapability(f, selected, model), /Invalid .*Save (mutation|snapshot)/);
  assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
});

for (const kind of ['revision', 'contributors', 'saved-pointer', 'content']) test('Save capability rejects malformed appended save: ' + kind, async t => {
  const f = await saveFixture(); t.after(f.close);
  const selected = await capability(f), model = modelOf(selected), flow = model.workflowScopes.AB;
  const saved = {id: 'synthetic-private-save', revision: flow.revision, content: copy(flow.working), contributors: copy(flow.contributors)};
  flow.saved = saved; flow.saves.push(saved); flow.revision++; flow.contributors = {};
  if (kind === 'revision') flow.revision--;
  if (kind === 'contributors') flow.contributors = {injected: true};
  if (kind === 'saved-pointer') flow.saved = {...saved, id: 'different-save'};
  if (kind === 'content') saved.content.products[0].name = 'Not the working snapshot';
  f.reset(); await assert.rejects(encodeCapability(f, selected, model), /Invalid .*Save (mutation|snapshot)/);
  assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
});

for (const kind of ['delete-receipt', 'fingerprint', 'foreign-sequence', 'own-sequence-wrong', 'own-sequence-lower', 'foreign-operation', 'foreign-actor', 'receipt-no-sequence', 'multiple-receipts', 'unbound-receipt', 'unbound-sequence', 'mutated-operation-object']) test('Save capability pins receipt history and verified operation: ' + kind, async t => {
  const f = await saveFixture(); t.after(f.close);
  const oldCommand = f.command('save', {expectedRevision: 3}), first = await f.request('POST', oldCommand);
  assert.equal(first.status, 200);
  const command = f.command('save'), operation = {actorId: f.user.id, clientId: command.clientId, sequence: command.sequence, operationId: command.operationId};
  const selected = await capability(f, async () => kind.startsWith('unbound-') ? undefined : operation), model = modelOf(selected), flow = model.workflowScopes.AB;
  const client = JSON.stringify([f.user.id, command.clientId]), foreignClient = JSON.stringify(['another-actor', command.clientId]);
  const receipt = {actorId: f.user.id, fingerprint: 'synthetic-noncredential-command-fingerprint', result: {...copy(first.body.receipt), operationId: command.operationId}};
  if (kind === 'delete-receipt') delete flow.receipts[oldCommand.operationId];
  if (kind === 'fingerprint') flow.receipts[oldCommand.operationId].fingerprint = 'tampered';
  if (kind === 'foreign-sequence') flow.sequences[foreignClient] = command.sequence;
  if (kind === 'own-sequence-wrong') flow.sequences[client] = command.sequence + 1;
  if (kind === 'own-sequence-lower') flow.sequences[client] = 0;
  if (['foreign-operation', 'foreign-actor', 'receipt-no-sequence', 'multiple-receipts', 'unbound-receipt', 'mutated-operation-object'].includes(kind)) {
    const key = kind === 'foreign-operation' ? 'synthetic-foreign-operation' : command.operationId;
    if (kind === 'foreign-actor') receipt.actorId = 'another-actor';
    if (kind === 'mutated-operation-object') {operation.actorId = 'another-actor'; receipt.actorId = operation.actorId;}
    flow.receipts[key] = receipt;
    if (kind === 'multiple-receipts') flow.receipts['synthetic-second-operation'] = copy(receipt);
    if (kind !== 'receipt-no-sequence') flow.sequences[client] = command.sequence;
  }
  if (kind === 'unbound-sequence') flow.sequences[client] = command.sequence;
  f.reset(); await assert.rejects(encodeCapability(f, selected, model), /[Mm]aster Save/);
  assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0);
});

test('actual Save advances only its verified actor-client sequence and preserves old receipt replay', async t => {
  const f = await saveFixture(); t.after(f.close);
  const foreign = JSON.stringify(['another-actor', 'synthetic-client']);
  await f.mutateValues(values => {const root = JSON.parse(values.masterDataControl); root.workflowScopes.AB.sequences[foreign] = 11; values.masterDataControl = JSON.stringify(root);});
  const firstCommand = f.command('save', {expectedRevision: 3}), first = await f.request('POST', firstCommand); assert.equal(first.status, 200);
  const firstFlow = JSON.parse((await f.decoded()).masterDataControl).workflowScopes.AB, originalReceipt = copy(firstFlow.receipts[firstCommand.operationId]);
  const nextCommand = f.command('save', {expectedRevision: 4}), next = await f.request('POST', nextCommand); assert.equal(next.status, 200);
  assert.equal(next.body.receipt.unchanged, true);
  const flow = JSON.parse((await f.decoded()).masterDataControl).workflowScopes.AB;
  assert.deepEqual(flow.receipts[firstCommand.operationId], originalReceipt);
  assert.equal(flow.sequences[JSON.stringify([f.user.id, nextCommand.clientId])], nextCommand.sequence);
  assert.equal(flow.sequences[foreign], 11); assert.equal(flow.receipts[nextCommand.operationId].actorId, f.user.id);
  const before = f.row(); f.reset(); const replay = await f.request('POST', firstCommand);
  assert.equal(replay.status, 200); assert.deepEqual(replay.body.receipt, first.body.receipt);
  assert.deepEqual(f.row(), before); assert.equal(f.stats.cas, 0); assert.equal(f.stats.put, 0);
});

// Default invocation still registers all 113 cases. Bounded CI shards register
// each assigned case exactly once; no skip/todo or conditionally absent assertions.
const shardText = process.env.MASTER_AB_SAVE_SHARD, shard = shardText ? shardText.split('/').map(Number) : [1, 1];
assert.ok(shard.length === 2 && shard.every(Number.isSafeInteger) && shard[0] >= 1 && shard[0] <= shard[1] && shard[1] >= 1);
assert.equal(definitions.length, 113); assert.equal(new Set(definitions.map(d => d.name)).size, 113);
const order = process.env.MASTER_AB_SAVE_TEST_ORDER || 'declared'; assert.ok(['declared', 'reverse'].includes(order));
const selected = definitions.filter((_definition, index) => index % shard[1] === shard[0] - 1);
if (order === 'reverse') selected.reverse();
if (process.argv.includes('--manifest')) console.log(JSON.stringify({total: definitions.length, shard: shardText || 'all', order, all: definitions.map(({name}) => ({group: 'master-ab-save', name})), selected: selected.map(d => d.name)}));
else for (const {name, body} of selected) void nativeTest(name, body);
