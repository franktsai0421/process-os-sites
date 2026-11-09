/* oxlint-disable typescript/no-require-imports -- Actual request-local reducers with synthetic, forbidden storage bindings. */
const assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
let reads = 0, writes = 0;
const load = require('./ipqc-ab-import-harness.cjs')({ DB: { prepare() { reads++; throw Error('UNEXPECTED_DB'); } },
  STATE_ARCHIVE: { get() { reads++; throw Error('UNEXPECTED_R2'); }, put() { writes++; throw Error('UNEXPECTED_R2'); } } });
const api = load('lib/master-line-page-workflow.ts'), { beginBasis } = load('lib/workflow-begin.ts');
const { stableDraftJSON } = load('lib/shared-draft.ts');
const author = { id: 'author-fixture', name: 'Synthetic author', admin: false }, peer = { id: 'peer-fixture', name: 'Synthetic peer', admin: false };
const reviewer = { id: 'reviewer-fixture', name: 'Synthetic reviewer', admin: false };
const plain = value => JSON.parse(JSON.stringify(value));
const checks = []; let ids = 0;
function fixture() {
  const partition = code => ({ lines: [{ id: 'line', code, name: code, stages: [{ id: 'stage', code: code + '-1', name: 'Stage', media: '/synthetic/' + code }] }] });
  return { control: { scope: 'master:LINES', activeVersionId: 'approved-page', versions: [{ id: 'approved-page', number: 1, status: 'approved',
    snapshot: { AB: partition('A'), C: partition('C') }, revision: 1, creatorId: author.id, creatorName: author.name, createdAt: 'fixture', updatedAt: 'fixture', history: [] }] }, sequence: 0 };
}
function context(f, overrides = {}) { return { actor: author, at: '2026-11-09T00:00:00Z', id: () => 'generated-' + ++ids,
  activeId: f.control.activeVersionId, allowed: () => true, structure() {}, validate: () => [], semantic: value => value, ...overrides }; }
function begin(f, overrides = {}) {
  const request = { operationId: randomUUID(), basis: plain(beginBasis(f.control)) };
  const result = api.beginMasterLinePage(f.control, request, context(f, overrides)); f.control = result.control; return { request, result };
}
function command(f, action, extra = {}) { return { action, operationId: 'operation-' + ++ids, clientId: 'client-fixture', sequence: ++f.sequence,
  generation: f.control.workflow.generation, ...extra }; }
