/* oxlint-disable typescript/no-require-imports -- Inactive reducer and actual shared kernel on synthetic in-memory data. */
const assert = require('node:assert/strict');
let reads = 0, writes = 0;
const load = require('./ipqc-ab-import-harness.cjs')({ DB: { prepare() { reads++; throw Error('UNEXPECTED_DB'); } },
  STATE_ARCHIVE: { get() { reads++; throw Error('UNEXPECTED_R2'); }, put() { writes++; throw Error('UNEXPECTED_R2'); } } });
const { saveMasterPageNames } = load('lib/master-page-name-save.ts');
const draft = load('lib/shared-draft.ts');
const author = { id: 'author-fixture', name: 'Synthetic author', admin: false };
const peer = { id: 'peer-fixture', name: 'Synthetic peer', admin: false };
const reviewer = { id: 'reviewer-fixture', name: 'Synthetic reviewer', admin: false };
const plain = value => JSON.parse(JSON.stringify(value));
let ids = 0;
const path = (scope = 'AB', stage = false) => stage ? [scope, 'lines', { id: 'line' }, 'stages', { id: 'stage' }, 'name']
  : [scope, 'lines', { id: 'line' }, 'name'];
function fixture() {
  const partition = line => ({ lines: [{ id: 'line', code: line, name: line,
    stages: [{ id: 'stage', code: line + '-1', name: 'Stage', media: { src: '/synthetic/' + line, extension: ['retain'] } }] }] });
  return { flow: draft.createSharedDraft('master:LINES', { AB: partition('A'), C: partition('C') }, 'approved-page-fixture', 'generation-fixture'), sequence: 0 };
}
function context(f, actor = author, overrides = {}) {
  return { actor, at: '2026-11-09T00:00:00Z', id: () => 'generated-' + ++ids, allowed: () => true,
    activeId: f.flow.active.id, structure() {}, validate: () => [], semantic: value => value, ...overrides };
}
function command(f, action, extra = {}) { return { action, operationId: 'operation-' + ++ids, clientId: 'client-fixture',
  sequence: ++f.sequence, generation: f.flow.generation, ...extra }; }
