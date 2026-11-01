// Production GET handlers and the server-only reader; no mock route, listener,
// employee data, persistent signer, browser or live bindings.
import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowFixture, routes, authKeys, businessKeys, selectors, copy, hash, manifest, aggregate, installEnvelope, replaceRawAggregate, replaceAggregate, installLegacyStorage, faultRef, reads, businessReads, assertReadOnly, get, routePath} from './scoped-workflow-read-benchmark.mjs';

const definitions = [];
function register(group, name, body) {definitions.push({group, name, body});}
async function withFixture(options, body) {
  const f = await workflowFixture(options);
  try {return await body(f);} finally {f.close();}
}
async function checkedGet(f, name, query = '', headers = f.headers) {
  const before = f.row(), objects = [...f.objects]; f.reset();
  const result = await get(f, name, query, headers); assertReadOnly(f, before, objects);
  return result;
}
function noDTO(result) {
  assert.ok(result.status >= 400, JSON.stringify(result));
  assert.deepEqual(Object.keys(result.body), ['error'], 'denials must not disclose business DTOs');
}
async function denied(f, name, query = '', headers = f.headers) {
  const result = await checkedGet(f, name, query, headers); noDTO(result);
  assert.deepEqual(businessReads(f), [], 'denial must precede every business aggregate/body GET');
  return result;
}
function requiredReferenceKeys(f, keys) {
  const refs = new Set(), envelope = manifest(f);
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.__immutableBody?.key) follow(value.__immutableBody.key);
    for (const child of Object.values(value)) visit(child);
  }
  function follow(key) {
    if (refs.has(key)) return; refs.add(key);
    const raw = f.objects.get(key); if (raw !== undefined) {try {visit(JSON.parse(raw));} catch { /* This is a read-set oracle, not an integrity decoder. */ }}
  }
  for (const key of keys) if (envelope.__processRecords.values[key]) follow(envelope.__processRecords.values[key].key);
  return refs;
}
function makeRef(f, raw) {const sha256 = hash(raw), ref = {key: 'state-records/v1/' + sha256 + '.json', sha256}; f.objects.set(ref.key, raw); return ref;}
async function helper(f, name, query = '') {
  return f.load('lib/scoped-workflow-read.ts').readScopedWorkflowState(new Request('https://fixture.invalid/api/' + routePath(name) + query, {headers: f.headers}), name === 'ipqc-c' ? 'ipqc-c-workflow' : 'routine-fqc');
}

for (const name of routes) for (const query of selectors[name]) register('selectors', name + ' selector and precedence ' + (query || '(normal)'), () => withFixture({}, async f => {
  const result = await checkedGet(f, name, query);
  const precedenceSuccess = ['?permissions=1&versionId=missing', '?uiHistory=1&versionId=missing', '?legacyHistory=1&restoreSaveId=missing', '?history=cases&caseId=missing', '?caseId=ipqc-case&operationId=missing', '?availability=1&search-preview=1&preview=1&operationId=missing&export=missing', '?search-preview=1&preview=1&operationId=missing', '?preview=1&operationId=missing', '?operationId=routine-operation&export=missing'].includes(query);
  const expected = precedenceSuccess ? 200 : query.includes('before=missing') || query.includes('Before=missing') ? 409 : query.includes('export=missing') ? 409 : query.includes('foreign') ? name === 'routine' ? 404 : 403 : query.includes('missing') ? 404 : 200;
  assert.equal(result.status, expected, query + ': ' + JSON.stringify(result.body));
  assert.equal(f.stats.state, 1, 'one selected D1 snapshot');
  const required = new Set([...authKeys, ...(name === 'ipqc-c' && query.includes('permissions=1') ? [] : businessKeys[name])]);
  const requiredRefs = requiredReferenceKeys(f, required);
  // Content-addressed aliasing can make an excluded aggregate's bytes equal a
  // required target body (e.g. processMasterData and master.active.PROCESS).
  // Such an identical key is required I/O, not an unrelated module read.
  for (const [key, ref] of Object.entries(manifest(f).__processRecords.values)) if (!required.has(key) && !requiredRefs.has(ref.key)) assert.ok(!reads(f).includes(ref.key), 'excluded aggregate ' + key);
  if (name === 'ipqc-c' && query.includes('permissions=1')) assert.deepEqual(businessReads(f), []);
  if (!query) {
    if (name === 'ipqc-c') assert.equal(result.body.workflow.working.items[0].id, 'item-c');
    else {assert.equal(result.body.sources[0].id, 'routine-item'); assert.equal(result.body.sources[0].products[0].code, 'A1'); assert.equal(result.body.control.receipts['routine-operation'], undefined);}
  }
}));

