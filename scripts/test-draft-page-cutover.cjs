/* oxlint-disable typescript/no-require-imports -- Actual pure planners/kernel, synthetic complete sources and forbidden storage. */
const assert = require('node:assert/strict'), { createHash } = require('node:crypto');
let reads = 0, writes = 0, ids = 0;
const load = require('./ipqc-ab-import-harness.cjs')({ DB: { prepare() { reads++; throw Error('UNEXPECTED_DB'); } },
  STATE_ARCHIVE: { get() { reads++; throw Error('UNEXPECTED_R2'); }, put() { writes++; throw Error('UNEXPECTED_R2'); } } });
const api = load('lib/draft-page-cutover.ts'), draft = load('lib/shared-draft.ts'), routine = load('lib/routine-fqc.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(draft.stableDraftJSON(value)).digest('hex');
const author = { id: 'author-fixture', name: 'Synthetic author', admin: false }, reviewer = { id: 'reviewer-fixture', name: 'Synthetic reviewer', admin: false };
function fixture() {
  const catalog = line => ({ products: [{ id: 'product-' + line, code: 'P-' + line, line, category: 'Group', stages: [line + '-1'], name: 'Product' }],
    categoryGroups: [{ id: 'group-' + line, line, name: 'Group', defaultStages: [line + '-1'] }],
    lines: [{ id: 'line-' + line, code: line, name: line, stages: [{ id: 'stage', code: line + '-1', name: 'Stage', media: '/synthetic/' + line }] }] });
  const root = { active: { AB: catalog('A'), C: catalog('C'), PROCESS: {} }, versions: [], workflowScopes: {}, unknownExtension: { keep: '  { "number": 1e2 }  ' } };
  for (const scope of ['AB', 'C', 'PROCESS']) {
    root.versions.push({ id: 'approved-' + scope, scope, status: 'approved', snapshot: plain(root.active[scope]) });
    root.workflowScopes[scope] = plain(draft.createSharedDraft('master:' + scope, root.active[scope], 'approved-' + scope, 'generation-' + scope));
  }
  const rf = routine.emptyRoutine(); rf.revision = 3;
  function document(id, approved) {
    const content = { title: 'Document ' + id, date: '2026-11-09', notes: '  { "number": 1e2 }  ', lines: [], reason: '', disposition: '', evidence: ['/synthetic/' + id] };
    let flow = draft.createSharedDraft('routine-fqc:' + id, content, null, 'generation-' + id), sequence = 0;
    const ctx = actor => ({ actor, at: '2026-11-09T00:00:00Z', id: () => 'generated-' + ++ids, allowed: () => true,
      activeId: flow.active.id, structure() {}, validate: () => [], semantic: value => value });
    const run = (action, actor = author, extra = {}) => { const command = { action, operationId: 'operation-' + ++ids, clientId: 'client-fixture', sequence: ++sequence,
      generation: flow.generation, ...extra }; flow = draft.applyDraftCommand(flow, command, ctx(actor)).state; };
    run('save');
    if (approved) { run('submit', author, { savedId: flow.saved.id, expectedRevision: flow.revision, reason: 'Synthetic submission' }); run('approve', reviewer, { caseId: flow.pendingId }); }
    return { id, number: 'SYNTHETIC-' + id, kind: 'plan', planId: null, caseId: null, correctionOf: null, createdAt: 'fixture', owner: author, flow: plain(flow) };
  }
  rf.documents.push(document('approved-doc', true), document('draft-doc', false));
  rf.cases.push({ id: 'business-failure', status: 'open', notes: 'retain business failure independently of approval cases' });
  rf.receipts['outer-operation'] = { actorId: author.id, fingerprint: '  { "number": 1e2 }  ', result: { untouched: true } };
  root.workflowScopes.AB.working.products[0].name = 'Unapproved catalog';
  root.workflowScopes.PROCESS.working['draft-stage'] = [{ id: 'untouched-process', name: 'Keep independent PROCESS working' }];
  return { root, rf };
}
function source(f) { return { revision: 42, masterRaw: JSON.stringify(f.root, null, 2), routineRaw: JSON.stringify(f.rf, null, 2) }; }
function pins(s) { return { revision: s.revision, rootDigest: hash(JSON.parse(s.masterRaw)), routineRawDigest: hash(s.routineRaw),
  versions: { AB: 'approved-AB', C: 'approved-C', PROCESS: 'approved-PROCESS' } }; }
const checks = [];
async function check(name, fn) { await fn(); checks.push(name); }
async function rejects(source, expected, code) {
  const before = JSON.stringify(source); await assert.rejects(api.planDraftPageCutover(source, expected), error => error.code === code); assert.equal(JSON.stringify(source), before);
}
(async () => {
  await check('plan covers all thirteen pages and projects changed owners from approved sources only', async () => {
    const f = fixture(), s = source(f), before = JSON.stringify(s), result = await api.planDraftPageCutover(s, pins(s));
    assert.equal(result.pages.length, 13); assert.equal(result.activationAvailable, false);
    assert.deepEqual(plain(result.masterDocuments.map(doc => doc.scope)), ['master:AB.catalog', 'master:C.catalog', 'master:LINES']);
    assert.equal(result.masterDocuments[0].content.products[0].name, 'Product');
    assert.equal(result.routine.scope, 'routine-fqc:page'); assert.equal(result.routine.approvedDocuments.length, 1);
    assert.equal(result.routine.approvedDocuments[0].document.id, 'approved-doc');
    assert.equal(result.routine.createsApprovedVersion, false); assert.equal(result.routine.newWorkflowCreated, false);
    assert.equal(JSON.stringify(s), before);
  });
  await check('old drafts may be omitted from new projections while exact originals history receipts and media remain retained', async () => {
    const s = source(fixture()), result = await api.planDraftPageCutover(s, pins(s));
    assert.equal(result.retainedSource.masterRaw, s.masterRaw); assert.equal(result.retainedSource.routineRaw, s.routineRaw);
    const restored = JSON.parse(result.retainedSource.routineRaw);
    assert.equal(restored.documents[1].flow.saved.content.evidence[0], '/synthetic/draft-doc');
    assert.equal(restored.receipts['outer-operation'].fingerprint, '  { "number": 1e2 }  ');
    assert.equal(restored.cases[0].id, 'business-failure'); assert.equal(result.inventory.routineCases, 1);
    assert(result.discardableWorking.includes('master:AB')); assert(result.discardableWorking.includes('routine-fqc:draft-doc'));
    assert(!result.discardableWorking.includes('master:PROCESS'));
    assert.equal(JSON.parse(result.retainedSource.masterRaw).workflowScopes.PROCESS.working['draft-stage'][0].id, 'untouched-process');
  });
  await check('master pending cases, orphan pending pointers and legacy pending versions block the plan unchanged', async () => {
    for (const kind of ['case', 'orphan', 'version']) {
      const f = fixture();
      if (kind === 'case') f.root.workflowScopes.AB.cases.push({ id: 'pending-case', status: 'pending', before: {}, content: {} });
      else if (kind === 'orphan') f.root.workflowScopes.C.pendingId = 'orphan-case';
      else f.root.versions.push({ id: 'legacy-pending', scope: 'AB', status: 'pending', snapshot: plain(f.root.active.AB) });
      const s = source(f); await rejects(s, pins(s), 'DRAFT_CUTOVER_PENDING_CASES_REQUIRE_RESOLUTION');
    }
  });
  await check('routine pending cases and orphan pointers are never interpreted as disposable drafts', async () => {
    for (const kind of ['case', 'orphan']) {
      const f = fixture(), flow = f.rf.documents[1].flow;
      if (kind === 'case') flow.cases.push({ id: 'pending-routine', status: 'pending', before: plain(flow.active.content), content: plain(flow.saved.content) });
      else flow.pendingId = 'orphan-routine';
      const s = source(f); await rejects(s, pins(s), 'DRAFT_CUTOVER_PENDING_CASES_REQUIRE_RESOLUTION');
    }
  });
  await check('approved routine projection requires the original approved case and immutable Save content', async () => {
    for (const change of [doc => { doc.flow.cases = []; }, doc => { doc.flow.saves = []; }, doc => { doc.flow.active.content.notes = 'Not approved'; }]) {
      const f = fixture(); change(f.rf.documents[0]); const s = source(f);
      await rejects(s, pins(s), 'DRAFT_CUTOVER_APPROVED_ROUTINE_SOURCE_INVALID');
    }
  });
  await check('partial immutable bodies in any historical or draft extension reject before projection', async () => {
    for (const area of ['master', 'routine']) {
      const f = fixture();
      if (area === 'master') f.root.unknownExtension.body = { __immutableBody: {} };
      else f.rf.documents[1].flow.saves[0].content.extension = { __liveContent: {} };
      const s = source(f); await rejects(s, pins(s), 'DRAFT_CUTOVER_SOURCE_NOT_HYDRATED');
    }
  });
  await check('revision raw routine bytes complete master digest and approved vector remain independently pinned', async () => {
    for (const change of [p => { p.revision++; }, p => { p.rootDigest = '0'.repeat(64); }, p => { p.routineRawDigest = '0'.repeat(64); }, p => { p.versions.AB = 'other'; }]) {
      const s = source(fixture()), p = pins(s); change(p);
      const before = JSON.stringify(s); await assert.rejects(api.planDraftPageCutover(s, p)); assert.equal(JSON.stringify(s), before);
    }
    const s = source(fixture()), p = pins(s); s.routineRaw += ' ';
    await rejects(s, p, 'DRAFT_CUTOVER_SOURCE_CHANGED');
  });
  await check('mutations across the hash await cannot mix later sources or change the captured policy pins', async () => {
    const s = source(fixture()), p = pins(s), original = plain(s), pending = api.planDraftPageCutover(s, p);
    s.routineRaw = '{}'; s.masterRaw = '{}'; p.versions.AB = 'changed';
    const result = await pending; assert.deepEqual(plain(result.retainedSource), { masterRaw: original.masterRaw, routineRaw: original.routineRaw });
    assert.equal(result.sourcePins.versions.AB, 'approved-AB');
  });
  await check('absent routine data creates no document approval and malformed or foreign sources fail closed', async () => {
    const s = source(fixture()); s.routineRaw = null; const result = await api.planDraftPageCutover(s, pins(s));
    assert.equal(result.routine.approvedDocuments.length, 0); assert.equal(result.routine.createsApprovedVersion, false);
    const malformed = source(fixture()); malformed.masterRaw = '{'; await rejects(malformed, pins({ ...malformed, masterRaw: '{}' }), 'DRAFT_CUTOVER_SOURCE_INVALID');
    const f = fixture(); f.rf.documents[0].flow.scope = 'fqc'; const foreign = source(f);
    await rejects(foreign, pins(foreign), 'DRAFT_CUTOVER_SOURCE_INVALID');
    const collision = fixture(); collision.rf.documents[1].id = 'page'; collision.rf.documents[1].flow.scope = 'routine-fqc:page';
    const cs = source(collision); await rejects(cs, pins(cs), 'DRAFT_CUTOVER_SCOPE_COLLISION');
    const adopted = fixture(); adopted.root.workflowScopes.LINES = plain(adopted.root.workflowScopes.AB);
    const as = source(adopted); await rejects(as, pins(as), 'DRAFT_CUTOVER_UNSUPPORTED_OWNER');
  });
  await check('duplicate routine document case and Save identities refuse ambiguous original owners', async () => {
    for (const duplicate of ['document', 'case', 'save']) {
      const f = fixture();
      if (duplicate === 'document') f.rf.documents.push(plain(f.rf.documents[0]));
      else if (duplicate === 'case') f.rf.documents[0].flow.cases.push(plain(f.rf.documents[0].flow.cases[0]));
      else f.rf.documents[0].flow.saves.push(plain(f.rf.documents[0].flow.saves[0]));
      const s = source(f); await rejects(s, pins(s), 'DRAFT_CUTOVER_OWNER_AMBIGUOUS');
    }
  });
  assert.equal(reads, 0); assert.equal(writes, 0);
  console.log(JSON.stringify({ status: 'PASS', checks, storageReads: reads, storageWrites: writes,
    scope: 'pure all-page inventory/cutover planning; no actual writer, adoption, DB/R2 recovery or live-data cutover' }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
