import assert from 'node:assert/strict';
import {test, after} from 'node:test';
import {writeFileSync} from 'node:fs';
import {buildFqcDraftLifecycleSeed, createFqcDraftLifecycleFixture} from './fqc-draft-lifecycle-route-fixture.mjs';

const reports = [], probes = [];
after(() => {
  if (process.env.FQC_LIFECYCLE_REPORT) writeFileSync(process.env.FQC_LIFECYCLE_REPORT, JSON.stringify({
    execution: 'routeVM', scope: 'Actual production FQC TypeScript route, in-memory SQLite/Map R2, signed synthetic actors; no sockets/browser/live data',
    timingBoundary: 'Handler plus JSON serialization/consumption only. Request/SQL/R2 counters and syntheticInProcessMs are NOT UI/browser/network latency or performance thresholds.',
    cycles: reports, probes,
  }, null, 2) + '\n');
});
const item = (flow, id) => flow.working.items.find(row => row.id === id);
const errorRow = (flow, id) => flow.working.errors.find(row => row.id === id);
const products = (seed, codes) => codes.map(code => {
  const product = JSON.parse(seed.values.masterDataControl).active.AB.products.find(row => row.code === code);
  return {code, kind: 'product', name: product.name, specification: product.specification};
});
const batchRule = {cadence: 'batch', batchKind: 'fixed_count', fixedCount: 1};
async function unchanged(f, invoke, status, error) {
  const row = f.row(), objects = [...f.objects], result = await invoke();
  assert.equal(result.status, status, JSON.stringify(result.body));
  if (error) assert.equal(result.body.error, error);
  assert.deepEqual(f.row(), row, 'denied/noop/read/replay must preserve the exact state manifest');
  assert.deepEqual([...f.objects], objects, 'denied/noop/read/replay must not persist immutable R2 objects');
  assert.equal(f.measurements.at(-1).committed, 0);
  assert.equal(f.measurements.at(-1).r2put, 0);
  return result;
}
async function ok(f, command, actor = 'editor', options = {}) {
  const result = await f.send(command, actor, options);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const receipt = result.body.receipt;
  assert.equal(receipt.operationId, command.operationId);
  let body = result.body;
  if (command.action === 'apply') {
    assert.equal(body.projection, 'fqc-apply-ack-v1', 'modern Apply ACK must not be replaced by a synthetic full response');
    for (const key of ['control', 'permissions', 'wireVersion']) assert.equal(Object.hasOwn(body, key), false);
    const read = await unchanged(f, () => f.request({actor, label: (options.label || command.action) + '-terminal-GET'}), 200);
    body = {...read.body, receipt};
  }
  assert.equal(receipt.generation, body.control.workflow.generation);
  assert.equal(receipt.revision, body.control.workflow.revision);
  const persisted = (await f.inspect()).control;
  assert.deepEqual(persisted.workflow.receipts[command.operationId].result, receipt);
  assert.deepEqual(persisted.workflow.working, body.control.workflow.working);
  assert.equal(persisted.workflow.pendingId, body.control.workflow.pendingId);
  return body;
}
async function begin(f, label = 'begin') {
  const result = await f.request({method: 'POST', body: {action: 'begin'}, label});
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.control.workflow;
}
function newError(seed) {
  return {id: seed.ids.newError, code: 'CLIENT-PREVIEW-NOT-AUTHORITY', name: 'New synthetic lifecycle error', category: seed.ids.category, line: seed.ids.line, isDeleted: false};
}
function newItem(seed) {
  return {...structuredClone(seed.initialContent.items[0]), id: seed.ids.newItem, errorId: seed.ids.newError,
    checkNo: 'CLIENT-PREVIEW-NOT-AUTHORITY', name: 'New synthetic lifecycle item', description: 'Inspect the second synthetic surface',
    productCodes: [seed.ids.product2], productRefs: products(seed, [seed.ids.product2]), rule: structuredClone(batchRule)};
}