for (const name of routes) register('scope', name + ' ignores caller-supplied scope/projection/keys', () => withFixture({}, async f => {
  const normal = await checkedGet(f, name), explicit = await checkedGet(f, name, '?keys=toolingMasterControl&modelKey=toolingMasterControl&effectiveOnly=1&scope=other');
  assert.deepEqual(explicit, normal);
  assert.ok(!reads(f).includes(manifest(f).__processRecords.values.toolingMasterControl.key));
}));

for (const name of routes) for (const kind of ['no-cookie', 'forged-headers', 'revoked', 'disabled', 'deleted', 'epoch', 'no-view', 'revocation-store-failure']) register('denials', name + ' auth-first zero-business refusal ' + kind, () => withFixture({}, async f => {
  let headers = f.headers;
  if (kind === 'no-cookie') headers = {};
  if (kind === 'forged-headers') headers = {'oai-authenticated-user-id': 'forged', 'x-process-admin-id': 'frank'};
  if (kind === 'revoked') f.revoke();
  if (kind === 'revocation-store-failure') f.hooks.set('revocation.before', () => {throw Error('SYNTHETIC_REVOCATION_FAILURE');});
  if (['disabled', 'deleted', 'epoch', 'no-view'].includes(kind)) await f.mutateValues(values => {
    const users = JSON.parse(values.platformUsers);
    if (kind === 'disabled') users[0].enabled = false;
    if (kind === 'deleted') users[0].deletedAt = '2026-10-31T12:00:01.000Z';
    if (kind === 'epoch') users[0].authEpoch++;
    if (kind === 'no-view') users[0].accessOverrides[name + '.view'] = false;
    values.platformUsers = JSON.stringify(users);
  }, false);
  await denied(f, name, '', headers);
}));

for (const name of routes) for (const key of authKeys) for (const fault of ['missing', 'corrupt', 'malformed-json']) register('authority', name + ' required authority ' + key + '/' + fault, () => withFixture({}, async f => {
  if (fault === 'malformed-json') replaceRawAggregate(f, key, '{broken');
  else faultRef(f, manifest(f).__processRecords.values[key], fault);
  await denied(f, name);
}));

for (const name of routes) for (const key of ['platformUsers', 'maintenanceMode']) for (const raw of ['{broken', 0, null, {}]) register('authority', name + ' invalid inline authority ' + key + '/' + JSON.stringify(raw), () => withFixture({}, async f => {
  const envelope = manifest(f); envelope[key] = raw; installEnvelope(f, envelope); await denied(f, name);
}));

for (const name of routes) for (const key of authKeys) register('authority', name + ' authority cannot smuggle body I/O ' + key, () => withFixture({}, async f => {
  const ref = makeRef(f, JSON.stringify({private: 'Synthetic authority must not hydrate this body'}));
  replaceRawAggregate(f, key, JSON.stringify({__immutableBody: ref}));
  await denied(f, name); assert.ok(!reads(f).includes(ref.key));
}));

