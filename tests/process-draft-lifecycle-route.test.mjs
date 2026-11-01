import assert from 'node:assert/strict';
import {test, after} from 'node:test';
import {writeFileSync} from 'node:fs';
import {createProcessDraftLifecycleFixture} from './process-draft-lifecycle-route-fixture.mjs';

const reports = [], bootstrapReports = [];
after(() => {
  if (process.env.PROCESS_LIFECYCLE_REPORT) writeFileSync(process.env.PROCESS_LIFECYCLE_REPORT, JSON.stringify({
    scope: 'Actual production process-authoring route, in-memory SQLite/Map R2, signed synthetic actors; no sockets/browser/live data',
    timingBoundary: 'Handler plus JSON response serialization/consumption only; not UI, HTTP, live latency or a performance threshold',
    cycles: reports, bootstrap: bootstrapReports,
  }, null, 2) + '\n');
});
const operation = (content, ids) => content.workspaces.find(w => w.id === ids.workspace).stages[ids.stage].find(op => op.id === ids.operation);
async function unchanged(f, invoke, status, error) {
  const row = f.row(), objects = [...f.objects], result = await invoke();
  assert.equal(result.status, status, JSON.stringify(result.body));
  if (error) assert.equal(result.body.error, error);
  assert.deepEqual(f.row(), row, 'denied/noop/replayed request must not change the state manifest');
  assert.deepEqual([...f.objects], objects, 'denied/noop/replayed request must not persist R2 content');
  assert.equal(f.measurements.at(-1).committed, 0);
  return result;
}
async function ok(f, command, actor = 'editor', options = {}) {
  const result = await f.send(command, actor, options);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.receipt.operationId, command.operationId);
  assert.equal(result.body.receipt.generation, result.body.control.workflow.generation);
  assert.equal(result.body.receipt.revision, result.body.control.workflow.revision);
  const persisted = (await f.inspect()).control;
  assert.deepEqual(persisted.workflow.receipts[command.operationId].result, result.body.receipt);
  assert.deepEqual(persisted.workflow.working, result.body.control.workflow.working);
  assert.equal(persisted.workflow.pendingId, result.body.control.workflow.pendingId);
  return result.body;
}