for (let cycle = 1; cycle <= 5; cycle++) void test(`FQC routeVM lifecycle ${cycle}: Begin, four form payloads, matrix Apply, Save, Submit, Withdraw, resubmit, Return, resubmit, distinct reviewer Approve`, async t => {
  const f = await createFqcDraftLifecycleFixture({cycle}), {seed} = f, {ids} = seed;
  const report = {execution: 'routeVM', cycle, fixtureBytes: seed.seedBytes, contentBytes: seed.contentBytes, seedDigest: f.seedDigest, status: 'RUNNING', requests: f.measurements}; reports.push(report);
  try {
    const initial = await unchanged(f, () => f.request({label: 'initial-editor-read'}), 200);
    assert.equal(initial.body.control.activeVersionId, ids.active);
    assert.equal(initial.body.control.versions.some(row => row.status === 'draft'), false);
    assert.deepEqual(initial.body.control.workflow.working, seed.initialContent);
    await unchanged(f, () => f.send(f.apply(initial.body.control.workflow, 'errors', ids.error, 'name', seed.initialContent.errors[0].name, 'Cannot skip Begin'), 'editor', {label: 'apply-before-begin'}), 409, 'BEGIN_REQUIRED');
    await unchanged(f, () => f.request({method: 'POST', actor: 'reader', body: {action: 'begin'}, label: 'reader-denied-begin'}), 403, 'FORBIDDEN');
    let flow = await begin(f);
    assert.equal(f.measurements.at(-1).committed, 1); assert.equal(flow.generation, ids.generation); assert.equal(flow.saved, null);
    await unchanged(f, () => f.request({method: 'POST', body: {action: 'begin'}, label: 'begin-idempotent'}), 200);
    const first = f.apply(flow, 'errors', ids.error, 'name', errorRow(flow, ids.error).name, 'Edited lifecycle error ' + cycle);
    const firstResult = await ok(f, first, 'editor', {label: 'existing-error-form-apply'}); flow = firstResult.control.workflow;
    assert.equal(errorRow(flow, ids.error).name, 'Edited lifecycle error ' + cycle);
    assert.equal(flow.saved, null); assert.deepEqual(flow.active.content, seed.initialContent);
    const staleRevision = f.apply(flow, 'errors', ids.error, 'name', errorRow(flow, ids.error).name, 'Stale revision must not win'); staleRevision.expectedRevision--;
    await unchanged(f, () => f.send(staleRevision, 'editor', {label: 'stale-draft-revision'}), 409, 'DRAFT_REVISION_CHANGED_RECONFIRM');
    const staleGuard = f.apply(flow, 'errors', ids.error, 'name', seed.initialContent.errors[0].name, 'Stale same field must not win'); delete staleGuard.expectedRevision;
    await unchanged(f, () => f.send(staleGuard, 'editor', {label: 'stale-same-field-guard'}), 409, 'DEPENDENCY_CHANGED_RECONFIRM');
    const unguarded = f.apply(flow, 'errors', ids.error, 'name', errorRow(flow, ids.error).name, 'Missing guard must not win'); delete unguarded.guards;
    await unchanged(f, () => f.send(unguarded, 'editor', {label: 'missing-exact-field-guard'}), 422, 'DEPENDENCY_GUARD_REQUIRED');
    const replay = await unchanged(f, () => f.send(first, 'editor', {label: 'exact-apply-replay'}), 200);
    assert.equal(replay.body.projection, 'fqc-apply-ack-v1'); assert.equal(replay.body.unchanged, true); assert.deepEqual(replay.body.receipt, firstResult.receipt);
    await unchanged(f, () => f.send(f.apply(flow, 'errors', ids.error, 'name', errorRow(flow, ids.error).name, 'Reader denial', 'reader'), 'reader', {label: 'reader-denied-existing-form'}), 403, 'FORBIDDEN');
    await unchanged(f, () => f.send(f.insert(flow, 'errors', newError(seed), 'reader'), 'reader', {label: 'reader-denied-new-error'}), 403, 'FORBIDDEN');
    flow = (await ok(f, f.insert(flow, 'errors', newError(seed)), 'editor', {label: 'new-error-form-apply'})).control.workflow;
    assert.equal(errorRow(flow, ids.newError).code, 'LIFE-FQC-L02', 'server, not client preview, allocates the error number');
    const edited = {name: 'Edited lifecycle item ' + cycle, description: 'Inspect synthetic surface and measure 1 mm', tool: '01', equipmentId: ids.equipment,
      equipmentSnapshot: {id: 'client-cannot-author-equipment-snapshot'}, rule: structuredClone(batchRule), productCodes: [ids.product], productRefs: products(seed, [ids.product]), note: 'Synthetic scalar instruction and equipment edit'};
    flow = (await ok(f, f.setFields(flow, 'items', ids.item, edited), 'editor', {label: 'existing-item-form-apply'})).control.workflow;
    assert.equal(item(flow, ids.item).equipmentId, ids.equipment); assert.equal(item(flow, ids.item).equipmentSnapshot.id, ids.equipment);
    assert.equal(item(flow, ids.item).equipmentSnapshot.assetCode, 'SYN-001'); assert.equal(item(flow, ids.item).equipmentSnapshot.enabled, true);
    assert.deepEqual(item(flow, ids.item).rule, batchRule); assert.deepEqual(item(flow, ids.item).productCodes, [ids.product]);
    assert.equal(item(flow, ids.item).description, edited.description); assert.equal(flow.saved, null);
    await unchanged(f, () => f.send(f.insert(flow, 'items', newItem(seed), 'reader'), 'reader', {label: 'reader-denied-new-item'}), 403, 'FORBIDDEN');
    flow = (await ok(f, f.insert(flow, 'items', newItem(seed)), 'editor', {label: 'new-item-form-apply'})).control.workflow;
    assert.equal(item(flow, ids.newItem).checkNo, 'LIFE-FQC-L2-01'); assert.equal(item(flow, ids.newItem).errorId, ids.newError);
    assert.deepEqual(item(flow, ids.newItem).productCodes, [ids.product2]); assert.deepEqual(item(flow, ids.newItem).rule, batchRule);

    // This is a synthetic local choice, not a browser checkbox claim. Only the
    // explicit guarded Apply below crosses the production route boundary.
    const beforeLocal = f.row(), objectsBeforeLocal = [...f.objects], requestCount = f.measurements.length;
    const localMatrix = structuredClone(item(flow, ids.item)); localMatrix.productCodes.push(ids.product2); localMatrix.productRefs = products(seed, localMatrix.productCodes);
    assert.deepEqual(f.row(), beforeLocal); assert.deepEqual([...f.objects], objectsBeforeLocal); assert.equal(f.measurements.length, requestCount);
    assert.deepEqual((await f.inspect()).control.workflow.working.items.find(row => row.id === ids.item).productCodes, [ids.product]);
    const matrix = f.setFields(flow, 'items', ids.item, {productCodes: localMatrix.productCodes, productRefs: localMatrix.productRefs});
    flow = (await ok(f, matrix, 'editor', {label: 'matrix-explicit-batch-apply'})).control.workflow;
    assert.deepEqual(item(flow, ids.item).productCodes, [ids.product, ids.product2]); assert.deepEqual(item(flow, ids.item).productRefs, localMatrix.productRefs);
    assert.equal(flow.saved, null); assert.deepEqual(flow.active.content, seed.initialContent);
    await unchanged(f, () => f.send(f.command('submit', flow, {savedId: 'not-saved', reason: 'Requires explicit Save'}), 'editor', {label: 'submit-before-save'}), 409, 'SUCCESSFUL_SAVE_REQUIRED');

    const unknown = f.apply(flow, 'items', ids.item, 'note', item(flow, ids.item).note, 'Lost ACK synthetic note ' + cycle), beforeUnknown = f.row().revision;
    const unknownStart = f.measurements.length;
    assert.equal(await f.send(unknown, 'editor', {label: 'lost-ACK-committed-once', discardResponse: true}), undefined);
    assert.equal(f.row().revision, beforeUnknown + 1);
    const receipt = await unchanged(f, () => f.request({suffix: '&operationId=' + unknown.operationId, label: 'lost-ACK-receipt-GET'}), 200);
    assert.equal(receipt.body.receipt.operationId, unknown.operationId);
    const readback = await unchanged(f, () => f.request({label: 'lost-ACK-authoritative-GET'}), 200); flow = readback.body.control.workflow;
    assert.equal(item(flow, ids.item).note, 'Lost ACK synthetic note ' + cycle); assert.equal(flow.revision, receipt.body.receipt.revision);
    assert.deepEqual(f.measurements.slice(unknownStart).map(row => row.method), ['POST', 'GET', 'GET']);
    assert.equal(f.row().revision, beforeUnknown + 1, 'unknown outcome resolves by GET only, never POST replay');
    await unchanged(f, () => f.request({actor: 'reader', suffix: '&operationId=' + unknown.operationId, label: 'reader-denied-owned-receipt'}), 403, 'FORBIDDEN');
    await unchanged(f, () => f.send(f.command('save', flow, {}, 'reader'), 'reader', {label: 'reader-denied-save'}), 403, 'FORBIDDEN');

    const saved = await ok(f, f.command('save', flow), 'editor', {label: 'manual-save'}); flow = saved.control.workflow;
    const savedId = flow.saved.id, savedContent = structuredClone(flow.saved.content);
    assert.equal(saved.receipt.savedId, savedId); assert.deepEqual(savedContent, flow.working); assert.deepEqual(flow.active.content, seed.initialContent);
    assert.deepEqual(savedContent.items.find(row => row.id === ids.item).productCodes, [ids.product, ids.product2]);
    const savedRead = await unchanged(f, () => f.request({label: 'manual-save-authoritative-GET'}), 200);
    assert.equal(savedRead.body.control.workflow.saved.id, savedId); assert.deepEqual(savedRead.body.control.workflow.saved.content, savedContent);
    await unchanged(f, () => f.send(f.command('submit', flow, {savedId, reason: 'Missing revision', expectedRevision: undefined}), 'editor', {label: 'submit-missing-revision'}), 409, 'DRAFT_REVISION_REQUIRED');
    await unchanged(f, () => f.send(f.command('submit', flow, {savedId: 'obsolete', reason: 'Wrong save'}), 'editor', {label: 'submit-stale-saved-id'}), 409, 'SAVED_VERSION_CHANGED_RECONFIRM');
    await unchanged(f, () => f.send(f.command('submit', flow, {savedId, reason: ''}), 'editor', {label: 'submit-missing-reason'}), 422, 'REASON_REQUIRED');
    await unchanged(f, () => f.send(f.command('submit', flow, {savedId, reason: 'Reader denied'}, 'reader'), 'reader', {label: 'reader-denied-submit'}), 403, 'FORBIDDEN');
    flow = (await ok(f, f.command('submit', flow, {savedId, reason: 'Synthetic submission ' + cycle}), 'editor', {label: 'submit'})).control.workflow;
    const firstCase = flow.pendingId, firstGeneration = flow.generation;
    assert.ok(firstCase); assert.deepEqual((await f.inspect()).control.workflow.cases.at(-1).content, savedContent);
    assert.deepEqual(flow.active.content, seed.initialContent);
    await unchanged(f, () => f.send(f.apply(flow, 'errors', ids.error, 'name', errorRow(flow, ids.error).name, 'Pending denied'), 'editor', {label: 'pending-denied-apply'}), 409, 'PENDING_LOCKED');
    await unchanged(f, () => f.send(f.command('save', flow), 'editor', {label: 'pending-denied-save'}), 409, 'PENDING_LOCKED');
    for (const action of ['withdraw', 'return', 'approve']) await unchanged(f, () => f.send(f.command(action, flow, {caseId: firstCase, reason: 'Reader denied'}, 'reader'), 'reader', {label: 'reader-denied-' + action}), 403, 'FORBIDDEN');
    await unchanged(f, () => f.send(f.command('withdraw', flow, {caseId: firstCase, reason: ''}), 'editor', {label: 'withdraw-missing-reason'}), 422, 'REASON_REQUIRED');
    flow = (await ok(f, f.command('withdraw', flow, {caseId: firstCase, reason: 'Synthetic withdrawal'}), 'editor', {label: 'withdraw'})).control.workflow;
    assert.equal(flow.pendingId, null); assert.notEqual(flow.generation, firstGeneration); assert.equal(flow.saved.id, savedId); assert.deepEqual(flow.working, savedContent);
    flow = (await ok(f, f.command('submit', flow, {savedId, reason: 'Resubmit the same fixed save after withdrawal'}), 'editor', {label: 'resubmit-after-withdraw'})).control.workflow;
    const secondCase = flow.pendingId, secondGeneration = flow.generation;
    assert.notEqual(secondCase, firstCase); assert.equal(flow.saved.id, savedId);
    await unchanged(f, () => f.send(f.command('return', flow, {caseId: secondCase, reason: ''}, 'reviewer'), 'reviewer', {label: 'return-missing-reason'}), 422, 'REASON_REQUIRED');
    await unchanged(f, () => f.send(f.command('return', flow, {caseId: secondCase, reason: 'Editor denied'}), 'editor', {label: 'editor-denied-return'}), 403, 'FORBIDDEN');
    flow = (await ok(f, f.command('return', flow, {caseId: secondCase, reason: 'Distinct reviewer returns synthetic case'}, 'reviewer'), 'reviewer', {label: 'return'})).control.workflow;
    assert.equal(flow.pendingId, null); assert.notEqual(flow.generation, secondGeneration); assert.equal(flow.saved.id, savedId); assert.deepEqual(flow.working, savedContent);
    flow = (await ok(f, f.command('submit', flow, {savedId, reason: 'Resubmit the same fixed save after return'}), 'editor', {label: 'resubmit-after-return'})).control.workflow;
    const finalCase = flow.pendingId, finalGeneration = flow.generation;
    assert.ok(![firstCase, secondCase].includes(finalCase));
    await unchanged(f, () => f.send(f.command('approve', flow, {caseId: finalCase}), 'editor', {label: 'editor-denied-approve'}), 403, 'FORBIDDEN');
    const reviewer = await unchanged(f, () => f.request({actor: 'reviewer', label: 'distinct-reviewer-fixed-case-GET'}), 200);
    assert.equal(reviewer.body.control.workflow.pendingId, finalCase);
    const pending = (await f.inspect()).control.workflow.cases.find(row => row.id === finalCase);
    assert.equal(pending.savedId, savedId); assert.deepEqual(pending.content, savedContent); assert.deepEqual(pending.contentIssues.issues, []);
    assert.equal(pending.actor.id, seed.actors.editor.id); assert.notEqual(pending.actor.id, seed.actors.reviewer.id);
    const approved = await ok(f, f.command('approve', flow, {caseId: finalCase, reason: 'Distinct synthetic reviewer approves'}, 'reviewer'), 'reviewer', {label: 'approve'}); flow = approved.control.workflow;
    assert.equal(flow.pendingId, null); assert.equal(flow.saved, null); assert.notEqual(flow.generation, finalGeneration);
    assert.equal(flow.active.id, finalCase); assert.equal(approved.control.activeVersionId, finalCase); assert.deepEqual(flow.active.content, savedContent);
    const persisted = (await f.inspect()).control;
    assert.deepEqual(persisted.workflow.cases.map(row => row.status), ['withdrawn', 'returned', 'approved']);
    for (const reviewCase of persisted.workflow.cases) {
      assert.deepEqual(reviewCase.content, savedContent); assert.equal(reviewCase.savedId, savedId); assert.deepEqual(reviewCase.before, seed.initialContent);
      assert.deepEqual(reviewCase.contentIssues.issues, []); assert.equal(reviewCase.result.selfReview, false);
    }
    assert.equal(persisted.workflow.cases.at(-1).result.actor.id, seed.actors.reviewer.id);
    assert.equal(persisted.workflow.saves.length, 1); assert.deepEqual(persisted.workflow.saves[0].content, savedContent);
    assert.equal(persisted.versions.find(row => row.id === ids.active).status, 'superseded');
    assert.deepEqual(persisted.versions.find(row => row.id === ids.active).snapshot, seed.initialContent);
    const effectiveRead = await unchanged(f, () => f.request({actor: 'reader', label: 'reader-approved-effective-GET'}), 200);
    assert.equal(effectiveRead.body.control.activeVersionId, finalCase); assert.deepEqual(effectiveRead.body.control.workflow.active.content, savedContent);
    const final = await f.inspect();
    for (const key of Object.keys(seed.values).filter(key => key !== 'qualityMasterControl')) assert.equal(final.values[key], seed.values[key], 'unrelated synthetic state retained: ' + key);
    assert.ok(JSON.parse(f.row().values).__processRecords);
    assert.equal(f.measurements.reduce((sum, row) => sum + row.committed, 0), f.row().revision - 1);
    assert(f.measurements.every(row => row.execution === 'routeVM' && row.requestCount === 1));
    const prior = reports.find(row => row.status === 'PASS');
    if (prior) { assert.equal(seed.seedBytes, prior.fixtureBytes); assert.equal(seed.contentBytes, prior.contentBytes); assert.deepEqual(f.measurements.map(row => row.label), prior.requests.map(row => row.label)); }
    report.status = 'PASS'; report.finalRevision = f.row().revision; report.fixedSavedId = savedId; report.caseIds = [firstCase, secondCase, finalCase];
    report.totalRequests = f.measurements.length; report.negativeContractRequests = f.measurements.filter(row => row.status >= 400).length;
    t.diagnostic(JSON.stringify({execution: 'routeVM', cycle, status: report.status, totalRequests: report.totalRequests, finalRevision: report.finalRevision, timing: 'synthetic in-process only; not UI latency'}));
  } catch (error) { report.status = 'FAIL'; report.failure = String(error); throw error; }
  finally { f.close(); }
});