for (const name of routes) for (const kind of ['user-name', 'role-description']) register('authority', name + ' legitimate literal __immutableBody in ' + kind + ' is not a storage reference', () => withFixture({user: kind === 'user-name' ? {name: '__immutableBody'} : undefined, values: kind === 'role-description' ? {processRoleTemplateOverrides: JSON.stringify({admin: {description: '__immutableBody'}})} : undefined}, async f => {
  assert.equal((await checkedGet(f, name)).status, 200);
}));
for (const name of routes) register('authority', name + ' nested genuine authority reference is refused without body I/O', () => withFixture({}, async f => {
  const ref = makeRef(f, JSON.stringify({private: 'Synthetic nested authority body'}));
  replaceRawAggregate(f, 'processAccessControl', JSON.stringify({audit: [{details: {__immutableBody: ref}}]}));
  await denied(f, name); assert.ok(!reads(f).includes(ref.key));
}));

for (const name of routes) for (const primary of [false, true]) register('authority', name + ' strict malformed role JSON also fails for primary=' + primary, () => withFixture({primary}, async f => {
  replaceRawAggregate(f, 'processRoleTemplateOverrides', '{broken'); await denied(f, name);
}));

for (const name of routes) for (const override of ['0', '1', undefined]) register('defaults', name + ' legal maintenance inline override ' + override, () => withFixture({}, async f => {
  const envelope = manifest(f);
  if (override === undefined) delete envelope.maintenanceMode; else envelope.maintenanceMode = override;
  installEnvelope(f, envelope);
  assert.equal((await checkedGet(f, name)).status, 200, 'GET has no maintenance write gate');
}));

for (const name of routes) for (const kind of ['absent', 'stale']) register('defaults', name + ' optional platform mirror ' + kind + ' never supplies authority', () => withFixture({}, async f => {
  const envelope = manifest(f); if (kind === 'absent') delete envelope.platformUsers; else envelope.platformUsers = '[]'; installEnvelope(f, envelope);
  assert.equal((await checkedGet(f, name)).status, 200);
}));
for (const name of routes) register('authority', name + ' valid inline platform mirror cannot replace an absent authority aggregate', () => withFixture({}, async f => {
  const envelope = manifest(f); delete envelope.__processRecords.values.platformUsers; installEnvelope(f, envelope); await denied(f, name);
}));

for (const name of routes) register('defaults', name + ' absent optional role/access authority keeps legacy defaults', () => withFixture({}, async f => {
  const envelope = manifest(f); for (const key of ['processCustomRoles', 'processRoleTemplateOverrides', 'processAccessControl', 'maintenanceMode']) delete envelope.__processRecords.values[key]; delete envelope.maintenanceMode; installEnvelope(f, envelope);
  assert.equal((await checkedGet(f, name)).status, 200);
}));

for (const name of routes) for (const key of businessKeys[name]) for (const fault of ['missing', 'corrupt', 'invalid-reference']) register('targets', name + ' present required aggregate remains fail-closed ' + key + '/' + fault, () => withFixture({}, async f => {
  if (fault === 'invalid-reference') {const envelope = manifest(f); envelope.__processRecords.values[key] = {key: 'foreign/untrusted', sha256: 'a'.repeat(64)}; installEnvelope(f, envelope);}
  else faultRef(f, manifest(f).__processRecords.values[key], fault);
  noDTO(await checkedGet(f, name));
}));

for (const [name, key] of [['ipqc-c', 'ipqcCMasterControl'], ['routine', 'routineFqcEnabled'], ['routine', 'routineFqcControl'], ['routine', 'qualityMasterControl'], ['routine', 'masterDataControl']]) register('targets', name + ' required domain aggregate malformed JSON ' + key, () => withFixture({}, async f => {
  replaceRawAggregate(f, key, '{broken'); noDTO(await checkedGet(f, name));
}));

