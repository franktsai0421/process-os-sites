/* oxlint-disable typescript/no-require-imports -- Actual whole-page Save/kernel/document rules with synthetic references and forbidden storage. */
const assert = require('node:assert/strict');
let reads = 0, writes = 0, ids = 0;
const load = require('./ipqc-ab-import-harness.cjs')({ DB: { prepare() { reads++; throw Error('UNEXPECTED_DB'); } },
  STATE_ARCHIVE: { get() { reads++; throw Error('UNEXPECTED_R2'); }, put() { writes++; throw Error('UNEXPECTED_R2'); } } });
const { saveRoutineFqcPage } = load('lib/routine-fqc-page-save.ts'), draft = load('lib/shared-draft.ts'), routine = load('lib/routine-fqc.ts');
const author = { id: 'author-fixture', name: 'Synthetic author', admin: false }, peer = { id: 'peer-fixture', name: 'Synthetic peer', admin: false };
const plain = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const domain = routine.emptyRoutine(), documents = [];
  for (const id of ['doc-one', 'doc-two']) {
    const content = { title: id, date: '2026-11-09', notes: '', reason: '', disposition: '', evidence: [], lines: [
      { id: 'line', jobId: 'job-' + id, source: { id: 'source-' + id, products: [{ code: 'P1' }, { code: 'P2' }] }, requiredSamples: [],
        results: [{ id: 'row', samples: ['P1'], outcome: '', value: '', notes: '', photos: [] }] },
    ] };
    domain.documents.push({ id, number: 'SYNTHETIC-' + id, kind: 'report', planId: 'plan-fixture', caseId: null, correctionOf: null,
      owner: author, createdAt: 'fixture', flow: draft.createSharedDraft('routine-fqc:' + id, content, null, 'legacy-generation-' + id) });
    documents.push({ id, content: plain(content) });
  }
  domain.receipts['old-outer-operation'] = { actorId: author.id, fingerprint: 'original outer fingerprint', result: { old: true } };
  const flow = draft.createSharedDraft('routine-fqc:page', { documents }, null, 'page-generation-fixture');
  flow.active.content = { documents: [] };
  return { domain: plain(domain), flow, sequence: 0 };
}
const path = (id = 'doc-one', field = 'notes') => ['documents', { id }, 'content', field];
function context(f, overrides = {}) { return { actor: author, at: '2026-11-09T00:00:00Z', id: () => 'generated-' + ++ids, allowed: () => true,
  activeId: f.flow.active.id, structure() {}, validate: () => [], semantic: value => value, ...overrides }; }
function command(f, batches) { return { action: 'save', moduleAction: 'save-local-v1', operationId: 'operation-' + ++ids,
  clientId: 'client-fixture', sequence: ++f.sequence, generation: f.flow.generation, patches: batches.flatMap(batch => batch.patches), input: { batches } }; }