function save(f, edits = [{ scope: 'AB', before: 'A', after: 'Edited A' }]) {
  const batches = edits.map(edit => { const path = [edit.scope, 'lines', { id: 'line' }, 'name'];
    return { patches: [{ op: 'set', path, value: edit.after }], guards: [{ path, value: edit.before }] }; });
  return command(f, 'save', { moduleAction: 'save-local-v1', patches: batches.flatMap(batch => batch.patches), input: { batches } });
}
function run(f, request, overrides = {}) { const result = api.commandMasterLinePage(f.control, request, context(f, overrides)); f.control = result.control; return result; }
function submit(f) { return command(f, 'submit', { savedId: f.control.workflow.saved.id, expectedRevision: f.control.workflow.revision, reason: 'Synthetic submission' }); }
function review(f, action) { return command(f, action, { caseId: f.control.workflow.pendingId, reason: 'Synthetic review' }); }
function code(fn, expected) { assert.throws(fn, error => error.code === expected, expected); }
function unchanged(f, fn) { const before = JSON.stringify(f.control); fn(); assert.equal(JSON.stringify(f.control), before); }
function check(name, fn) { fn(); checks.push(name); }
check('identified Begin creates one page generation and draft projection without adopting a legacy root', () => {
  const f = fixture(), original = JSON.stringify(f.control), { request, result } = begin(f);
  assert.equal(result.activationAvailable, false); assert.equal(f.control.workflow.scope, 'master:LINES');
  assert.equal(f.control.versions.filter(v => v.status === 'draft').length, 1);
  assert.deepEqual(Object.keys(f.control.workflow.working), ['AB', 'C']);
  assert.equal(JSON.stringify(fixture().control), original);
  unchanged(f, () => assert.equal(api.beginMasterLinePage(f.control, request, context(f)).replayed, true));
  assert.deepEqual(plain(api.masterLinePageReceipt(f.control, request.operationId, context(f))), plain(result.receipt));
});
check('Begin rejects stale basis, foreign owner, revoked rights and mismatched original identity atomically', () => {
  const f = fixture(), { request } = begin(f);
  unchanged(f, () => code(() => api.beginMasterLinePage(f.control, { ...request, operationId: randomUUID() }, context(f)), 'BEGIN_BASIS_CHANGED'));
  unchanged(f, () => code(() => api.beginMasterLinePage(f.control, request, context(f, { actor: peer })), 'OPERATION_ID_REUSED'));
  unchanged(f, () => code(() => api.beginMasterLinePage(f.control, request, context(f, { allowed: p => p !== 'edit' })), 'FORBIDDEN'));
  const foreign = { ...f.control, scope: 'master:AB.lines' };
  code(() => api.beginMasterLinePage(foreign, request, context(f)), 'MASTER_LINE_PAGE_OWNER_INVALID');
});
check('full AB/C Save creates one saved projection and fixed Submit case, preserving approved options until approval', () => {
  const f = fixture(); begin(f); const request = save(f, [{ scope: 'AB', before: 'A', after: 'Edited A' }, { scope: 'C', before: 'C', after: 'Edited C' }]);
  const result = run(f, request), saved = f.control.workflow.saved.id;
  assert.equal(f.control.workflow.saves.length, 1); assert.equal(f.control.workflow.saved.content.C.lines[0].name, 'Edited C');
  assert.equal(f.control.versions.find(v => v.status === 'draft').snapshot.AB.lines[0].name, 'Edited A');
  assert.equal(f.control.workflow.receipts[request.operationId].fingerprint, stableDraftJSON(request));
  const current = api.approvedMasterLinePage(f.control, 'approved-page', context(f)); assert.equal(current.content.AB.lines[0].name, 'A');
  current.content.AB.lines[0].name = 'External mutation';
  run(f, submit(f)); const pending = f.control.versions.find(v => v.status === 'pending');
  assert.equal(pending.id, f.control.workflow.pendingId); assert.equal(f.control.workflow.cases[0].savedId, saved);
  assert.deepEqual(plain(pending.snapshot), plain(f.control.workflow.saved.content));
  assert.equal(api.approvedMasterLinePage(f.control, 'approved-page', context(f)).content.C.lines[0].name, 'C');
  assert.equal(result.activationAvailable, false);
});
check('pending locks the whole page for both filters and identified Begin', () => {
  const f = fixture(); begin(f); run(f, save(f)); run(f, submit(f));
  unchanged(f, () => code(() => run(f, save(f, [{ scope: 'C', before: 'C', after: 'No' }])), 'PENDING_LOCKED'));
  unchanged(f, () => code(() => begin(f, { actor: peer }), 'PENDING_LOCKED'));
});
check('withdraw and return retain original saved content and permit fixed resubmission with one pending case', () => {
  for (const action of ['withdraw', 'return']) {
    const f = fixture(); begin(f); run(f, save(f)); const saved = plain(f.control.workflow.saved); run(f, submit(f));
    const oldGeneration = f.control.workflow.generation; run(f, review(f, action), { actor: action === 'return' ? reviewer : author });
    assert.equal(f.control.workflow.pendingId, null); assert.notEqual(f.control.workflow.generation, oldGeneration);
    assert.deepEqual(plain(f.control.workflow.saved), saved); assert.equal(f.control.versions.filter(v => v.status === 'draft').length, 1);
    run(f, submit(f)); assert.equal(f.control.workflow.cases.filter(c => c.status === 'pending').length, 1);
    assert.equal(f.control.workflow.cases.at(-1).savedId, saved.id);
  }
});
check('approval closes the draft, advances one approved page and keeps original receipts replayable', () => {
  const f = fixture(), original = begin(f); const saveRequest = save(f), receipt = run(f, saveRequest).receipt;
  run(f, submit(f)); const approve = review(f, 'approve'), approved = run(f, approve, { actor: reviewer }).receipt;
  assert.equal(f.control.activeVersionId, f.control.workflow.active.id); assert.notEqual(f.control.activeVersionId, 'approved-page');
  assert.equal(f.control.versions.filter(v => v.status === 'approved').length, 1); assert.equal(f.control.versions.filter(v => v.status === 'draft').length, 0);
  assert.equal(api.approvedMasterLinePage(f.control, f.control.activeVersionId, context(f)).content.AB.lines[0].name, 'Edited A');
  unchanged(f, () => assert.deepEqual(plain(run(f, saveRequest).receipt), plain(receipt)));
  unchanged(f, () => assert.deepEqual(plain(run(f, approve, { actor: reviewer }).receipt), plain(approved)));
  unchanged(f, () => assert.equal(api.beginMasterLinePage(f.control, original.request, context(f)).replayed, true));
  code(() => api.approvedMasterLinePage(f.control, 'approved-page', context(f)), 'ACTIVE_VERSION_CHANGED');
  begin(f); assert.equal(f.control.versions.filter(v => v.status === 'draft').length, 1);
});
check('different editors merge nonconflicts and same-field stale guards reject without changing the control', () => {
  const f = fixture(); begin(f); const staleC = save(f, [{ scope: 'C', before: 'C', after: 'Peer C' }]);
  run(f, save(f)); run(f, staleC, { actor: peer });
  assert.equal(f.control.workflow.saved.content.AB.lines[0].name, 'Edited A'); assert.equal(f.control.workflow.saved.content.C.lines[0].name, 'Peer C');
  unchanged(f, () => code(() => run(f, save(f, [{ scope: 'AB', before: 'A', after: 'Stale' }])), 'DEPENDENCY_CHANGED_RECONFIRM'));
});
check('a later guarded batch failure leaves versions, saved body and original receipts untouched', () => {
  const f = fixture(); begin(f); const request = save(f, [{ scope: 'AB', before: 'A', after: 'First' }, { scope: 'C', before: 'Wrong', after: 'Last' }]);
  unchanged(f, () => code(() => run(f, request), 'DEPENDENCY_CHANGED_RECONFIRM'));
});
check('submit and review check fresh active version, permissions and complete reference validation', () => {
  const f = fixture(); begin(f); run(f, save(f));
  unchanged(f, () => code(() => run(f, submit(f), { activeId: 'other-approved' }), 'ACTIVE_VERSION_CHANGED'));
  unchanged(f, () => code(() => run(f, submit(f), { allowed: p => p !== 'submit' }), 'FORBIDDEN'));
  run(f, submit(f));
  unchanged(f, () => code(() => run(f, review(f, 'approve'), { actor: reviewer, allowed: p => p !== 'approve' }), 'FORBIDDEN'));
  unchanged(f, () => code(() => run(f, review(f, 'approve'), { actor: reviewer, structure() { throw new (load('lib/shared-draft.ts').DraftConflict)('REFERENCE_CHANGED'); } }), 'REFERENCE_CHANGED'));
});
check('topology cannot enter through saved or pending bodies, Apply, restore, or lifecycle payload smuggling', () => {
  const f = fixture(); begin(f); run(f, save(f));
  for (const action of ['apply', 'restore']) unchanged(f, () => code(() => run(f, command(f, action)), 'MASTER_LINE_PAGE_ACTION_INVALID'));
  unchanged(f, () => code(() => run(f, { ...submit(f), input: {} }), 'MASTER_LINE_PAGE_LIFECYCLE_PAYLOAD_INVALID'));
  for (const target of ['working', 'saved']) {
    const bad = plain(f.control); (target === 'working' ? bad.workflow.working : bad.workflow.saved.content).AB.lines[0].code = 'Recode';
    if (target === 'working') bad.versions.find(v => v.status === 'draft').snapshot = plain(bad.workflow.working);
    else bad.workflow.saves[0] = plain(bad.workflow.saved);
    const wrapper = { ...f, control: bad };
    unchanged(wrapper, () => code(() => run(wrapper, target === 'working' ? save(wrapper) : submit(wrapper)), target === 'working' ? 'MASTER_PAGE_NAME_SAVE_ONLY' : 'UNSAVED_CHANGES_SAVE_REQUIRED'));
  }
  run(f, submit(f)); f.control.workflow.cases[0].content.C.lines[0].stages.push({ id: 'new', code: 'New', name: 'New' });
  f.control.versions.find(v => v.status === 'pending').snapshot = plain(f.control.workflow.cases[0].content);
  unchanged(f, () => code(() => run(f, review(f, 'approve'), { actor: reviewer }), 'MASTER_PAGE_NAME_SAVE_ONLY'));
});
check('all retained bodies must be hydrated and owned, with unambiguous line and stage identities', () => {
  for (const mutate of [c => { c.versions[0].snapshot.AB.lines[0].stages = {}; }, c => { c.versions[0].snapshot.C.lines.push(plain(c.versions[0].snapshot.C.lines[0])); },
    c => { c.versions[0].snapshot.AB.lines[0].stages.push(plain(c.versions[0].snapshot.AB.lines[0].stages[0])); }]) {
    const f = fixture(); mutate(f.control); unchanged(f, () => code(() => begin(f), 'MASTER_LINE_PAGE_CONTENT_INVALID'));
  }
  const f = fixture(); begin(f); run(f, save(f)); f.control.workflow.saves[0].content.AB.lines[0].media = { __immutableBody: {} };
  unchanged(f, () => code(() => run(f, submit(f)), 'MASTER_LINE_PAGE_NOT_HYDRATED'));
  const foreign = fixture(); begin(foreign); foreign.control.workflow.scope = 'master:AB.lines';
  unchanged(foreign, () => code(() => run(foreign, save(foreign)), 'MASTER_LINE_PAGE_OWNER_INVALID'));
});
check('receipt lookup remains owner/action scoped, read-only and missing-is-unknown', () => {
  const f = fixture(); const { request } = begin(f); const saveRequest = save(f), saved = run(f, saveRequest).receipt;
  unchanged(f, () => assert.deepEqual(plain(api.masterLinePageReceipt(f.control, saveRequest.operationId, context(f))), plain(saved)));
  for (const overrides of [{ actor: peer }, { allowed: () => false }, { allowed: p => p !== 'save' && p !== 'edit' }])
    unchanged(f, () => code(() => api.masterLinePageReceipt(f.control, saveRequest.operationId, context(f, overrides)), 'FORBIDDEN'));
  unchanged(f, () => code(() => api.masterLinePageReceipt(f.control, request.operationId, context(f, { allowed: p => p !== 'edit' })), 'FORBIDDEN'));
  unchanged(f, () => code(() => api.masterLinePageReceipt(f.control, 'unknown-operation', context(f)), 'OPERATION_NOT_FOUND'));
  unchanged(f, () => code(() => api.approvedMasterLinePage(f.control, f.control.activeVersionId, context(f, { allowed: () => false })), 'FORBIDDEN'));
});
check('serialized reopen preserves both partitions, media, version projections and exact replay identity', () => {
  const f = fixture(); const { request } = begin(f); const saveRequest = save(f), saved = run(f, saveRequest).receipt;
  f.control = plain(f.control); unchanged(f, () => assert.deepEqual(plain(run(f, saveRequest).receipt), plain(saved)));
  assert.equal(api.beginMasterLinePage(f.control, request, context(f)).replayed, true);
  assert.equal(f.control.workflow.working.C.lines[0].stages[0].media, '/synthetic/C');
});
check('Save and Submit retain generation, revision, saved confirmation and no-change gates', () => {
  const f = fixture(); begin(f);
  const empty = command(f, 'save', { moduleAction: 'save-local-v1', patches: [], input: { batches: [] } }); run(f, empty);
  unchanged(f, () => code(() => run(f, submit(f)), 'NO_SUBSTANTIVE_CHANGE'));
  run(f, save(f));
  unchanged(f, () => code(() => run(f, { ...submit(f), savedId: 'wrong-save' }), 'SAVED_VERSION_CHANGED_RECONFIRM'));
  unchanged(f, () => code(() => run(f, { ...submit(f), expectedRevision: 0 }), 'DRAFT_REVISION_CHANGED_RECONFIRM'));
  unchanged(f, () => code(() => run(f, { ...save(f), generation: 'other-generation' }), 'STALE_GENERATION'));
  run(f, submit(f)); unchanged(f, () => code(() => run(f, review(f, 'approve')), 'SELF_REVIEW_CONFIRM_REQUIRED'));
  const oldCase = f.control.workflow.pendingId; run(f, review(f, 'approve'), { actor: reviewer }); begin(f);
  unchanged(f, () => code(() => run(f, command(f, 'withdraw', { caseId: oldCase, reason: 'No rollback' })), 'CASE_NOT_PENDING'));
});
check('late authority loss cannot publish a partial Save or a numeric version projection', () => {
  const f = fixture(); begin(f); let permitted = true;
  const request = save(f, [{ scope: 'AB', before: 'A', after: 'First' }, { scope: 'C', before: 'C', after: 'Last' }]);
  unchanged(f, () => code(() => run(f, request, { allowed: () => permitted, structure() { permitted = false; } }), 'FORBIDDEN'));
});
check('inconsistent pending, saved or draft projections are refused rather than silently repaired', () => {
  for (const target of ['draft', 'saved', 'pending']) {
    const f = fixture(); begin(f); run(f, save(f));
    if (target === 'pending') run(f, submit(f));
    // Serialized projections are independent bodies; corrupt only one of them.
    f.control = plain(f.control);
    if (target === 'pending') f.control.versions.find(v => v.status === 'pending').snapshot.AB.lines[0].name = 'Other';
    else if (target === 'draft') f.control.versions.find(v => v.status === 'draft').snapshot.AB.lines[0].name = 'Other';
    else f.control.workflow.saved.content.AB.lines[0].name = 'Other';
    unchanged(f, () => code(() => api.approvedMasterLinePage(f.control, f.control.activeVersionId, context(f)), 'MASTER_LINE_PAGE_OWNER_INVALID'));
  }
});
assert.equal(reads, 0); assert.equal(writes, 0);
console.log(JSON.stringify({ status: 'PASS', checks, storageReads: reads, storageWrites: writes,
  scope: 'inactive single-page existing-name lifecycle; no adoption, topology planner, ACL mapping, HTTP or storage/CAS' }, null, 2));