const requiredBodies = [
  ['ipqc-c', 'ipqcCMasterControl', 'working', '', model => model.workflow.working],
  ['ipqc-c', 'ipqcCMasterControl', 'active', '', model => model.versions.find(v => v.id === 'ipqc-active').snapshot],
  ['ipqc-c', 'ipqcCMasterControl', 'selected-save', '?restoreSaveId=ipqc-save', model => model.workflow.saves[0].content],
  ['ipqc-c', 'ipqcCMasterControl', 'selected-case', '?caseId=ipqc-case', model => model.workflow.cases[0].content],
  ['ipqc-c', 'ipqcCMasterControl', 'selected-version', '?versionId=ipqc-legacy', model => model.versions.find(v => v.id === 'ipqc-legacy').snapshot],
  ['routine', 'routineFqcControl', 'document-working', '', model => model.documents[0].flow.working],
  ['routine', 'qualityMasterControl', 'fqc-active', '', model => model.libraries.fqc.versions[0].snapshot],
  ['routine', 'qualityMasterControl', 'other-quality-scope', '', model => model.libraries.syntheticSibling.versions[0].snapshot],
  ['routine', 'masterDataControl', 'master-AB', '', model => model.active.AB],
  ['routine', 'masterDataControl', 'other-master-C-scope', '', model => model.active.C],
  ['routine', 'masterDataControl', 'other-master-PROCESS-scope', '', model => model.active.PROCESS],
];
for (const [name, key, label, query, select] of requiredBodies) for (const fault of ['missing', 'corrupt', 'malformed-json']) register('bodies', name + ' required body ' + label + '/' + fault, () => withFixture({}, async f => {
  const ref = select(aggregate(f, key)).__immutableBody;
  if (fault === 'malformed-json') {
    const replacement = makeRef(f, '{broken');
    // Replace all aliases of this immutable reference so no stale valid alias
    // can mask the selected body's actual malformed JSON.
    const raw = JSON.stringify(aggregate(f, key)).split(JSON.stringify(ref)).join(JSON.stringify(replacement)); replaceRawAggregate(f, key, raw);
  } else faultRef(f, ref, fault);
  noDTO(await checkedGet(f, name, query));
}));

register('bodies', 'C unselected deferred legacy body remains deferred; selecting it still verifies it', () => withFixture({}, async f => {
  const ref = aggregate(f, 'ipqcCMasterControl').versions.find(v => v.id === 'ipqc-legacy').snapshot.__immutableBody;
  faultRef(f, ref, 'corrupt'); assert.equal((await checkedGet(f, 'ipqc-c')).status, 200); assert.ok(!reads(f).includes(ref.key));
  noDTO(await checkedGet(f, 'ipqc-c', '?legacyVersionId=ipqc-legacy')); assert.ok(reads(f).includes(ref.key));
}));
register('bodies', 'routine retains original deferred historical body contract rather than claiming full history hydration', () => withFixture({}, async f => {
  const ref = aggregate(f, 'routineFqcControl').documents[0].flow.saves[0].content.__immutableBody;
  faultRef(f, ref, 'corrupt'); assert.equal((await checkedGet(f, 'routine')).status, 200); assert.ok(!reads(f).includes(ref.key));
}));

for (const name of routes) for (const target of ['aggregate', 'body']) for (const fault of ['missing', 'corrupt', 'malformed-json']) register('isolation', name + ' approved unrelated isolation ' + target + '/' + fault, () => withFixture({}, async f => {
  const key = 'toolingMasterControl';
  if (target === 'aggregate') {if (fault === 'malformed-json') replaceRawAggregate(f, key, '{broken'); else faultRef(f, manifest(f).__processRecords.values[key], fault);}
  else {const ref = aggregate(f, key).versions[0].snapshot.__immutableBody; if (fault === 'malformed-json') {const replacement = makeRef(f, '{broken'); replaceAggregate(f, key, model => {model.versions[0].snapshot = {__immutableBody: replacement};});} else faultRef(f, ref, fault);}
  assert.equal((await checkedGet(f, name)).status, 200); assert.ok(!reads(f).includes(manifest(f).__processRecords.values[key].key));
}));

