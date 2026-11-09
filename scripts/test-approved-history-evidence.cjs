/* oxlint-disable typescript/no-require-imports -- Pure read helpers in the repository's no-storage VM harness. */
const assert = require('node:assert/strict');
const load = require('./ipqc-ab-import-harness.cjs')({ DB: { prepare() { throw Error('UNEXPECTED_DB'); } }, STATE_ARCHIVE: { get() { throw Error('UNEXPECTED_R2'); }, put() { throw Error('UNEXPECTED_R2'); } } });
const history = load('lib/approved-history.ts');
const ab = load('lib/ipqc-ab-approved-history.ts');
const plain = value => JSON.parse(JSON.stringify(value));
let groups = 0;
function check(name, action) { action(); groups++; console.log('PASS ' + name); }
function frozen(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) frozen(child); Object.freeze(value); } return value; }
function version(id = 'version-one', extra = {}) { return { id, number: 1, status: 'approved', snapshot: { rows: ['numeric-body'] }, revision: 1, baseVersionId: 'base-one', creatorId: 'author-fixture', creatorName: 'Author fixture', createdAt: 'created-fixture', updatedAt: 'updated-fixture', history: [], ...extra }; }
function control(versions, activeVersionId = null, cases) { return { activeVersionId, versions, ...(cases ? { workflow: { cases } } : {}) }; }
function approvedCase(v, extra = {}) { return { id: v.id, status: 'approved', actor: { id: v.creatorId }, baseId: v.baseVersionId, at: v.createdAt, savedId: 'saved-fixture', content: { rows: ['immutable-case'] }, contentIssues: ['case-issue'], result: { actor: { name: 'Reviewer fixture' }, at: 'reviewed-fixture' }, ...extra }; }
const legacyApproval = { action: 'approved', actorId: 'reviewer-fixture', actorName: 'Reviewer fixture', at: 'reviewed-fixture' };