function edit(id, before, after, field = 'notes') { const p = path(id, field); return { patches: [{ op: 'set', path: p, value: after }], guards: [{ path: p, value: before }] }; }
function run(f, request, overrides = {}) { const result = saveRoutineFqcPage(f.flow, request, f.domain, context(f, overrides)); f.flow = result.state; return result; }
function unchanged(f, fn) { const before = JSON.stringify({ flow: f.flow, domain: f.domain }); fn(); assert.equal(JSON.stringify({ flow: f.flow, domain: f.domain }), before); }
function code(fn, expected) { assert.throws(fn, error => error.code === expected, expected); }
const checks = [];
function check(name, fn) { fn(); checks.push(name); }
check('two document edits create one page revision Save sequence and original receipt with no per-document writes', () => {
  const f = fixture(), original = JSON.stringify(f.domain), request = command(f, [edit('doc-one', '', 'One'), edit('doc-two', '', 'Two')]);
  const result = run(f, request);
  assert.equal(result.activationAvailable, false); assert.equal(f.flow.revision, 1); assert.equal(f.flow.saves.length, 1);
  assert.equal(Object.keys(f.flow.receipts).length, 1); assert.equal(Object.keys(f.flow.sequences).length, 1);
  assert.equal(f.flow.saved.content.documents[0].content.notes, 'One'); assert.equal(f.flow.saved.content.documents[1].content.notes, 'Two');
  assert.equal(f.flow.receipts[request.operationId].fingerprint, draft.stableDraftJSON(request)); assert.equal(JSON.stringify(f.domain), original);
});
check('different editors and document filters preserve peer changes in the same complete page Save', () => {
  const f = fixture(), stale = command(f, [edit('doc-two', '', 'Peer second')]); run(f, command(f, [edit('doc-one', '', 'First')]));
  run(f, stale, { actor: peer }); assert.equal(f.flow.saved.content.documents[0].content.notes, 'First'); assert.equal(f.flow.saved.content.documents[1].content.notes, 'Peer second');
});
check('same-field conflicts and a later conflicting document leave the complete source and domain unchanged', () => {
  const f = fixture(); run(f, command(f, [edit('doc-two', '', 'Peer')]), { actor: peer });
  unchanged(f, () => code(() => run(f, command(f, [edit('doc-one', '', 'First staged'), edit('doc-two', '', 'Stale')])), 'DEPENDENCY_CHANGED_RECONFIRM'));
});
check('actual document structure rejects a later invalid text field without a partial page Save', () => {
  const f = fixture(); unchanged(f, () => code(() => run(f, command(f, [edit('doc-one', '', 'Valid'), edit('doc-two', '2026-11-09', 123, 'date')])), 'TEXT_INVALID'));
});
check('actual retest rules reject covered but unrequested samples and retain the original references', () => {
  const f = fixture(); f.domain.documents[0].caseId = 'failure'; f.domain.cases.push({ id: 'failure', jobId: 'job-doc-one', requiredSamples: ['P1'] });
  const p = ['documents', { id: 'doc-one' }, 'content', 'lines', { id: 'line' }, 'results'], before = plain(f.flow.working.documents[0].content.lines[0].results);
  const after = plain(before); after[0].samples = ['P2'];
  unchanged(f, () => code(() => run(f, command(f, [{ patches: [{ op: 'set', path: p, value: after }], guards: [{ path: p, value: before }] }])), 'RETEST_SAMPLE_FIXED'));
});
check('original formal documents cancellation and unresolved legacy cases cannot be edited through the new page core', () => {
  for (const status of ['approved', 'cancelled', 'legacy-pending']) {
    const f = fixture();
    if (status === 'approved') f.domain.documents[0].flow.active.id = 'original-approved';
    else if (status === 'cancelled') f.domain.documents[0].cancelled = { at: 'fixture' };
    else f.domain.documents[1].flow.pendingId = 'legacy-pending';
    unchanged(f, () => code(() => run(f, command(f, [edit('doc-one', '', 'Blocked')])), status === 'approved' ? 'FORMAL_DOCUMENT_IMMUTABLE' : status === 'cancelled' ? 'DOCUMENT_CANCELLED' : 'LEGACY_PENDING_REQUIRES_REVIEW'));
  }
});
check('source snapshots document membership and selector aliases cannot bypass owned field boundaries', () => {
  for (const mutate of [batch => { batch.patches[0].path[3] = 'lines'; }, batch => { batch.patches[0].op = 'remove'; },
    batch => { batch.patches[0].path[1].extra = true; }, batch => { batch.guards[0].path = ['otherModule']; }, batch => { batch.guards = []; }]) {
    const f = fixture(), batch = edit('doc-one', '', 'No'); mutate(batch);
    unchanged(f, () => assert.throws(() => run(f, command(f, [batch]))));
  }
  const f = fixture(); f.flow.scope = 'fqc'; unchanged(f, () => code(() => run(f, command(f, [edit('doc-one', '', 'No')])), 'ROUTINE_PAGE_OWNER_MISMATCH'));
});
check('pending locks the entire page and original Save replay remains exact after a terminal generation change', () => {
  const f = fixture(), request = command(f, [edit('doc-one', '', 'First')]), receipt = plain(run(f, request).receipt);
  const lifecycle = (action, extra = {}) => { const request = { action, operationId: 'operation-' + ++ids, clientId: 'client-fixture', sequence: ++f.sequence, generation: f.flow.generation, ...extra };
    f.flow = draft.applyDraftCommand(f.flow, request, context(f)).state; };
  lifecycle('submit', { expectedRevision: f.flow.revision, savedId: f.flow.saved.id, reason: 'Synthetic page submission' });
  unchanged(f, () => code(() => run(f, command(f, [edit('doc-two', '', 'No')])), 'PENDING_LOCKED'));
  lifecycle('withdraw', { caseId: f.flow.pendingId, reason: 'Synthetic withdrawal' });
  unchanged(f, () => assert.deepEqual(plain(run(f, request).receipt), receipt));
});
check('current view edit save rights generation and exact receipt actor payload remain enforced', () => {
  for (const deny of ['view', 'edit']) {
    const f = fixture(); unchanged(f, () => code(() => run(f, command(f, [edit('doc-one', '', 'No')]), { allowed: p => p !== deny && p !== 'save' }), 'FORBIDDEN'));
  }
  const f = fixture(), request = command(f, [edit('doc-one', '', 'Saved')]); run(f, request);
  unchanged(f, () => code(() => run(f, request, { actor: peer }), 'OPERATION_ID_REUSED'));
  const changed = plain(request); changed.patches[0].value = 'Different'; changed.input.batches[0].patches[0].value = 'Different';
  unchanged(f, () => code(() => run(f, changed), 'OPERATION_ID_REUSED'));
  unchanged(f, () => code(() => run(f, { ...command(f, [edit('doc-two', '', 'No')]), generation: 'other' }), 'STALE_GENERATION'));
});
check('net-reverted fields retain peer attribution while the other document gets the actual editor', () => {
  const f = fixture(), p = path();
  f.flow = draft.applyDraftCommand(f.flow, { action: 'apply', operationId: 'peer-operation', clientId: 'peer-client', sequence: 1, generation: f.flow.generation,
    patches: [{ op: 'set', path: p, value: 'Peer' }], guards: [{ path: p, value: '' }] }, context(f, { actor: peer })).state;
  run(f, command(f, [edit('doc-one', 'Peer', 'Temporary'), edit('doc-two', '', 'Real'), edit('doc-one', 'Temporary', 'Peer')]));
  assert.equal(f.flow.saved.contributors[draft.stableDraftJSON(p)].actor.id, peer.id);
  assert.equal(f.flow.saved.contributors[draft.stableDraftJSON(path('doc-two'))].actor.id, author.id);
});
check('later photo/reference validation or authority loss cannot publish staged document changes', () => {
  const f = fixture(); let allowed = true;
  unchanged(f, () => code(() => run(f, command(f, [edit('doc-one', '', 'First'), edit('doc-two', '', 'Second')]), {
    allowed: () => allowed, structure() { allowed = false; },
  }), 'FORBIDDEN'));
  unchanged(f, () => code(() => run(f, command(f, [edit('doc-one', '', 'First'), edit('doc-two', '', 'Second')]), {
    structure(content) { if (content.documents[1].content.notes) throw new draft.DraftConflict('PHOTO_NOT_UPLOADED', 422); },
  }), 'PHOTO_NOT_UPLOADED'));
});
check('serialized page reopen preserves complete saved content domain history and exact replay', () => {
  const f = fixture(), originalDomain = JSON.stringify(f.domain), request = command(f, [edit('doc-one', '', 'Saved')]), receipt = plain(run(f, request).receipt);
  f.flow = plain(f.flow); unchanged(f, () => assert.deepEqual(plain(run(f, request).receipt), receipt));
  assert.equal(JSON.stringify(f.domain), originalDomain); assert.equal(f.domain.receipts['old-outer-operation'].fingerprint, 'original outer fingerprint');
  assert.equal(f.flow.saved.content.documents[1].content.lines[0].source.products[1].code, 'P2');
});
check('unhydrated historical bodies and changed immutable document references reject without writing', () => {
  const f = fixture(); f.domain.documents[0].flow.extension = { __immutableBody: {} };
  unchanged(f, () => code(() => run(f, command(f, [edit('doc-one', '', 'No')])), 'ROUTINE_PAGE_SOURCE_NOT_HYDRATED'));
  const changed = fixture(); changed.domain.documents[0].flow.working.lines[0].source.products.push({ code: 'Later product' });
  unchanged(changed, () => code(() => run(changed, command(changed, [edit('doc-one', '', 'No')])), 'ROUTINE_PAGE_REFERENCE_CHANGED'));
});
assert.equal(reads, 0); assert.equal(writes, 0);
console.log(JSON.stringify({ status: 'PASS', checks, storageReads: reads, storageWrites: writes,
  scope: 'unregistered routine whole-page existing-document Save core; not page creation approval effects HTTP/CAS or live migration' }, null, 2));