register('scope', 'C restoreContent GET has no master/equipment dependency (not a POST claim)', () => withFixture({}, async f => {
  for (const key of ['masterDataControl', 'routineEquipmentControl']) faultRef(f, manifest(f).__processRecords.values[key], 'missing');
  const result = await checkedGet(f, 'ipqc-c', '?restoreSaveId=ipqc-save');
  assert.equal(result.status, 200); assert.equal(result.body.after.items[0].description, 'Synthetic historical description');
  for (const key of ['masterDataControl', 'routineEquipmentControl']) assert.ok(!reads(f).includes(manifest(f).__processRecords.values[key].key));
}));

for (const name of routes) register('defaults', name + ' legitimately absent business aggregates keep existing empty/default behavior', () => withFixture({}, async f => {
  const envelope = manifest(f); for (const key of businessKeys[name]) delete envelope.__processRecords.values[key]; installEnvelope(f, envelope);
  const result = await checkedGet(f, name, name === 'routine' ? '?availability=1' : '');
  assert.equal(result.status, 200); if (name === 'routine') assert.equal(result.body.enabled, false); else assert.equal(result.body.workflow, null);
}));

for (const key of ['routineFqcControl', 'qualityMasterControl', 'masterDataControl']) register('availability', 'routine availability still checks required ' + key + ' before returning enabled', () => withFixture({}, async f => {
  faultRef(f, manifest(f).__processRecords.values[key], 'missing'); noDTO(await checkedGet(f, 'routine', '?availability=1'));
}));
register('availability', 'routine availability still parses malformed control and sources while disabled', () => withFixture({}, async f => {
  replaceRawAggregate(f, 'routineFqcEnabled', '0'); replaceRawAggregate(f, 'routineFqcControl', '{broken'); noDTO(await checkedGet(f, 'routine', '?availability=1'));
}));

for (const name of routes) register('roles', name + ' view-only keeps existing history but does not grant write/restore/settings', () => withFixture({user: {role: 'staff', inheritRole: false, accessOverrides: {[name + '.view']: true}}}, async f => {
  const normal = await checkedGet(f, name); assert.equal(normal.status, 200); assert.equal(normal.body.permissions.edit, false);
  assert.equal(normal.body.permissions.history, true, 'current workflowAccess derives history from view');
  if (name === 'ipqc-c') {
    assert.equal((await checkedGet(f, name, '?caseId=ipqc-case')).status, 200);
    assert.equal((await checkedGet(f, name, '?restoreSaveId=ipqc-save')).status, 403);
    assert.equal((await checkedGet(f, name, '?operationId=ipqc-operation')).status, 403);
  } else {
    assert.equal((await checkedGet(f, name, '?preview=1')).status, 403);
    assert.equal((await checkedGet(f, name, '?search-preview=1')).status, 200);
    assert.equal((await checkedGet(f, name, '?export=routine-document')).status, 200);
    assert.equal((await checkedGet(f, name, '?operationId=routine-operation')).status, 200);
    assert.equal((await checkedGet(f, name, '?operationId=routine-foreign')).status, 404);
  }
}));

for (const name of routes) register('revocation', name + ' logout during required body retrieval yields no terminal DTO', () => withFixture({}, async f => {
  const key = name === 'ipqc-c' ? aggregate(f, 'ipqcCMasterControl').workflow.working.__immutableBody.key : aggregate(f, 'routineFqcControl').documents[0].flow.working.__immutableBody.key;
  let revoked = false; f.hooks.set('r2get.before', event => {if (!revoked && event.key === key) {revoked = true; f.revoke();}});
  const result = await checkedGet(f, name); assert.equal(revoked, true); noDTO(result);
  assert.equal(result.status, name === 'routine' ? 401 : 403);
}));

for (const name of routes) register('snapshot', name + ' authority and target bind the same selected row despite concurrent D1 change', () => withFixture({}, async f => {
  const before = f.row(); let changed = false;
  f.hooks.set('state.after', () => {if (!changed) {changed = true; const replacement = manifest(f); replacement.__processRecords.values[name === 'ipqc-c' ? 'ipqcCMasterControl' : 'routineFqcControl'] = {key: 'foreign/not-selected', sha256: 'a'.repeat(64)}; installEnvelope(f, replacement, before.revision + 1);}});
  f.reset(); const result = await get(f, name);
  assert.equal(result.status, 200); assert.equal(result.body.revision, before.revision); assert.equal(f.stats.state, 1); assert.equal(changed, true); assert.equal(f.stats.put, 0); assert.equal(f.stats.cas, 0); assert.ok(!reads(f).includes('foreign/not-selected'));
}));