for (let cycle = 1; cycle <= 5; cycle++) void test(`process lifecycle cycle ${cycle}: Begin, guarded Apply/Sync, Save, Submit, Withdraw, resubmit, Return, resubmit, Approve`, async t => {
  const f = await createProcessDraftLifecycleFixture({cycle}), {seed} = f, report = {cycle, fixtureBytes: seed.seedBytes, contentBytes: seed.contentBytes, seedDigest: f.seedDigest, status: 'RUNNING', requests: f.measurements};
  reports.push(report);
  try {
    const integrity = f.load('lib/process-editor-integrity.ts').editorIntegrity(seed.initialContent.workspaces, JSON.parse(seed.values.processMasterData), () => []);
    assert.deepEqual(JSON.parse(JSON.stringify(integrity)), [], 'canonical synthetic graph has no structural integrity issues');
    const initial = await f.request({label: 'initial-editor-read'});
    assert.equal(initial.status, 200); assert.equal(initial.body.control.activeVersionId, seed.ids.active);
    assert.equal(initial.body.control.versions.some(v => v.status === 'draft'), false, 'Begin must create an actual draft, not hit an already-open noop');
    assert.deepEqual(initial.body.control.workflow.working, seed.initialContent);
    const reader = await f.request({actor: 'reader', label: 'reader-permissions'});
    assert.equal(reader.status, 200); assert.equal(reader.body.permissions.view, true);
    for (const key of ['edit', 'save', 'submit', 'withdraw', 'approve', 'return']) assert.equal(reader.body.permissions[key], false);
    await unchanged(f, () => f.request({method: 'POST', actor: 'reader', body: {action: 'begin'}, label: 'reader-denied-begin'}), 403, 'FORBIDDEN');
    const begun = await f.request({method: 'POST', body: {action: 'begin'}, label: 'begin'});
    assert.equal(begun.status, 200); assert.equal(f.measurements.at(-1).committed, 1);
    let flow = begun.body.control.workflow;
    assert.equal(flow.generation, seed.ids.generation); assert.equal(flow.saved, null); assert.equal(flow.pendingId, null);
    assert.equal(begun.body.control.versions.filter(v => v.status === 'draft').length, 1);
    await unchanged(f, () => f.request({method: 'POST', body: {action: 'begin'}, label: 'begin-idempotent'}), 200);

    const first = f.apply(flow, 'name', operation(flow.working, seed.ids).name, 'Synthetic applied cycle ' + cycle);
    const applied = await ok(f, first, 'editor', {label: 'guarded-form-apply'}); flow = applied.control.workflow;
    assert.equal(flow.saved, null); assert.deepEqual(flow.active.content, seed.initialContent);
    const sync = f.apply(flow, 'x', 120, 220), synced = await ok(f, sync, 'editor', {label: 'guarded-canvas-sync'}); flow = synced.control.workflow;
    assert.equal(operation(flow.working, seed.ids).x, 220); assert.equal(flow.saved, null);
    const stale = f.apply(flow, 'name', 'Synthetic lifecycle operation', 'Must not overwrite'); delete stale.expectedRevision;
    await unchanged(f, () => f.send(stale, 'editor', {label: 'stale-same-field'}), 409, 'DEPENDENCY_CHANGED_RECONFIRM');
    const replay = await unchanged(f, () => f.send(first, 'editor', {label: 'exact-apply-replay'}), 200);
    assert.equal(replay.body.unchanged, true); assert.deepEqual(replay.body.receipt, applied.receipt);
    await unchanged(f, () => f.send(f.apply(flow, 'name', operation(flow.working, seed.ids).name, 'Reader must not edit', 'reader'), 'reader', {label: 'reader-denied-apply'}), 403, 'FORBIDDEN');
    await unchanged(f, () => f.send(f.command('submit', flow, {savedId: 'not-saved', reason: 'Synthetic save required'}), 'editor', {label: 'submit-before-save'}), 409, 'SUCCESSFUL_SAVE_REQUIRED');

    // Synthetic acknowledgement loss: production handler commits, consumer discards
    // its response, then uses the original operation ID instead of resending.
    const unknown = f.apply(flow, 'x', 220, 240), beforeUnknown = f.row().revision;
    assert.equal(await f.send(unknown, 'editor', {label: 'unknown-acknowledgement-discarded', discardResponse: true}), undefined);
    assert.equal(f.row().revision, beforeUnknown + 1);
    const receiptOnly = await f.request({suffix: '&operationId=' + unknown.operationId, label: 'unknown-receipt-read'});
    assert.equal(receiptOnly.status, 200); assert.equal(receiptOnly.body.receipt.operationId, unknown.operationId);
    const readback = await f.request({label: 'unknown-authoritative-readback'});
    assert.equal(readback.status, 200); flow = readback.body.control.workflow;
    assert.equal(flow.revision, receiptOnly.body.receipt.revision); assert.equal(operation(flow.working, seed.ids).x, 240);
    assert.equal(f.row().revision, beforeUnknown + 1, 'receipt/readback must not retry or mutate the command');
    await unchanged(f, () => f.request({actor: 'reader', suffix: '&operationId=' + unknown.operationId, label: 'reader-denied-receipt'}), 403, 'FORBIDDEN');
    await unchanged(f, () => f.send(f.command('save', flow, {}, 'reader'), 'reader', {label: 'reader-denied-save'}), 403, 'FORBIDDEN');

    const saved = await ok(f, f.command('save', flow), 'editor', {label: 'save'}); flow = saved.control.workflow;
    const savedId = flow.saved.id, savedContent = structuredClone(flow.saved.content);
    assert.equal(saved.receipt.savedId, savedId); assert.deepEqual(savedContent, flow.working); assert.deepEqual(flow.active.content, seed.initialContent);
    await unchanged(f, () => f.send(f.command('submit', flow, {savedId, reason: 'Synthetic missing revision', expectedRevision: undefined}), 'editor', {label: 'submit-missing-revision'}), 409, 'DRAFT_REVISION_REQUIRED');
    await unchanged(f, () => f.send(f.command('submit', flow, {savedId: 'obsolete-save', reason: 'Synthetic stale save'}), 'editor', {label: 'submit-stale-save-id'}), 409, 'SAVED_VERSION_CHANGED_RECONFIRM');
    await unchanged(f, () => f.send(f.command('submit', flow, {savedId, reason: ''}), 'editor', {label: 'submit-missing-reason'}), 422, 'REASON_REQUIRED');
    await unchanged(f, () => f.send(f.command('submit', flow, {savedId, reason: 'Reader denied'}, 'reader'), 'reader', {label: 'reader-denied-submit'}), 403, 'FORBIDDEN');
    const submitted = await ok(f, f.command('submit', flow, {savedId, reason: 'Synthetic lifecycle submission ' + cycle}), 'editor', {label: 'submit'}); flow = submitted.control.workflow;
    const firstCase = flow.pendingId, firstGeneration = flow.generation;
    assert.ok(firstCase); assert.equal(submitted.receipt.caseId, firstCase);
    let persisted = (await f.inspect()).control;
    assert.deepEqual(persisted.workflow.cases.at(-1).content, savedContent); assert.deepEqual(persisted.workflow.active.content, seed.initialContent);
    await unchanged(f, () => f.send(f.apply(flow, 'x', 240, 999), 'editor', {label: 'pending-denied-apply'}), 409, 'PENDING_LOCKED');
    await unchanged(f, () => f.send(f.command('save', flow), 'editor', {label: 'pending-denied-save'}), 409, 'PENDING_LOCKED');
    for (const action of ['withdraw', 'return', 'approve']) await unchanged(f, () => f.send(f.command(action, flow, {caseId: firstCase, reason: 'Reader denied'}, 'reader'), 'reader', {label: 'reader-denied-' + action}), 403, 'FORBIDDEN');
    await unchanged(f, () => f.send(f.command('withdraw', flow, {caseId: firstCase, reason: ''}), 'editor', {label: 'withdraw-missing-reason'}), 422, 'REASON_REQUIRED');
    const withdrawn = await ok(f, f.command('withdraw', flow, {caseId: firstCase, reason: 'Synthetic withdrawal ' + cycle}), 'editor', {label: 'withdraw'}); flow = withdrawn.control.workflow;
    assert.equal(flow.pendingId, null); assert.notEqual(flow.generation, firstGeneration); assert.equal(flow.saved.id, savedId);
    assert.deepEqual(flow.working, savedContent); assert.deepEqual(flow.active.content, seed.initialContent);

    const resubmitted = await ok(f, f.command('submit', flow, {savedId, reason: 'Synthetic resubmit after withdrawal ' + cycle}), 'editor', {label: 'resubmit-after-withdraw'}); flow = resubmitted.control.workflow;
    const secondCase = flow.pendingId, secondGeneration = flow.generation;
    assert.notEqual(secondCase, firstCase); assert.equal(flow.saved.id, savedId);
    await unchanged(f, () => f.send(f.command('return', flow, {caseId: secondCase, reason: ''}, 'reviewer'), 'reviewer', {label: 'return-missing-reason'}), 422, 'REASON_REQUIRED');
    await unchanged(f, () => f.send(f.command('return', flow, {caseId: secondCase, reason: 'Editor denied'}), 'editor', {label: 'editor-denied-return'}), 403, 'FORBIDDEN');
    const returned = await ok(f, f.command('return', flow, {caseId: secondCase, reason: 'Synthetic reviewer return ' + cycle}, 'reviewer'), 'reviewer', {label: 'return'}); flow = returned.control.workflow;
    assert.equal(flow.pendingId, null); assert.notEqual(flow.generation, secondGeneration); assert.equal(flow.saved.id, savedId);
    assert.deepEqual(flow.working, savedContent); assert.deepEqual(flow.active.content, seed.initialContent);

    const finalSubmit = await ok(f, f.command('submit', flow, {savedId, reason: 'Synthetic resubmit after return ' + cycle}), 'editor', {label: 'resubmit-after-return'}); flow = finalSubmit.control.workflow;
    const finalCase = flow.pendingId, finalGeneration = flow.generation;
    assert.ok(![firstCase, secondCase].includes(finalCase));
    await unchanged(f, () => f.send(f.command('approve', flow, {caseId: finalCase}), 'editor', {label: 'editor-denied-approve'}), 403, 'FORBIDDEN');
    persisted = (await f.inspect()).control;
    const pending = persisted.workflow.cases.find(c => c.id === finalCase);
    assert.equal(pending.savedId, savedId); assert.deepEqual(pending.content, savedContent);
    assert.deepEqual(pending.contentIssues.issues, seed.expectedContentIssues, 'current endpoint-selection advisory is explicit, never silently skipped');
    await unchanged(f, () => f.send(f.command('approve', flow, {caseId: finalCase}, 'reviewer'), 'reviewer', {label: 'approve-missing-content-issues-confirmation'}), 409, 'CONTENT_ISSUES_CONFIRM_REQUIRED');
    const approved = await ok(f, f.command('approve', flow, {caseId: finalCase, reason: 'Synthetic lifecycle approval ' + cycle, acknowledgedContentIssues: pending.contentIssues.issues}, 'reviewer'), 'reviewer', {label: 'approve'}); flow = approved.control.workflow;
    assert.equal(flow.pendingId, null); assert.equal(flow.saved, null); assert.notEqual(flow.generation, finalGeneration);
    assert.equal(flow.active.id, finalCase); assert.equal(approved.control.activeVersionId, finalCase); assert.deepEqual(flow.active.content, savedContent);
    persisted = (await f.inspect()).control;
    assert.deepEqual(persisted.workflow.cases.map(c => c.status), ['withdrawn', 'returned', 'approved']);
    for (const reviewCase of persisted.workflow.cases) { assert.deepEqual(reviewCase.content, savedContent); assert.equal(reviewCase.savedId, savedId); assert.deepEqual(reviewCase.before, seed.initialContent); }
    assert.equal(persisted.workflow.saves.length, 1); assert.deepEqual(persisted.workflow.saves[0].content, savedContent);
    assert.equal(persisted.versions.find(v => v.id === seed.ids.active).status, 'superseded');
    assert.deepEqual(persisted.versions.find(v => v.id === seed.ids.active).snapshot, seed.initialContent);
    assert.equal(persisted.versions.find(v => v.id === finalCase).status, 'approved');
    const finalRead = await f.request({actor: 'reader', label: 'reader-effective-readback'});
    assert.equal(finalRead.status, 200); assert.equal(finalRead.body.control.activeVersionId, finalCase);
    assert.deepEqual(finalRead.body.control.workflow.active.content, savedContent);
    const finalState = await f.inspect();
    for (const key of Object.keys(seed.values).filter(key => key !== 'processAuthoringControl')) assert.equal(finalState.values[key], seed.values[key], 'unrelated synthetic value retained: ' + key);
    assert.ok(JSON.parse(f.row().values).__processRecords, 'records-v1 storage format preserved');
    assert.equal(new Set(f.measurements.map(row => row.requestCount)).size, 1);
    assert.equal(f.measurements.reduce((total, row) => total + row.committed, 0), f.row().revision - 1);
    assert.equal(persisted.workflow.cases.at(-1).result.contentIssuesConfirmed, true);
    const prior = reports.find(row => row.status === 'PASS');
    if (prior) { assert.equal(seed.seedBytes, prior.fixtureBytes); assert.equal(seed.contentBytes, prior.contentBytes); assert.deepEqual(f.measurements.map(row => row.label), prior.requests.map(row => row.label)); }
    report.expectedContentIssues = seed.expectedContentIssues;
    report.status = 'PASS'; report.finalRevision = f.row().revision; report.fixedSavedId = savedId; report.caseIds = [firstCase, secondCase, finalCase];
    report.totalRequests = f.measurements.length;
    report.negativeContractRequests = f.measurements.filter(row => row.status >= 400).length;
    report.primaryLifecycleRequests = f.measurements.filter(row => ['begin', 'guarded-form-apply', 'guarded-canvas-sync', 'save', 'submit', 'withdraw', 'resubmit-after-withdraw', 'return', 'resubmit-after-return', 'approve'].includes(row.label)).length;
    t.diagnostic(JSON.stringify({cycle, status: report.status, requests: report.totalRequests, fixtureBytes: report.fixtureBytes, contentBytes: report.contentBytes, finalRevision: report.finalRevision, timing: 'synthetic in-process only'}));
  } catch (error) { report.status = 'FAIL'; report.failure = String(error); throw error; }
  finally { f.close(); }
});