check('verified case evidence matches author, base and creation identity', () => {
  const v = version(), c = approvedCase(v), root = frozen(control([v], v.id, [c]));
  const evidence = history.approvedVersionEvidence(root, v);
  assert.deepEqual(plain(evidence), { kind: 'approved-case', caseId: v.id, savedId: c.savedId, approvedBy: 'Reviewer fixture', approvedAt: 'reviewed-fixture' });
  assert.equal(history.approvedVersions(root).length, 1);
  const selected = history.approvedVersion(root, v.id);
  assert.deepEqual(plain(selected.snapshot), { rows: ['immutable-case'] });
  assert.deepEqual(plain(selected.contentIssues), ['case-issue']);
  assert.equal(selected.status, 'approved');
  assert.deepEqual(plain(v.snapshot), { rows: ['numeric-body'] });
});
check('invalid matching case never falls back to legacy evidence or formal pointer', () => {
  const v = version('bad-case', { history: [legacyApproval] });
  for (const change of [{ status: 'pending' }, { status: 'rejected' }, { actor: { id: 'other-author' } }, { baseId: 'other-base' }, { at: 'other-time' }]) {
    const root = frozen(control([v], v.id, [approvedCase(v, change)]));
    assert.equal(history.approvedVersionEvidence(root, v), null);
    assert.equal(history.approvedVersion(root, v.id), null);
  }
});
check('case proof controls detail body and does not fabricate reviewer data', () => {
  const v = version('old-case'), c = approvedCase(v, { result: undefined });
  const selected = history.approvedVersion(frozen(control([v], null, [c])), v.id);
  assert.equal(selected.status, 'superseded');
  assert.equal(selected.approvalEvidence.approvedBy, null);
  assert.equal(selected.approvalEvidence.approvedAt, null);
  assert.deepEqual(plain(selected.snapshot), plain(c.content));
});
check('legacy approval requires allowed status, a timestamp and actor identity', () => {
  for (const status of ['approved', 'superseded']) {
    for (const action of ['approve', 'approved']) {
      const v = version('legacy', { status, history: [{ ...legacyApproval, action }] });
      assert.equal(history.approvedVersionEvidence(frozen(control([v])), v).kind, 'legacy-approval');
    }
  }
  for (const change of [{ status: 'draft' }, { status: 'pending' }, { status: 'rejected' }, { id: 'shared-old' }, { history: [{ ...legacyApproval, actorId: '' }] }, { history: [{ ...legacyApproval, at: '' }] }, { history: [{ ...legacyApproval, action: 'save' }] }]) {
    const v = version('legacy', { history: [legacyApproval], ...change });
    assert.equal(history.approvedVersionEvidence(frozen(control([v])), v), null);
  }
});
check('formal baseline is only the authoritative approved pointer and contains no invented approval', () => {
  const v = version('formal'), other = version('other', { status: 'superseded' });
  const root = frozen(control([v, other], v.id));
  assert.deepEqual(plain(history.approvedVersionEvidence(root, v)), { kind: 'formal-baseline', caseId: null, savedId: null, approvedBy: null, approvedAt: null });
  assert.equal(history.approvedVersionEvidence(root, other), null);
  assert.equal(history.approvedVersion(root, 'missing'), null);
  assert.deepEqual(history.approvedVersions(root).map(row => row.id), [v.id]);
});
check('metadata proof never reads numeric snapshot or immutable case content', () => {
  const v = version('getter-case'), c = approvedCase(v);
  Object.defineProperty(v, 'snapshot', { get() { throw Error('SNAPSHOT_READ'); } });
  Object.defineProperty(c, 'content', { get() { throw Error('CASE_CONTENT_READ'); } });
  const root = control([v], v.id, [c]);
  assert.equal(history.approvedVersions(root).length, 1);
  assert.equal(history.approvedVersionEvidence(root, v).kind, 'approved-case');
});
check('legacy PROCESS proof and read projection preserve exact scope without inventing approval', () => {
  for (const actor of [{ actorId: 'reviewer' }, { actorName: 'Reviewer' }, { actor: 'Legacy reviewer' }]) {
    const v = frozen({ id: 'legacy-process-row', number: 7, status: 'superseded', category: 'fixture-category', line: 'fixture-line', stages: [{ code: 'stage-one' }], history: [{ action: 'approved', at: 'time', ...actor }] });
    assert.equal(history.legacyProcessEvidence(v).kind, 'legacy-approval');
    const selected = history.legacyProcessProjection(v);
    assert.equal(selected.id, 'legacy-process:legacy-process-row');
    assert.equal(selected.status, 'superseded');
    assert.equal(selected.snapshot.workspaces[0].id, JSON.stringify([v.category, v.line]));
    assert.deepEqual(plain(selected.snapshot.workspaces[0].stages), plain(v.stages));
  }
  for (const change of [{ id: 'shared-old' }, { status: 'draft' }, { history: [] }, { history: [{ action: 'approved', at: 'time' }] }, { history: [{ action: 'approved', actor: 'Reviewer' }] }]) {
    const v = { id: 'legacy', number: 1, status: 'approved', category: 'C', line: 'L', stages: [], history: [legacyApproval], ...change };
    assert.equal(history.legacyProcessProjection(frozen(v)), null);
  }
});
check('legacy AB IDs round-trip opaque scopes and reject malformed or oversized identities', () => {
  for (const [scope, id] of [['A/B', 'id:one'], ['越南文', '引號"與\\'], ['a'.repeat(499), 'b'.repeat(499)]]) assert.deepEqual(plain(ab.parseLegacyAbId(ab.legacyAbId(scope, id))), { scope, id });
  for (const id of [null, '', 'other:["x","y"]', 'legacy-ab:{"scope":"x"}', 'legacy-ab:["x"]', 'legacy-ab:["x","y","z"]', 'legacy-ab:["", "y"]', 'legacy-ab:[1,"y"]', 'legacy-ab:["x",null]', 'legacy-ab:not-json', ab.legacyAbId('x'.repeat(500), 'y'), ab.legacyAbId('x', 'y'.repeat(500))]) assert.equal(ab.parseLegacyAbId(id), null);
});
function abRoot() {
  const legacy = version('legacy-one', { status: 'superseded', history: [legacyApproval], snapshot: { form: 'legacy-body' } });
  const moduleRow = version('modern-one', { snapshot: { scopes: { A: { form: 'modern-body' } }, bases: {} } });
  return { legacy, moduleRow, root: { scopes: { A: control([legacy], null) }, moduleDraft: control([moduleRow], moduleRow.id) } };
}
check('AB metadata is an evidence-only union and does not hydrate bodies', () => {
  const f = abRoot();
  Object.defineProperty(f.legacy, 'snapshot', { get() { throw Error('LEGACY_BODY_READ'); } });
  Object.defineProperty(f.moduleRow, 'snapshot', { get() { throw Error('MODULE_BODY_READ'); } });
  const rows = ab.abApprovedMetadata(f.root);
  assert.deepEqual(plain(rows.map(row => row.id)), ['modern-one', ab.legacyAbId('A', 'legacy-one')]);
  assert(rows.every(row => !Object.hasOwn(row, 'snapshot') && row.approvalEvidence));
});
check('AB union excludes unapproved rows, duplicate module IDs and whole-module aliases', () => {
  const f = abRoot();
  f.root.scopes.A.versions.push(version('unsaved', { status: 'superseded' }), version('modern-one', { history: [legacyApproval] }), version('linked', { history: [legacyApproval], wholeModuleCaseId: 'modern-one' }));
  const rows = ab.abApprovedMetadata(frozen(f.root));
  assert.equal(rows.length, 2);
  assert.deepEqual(plain(rows.map(row => row.id)), ['modern-one', ab.legacyAbId('A', 'legacy-one')]);
  for (const id of ['unsaved', 'modern-one', 'linked']) assert.equal(ab.legacyAbVersion(f.root, ab.legacyAbId('A', id)), null);
});
check('legacy AB detail is a read-only one-scope projection, retaining source identity and base', () => {
  const f = abRoot(), root = frozen(f.root), before = JSON.stringify(root), id = ab.legacyAbId('A', f.legacy.id);
  const selected = ab.legacyAbVersion(root, id);
  assert.equal(selected.id, id); assert.equal(selected.sourceVersionId, f.legacy.id); assert.equal(selected.sourceScope, 'A');
  assert.deepEqual(plain(selected.snapshot), { scopes: { A: { form: 'legacy-body' } }, bases: { A: 'base-one' } });
  assert.equal(JSON.stringify(root), before);
  assert.equal(ab.legacyAbVersion(root, ab.legacyAbId('missing', f.legacy.id)), null);
  assert.equal(ab.legacyAbVersion(root, ab.legacyAbId('__proto__', f.legacy.id)), null);
  assert.equal(ab.legacyAbVersion(root, 'invalid'), null);
});
check('AB detail uses immutable approved case content and missing base remains null', () => {
  const v = version('legacy-case', { baseVersionId: null }), c = approvedCase(v, { content: { form: 'case-body' } });
  const root = frozen({ scopes: { A: control([v], null, [c]) } });
  const selected = ab.legacyAbVersion(root, ab.legacyAbId('A', v.id));
  assert.deepEqual(plain(selected.snapshot), { scopes: { A: { form: 'case-body' } }, bases: { A: null } });
  assert.equal(selected.approvalEvidence.kind, 'approved-case');
  assert.equal(ab.abApprovedMetadata(root).length, 1);
});
check('strict AB union excludes unreviewed formal pointers without changing legacy compatibility', () => {
  const f=abRoot();f.legacy.history=[{...legacyApproval,at:'2026-11-09T00:00:00.000Z'}];assert.equal(ab.abApprovedMetadata(f.root).length,2);const rows=ab.abApprovedMetadata(f.root,true);assert.deepEqual(plain(rows.map(row=>row.id)),[ab.legacyAbId('A','legacy-one')]);
  const baseline=version('formal-only',{status:'approved'});f.root.scopes.A.versions.push(baseline);f.root.scopes.A.activeVersionId=baseline.id;
  assert.equal(ab.legacyAbVersion(f.root,ab.legacyAbId('A',baseline.id),true),null);assert.equal(ab.abApprovedMetadata(f.root,true).length,1);
});
console.log('PASS approved-history evidence groups=' + groups + ' READ_ONLY_HELPERS_NO_STORAGE_NOT_API_ACCEPTANCE');