for (const name of routes) register('readonly', name + ' scoped delivery state cannot enter either ordinary writer', () => withFixture({}, async f => {
  f.reset(); const state = await helper(f, name);
  assert.ok(state); assert.equal(state.deliveryOnly, true); assert.equal(state.recordStorage.partial, true); assert.equal(f.stats.state, 1);
  assert.deepEqual(Object.keys(state.values).sort((a,b)=>a<b?-1:a>b?1:0), [...authKeys, ...businessKeys[name]].sort((a,b)=>a<b?-1:a>b?1:0));
  const before = f.row(), objects = [...f.objects]; f.reset();
  await assert.rejects(f.core.encodeValues({...state.values}, state), /Read-only delivery cannot be saved/);
  await assert.rejects(f.codec.encodeRecordValues(f.env.STATE_ARCHIVE, {...state.values}, state.recordStorage), /Partial read cannot be saved/);
  assertReadOnly(f, before, objects);
}));

register('readonly', 'C permissions-only reader has one initial identity fence and remains read-only', () => withFixture({}, async f => {
  f.reset(); const state = await helper(f, 'ipqc-c', '?permissions=1'); assert.ok(state); assert.equal(f.stats.revocation, 1); assert.equal(f.stats.state, 1); assert.deepEqual(businessReads(f), []); assert.equal(state.deliveryOnly, true); assert.equal(state.recordStorage.partial, true);
  await assert.rejects(f.core.encodeValues({...state.values}, state), /Read-only delivery cannot be saved/);
}));

for (const name of routes) register('diagnostics', name + ' named policy diagnostics disclose only scope/revision/count metadata', () => withFixture({}, async f => {
  const events = [], info = console.info; console.info = (...args) => events.push(copy(args));
  try {assert.equal((await checkedGet(f, name)).status, 200);} finally {console.info = info;}
  assert.equal(events.length, 1); assert.equal(events[0][0], '[record-read-scope]'); const entry = JSON.parse(events[0][1]);
  assert.deepEqual(Object.keys(entry).sort(), ['policy', 'required', 'revision', 'unverifiedAggregates']);
  assert.equal(entry.policy, (name === 'ipqc-c' ? 'ipqc-c-workflow' : 'routine-fqc') + '-read-v1'); assert.equal(entry.revision, f.row().revision);
  assert.deepEqual(entry.required, [...authKeys, ...businessKeys[name]]);
  assert.equal(entry.unverifiedAggregates, Object.keys(manifest(f).__processRecords.values).filter(key => !entry.required.includes(key)).length);
}));

for (const name of routes) for (const mode of ['inline', 'legacy-r2', 'legacy-chunks', 'unsupported-envelope']) register('compatibility', name + ' ' + mode + ' retains explicit ordinary-reader fallback limitation', () => withFixture({inline: mode === 'inline'}, async f => {
  if (mode.startsWith('legacy-')) await installLegacyStorage(f, mode);
  if (mode === 'unsupported-envelope') {const envelope = manifest(f); envelope.syntheticUnsupportedExtension = true; installEnvelope(f, envelope);}
  assert.equal(await helper(f, name), null);
  assert.equal((await checkedGet(f, name)).status, 200);
  if (mode === 'unsupported-envelope') {faultRef(f, manifest(f).__processRecords.values.toolingMasterControl, 'missing'); noDTO(await checkedGet(f, name));}
}));