void test('canonical seed reaches actual editor/approval bootstrap; explicit approval denial fails closed', async t => {
  const f = await createProcessDraftLifecycleFixture(); t.after(f.close);
  const positive = {variant: 'explicit-approval-view', status: 'RUNNING', requests: f.measurements}; bootstrapReports.push(positive);
  assert.equal(f.seed.actors.reviewer.accessOverrides['approval.view'], true);
  for (const [actor, suffix, module] of [['editor', '?view=editor', 'editor'], ['reviewer', '?view=approval&approvalTab=process', 'approval'], ['reader', '?view=approval&approvalTab=process', 'approval']]) {
    const result = await unchanged(f, () => f.request({actor, suffix, target: 'bootstrap', label: actor + '-bootstrap-positive'}), 200);
    assert.equal(result.body.identity.id, f.seed.actors[actor].id);
    assert.equal(result.body.destination.module, module);
    assert.equal(result.body.deliveryProjection, true);
    const control = JSON.parse(result.body.values.processAuthoringControl);
    assert.equal(control.activeVersionId, f.seed.ids.active);
    assert.equal(control.workflow, undefined, 'bootstrap is the approved projection, not a shared working mirror');
    assert.equal(control.versions.length, 1); assert.equal(control.versions[0].status, 'approved');
    assert.deepEqual(control.versions[0].snapshot.workspaces[0].stages[f.seed.ids.stage].map(row => row.id), [f.seed.ids.entry, f.seed.ids.operation, f.seed.ids.exit]);
    assert.deepEqual(control.versions[0].snapshot, f.seed.initialContent);
    assert.equal(f.measurements.at(-1).r2put, 0);
  }
  const rights = await f.request({actor: 'reviewer', label: 'reviewer-workflow-rights-unchanged'});
  assert.equal(rights.status, 200);
  for (const action of ['edit', 'create', 'delete', 'save', 'submit', 'withdraw', 'restore']) assert.equal(rights.body.permissions[action], false);
  assert.equal(rights.body.permissions.approve, true); assert.equal(rights.body.permissions.return, true);
  positive.status = 'PASS';

  // Missing an override is not a missing effective permission: the original
  // seed's legacy views:['approval'] already authorized this destination.
  const legacy = await createProcessDraftLifecycleFixture({reviewerApprovalView: null}); t.after(legacy.close);
  const legacyReport = {variant: 'absent-override-legacy-view-remains-authorized', status: 'RUNNING', requests: legacy.measurements}; bootstrapReports.push(legacyReport);
  assert.equal(Object.hasOwn(legacy.seed.actors.reviewer.accessOverrides, 'approval.view'), false);
  const inherited = await unchanged(legacy, () => legacy.request({actor: 'reviewer', target: 'bootstrap', suffix: '?view=approval&approvalTab=process', label: 'legacy-approval-bootstrap-positive'}), 200);
  assert.equal(inherited.body.destination.module, 'approval'); legacyReport.status = 'PASS';

  const denied = await createProcessDraftLifecycleFixture({reviewerApprovalView: false}); t.after(denied.close);
  const denialReport = {variant: 'explicit-effective-approval-denial', status: 'RUNNING', requests: denied.measurements}; bootstrapReports.push(denialReport);
  const result = await unchanged(denied, () => denied.request({actor: 'reviewer', target: 'bootstrap', suffix: '?view=approval&approvalTab=process', label: 'denied-approval-bootstrap'}), 403, 'DESTINATION_FORBIDDEN');
  assert.equal(result.body.values, undefined); assert.equal(result.body.catalog, undefined); assert.equal(result.body.destination, undefined);
  denialReport.status = 'PASS';

  const missing = await createProcessDraftLifecycleFixture({reviewerApprovalView: null, reviewerLegacyApprovalView: false}); t.after(missing.close);
  const missingReport = {variant: 'no-override-and-no-legacy-approval-view', status: 'RUNNING', requests: missing.measurements}; bootstrapReports.push(missingReport);
  assert.equal(Object.hasOwn(missing.seed.actors.reviewer.accessOverrides, 'approval.view'), false);
  assert.equal(missing.seed.actors.reviewer.views.includes('approval'), false);
  const absent = await unchanged(missing, () => missing.request({actor: 'reviewer', target: 'bootstrap', suffix: '?view=approval&approvalTab=process', label: 'missing-effective-approval-bootstrap'}), 403, 'DESTINATION_FORBIDDEN');
  assert.equal(absent.body.values, undefined); assert.equal(absent.body.catalog, undefined); assert.equal(absent.body.destination, undefined);
  missingReport.status = 'PASS';
  t.diagnostic('actual signed editor bootstrap 200 with three nodes; reviewer/reader approval 200; absent override remains 200 under legacy views; explicit denial or absent effective approval.view 403, no data or writes');
});

void test('seed keeps the legacy reviewer advisory separate from actual per-module approval rights', async t => {
  const f = await createProcessDraftLifecycleFixture(); t.after(f.close);
  const editor = await unchanged(f, () => f.request({suffix: '&permissions=1', label: 'submit-legacy-reviewer-advisory'}), 200);
  assert.equal(editor.body.permissions.submit, true);
  assert.equal(editor.body.otherReviewerAvailable, false, 'Existing advisory checks legacy permissions, not the explicit editor.approve cell');
  const reviewer = await unchanged(f, () => f.request({actor: 'reviewer', suffix: '&permissions=1', label: 'distinct-reviewer-module-rights'}), 200);
  assert.equal(reviewer.body.permissions.approve, true); assert.equal(reviewer.body.permissions.return, true);
  for (const name of ['edit', 'create', 'delete', 'save', 'submit', 'withdraw', 'restore']) assert.equal(reviewer.body.permissions[name], false);
  assert.equal(f.measurements.length, 2);
  for (const request of f.measurements) { assert.equal(request.method, 'GET'); assert.equal(request.committed, 0); assert.equal(request.r2put, 0); }
});