void test('canonical pure FQC seed reaches real bootstrap, AB catalog, effective equipment and reviewer shell without grant changes', async t => {
  const f = await createFqcDraftLifecycleFixture(); t.after(f.close);
  const report = {name: 'canonical-bootstrap-and-grants', status: 'RUNNING', requests: f.measurements}; probes.push(report);
  assert.deepEqual(buildFqcDraftLifecycleSeed(f.load('lib/shared-draft.ts').createSharedDraft), f.seed);
  for (const [actor, suffix, module] of [['editor', '?view=data&dataTab=quality-fqc', 'fqc'], ['reader', '?view=data&dataTab=quality-fqc', 'fqc'], ['reviewer', '?view=approval', 'approval']]) {
    const bootstrap = await unchanged(f, () => f.request({actor, target: 'bootstrap', suffix, label: actor + '-bootstrap'}), 200);
    assert.equal(bootstrap.body.identity.id, f.seed.actors[actor].id); assert.equal(bootstrap.body.destination.module, module); assert.equal(bootstrap.body.deliveryProjection, true);
    const users = JSON.parse(bootstrap.body.values.platformUsers), user = users.find(row => row.id === f.seed.actors[actor].id);
    for (const [key, value] of Object.entries(f.seed.actors[actor].accessOverrides)) assert.equal(user.cells[key], value, actor + ' keeps explicit ' + key);
    const catalog = await unchanged(f, () => f.request({actor, target: 'ab-catalog', label: actor + '-AB-effective-catalog'}), 200);
    assert.equal(catalog.body.control.activeVersionId, f.seed.ids.masterAB); assert.deepEqual(catalog.body.control.versions[0].snapshot.products.map(row => row.code), [f.seed.ids.product, f.seed.ids.product2]);
    const equipment = await unchanged(f, () => f.request({actor, target: 'equipment', label: actor + '-equipment-effective-catalog'}), 200);
    assert.equal(equipment.body.control.versions.length, 1); assert.equal(equipment.body.control.versions[0].equipment[0].id, f.seed.ids.equipment);
    const rights = await unchanged(f, () => f.request({actor, suffix: '&permissions=1', label: actor + '-workflow-rights'}), 200);
    for (const operation of ['view', 'edit', 'create', 'delete', 'save', 'submit', 'withdraw', 'approve', 'return', 'restore']) assert.equal(rights.body.permissions[operation], f.seed.actors[actor].accessOverrides['fqc.' + operation]);
    if (actor === 'editor') assert.equal(rights.body.otherReviewerAvailable, true, 'distinct reviewer has actual legacy review-entry and FQC operation rights');
  }
  for (const scope of ['AB', 'C', 'PROCESS']) {
    const result = await unchanged(f, () => f.request({actor: 'reviewer', target: 'master-' + scope, label: 'reviewer-approved-master-' + scope}), 200);
    assert.equal(result.body.control.activeVersionId, 'fqc-life-master-' + scope + '-1');
  }
  await unchanged(f, () => f.request({actor: 'reviewer', target: 'bom', label: 'reviewer-BOM-read'}), 200);
  await unchanged(f, () => f.request({actor: 'reader', target: 'bootstrap', suffix: '?view=approval', label: 'reader-denied-approval-entry'}), 403, 'DESTINATION_FORBIDDEN');
  assert.equal((await f.inspect()).values.platformUsers, f.seed.values.platformUsers);
  assert(f.measurements.every(row => row.method === 'GET' && row.committed === 0 && row.r2put === 0)); report.status = 'PASS';
});