function save(f, edits = [{ scope: 'AB', before: 'A', after: 'Edited A' }]) {
  const batches = edits.map(edit => ({ patches: [{ op: 'set', path: path(edit.scope, edit.stage), value: edit.after }],
    guards: [{ path: path(edit.scope, edit.stage), value: edit.before }] }));
  return command(f, 'save', { moduleAction: 'save-local-v1', patches: batches.flatMap(batch => batch.patches), input: { batches } });
}
function run(f, request, actor = author, overrides = {}) { const result = saveMasterPageNames(f.flow, request, context(f, actor, overrides)); f.flow = result.state; return result; }
function lifecycle(f, action, actor, extra = {}) {
  const request = command(f, action, { expectedRevision: f.flow.revision, savedId: f.flow.saved?.id, caseId: f.flow.pendingId,
    reason: 'Synthetic lifecycle reason', ...extra });
  const result = draft.applyDraftCommand(f.flow, request, context(f, actor)); f.flow = result.state; return { request, ...result };
}
function code(fn, expected) { assert.throws(fn, e => e.code === expected, expected); }
function unchanged(f, fn) { const before = JSON.stringify(f.flow); fn(); assert.equal(JSON.stringify(f.flow), before); }
const checks = [];
function check(name, fn) { fn(); checks.push(name); }
check('one request-local Save across AB/C has one revision, save, sequence and receipt', () => {
  const f = fixture(), initial = f.flow, source = JSON.stringify(initial), request = save(f, [{ scope: 'AB', before: 'A', after: 'Tên A' }, { scope: 'C', before: 'C', after: '工段 C' }]);
  const result = run(f, request);
  assert.equal(result.activationAvailable, false); assert.equal(f.flow.scope, 'master:LINES'); assert.equal(f.flow.revision, 1);
  assert.equal(f.flow.saves.length, 1); assert.equal(Object.keys(f.flow.receipts).length, 1); assert.equal(Object.keys(f.flow.sequences).length, 1);
  assert.equal(f.flow.saved.content.AB.lines[0].name, 'Tên A'); assert.equal(f.flow.saved.content.C.lines[0].name, '工段 C');
  assert.equal(f.flow.active.content.AB.lines[0].name, 'A'); assert.equal(JSON.stringify(initial), source);
  assert.equal(f.flow.receipts[request.operationId].fingerprint, draft.stableDraftJSON(request));
});
check('switching the AB/C editing view preserves prior saved partition and both media bodies', () => {
  const f = fixture(); run(f, save(f)); run(f, save(f, [{ scope: 'C', before: 'C', after: 'Edited C' }]), peer);
  assert.equal(f.flow.saved.content.AB.lines[0].name, 'Edited A'); assert.equal(f.flow.saved.content.C.lines[0].name, 'Edited C');
  assert.deepEqual(plain(f.flow.saved.content.AB.lines[0].stages[0].media), { src: '/synthetic/A', extension: ['retain'] });
  assert.deepEqual(plain(f.flow.saved.content.C.lines[0].stages[0].media), { src: '/synthetic/C', extension: ['retain'] });
});
check('different actors stale edits to different fields merge in the same page without overwriting peers', () => {
  const f = fixture(), stale = save(f, [{ scope: 'C', stage: true, before: 'Stage', after: 'Peer stage' }]);
  run(f, save(f)); run(f, stale, peer);
  assert.equal(f.flow.working.AB.lines[0].name, 'Edited A'); assert.equal(f.flow.working.C.lines[0].stages[0].name, 'Peer stage');
});
check('same-field stale edits reject; explicit reconfirmed mine or peer does not discard nonconflicts', () => {
  const f = fixture(), stale = save(f); run(f, save(f, [{ scope: 'AB', before: 'A', after: 'Peer' }]), peer);
  unchanged(f, () => code(() => run(f, stale), 'DEPENDENCY_CHANGED_RECONFIRM'));
  run(f, save(f, [{ scope: 'AB', before: 'Peer', after: 'Mine' }, { scope: 'C', before: 'C', after: 'Nonconflict' }]));
  assert.equal(f.flow.saved.content.AB.lines[0].name, 'Mine'); assert.equal(f.flow.saved.content.C.lines[0].name, 'Nonconflict');
  const theirs = fixture(); run(theirs, save(theirs, [{ scope: 'AB', before: 'A', after: 'Peer' }]), peer);
  run(theirs, save(theirs, [{ scope: 'C', before: 'C', after: 'Nonconflict' }]));
  assert.equal(theirs.flow.saved.content.AB.lines[0].name, 'Peer'); assert.equal(theirs.flow.saved.content.C.lines[0].name, 'Nonconflict');
});
check('a later batch conflict or structural refusal leaves all input and original receipts unchanged', () => {
  const f = fixture(); run(f, save(f));
  const request = save(f, [{ scope: 'AB', before: 'Edited A', after: 'First' }, { scope: 'C', before: 'Wrong', after: 'Second' }]);
  unchanged(f, () => code(() => run(f, request), 'DEPENDENCY_CHANGED_RECONFIRM'));
  const valid = save(f, [{ scope: 'AB', before: 'Edited A', after: 'First' }, { scope: 'C', before: 'C', after: 'Second' }]);
  unchanged(f, () => code(() => run(f, valid, author, { structure(content) { if (content.C.lines[0].name === 'Second') throw new draft.DraftConflict('SYNTHETIC_REFERENCE_REFUSAL'); } }), 'SYNTHETIC_REFERENCE_REFUSAL'));
});
check('names-only slice refuses topology, codes, missing guards, blank names and foreign collections', () => {
  const f = fixture();
  for (const edit of [c => { c.patches[0].path[3] = 'code'; }, c => { c.patches[0].op = 'insert'; },
    c => { c.patches[0].value = ' '; }, c => { c.patches[0].path[1] = 'products'; }]) {
    const request = save(f); edit(request); request.input.batches[0].patches = plain(request.patches);
    unchanged(f, () => assert.throws(() => run(f, request)));
  }
  const request = save(f); request.input.batches[0].guards = [];
  unchanged(f, () => code(() => run(f, request), 'DEPENDENCY_GUARD_REQUIRED'));
});
check('permission revocation and wrong owner or generation fail before accepting changes', () => {
  const f = fixture(), request = save(f);
  for (const deny of ['view', 'edit']) unchanged(f, () => code(() => run(f, request, author, { allowed: p => p !== deny && p !== 'save' }), 'FORBIDDEN'));
  const generation = { ...request, generation: 'other-generation' };
  unchanged(f, () => code(() => run(f, generation), 'STALE_GENERATION'));
  for (const scope of ['master:AB', 'master:C', 'master:AB.lines', 'master:C.lines']) {
    const foreign = { ...f.flow, scope };
    code(() => saveMasterPageNames(foreign, request, context(f)), 'MASTER_PAGE_OWNER_MISMATCH');
  }
  run(f, request, author, { allowed: p => ['view', 'edit'].includes(p) });
});
check('kernel lifecycle uses one fixed full-page case and pending locks both partitions', () => {
  const f = fixture(); run(f, save(f, [{ scope: 'AB', before: 'A', after: 'A saved' }, { scope: 'C', before: 'C', after: 'C saved' }]));
  const saved = plain(f.flow.saved); lifecycle(f, 'submit', author);
  assert.equal(f.flow.cases.length, 1); assert.equal(f.flow.cases[0].savedId, saved.id); assert.deepEqual(plain(f.flow.cases[0].content), saved.content);
  unchanged(f, () => code(() => run(f, save(f, [{ scope: 'C', before: 'C saved', after: 'While pending' }]), peer), 'PENDING_LOCKED'));
  unchanged(f, () => code(() => lifecycle(f, 'approve', author), 'SELF_REVIEW_CONFIRM_REQUIRED'));
  lifecycle(f, 'approve', reviewer);
  assert.equal(f.flow.active.content.AB.lines[0].name, 'A saved'); assert.equal(f.flow.active.content.C.lines[0].name, 'C saved');
  assert.equal(f.flow.saved, null); assert.equal(f.flow.cases[0].status, 'approved');
});
check('withdraw and return retain the exact Save, permit fixed resubmission and keep original receipt identity', () => {
  const f = fixture(), request = save(f), receipt = plain(run(f, request).receipt), saved = plain(f.flow.saved);
  for (const action of ['withdraw', 'return']) {
    lifecycle(f, 'submit', author); lifecycle(f, action, action === 'withdraw' ? author : reviewer);
    assert.equal(f.flow.pendingId, null); assert.deepEqual(plain(f.flow.saved), saved);
    const before = JSON.stringify(f.flow), replay = run(f, request);
    assert.deepEqual(plain(replay.receipt), receipt); assert.equal(JSON.stringify(f.flow), before);
  }
  assert.equal(f.flow.cases.length, 2);
});
check('old receipt replay cannot change actor/payload or grant access, and a missing operation remains missing', () => {
  const f = fixture(), request = save(f); run(f, request);
  unchanged(f, () => code(() => run(f, request, peer), 'OPERATION_ID_REUSED'));
  unchanged(f, () => code(() => run(f, { ...request, reason: 'Changed payload' }), 'OPERATION_ID_REUSED'));
  unchanged(f, () => code(() => run(f, request, author, { allowed: () => false }), 'FORBIDDEN'));
  assert.equal(f.flow.receipts['missing-operation'], undefined);
  unchanged(f, () => run(f, request, author, { allowed: p => ['view', 'save'].includes(p) }));
});
check('foreign legacy saved/case/history bodies cannot masquerade as page-owned history', () => {
  for (const mutate of [
    flow => { flow.saved = { content: { products: [], lines: [] } }; },
    flow => { flow.saves.push({ content: { lines: [] } }); },
    flow => { flow.cases.push({ before: flow.active.content, content: { AB: flow.working.AB } }); },
  ]) {
    const f = fixture(); mutate(f.flow);
    unchanged(f, () => code(() => run(f, save(f)), 'MASTER_PAGE_OWNERSHIP_VIOLATION'));
  }
});
check('authority lost after the first staged batch rejects the whole request-local Save', () => {
  const f = fixture(); let allowed = true;
  const request = save(f, [{ scope: 'AB', before: 'A', after: 'Staged' }, { scope: 'C', before: 'C', after: 'Refused' }]);
  unchanged(f, () => code(() => run(f, request, author, { allowed: () => allowed, structure() { allowed = false; } }), 'FORBIDDEN'));
});
check('serialized isolated snapshot can reopen without changing Save, cases, generations, media or receipts', () => {
  const f = fixture(), request = save(f); run(f, request); lifecycle(f, 'submit', author); lifecycle(f, 'withdraw', author);
  const serialized = JSON.stringify(f.flow), reopened = JSON.parse(serialized);
  assert.deepEqual(plain(reopened), plain(f.flow)); f.flow = reopened;
  const before = JSON.stringify(f.flow); run(f, request); assert.equal(JSON.stringify(f.flow), before);
  lifecycle(f, 'submit', author); lifecycle(f, 'approve', reviewer);
  assert.equal(f.flow.cases.length, 2); assert.equal(f.flow.active.content.C.lines[0].stages[0].media.src, '/synthetic/C');
});
check('ordered intermediate edits returning to prior saved content still retain a single correct receipt', () => {
  const f = fixture(); run(f, save(f)); const prior = f.flow.saved.id, revision = f.flow.revision;
  const contributors = plain(f.flow.contributors);
  const result = run(f, save(f, [{ scope: 'AB', before: 'Edited A', after: 'Temporary' }, { scope: 'AB', before: 'Temporary', after: 'Edited A' }]));
  assert.equal(result.receipt.unchanged, true); assert.equal(f.flow.saved.id, prior); assert.equal(f.flow.revision, revision);
  assert.equal(f.flow.saves.length, 1); assert.equal(Object.keys(f.flow.receipts).length, 2);
  assert.deepEqual(plain(f.flow.contributors), contributors);
});
check('a reverted name keeps its original contributor while a real peer-field edit is attributed correctly', () => {
  const f = fixture(), namePath = path('AB'), apply = command(f, 'apply', {
    patches: [{ op: 'set', path: namePath, value: 'Peer draft' }], guards: [{ path: namePath, value: 'A' }],
  });
  f.flow = draft.applyDraftCommand(f.flow, apply, context(f, peer)).state;
  run(f, save(f, [{ scope: 'AB', before: 'Peer draft', after: 'Temporary' },
    { scope: 'C', before: 'C', after: 'Actual edit' }, { scope: 'AB', before: 'Temporary', after: 'Peer draft' }]));
  assert.equal(f.flow.saved.content.AB.lines[0].name, 'Peer draft');
  assert.equal(f.flow.saved.contributors[draft.stableDraftJSON(namePath)].actor.id, peer.id);
  assert.equal(f.flow.saved.contributors[draft.stableDraftJSON(path('C'))].actor.id, author.id);
  assert.deepEqual(plain(f.flow.contributors), {});
});
assert.equal(reads, 0); assert.equal(writes, 0);
console.log(JSON.stringify({ status: 'PASS', checks, storageReads: reads, storageWrites: writes,
  scope: 'inactive names-only Save plus synthetic actual-kernel lifecycle; no HTTP/CAS/adoption/ACL mapping' }, null, 2));