for (const [method, requestPath, scope] of [['POST', 'ipqc-c/workflow', 'ipqc-c-workflow'], ['GET', 'master/workflow', 'ipqc-c-workflow'], ['GET', 'ipqc-c/workflow', 'routine-fqc'], ['GET', 'routine-fqc', 'unsupported']]) register('readonly', 'private reader rejects route/method/scope misuse ' + method + '/' + requestPath + '/' + scope, () => withFixture({}, async f => {
  f.reset(); const reader = f.load('lib/scoped-workflow-read.ts').readScopedWorkflowState;
  await assert.rejects(reader(new Request('https://fixture.invalid/api/' + requestPath, {method, headers: f.headers}), scope), /Invalid workflow read/);
  assert.equal(f.stats.sql, 0); assert.equal(f.stats.get, 0); assert.equal(f.stats.put, 0);
}));

// Vinext's automatic HEAD calls the actual GET export with a HEAD Request.
// The transport strips bytes later; these tests compare the real handler DTO
// and retain the old full-reader behavior rather than expanding the new scope.
for (const name of routes) for (const faulty of [false, true]) register('head-compatibility', name + ' auto-HEAD keeps ordinary full-reader ' + (faulty ? 'unrelated-fault refusal' : 'healthy response and cost'), () => withFixture({}, async f => {
  const key = manifest(f).__processRecords.values.toolingMasterControl.key;
  if (faulty) f.objects.delete(key);
  const before = f.row(), objects = [...f.objects]; f.reset();
  const result = await get(f, name, '', f.headers, 'HEAD'); assertReadOnly(f, before, objects);
  assert.equal(f.stats.state, 1); assert.ok(reads(f).includes(key), 'HEAD retains unrelated full-reader I/O');
  if (faulty) {assert.equal(result.status, 503); noDTO(result);}
  else {
    assert.equal(result.status, 200); const headCounters = {...f.stats};
    const normal = await checkedGet(f, name); assert.deepEqual(result, normal);
    assert.equal(headCounters.revocation, name === 'ipqc-c' ? 13 : 11, 'HEAD retains ordinary per-cell fresh checks');
    assert.equal(f.stats.revocation, 4, 'supported GET has four fresh request-local fences');
    assert.ok(headCounters.get > f.stats.get, 'HEAD preserves the legacy full-reader cost');
  }
}));

for (const name of routes) register('snapshot', name + ' missing selected row does not retry into concurrently restored authority/business', () => withFixture({}, async f => {
  const before = f.row(), objects = [...f.objects]; let restored = false;
  f.sqlite.prepare('DELETE FROM shared_state WHERE id=1').run();
  f.hooks.set('state.after', event => {
    if (!event.result && !restored) {restored = true; f.sqlite.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,?,?,?)').run(before.revision, before.values, before.updated_at);}
  });
  f.reset(); const result = await get(f, name); assert.equal(restored, true); assert.equal(result.status, 503); noDTO(result);
  assert.equal(f.stats.state, 1, 'missing state is not an unsupported-envelope fallback'); assert.equal(f.stats.get, 0); assert.equal(f.stats.revocation, 0);
  assertReadOnly(f, before, objects);
}));

// A complete default entry remains suitable for CI. Optional disjoint shards
// register only their assigned cases (never skip them). --manifest prints the
// exact total and selected names so a parent can prove the union covers all.
const shardText = process.env.SCOPED_READ_SHARD, shard = shardText ? shardText.split('/').map(Number) : [1, 1];
assert.ok(shard.length === 2 && shard.every(Number.isSafeInteger) && shard[0] >= 1 && shard[0] <= shard[1] && shard[1] >= 1, 'SCOPED_READ_SHARD must be n/total');
assert.equal(new Set(definitions.map(d => d.name)).size, definitions.length, 'test names are unique');
const selected = definitions.filter((_definition, index) => index % shard[1] === shard[0] - 1);
if (process.argv.includes('--manifest')) console.log(JSON.stringify({total: definitions.length, shard: shardText || 'all', all: definitions.map(({group, name}) => ({group, name})), selected: selected.map(d => d.name)}));
else for (const {name, body} of selected) test(name, body);