void test('no-change and unsaved changes keep explicit Save, fixed Submit, and active-version boundaries', async t => {
  const f = await createFqcDraftLifecycleFixture(); t.after(f.close);
  let flow = await begin(f); const saved = await ok(f, f.command('save', flow)); flow = saved.control.workflow;
  await unchanged(f, () => f.send(f.command('submit', flow, {savedId: flow.saved.id, reason: 'No change'})), 422, 'NO_SUBSTANTIVE_CHANGE');
  flow = (await ok(f, f.apply(flow, 'errors', f.seed.ids.error, 'name', errorRow(flow, f.seed.ids.error).name, 'Changed after Save'))).control.workflow;
  await unchanged(f, () => f.send(f.command('submit', flow, {savedId: flow.saved.id, reason: 'Must not silently save'})), 409, 'UNSAVED_CHANGES_SAVE_REQUIRED');
  flow = (await ok(f, f.command('save', flow))).control.workflow;
  flow = (await ok(f, f.command('submit', flow, {savedId: flow.saved.id, reason: 'Explicit revised save'}))).control.workflow;
  flow = (await ok(f, f.command('approve', flow, {caseId: flow.pendingId}, 'reviewer'), 'reviewer')).control.workflow;
  assert.equal(flow.saved, null);
  flow = await begin(f, 'begin-after-approval'); flow = (await ok(f, f.command('save', flow))).control.workflow;
  await unchanged(f, () => f.send(f.command('submit', flow, {savedId: flow.saved.id, reason: 'No substantive change after approval', allowNoChange: true})), 422, 'NO_SUBSTANTIVE_CHANGE');
  const original = errorRow(flow, f.seed.ids.error).name;
  flow = (await ok(f, f.apply(flow, 'errors', f.seed.ids.error, 'name', original, 'Temporary then revert'))).control.workflow;
  flow = (await ok(f, f.apply(flow, 'errors', f.seed.ids.error, 'name', 'Temporary then revert', original))).control.workflow;
  flow = (await ok(f, f.command('save', flow))).control.workflow;
  await unchanged(f, () => f.send(f.command('submit', flow, {savedId: flow.saved.id, reason: 'Revert is not substantive'})), 422, 'NO_SUBSTANTIVE_CHANGE');
});

