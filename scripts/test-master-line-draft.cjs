/* oxlint-disable typescript/no-require-imports -- Real reducers in a no-storage synthetic VM. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const load = require('./ipqc-ab-import-harness.cjs')({ DB: { prepare() { throw Error('UNEXPECTED_DB'); } }, STATE_ARCHIVE: { get() { throw Error('UNEXPECTED_R2'); }, put() { throw Error('UNEXPECTED_R2'); } } });
const api = load('lib/master-line-draft.ts'), draft = load('lib/shared-draft.ts');
const { beginBasis } = load('lib/workflow-begin.ts');
const { stageDefaultTemplates } = load('lib/master-stage-link.ts');
const plain = v => JSON.parse(JSON.stringify(v));
const author = { id: 'author-fixture', name: 'Synthetic author', admin: false };
const reviewer = { id: 'reviewer-fixture', name: 'Synthetic reviewer', admin: false };
let ids = 0, groups = 0;
const source = (scope, line) => ({ lines: [{ id: 'line-' + line, code: line, name: line, extension: 'retain', stages: [{ id: 'stage-1', code: line + '-1', name: 'One' }] }], products: [{ id: 'product-' + line, code: 'P-' + line, name: 'Product', line, category: 'Fixture', stages: [line + '-1'], routeMode: 'exception' }], categoryGroups: [{ id: 'group-' + line, line, name: 'Fixture', defaultStages: [line + '-1'] }], extension: { untouched: scope } });
function assertNewStageTemplates(actual, code) {
  assert.deepEqual(plain(actual.filter(t => t.presetKey)), plain(stageDefaultTemplates(code)));
  const custom = actual.filter(t => !t.presetKey);
  assert.equal(custom.length, 1); assert.equal(custom[0].name, '自訂');
  assert.equal(custom[0].editorType, 'custom'); assert.deepEqual(plain(custom[0].machineIds), []);
}
function fixture(scope = 'AB') {
  const root = { active: { AB: source('AB', 'A'), C: source('C', 'C'), PROCESS: { 'A-1': plain(stageDefaultTemplates('A-1')), 'C-1': plain(stageDefaultTemplates('C-1')) } }, versions: [], workflowScopes: {}, extension: { untouched: true } };
  for (const key of ['AB', 'C', 'PROCESS']) root.versions.push({ id: 'source-' + key, scope: key, status: 'approved', snapshot: plain(root.active[key]), number: 1 });
  const control = { activeVersionId: 'line-base-' + scope, versions: [{ id: 'line-base-' + scope, status: 'approved', snapshot: { lines: plain(root.active[scope].lines) }, number: 1, revision: 1, creatorId: author.id, creatorName: author.name, createdAt: 'fixture', updatedAt: 'fixture', history: [] }] };
  const ctx = { root, values: {}, actor: author, at: '2026-11-07T00:00:00Z', id: () => 'generated-' + ++ids, allowed: () => true, create: true, delete: true, restore: true };
  return { control, ctx, scope, line: scope === 'AB' ? 'A' : 'C', sequence: 0 };
}
function begin(f, override = {}) { const request = { operationId: randomUUID(), basis: plain(beginBasis(f.control)) }; const result = api.beginMasterLineCandidate(f.control, f.scope, request, { ...f.ctx, ...override }); f.control = result.control; return { request, result }; }
function command(f, action, extra = {}) { return { action, operationId: 'operation-' + ++ids, clientId: 'client-fixture', sequence: ++f.sequence, generation: f.control.workflow.generation, ...extra }; }
function run(f, cmd, override = {}) { const result = api.commandMasterLineCandidate(f.control, f.scope, cmd, { ...f.ctx, ...override }); f.control = result.control; return result; }
function save(f, batches) { return command(f, 'save', { moduleAction: 'save-local-v1', patches: batches.flatMap(b => b.patches), input: { batches } }); }
function add(f, code = f.line + '-2') { return save(f, [{ patches: [{ op: 'insert', path: ['lines', { id: 'line-' + f.line }, 'stages'], value: { id: 'stage-2', code, name: 'Two' } }], guards: [] }]); }
function rename(f, before, after, field = 'name') { const path = ['lines', { id: 'line-' + f.line }, field]; return save(f, [{ patches: [{ op: 'set', path, value: after }], guards: [{ path, value: before }] }]); }
function submit(f) { return command(f, 'submit', { savedId: f.control.workflow.saved.id, expectedRevision: f.control.workflow.revision, reason: 'Fixture submission' }); }
function code(fn, expected) { assert.throws(fn, e => e.code === expected, expected); }
function check(name, fn) { fn(); groups++; console.log('PASS ' + name); }
function retain(f, fn) { const before = JSON.stringify({ control: f.control, root: f.ctx.root }); fn(); assert.equal(JSON.stringify({ control: f.control, root: f.ctx.root }), before); }
function publishFixture(f, result) { // Explicit test-only CAS commit; no production adoption path.
  const root = plain(f.ctx.root), prior = root.versions.find(v => v.id === 'source-' + f.scope && v.status === 'approved');
  prior.status = 'superseded'; root.active[f.scope].lines = plain(result.control.workflow.active.content.lines);
  root.versions.push({ id: 'fixture-compatibility-' + ++ids, scope: f.scope, status: 'approved', snapshot: plain(root.active[f.scope]), number: 2 });
  root.active.PROCESS = plain(result.process.active); root.versions = [...root.versions.filter(v => v.scope !== 'PROCESS'), ...plain(result.process.versions)];
  f.ctx.root = root;
}
for (const scope of ['AB', 'C']) {
  check(scope + ' refuses absent baseline and never adopts legacy saved/pending as approved', () => {
    const f = fixture(scope); code(() => api.beginMasterLineCandidate({}, scope, { operationId: randomUUID(), basis: {} }, f.ctx), 'INVALID_BEGIN_IDENTITY');
    code(() => api.beginMasterLineCandidate({ versions: [] }, scope, { operationId: randomUUID(), basis: plain(beginBasis(f.control)) }, f.ctx), 'MASTER_LINE_BASELINE_REQUIRED');
    f.ctx.root.versions.find(v => v.scope === scope).status = 'pending'; code(() => begin(f), 'MASTER_EFFECTIVE_BASELINE_CONFLICT');
  });
  check(scope + ' identified Begin retains original receipt and rejects stale/foreign/invalid replay', () => {
    const f = fixture(scope), original = plain(f.ctx.root), { request, result } = begin(f);
    assert.equal(f.control.workflow.scope, 'master:' + scope + '.lines'); assert.deepEqual(plain(f.ctx.root), original);
    assert.equal(api.beginMasterLineCandidate(f.control, scope, request, f.ctx).replayed, true);
    assert.deepEqual(plain(api.masterLineCandidateReceipt(f.control, scope, request.operationId, f.ctx)), plain(result.receipt));
    code(() => api.beginMasterLineCandidate(f.control, scope, request, { ...f.ctx, actor: reviewer }), 'OPERATION_ID_REUSED');
    code(() => api.beginMasterLineCandidate(f.control, scope, { ...request, operationId: randomUUID() }, f.ctx), 'BEGIN_BASIS_CHANGED');
  });
  check(scope + ' local input does not write; explicit Save is atomic and approved options stay unchanged', () => {
    const f = fixture(scope); begin(f); const original = JSON.stringify(f.control), cmd = add(f); assert.equal(JSON.stringify(f.control), original);
    const root = JSON.stringify(f.ctx.root), result = run(f, cmd); assert.equal(result.activationAvailable, false); assert.equal(JSON.stringify(f.ctx.root), root);
    assert.equal(f.control.workflow.working.lines[0].stages.length, 2); assert.equal(f.control.workflow.saved.content.lines[0].stages.length, 2);
    assert.equal(Object.keys(f.control.workflow.receipts).length, 2); assert.equal(api.approvedMasterLineOptions(f.ctx.root, scope).content.lines[0].stages.length, 1);
    assert.equal(f.control.workflow.working.lines[0].extension, 'retain'); assert.deepEqual(Object.keys(f.control.workflow.working), ['lines']);
    code(() => run(f, command(f, 'apply', { patches: [] })), 'MASTER_LINE_EXPLICIT_SAVE_REQUIRED');
    code(() => run(f, command(f, 'save')), 'MASTER_LINE_EXPLICIT_SAVE_REQUIRED');
  });
  check(scope + ' saved topology is fixed pending; approval stages line and PROCESS changes together', () => {
    const f = fixture(scope); begin(f); run(f, add(f)); const sent = run(f, submit(f)), caseId = sent.receipt.caseId;
    assert.equal(api.approvedMasterLineOptions(f.ctx.root, scope).content.lines[0].stages.length, 1);
    const review = f.control.workflow.cases.at(-1); assert.equal(review.linkedProcess.added[0], f.line + '-2');
    retain(f, () => code(() => run(f, rename(f, f.line, 'Locked')), 'PENDING_LOCKED'));
    retain(f, () => code(() => run(f, command(f, 'approve', { caseId })), 'SELF_REVIEW_CONFIRM_REQUIRED'));
    const priorCatalog = plain(f.ctx.root.active[scope].products), result = run(f, command(f, 'approve', { caseId }), { actor: reviewer });
    assertNewStageTemplates(result.process.active[f.line + '-2'], f.line + '-2'); assert.equal(f.control.workflow.active.content.lines[0].stages.length, 2);
    assert.deepEqual(plain(f.ctx.root.active[scope].products), priorCatalog); publishFixture(f, result);
    assert.equal(api.approvedMasterLineOptions(f.ctx.root, scope).content.lines[0].stages.length, 2);
    assert.equal(f.control.workflow.saved, null); assert.equal(f.control.workflow.saves.length, 1);
  });
  check(scope + ' ordered Save rolls back all batches, receipts and dependencies on a later conflict', () => {
    const f = fixture(scope); begin(f); const path = ['lines', { id: 'line-' + f.line }, 'name'];
    const cmd = save(f, [{ patches: [{ op: 'set', path, value: 'First' }], guards: [{ path, value: f.line }] }, { patches: [{ op: 'set', path, value: 'Second' }], guards: [{ path, value: 'Wrong' }] }]);
    retain(f, () => code(() => run(f, cmd), 'DEPENDENCY_CHANGED_RECONFIRM')); assert.equal(f.control.workflow.saved, null);
  });
  check(scope + ' different fields merge; same field conflicts; explicit mine/theirs requires new guards', () => {
    const f = fixture(scope); begin(f); const stale = rename(f, f.line, 'Mine'); stale.clientId = 'other-client-fixture'; run(f, rename(f, f.line, 'Other'));
    retain(f, () => code(() => run(f, stale), 'DEPENDENCY_CHANGED_RECONFIRM'));
    const path = ['lines', { id: 'line-' + f.line }, 'stages', { id: 'stage-1' }, 'name'];
    run(f, save(f, [{ patches: [{ op: 'set', path, value: 'Different field' }], guards: [{ path, value: 'One' }] }])); assert.equal(f.control.workflow.working.lines[0].name, 'Other');
    run(f, rename(f, 'Other', 'Mine')); assert.equal(f.control.workflow.saved.content.lines[0].name, 'Mine');
  });
  check(scope + ' permissions gate Begin, edit-grants-Save, create/delete, submit and recovery', () => {
    const f = fixture(scope); code(() => begin(f, { allowed: () => false }), 'FORBIDDEN'); begin(f);
    retain(f, () => code(() => run(f, add(f), { create: false }), 'FORBIDDEN'));
    run(f, rename(f, f.line, 'Edited'), { allowed: p => ['view', 'edit'].includes(p) });
    retain(f, () => code(() => run(f, submit(f), { allowed: p => p !== 'submit' }), 'FORBIDDEN'));
    const path = ['lines', { id: 'line-' + f.line }, 'stages', { id: 'stage-1' }];
    retain(f, () => code(() => run(f, save(f, [{ patches: [{ op: 'remove', path }], guards: [{ path, value: f.control.workflow.working.lines[0].stages[0] }] }] ), { delete: false }), 'FORBIDDEN'));
    const operation = Object.keys(f.control.workflow.receipts).at(-1);
    code(() => api.masterLineCandidateReceipt(f.control, scope, operation, { ...f.ctx, actor: reviewer }), 'FORBIDDEN');
    code(() => api.masterLineCandidateReceipt(f.control, scope, operation, { ...f.ctx, allowed: () => false }), 'FORBIDDEN');
  });
  check(scope + ' cross-owner patches, identity changes, duplicate codes and code/name validation refuse', () => {
    const f = fixture(scope); begin(f);
    retain(f, () => code(() => run(f, save(f, [{ patches: [{ op: 'insert', path: ['products'], value: { id: 'bad' } }], guards: [] }])), 'MASTER_DOCUMENT_OWNERSHIP_VIOLATION'));
    retain(f, () => code(() => run(f, add(f, scope === 'AB' ? 'C-1' : 'A-1')), 'LINE_STAGE_USED_IN_OTHER_SCOPE'));
    retain(f, () => code(() => run(f, add(f, f.line + '-1')), 'STAGE_INVALID'));
    retain(f, () => code(() => run(f, rename(f, f.line, 'bad code', 'code')), 'LINE_CODE_INVALID'));
    retain(f, () => code(() => run(f, rename(f, f.line, ' ')), 'NAME_REQUIRED'));
  });
  check(scope + ' return/withdraw retain saved/history and original-generation receipts for resubmission', () => {
    const f = fixture(scope); begin(f); const cmd = rename(f, f.line, 'Edited'), saved = run(f, cmd).receipt;
    for (const action of ['return', 'withdraw']) {
      const pending = run(f, submit(f)).receipt.caseId;
      run(f, command(f, action, { caseId: pending, reason: 'Fixture reason' }), { actor: action === 'return' ? reviewer : author });
      assert.equal(f.control.workflow.saved.id, saved.savedId); assert.equal(f.control.workflow.pendingId, null);
    }
    assert.equal(run(f, cmd).replayed, true); assert.equal(f.control.workflow.cases.length, 2);
    assert.deepEqual(plain(api.masterLineCandidateReceipt(f.control, scope, cmd.operationId, f.ctx)), plain(saved));
    code(() => api.masterLineCandidateReceipt(f.control, scope, 'missing-operation', f.ctx), 'OPERATION_NOT_FOUND');
    assert.equal(f.control.workflow.saved.id, saved.savedId);
  });
  check(scope + ' new restore stays disabled with and without legacy rights', () => {
    const f = fixture(scope); begin(f); run(f, rename(f, f.line, 'First')); const savedId = f.control.workflow.saved.id; run(f, rename(f, 'First', 'Second'));
    const cmd = command(f, 'restore', { restoreSaveId: savedId, expectedRevision: f.control.workflow.revision });
    retain(f, () => code(() => run(f, cmd, { restore: false }), 'RESTORE_PERMISSION_REQUIRED'));
    retain(f, () => code(() => run(f, cmd, { create: false, delete: false }), 'RESTORE_DISABLED'));
    assert.equal(f.control.workflow.working.lines[0].name, 'Second');
    assert.equal(f.control.workflow.saved.content.lines[0].name, 'Second');
  });
  check(scope + ' committed legacy restore receipt remains exact and read-only without new restore', () => {
    const f = fixture(scope); begin(f); run(f, rename(f, f.line, 'Saved'));
    const cmd = command(f, 'restore', { restoreSaveId: 'legacy-saved-fixture', expectedRevision: 0 });
    const receipt = { operationId: cmd.operationId, generation: f.control.workflow.generation,
      revision: 0, savedId: 'legacy-saved-fixture', caseId: null, unchanged: false };
    f.control.workflow.receipts[cmd.operationId] = { actorId: author.id,
      fingerprint: draft.stableDraftJSON(cmd), result: plain(receipt) };
    retain(f, () => {
      const result = api.commandMasterLineCandidate(f.control, scope, cmd, f.ctx);
      assert.equal(result.replayed, true); assert.equal(result.activationAvailable, false);
      assert.deepEqual(plain(result.receipt), receipt); assert.deepEqual(plain(result.control), plain(f.control));
      assert.deepEqual(plain(api.masterLineCandidateReceipt(f.control, scope, cmd.operationId, f.ctx)), receipt);
      result.receipt.savedId = 'mutated-return-only';
      assert.equal(f.control.workflow.receipts[cmd.operationId].result.savedId, receipt.savedId);
    });
    retain(f, () => code(() => api.commandMasterLineCandidate(f.control, scope, { ...cmd, restoreSaveId: 'changed' }, f.ctx), 'OPERATION_ID_REUSED'));
    retain(f, () => code(() => api.commandMasterLineCandidate(f.control, scope, cmd, { ...f.ctx, actor: reviewer }), 'OPERATION_ID_REUSED'));
    for (const denied of ['view', 'edit']) retain(f, () => code(() =>
      api.commandMasterLineCandidate(f.control, scope, cmd, { ...f.ctx, allowed: permission => permission !== denied }), 'FORBIDDEN'));
    retain(f, () => code(() => api.commandMasterLineCandidate(f.control, scope, cmd, { ...f.ctx, restore: false }), 'RESTORE_PERMISSION_REQUIRED'));
    retain(f, () => code(() => api.masterLineCandidateReceipt(f.control, scope, cmd.operationId, { ...f.ctx, restore: false }), 'FORBIDDEN'));
    retain(f, () => code(() => api.masterLineCandidateReceipt(f.control, scope, 'unknown-restore-operation', f.ctx), 'OPERATION_NOT_FOUND'));
    retain(f, () => code(() => api.commandMasterLineCandidate(f.control, scope,
      { ...cmd, operationId: 'new-restore-operation', sequence: cmd.sequence + 1 }, f.ctx), 'RESTORE_DISABLED'));
  });
  check(scope + ' new restore preserves current edit and operation-identity admission', () => {
    const f = fixture(scope); begin(f); run(f, rename(f, f.line, 'Saved'));
    const cmd = command(f, 'restore', { restoreSaveId: f.control.workflow.saved.id, expectedRevision: f.control.workflow.revision });
    retain(f, () => code(() => run(f, cmd, { allowed: permission => permission !== 'edit' }), 'FORBIDDEN'));
    for (const invalid of [{ operationId: '' }, { operationId: '?' }, { operationId: 'x'.repeat(101) },
      { clientId: '' }, { clientId: '?' }, { clientId: 'x'.repeat(101) }, { sequence: 0 }, { sequence: 1.5 }, { sequence: Number.MAX_SAFE_INTEGER + 1 }])
      retain(f, () => code(() => run(f, { ...cmd, ...invalid }), 'INVALID_OPERATION'));
    retain(f, () => code(() => run(f, cmd), 'RESTORE_DISABLED'));
  });
  check(scope + ' new restore refusal retains current create/delete permission ordering', () => {
    const f = fixture(scope); begin(f); run(f, rename(f, f.line, 'Saved'));
    const savedId = f.control.workflow.saved.id;
    f.control.workflow.working.lines[0].stages.push({ id: 'unsaved-extra', code: f.line + '-extra', name: 'Extra' });
    const cmd = command(f, 'restore', { restoreSaveId: savedId, expectedRevision: f.control.workflow.revision });
    retain(f, () => code(() => run(f, cmd, { delete: false }), 'RESTORE_DELETE_PERMISSION_REQUIRED'));
    retain(f, () => code(() => run(f, cmd), 'RESTORE_DISABLED'));
    f.control.workflow.working.lines[0].stages = [];
    retain(f, () => code(() => run(f, cmd, { create: false }), 'RESTORE_CREATE_PERMISSION_REQUIRED'));
    retain(f, () => code(() => run(f, cmd), 'RESTORE_DISABLED'));
  });
  check(scope + ' PROCESS busy/source drift and pending links preserve all candidate inputs', () => {
    const f = fixture(scope); begin(f); f.ctx.root.workflowScopes.PROCESS = plain(draft.createSharedDraft('master:PROCESS', f.ctx.root.active.PROCESS, 'source-PROCESS', 'process-generation'));
    f.ctx.root.workflowScopes.PROCESS.saved = { content: {}, id: 'saved-process' };
    retain(f, () => code(() => run(f, add(f)), 'PROCESS_TEMPLATE_SCOPE_BUSY'));
    delete f.ctx.root.workflowScopes.PROCESS; run(f, add(f)); const caseId = run(f, submit(f)).receipt.caseId;
    f.ctx.root.versions.find(v => v.scope === 'PROCESS').status = 'superseded'; f.ctx.root.active.PROCESS.extra = [];
    f.ctx.root.versions.push({ id: 'new-process', scope: 'PROCESS', status: 'approved', snapshot: plain(f.ctx.root.active.PROCESS), number: 2 });
    retain(f, () => code(() => run(f, command(f, 'approve', { caseId }), { actor: reviewer }), 'PROCESS_SOURCE_VERSION_CHANGED'));
  });
  check(scope + ' products/categories can select new stages only after approval; category route stays wider than product', () => {
    const f = fixture(scope); begin(f); run(f, add(f)); const caseId = run(f, submit(f)).receipt.caseId;
    const catalog = { products: plain(f.ctx.root.active[scope].products), categoryGroups: plain(f.ctx.root.active[scope].categoryGroups) };
    catalog.products[0].stages.push(f.line + '-2');
    code(() => api.assertMasterCatalogApprovedTopology(catalog, scope, f.ctx), 'PRODUCT_ROUTE_INVALID');
    catalog.products[0].stages.pop(); catalog.categoryGroups[0].defaultStages.push(f.line + '-2');
    code(() => api.assertMasterCatalogApprovedTopology(catalog, scope, f.ctx), 'GROUP_ROUTE_INVALID');
    publishFixture(f, run(f, command(f, 'approve', { caseId }), { actor: reviewer }));
    assert.equal(api.assertMasterCatalogApprovedTopology(catalog, scope, f.ctx).source, 'approved');
    assert.equal(catalog.products[0].stages.length, 1); assert.equal(catalog.categoryGroups[0].defaultStages.length, 2);
    catalog.products[0].stages.push(f.line + '-2'); api.assertMasterCatalogApprovedTopology(catalog, scope, f.ctx);
    catalog.products[0].stages.push(scope === 'AB' ? 'C-1' : 'A-1');
    code(() => api.assertMasterCatalogApprovedTopology(catalog, scope, f.ctx), 'PRODUCT_ROUTE_INVALID');
  });
  check(scope + ' approval rechecks newly approved catalog references and leaves pending content intact', () => {
    const f = fixture(scope), root = f.ctx.root, line = root.active[scope].lines[0];
    line.stages.push({ id: 'unused-stage', code: f.line + '-9', name: 'Unused' });
    root.active.PROCESS[f.line + '-9'] = plain(stageDefaultTemplates(f.line + '-9'));
    root.versions.find(v => v.scope === scope).snapshot = plain(root.active[scope]);
    root.versions.find(v => v.scope === 'PROCESS').snapshot = plain(root.active.PROCESS);
    f.control.versions[0].snapshot = { lines: plain(root.active[scope].lines) };
    begin(f); const path = ['lines', { id: 'line-' + f.line }, 'stages', { id: 'unused-stage' }];
    run(f, save(f, [{ patches: [{ op: 'remove', path }], guards: [{ path, value: plain(line.stages[1]) }] }]));
    const caseId = run(f, submit(f)).receipt.caseId;
    root.active[scope].categoryGroups[0].defaultStages.push(f.line + '-9');
    root.versions.find(v => v.scope === scope).snapshot = plain(root.active[scope]);
    retain(f, () => code(() => run(f, command(f, 'approve', { caseId }), { actor: reviewer }), 'STAGE_IN_USE'));
    assert.equal(f.control.workflow.pendingId, caseId);
  });
  check(scope + ' receipts survive generations; changed command/foreign owner and stale writes refuse', () => {
    const f = fixture(scope); begin(f); const cmd = rename(f, f.line, 'First'); run(f, cmd);
    retain(f, () => code(() => run(f, { ...cmd, reason: 'different request' }), 'OPERATION_ID_REUSED'));
    retain(f, () => code(() => run(f, { ...cmd, operationId: 'fresh-op-fixture', generation: 'wrong-generation' }), 'STALE_GENERATION'));
    const bad = plain(f.control); bad.workflow.scope = scope === 'AB' ? 'master:C.lines' : 'master:AB.lines';
    code(() => api.masterLineCandidateReceipt(bad, scope, cmd.operationId, f.ctx), 'MASTER_LINE_OWNER_MISMATCH');
    const prior = plain(f.control.workflow.receipts), missing = 'unconfirmed-op-fixture';
    code(() => api.masterLineCandidateReceipt(f.control, scope, missing, f.ctx), 'OPERATION_NOT_FOUND');
    assert.deepEqual(plain(f.control.workflow.receipts), prior);
  });
  check(scope + ' complete split closure permits only its own pinned linked approval', () => {
    const f = fixture(scope); begin(f); run(f, add(f)); const caseId = run(f, submit(f)).receipt.caseId;
    f.ctx.root.workflowScopes[scope + '.lines'] = plain(f.control.workflow);
    const result = run(f, command(f, 'approve', { caseId }), { actor: reviewer });
    assert.equal(result.control.workflow.cases.at(-1).status, 'approved');
    assert.equal(f.ctx.root.workflowScopes[scope + '.lines'].pendingId, caseId);
    assertNewStageTemplates(result.process.active[f.line + '-2'], f.line + '-2');
  });
  check(scope + ' sibling split working/saved/pending reserves stage codes and keeps other links locked', () => {
    for (const kind of ['working', 'saved', 'pending']) {
      const f = fixture(scope), other = scope === 'AB' ? 'C' : 'AB'; begin(f);
      const active = { lines: plain(f.ctx.root.active[other].lines) };
      const flow = plain(draft.createSharedDraft('master:' + other + '.lines', active, 'other-active', 'other-generation'));
      const reserved = plain(active); reserved.lines[0].stages.push({ id: 'reserved-id', code: f.line + '-2', name: 'Reserved' });
      if (kind === 'working') flow.working = reserved;
      if (kind === 'saved') flow.saved = { id: 'other-saved', content: reserved };
      if (kind === 'pending') { flow.pendingId = 'other-pending'; flow.cases.push({ id: flow.pendingId, status: 'pending', content: reserved, before: active }); }
      f.ctx.root.workflowScopes[other + '.lines'] = flow;
      retain(f, () => code(() => run(f, add(f)), 'LINE_STAGE_USED_IN_OTHER_SCOPE'));
    }
    const f = fixture(scope); begin(f); const other = scope === 'AB' ? 'C' : 'AB';
    const active = { lines: plain(f.ctx.root.active[other].lines) };
    const flow = plain(draft.createSharedDraft('master:' + other + '.lines', active, 'other-active', 'other-generation'));
    flow.pendingId = 'other-pending'; flow.cases.push({ id: flow.pendingId, status: 'pending', content: active, before: active, linkedProcess: { scope: 'PROCESS' } });
    f.ctx.root.workflowScopes[other + '.lines'] = flow;
    retain(f, () => code(() => run(f, add(f)), 'LINKED_PROCESS_CASE_PENDING'));
  });
  check(scope + ' foreign catalog drafts still protect removed stages and line issues exclude unrelated product completeness', () => {
    const f = fixture(scope); f.ctx.root.active[scope].products[0].name = '';
    f.ctx.root.versions.find(v => v.scope === scope).snapshot = plain(f.ctx.root.active[scope]);
    begin(f); run(f, rename(f, f.line, 'Name only')); run(f, submit(f));
    assert.equal(f.control.workflow.cases.at(-1).contentIssues.issues.length, 0);
    const g = fixture(scope), source = g.ctx.root.active[scope]; source.lines[0].stages.push({ id: 'unused-stage', code: g.line + '-9', name: 'Unused' });
    g.ctx.root.versions.find(v => v.scope === scope).snapshot = plain(source); g.control.versions[0].snapshot = { lines: plain(source.lines) };
    const active = { products: plain(source.products), categoryGroups: plain(source.categoryGroups) };
    const catalog = plain(draft.createSharedDraft('master:' + scope + '.catalog', active, 'catalog-active', 'catalog-generation'));
    catalog.working.categoryGroups[0].defaultStages.push(g.line + '-9'); g.ctx.root.workflowScopes[scope + '.catalog'] = catalog;
    begin(g); const path = ['lines', { id: 'line-' + g.line }, 'stages', { id: 'unused-stage' }];
    retain(g, () => code(() => run(g, save(g, [{ patches: [{ op: 'remove', path }], guards: [{ path, value: plain(source.lines[0].stages[1]) }] }])), 'STAGE_IN_USE'));
  });
  check(scope + ' current approved catalog routes protect stage deletion at Save', () => {
    const f = fixture(scope); begin(f); const path = ['lines', { id: 'line-' + f.line }, 'stages', { id: 'stage-1' }];
    retain(f, () => code(() => run(f, save(f, [{ patches: [{ op: 'remove', path }], guards: [{ path, value: f.control.workflow.working.lines[0].stages[0] }] }])), 'STAGE_IN_USE'));
  });
}
console.log(JSON.stringify({ status: 'PASS', groups, persistence: 'NO_STORAGE', activationAvailable: false }));