void test('FQC structural, dependency and reader/delete guards reject without persistence; explicit disposable soft-delete retains history', async t => {
  const f = await createFqcDraftLifecycleFixture(); t.after(f.close);
  let flow = await begin(f); const {ids} = f.seed;
  for (const [label, fields, status, error] of [
    ['protected-identity', {category: 'Other'}, 422, 'UNSUPPORTED_ITEM_PATCH'],
    ['missing-parent', {errorId: 'missing-parent'}, 422, 'ERROR_PARENT_INVALID'],
    ['invalid-products', {productCodes: [ids.product, ids.product]}, 422, 'INVALID_FQC_ITEM'],
    ['unavailable-equipment', {tool: 'unavailable', equipmentId: 'missing-equipment'}, 422, 'EQUIPMENT_UNAVAILABLE'],
  ]) await unchanged(f, () => f.send(f.setFields(flow, 'items', ids.item, fields), 'editor', {label}), status, error);
  const staleAB = f.setFields(flow, 'items', ids.item, {productCodes: [ids.product], productRefs: products(f.seed, [ids.product])});
  staleAB.input = {expectedAB: {versionId: 'obsolete-master', codes: [ids.product]}};
  await unchanged(f, () => f.send(staleAB, 'editor', {label: 'AB-effective-version-guard'}), 409, 'AB_EFFECTIVE_CHANGED_RECONFIRM');
  await unchanged(f, () => f.send(f.setFields(flow, 'items', ids.item, {isDeleted: true}, 'reader'), 'reader', {label: 'reader-denied-delete'}), 403, 'FORBIDDEN');
  flow = (await ok(f, f.insert(flow, 'errors', newError(f.seed)))).control.workflow;
  flow = (await ok(f, f.insert(flow, 'items', newItem(f.seed)))).control.workflow;
  await unchanged(f, () => f.send(f.setFields(flow, 'errors', ids.newError, {isDeleted: true})), 422, 'ERROR_PARENT_INVALID');
  flow = (await ok(f, f.setFields(flow, 'items', ids.newItem, {isDeleted: true}))).control.workflow;
  flow = (await ok(f, f.setFields(flow, 'errors', ids.newError, {isDeleted: true}))).control.workflow;
  assert.equal(item(flow, ids.newItem).isDeleted, true); assert.equal(errorRow(flow, ids.newError).isDeleted, true);
  assert.deepEqual(flow.active.content, f.seed.initialContent); assert.equal(flow.saved, null);
  await unchanged(f, () => f.send(f.insert(flow, 'errors', newError(f.seed))), 409, 'ENTITY_ID_RESERVED');
});

void test('reviewer quality-shell read set preserves four denied siblings while FQC and effective equipment remain readable', async t => {
  const f = await createFqcDraftLifecycleFixture(); t.after(f.close);
  const report = {name: 'quality-shell-exact-read-set', status: 'RUNNING', requests: f.measurements}; probes.push(report);
  await unchanged(f, () => f.request({actor: 'reviewer', target: 'bootstrap', suffix: '?view=approval&approvalTab=quality', label: 'quality-shell-bootstrap'}), 200);
  // master-data binds every sibling reader; their catch handlers render each
  // denial and settle. Global navigation readiness is not all-module success.
  for (const [target, status, error] of [
    ['tooling-review', 403, 'FORBIDDEN'], ['workflow', 200, undefined],
    ['equipment-review', 200, undefined], ['equipment-permissions', 200, undefined],
    ['iqc-review', 403, 'FORBIDDEN'], ['ipqc-c-review', 403, '沒有查看 IPQC-C 的權限'],
    // Legacy AB permits the approval entry's catalog read, but its subsequent
    // explicit module permission read still denies. Do not erase this split.
    ['ipqc-ab-review', 200, undefined], ['ipqc-ab-permissions', 403, 'FORBIDDEN'],
  ]) {
    const result = await unchanged(f, () => f.request({actor: 'reviewer', target, label: 'quality-shell-' + target}), status, error);
    if (status === 403) { assert.equal(result.body.control, undefined); assert.equal(result.body.permissions, undefined); }
    if (target === 'equipment-permissions') {
      assert.equal(result.body.permissions.view, true);
      for (const op of ['edit', 'create', 'delete', 'save', 'submit', 'withdraw', 'approve', 'return', 'restore']) assert.equal(result.body.permissions[op], false);
    }
    if (target === 'ipqc-ab-review') { assert.deepEqual(result.body.control.scopes, {}); assert.equal(result.body.equipmentDeferred, true); }
  }
  assert.equal(f.measurements.filter(row => row.status === 403).length, 4);
  assert.equal((await f.inspect()).values.platformUsers, f.seed.values.platformUsers);
  assert(f.measurements.every(row => row.method === 'GET' && row.committed === 0 && row.r2put === 0));
  report.status = 'PASS';
});

void test('native lifecycle history seed has real synthetic approval evidence and remains GET-only',async t=>{
 const f=await createFqcDraftLifecycleFixture();t.after(f.close);const before=f.row();
 const listing=await f.request({suffix:'&uiHistory=1&approvedOnly=1'});assert.equal(listing.status,200);assert.equal(listing.body.approvedOnly,true);
 const row=listing.body.versions.rows.find(row=>row.id===f.seed.ids.active);assert(row);assert.equal(row.approvalEvidence.kind,'legacy-approval');assert(Number.isFinite(Date.parse(row.approvalEvidence.approvedAt)));
 const detail=await f.request({suffix:'&versionId='+encodeURIComponent(row.id)+'&approvedOnly=1'});assert.equal(detail.status,200);assert.deepEqual(detail.body.version.snapshot,f.seed.initialContent);assert.deepEqual(f.row(),before);
});
