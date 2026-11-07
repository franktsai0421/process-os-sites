/* oxlint-disable typescript/no-require-imports -- Real TypeScript modules in an isolated no-storage VM. */
const assert = require('node:assert/strict');
const harness = require('./ipqc-ab-import-harness.cjs');
let storageReads = 0, storageWrites = 0;
const load = harness({
  DB: { prepare() { storageReads++; throw Error('UNEXPECTED_DB_ACCESS'); } },
  STATE_ARCHIVE: { get() { storageReads++; throw Error('UNEXPECTED_R2_ACCESS'); },
    put() { storageWrites++; throw Error('UNEXPECTED_R2_WRITE'); } },
});
const boundary = load('lib/master-document-boundary.ts');
const route = load('app/api/master/workflow/route.ts');
const draft = load('lib/shared-draft.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const expectCode = (fn, code) => assert.throws(fn, error => error.code === code);
const checks = [];
async function check(name, fn) { await fn(); checks.push(name); }
const descriptor = (scope = 'AB', area = 'catalog') => boundary.parseMasterDocumentSelector(
  new URLSearchParams({ scope, area, layout: 'split-v1' }));
const actor = { id: 'fixture-author', name: 'Synthetic author', admin: false };
const snapshot = (line, stages) => ({
  products: [{ id: 'p-' + line, code: 'P-' + line, name: '', line, category: 'Synthetic',
    stages: stages.slice(0, 1), routeMode: 'exception', extension: { retained: true } }],
  lines: [{ id: 'l-' + line, code: line, name: line, extension: 'keep-line',
    stages: stages.map((code, i) => ({ id: 's-' + i, code, name: code, extra: 'keep-stage' })) }],
  categoryGroups: [{ id: 'g-' + line, line, name: 'Synthetic', defaultStages: stages }],
  sourceExtension: { retained: 'top-level owner is not inferred' },
});
const ab = snapshot('A', ['A-1', 'A-2']), c = snapshot('C', ['C-1', 'C-2', 'C-3', 'C-4', 'C-5']);
const root = { active: { AB: ab, C: c, PROCESS: {} }, versions: [
  { id: 'approved-ab', scope: 'AB', status: 'approved', snapshot: structuredClone(ab) },
  { id: 'approved-c', scope: 'C', status: 'approved', snapshot: structuredClone(c) },
  { id: 'approved-process', scope: 'PROCESS', status: 'approved', snapshot: {} },
  { id: 'old-ab', scope: 'AB', status: 'superseded', snapshot: { old: 'unchanged' } },
], workflowScopes: {}, customRootExtension: { doNotErase: true } };
for (const scope of ['AB', 'C', 'PROCESS']) root.workflowScopes[scope] =
  plain(draft.createSharedDraft('master:' + scope, root.active[scope], 'approved-' + (scope === 'PROCESS' ? 'process' : scope.toLowerCase()), 'g-' + scope));
const pin = { AB: 'approved-ab', C: 'approved-c', PROCESS: 'approved-process' };

(async () => {
  await check('registry has four exact immutable owners under existing AB/C permission namespaces', () => {
    assert.equal(boundary.masterDocumentDescriptors.length, 4);
    assert.equal(Object.isFrozen(boundary.masterDocumentDescriptors), true);
    for (const scope of ['AB', 'C']) for (const area of ['catalog', 'lines']) {
      const d = descriptor(scope, area);
      assert.equal(d.scope, scope + '.' + area);
      assert.equal(d.permissionModule, scope.toLowerCase());
      assert.equal(Object.isFrozen(d), true); assert.equal(Object.isFrozen(d.collections), true);
      assert.deepEqual(plain(d.collections), area === 'lines' ? ['lines'] : ['products', 'categoryGroups']);
    }
  });
  await check('legacy queries remain legacy and cannot accidentally enable a split', () => {
    for (const query of ['', 'scope=AB', 'scope=C&caseMetadata=1', 'scope=PROCESS', 'scope=AB&catalog=effective']) {
      assert.equal(boundary.parseMasterDocumentSelector(new URLSearchParams(query)), null);
      boundary.assertMasterDocumentRouteAvailable(new URLSearchParams(query));
    }
  });
  const malformed = [
    'scope=AB&area=lines', 'scope=AB&layout=split-v1', 'area=lines&layout=split-v1',
    'scope=AB&area=lines&layout=split-v2', 'scope=AB&area=unknown&layout=split-v1',
    'scope=PROCESS&area=lines&layout=split-v1', 'scope=AB.lines&area=lines&layout=split-v1',
    'scope=AB&scope=C&area=lines&layout=split-v1', 'scope=AB&area=lines&area=catalog&layout=split-v1',
    'scope=AB&area=lines&layout=split-v1&layout=split-v1',
    'scope=AB&area=lines&layout=split-v1&catalog=effective',
    'scope=AB&area=lines&layout=split-v1&references=P-A', 'scope=AB&area=&layout=split-v1',
  ];
  await check('partial, duplicate, ambiguous and unsupported selectors fail closed', () => {
    for (const query of malformed) expectCode(() => boundary.parseMasterDocumentSelector(new URLSearchParams(query)), 'MASTER_DOCUMENT_SELECTOR_INVALID');
  });
  await check('actual GET and POST refuse split requests with zero reads and zero writes', async () => {
    for (const [query, code, status] of [
      ...malformed.map(query => [query, 'MASTER_DOCUMENT_SELECTOR_INVALID', 422]),
      ...boundary.masterDocumentDescriptors.map(d => [new URLSearchParams({ scope: d.businessScope, area: d.area, layout: d.layout }), 'MASTER_DOCUMENT_SPLIT_NOT_ENABLED', 409]),
    ]) for (const method of ['GET', 'POST']) {
      const request = new Request('https://fixture.invalid/api/master/workflow?' + query,
        { method, ...(method === 'POST' ? { body: JSON.stringify({ action: 'begin', adoption: true }) } : {}) });
      const response = await route[method](request);
      assert.equal(response.status, status); assert.equal((await response.json()).error, code);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.equal(storageReads, 0); assert.equal(storageWrites, 0);
  });
  await check('owned projections exclude other document edits and preserve nested extensions without mutating source', () => {
    const before = JSON.stringify(root), catalog = boundary.projectMasterOwnedContent(ab, descriptor()),
      lines = boundary.projectMasterOwnedContent(ab, descriptor('AB', 'lines'));
    assert.deepEqual(Object.keys(catalog).sort(), ['categoryGroups', 'products']);
    assert.deepEqual(Object.keys(lines), ['lines']);
    assert.equal(catalog.products[0].extension.retained, true);
    assert.equal(lines.lines[0].stages[0].extra, 'keep-stage');
    catalog.products[0].name = 'separate output'; lines.lines[0].name = 'separate output';
    assert.equal(JSON.stringify(root), before);
    for (const d of boundary.masterDocumentDescriptors) {
      const source = root.active[d.businessScope];
      boundary.assertMasterOwnedContent(boundary.projectMasterOwnedContent(source, d), d);
      expectCode(() => boundary.assertMasterOwnedContent(source, d), 'MASTER_DOCUMENT_OWNERSHIP_VIOLATION');
      expectCode(() => boundary.projectMasterOwnedContent(source, { ...d, collections: ['lines', 'products'] }), 'MASTER_DOCUMENT_SELECTOR_INVALID');
    }
    expectCode(() => boundary.assertMasterOwnedContent({ products: [], categoryGroups: [], extension: {} }, descriptor()), 'MASTER_DOCUMENT_OWNERSHIP_VIOLATION');
    expectCode(() => boundary.projectMasterOwnedContent({ lines: [null] }, descriptor('AB', 'lines')), 'MASTER_DOCUMENT_CONTENT_INVALID');
    for (const categoryGroups of [null, undefined, {}, '']) {
      expectCode(() => boundary.assertMasterOwnedContent({ products: [], categoryGroups }, descriptor()), 'MASTER_DOCUMENT_CONTENT_INVALID');
      expectCode(() => boundary.projectMasterOwnedContent({ products: [], categoryGroups }, descriptor()), 'MASTER_DOCUMENT_CONTENT_INVALID');
    }
    assert.deepEqual(plain(boundary.projectMasterOwnedContent({ products: [] }, descriptor())), { products: [], categoryGroups: [] });
    expectCode(() => boundary.assertMasterOwnedContent({ products: [] }, descriptor()), 'MASTER_DOCUMENT_OWNERSHIP_VIOLATION');
  });
  await check('all patch operations and ordered batches remain owned; unsupported module actions cannot smuggle foreign content', () => {
    for (const d of boundary.masterDocumentDescriptors) {
      const own = d.collections[0], other = d.area === 'lines' ? 'products' : 'lines';
      const patch = { op: 'set', path: [own, { id: 'fixture' }, 'name'], value: 'allowed' };
      boundary.assertMasterOwnedCommand({ action: 'apply', patches: [patch] }, d);
      const input = { batches: [{ patches: [patch], guards: [{ path: patch.path, value: '' }] }] };
      boundary.assertMasterOwnedCommand({ action: 'save', moduleAction: 'save-local-v1', patches: [patch], input }, d);
      for (const op of ['set', 'insert', 'remove', 'order']) expectCode(() => boundary.assertMasterOwnedCommand({ action: 'apply', patches: [{ op, path: [other, { id: 'foreign' }], value: {} }] }, d), 'MASTER_DOCUMENT_OWNERSHIP_VIOLATION');
      for (const op of ['set', 'remove']) expectCode(() => boundary.assertMasterOwnedCommand({ action: 'apply', patches: [{ op, path: [own], value: [] }] }, d), 'COLLECTION_REPLACEMENT_FORBIDDEN');
      expectCode(() => boundary.assertMasterOwnedCommand({ action: 'apply', patches: [{ op: 'set', path: [], value: {} }] }, d), 'MASTER_DOCUMENT_OWNERSHIP_VIOLATION');
      expectCode(() => boundary.assertMasterOwnedCommand({ action: 'save', moduleAction: 'save-local-v1', patches: [], input }, d), 'INVALID_LOCAL_SAVE');
      expectCode(() => boundary.assertMasterOwnedCommand({ action: 'save', moduleAction: 'save-local-v1', patches: [patch], input: { batches: [{ ...input.batches[0], batches: input.batches }] } }, d), 'INVALID_LOCAL_SAVE');
      expectCode(() => boundary.assertMasterOwnedCommand({ action: 'save', moduleAction: 'save-local-v1', patches: [], input: { batches: [{ patches: [{ ...patch, path: [other, { id: 'foreign' }, 'name'] }], guards: [] }] } }, d), 'MASTER_DOCUMENT_OWNERSHIP_VIOLATION');
      expectCode(() => boundary.assertMasterOwnedCommand({ action: 'save', moduleAction: 'unknown', input: {} }, d), 'INVALID_MODULE_ACTION');
      expectCode(() => boundary.assertMasterOwnedCommand({ action: 'apply', input }, d), 'INVALID_MODULE_ACTION');
    }
  });
  await check('approved sources never substitute unsaved, saved or pending topology and do not narrow category stages to product exceptions', () => {
    const candidate = structuredClone(root);
    candidate.workflowScopes.AB.working.lines[0].stages.push({ id: 'unapproved', code: 'A-NEW', name: 'Unapproved' });
    candidate.workflowScopes.C.working.products[0].name = 'local product only';
    candidate.workflowScopes.AB.saved = { id: 'line-save', content: candidate.workflowScopes.AB.working };
    candidate.versions.push({ id: 'ab-pending', scope: 'AB', status: 'pending', snapshot: candidate.workflowScopes.AB.working });
    assert.equal(boundary.approvedMasterDocument(candidate, descriptor('AB', 'lines')).content.lines[0].stages.length, 2);
    assert.equal(boundary.approvedMasterDocument(candidate, descriptor('C', 'catalog')).content.products[0].name, '');
    assert.equal(boundary.approvedMasterDocument(candidate, descriptor('C', 'catalog')).content.categoryGroups[0].defaultStages.length, 5);
    assert.equal(boundary.approvedMasterDocument(candidate, descriptor('C', 'catalog')).content.products[0].stages.length, 1);
    delete candidate.active.AB;
    expectCode(() => boundary.approvedMasterSource(candidate, 'AB'), 'MASTER_EXISTING_DATA_INVALID');
  });
  await check('invalid approved body and duplicate active version identities refuse rather than choosing working', () => {
    for (const mutate of [
      r => { r.active.AB.products[0].name = 'no approved match'; },
      r => { r.versions.push({ ...r.versions[0] }); },
      r => { r.versions.push({ ...r.versions[0], scope: 'C' }); },
      r => { r.versions[0].status = 'pending'; },
    ]) { const candidate = structuredClone(root); mutate(candidate); expectCode(() => boundary.approvedMasterSource(candidate, 'AB'), 'MASTER_EFFECTIVE_BASELINE_CONFLICT'); }
    for (const scope of ['AB', 'C', 'PROCESS']) {
      const candidate = structuredClone(root), wrapper = { __immutableBody: {
        key: 'state-records/v1/' + 'a'.repeat(64) + '.json', sha256: 'a'.repeat(64) } };
      candidate.active[scope] = wrapper;
      candidate.versions.find(v => v.scope === scope && v.status === 'approved').snapshot = wrapper;
      expectCode(() => boundary.approvedMasterSource(candidate, scope), 'MASTER_DOCUMENT_SOURCE_NOT_HYDRATED');
    }
  });
  await check('pure preview pins approved sources, records extension ownership questions, and cannot activate or manufacture history', async () => {
    const before = JSON.stringify(root), preview = await boundary.previewMasterDocumentSplit(root, pin);
    assert.equal(preview.activationAvailable, false); assert.equal(preview.documents.length, 4);
    assert.equal(preview.rootDigest.length, 64); assert.equal(preview.sources.every(s => s.digest.length === 64), true);
    assert.deepEqual(plain(preview.sourceVector), pin); assert.deepEqual(plain(preview.issues), []);
    assert.deepEqual(plain(preview.legacy.rootExtensionKeys), ['customRootExtension']);
    assert.deepEqual(plain(preview.sources[0].extensionKeys), ['sourceExtension']);
    assert.equal(preview.legacy.versions, 4); assert.equal(preview.legacy.workflows.length, 3);
    assert.equal(JSON.stringify(root), before);
    assert.equal(preview.documents.some(d => d.saved || d.workflow || d.approvedBy), false);
    const replay = await boundary.previewMasterDocumentSplit(root, { PROCESS: pin.PROCESS, C: pin.C, AB: pin.AB });
    assert.equal(replay.rootDigest, preview.rootDigest);
    await assert.rejects(boundary.previewMasterDocumentSplit(root, { ...pin, AB: 'stale' }), e => e.code === 'MASTER_DOCUMENT_SOURCE_CHANGED');
  });
  await check('mixed legacy working/saved, receipts, pending/orphan links and history are reported unchanged', async () => {
    const candidate = structuredClone(root), flow = candidate.workflowScopes.AB;
    flow.working.products[0].name = 'unsaved';
    flow.saved = { id: 'fixed-save', actor, at: 'fixture-time', content: structuredClone(flow.working) };
    flow.saves.push(structuredClone(flow.saved));
    flow.cases.push({ id: 'case-pending', status: 'pending', linkedProcess: { baseVersionId: pin.PROCESS }, content: structuredClone(flow.saved.content) });
    flow.pendingId = 'orphan-pending';
    flow.receipts.op = { actorId: actor.id, fingerprint: 'original-fingerprint', result: { unchanged: false } };
    flow.unknownMarker = { keep: true };
    const before = JSON.stringify(candidate), preview = await boundary.previewMasterDocumentSplit(candidate, pin),
      codes = preview.issues.filter(i => i.scope === 'AB').map(i => i.code);
    for (const code of ['OPEN_REVIEW_CASE', 'ORPHAN_PENDING_ID', 'LINKED_PROCESS_CASE_PENDING',
      'LEGACY_WORKING_REQUIRES_EXPLICIT_CUTOFF_DECISION', 'LEGACY_SAVED_REQUIRES_RETENTION_PLAN']) assert.equal(codes.includes(code), true, code);
    const legacy = preview.legacy.workflows.find(w => w.scope === 'AB');
    assert.equal(legacy.savedId, 'fixed-save'); assert.equal(legacy.receipts, 1);
    assert.deepEqual(plain(legacy.extensionKeys), ['unknownMarker']);
    assert.equal(JSON.stringify(candidate), before);
    assert.equal(preview.documents[0].content.products[0].name, '');
  });
  await check('asynchronous hashing cannot mix later source or pin mutations into the captured preview', async () => {
    const candidate = structuredClone(root), mutablePin = { ...pin },
      unchanged = await boundary.previewMasterDocumentSplit(candidate, mutablePin),
      pending = boundary.previewMasterDocumentSplit(candidate, mutablePin);
    candidate.active.AB.products[0].name = 'after preview started';
    candidate.versions.find(v => v.id === pin.AB).snapshot = structuredClone(candidate.active.AB);
    candidate.versions.find(v => v.id === pin.AB).id = 'new-approved-ab';
    candidate.workflowScopes.AB.active.id = 'new-approved-ab';
    mutablePin.AB = 'new-approved-ab';
    const preview = await pending;
    assert.deepEqual(plain(preview), plain(unchanged));
    assert.equal(preview.sourceVector.AB, pin.AB);
    assert.equal(preview.documents[0].source.versionId, pin.AB);
    assert.equal(preview.documents[0].content.products[0].name, '');
  });
  await check('missing IDs are mapped deterministically in preview only and stage IDs stay line-nested', async () => {
    const candidate = structuredClone(root);
    for (const scope of ['AB', 'C']) {
      const s = candidate.active[scope];
      delete s.products[0].id; delete s.lines[0].id; delete s.categoryGroups[0].id; delete s.lines[0].stages[0].id;
      candidate.versions.find(v => v.scope === scope && v.status === 'approved').snapshot = structuredClone(s);
      candidate.workflowScopes[scope].working = structuredClone(s);
    }
    const before = JSON.stringify(candidate), preview = await boundary.previewMasterDocumentSplit(candidate, pin);
    assert.equal(preview.identities.length, 8); assert.equal(preview.issues.length, 0);
    assert.equal(preview.identities.some(i => i.id === 'stage:A-1'), true);
    assert.equal(preview.documents[0].content.products[0].id, undefined);
    assert.equal(JSON.stringify(candidate), before);
  });
  await check('preview reports code collisions and invalid references without repairing approved data', async () => {
    const candidate = structuredClone(root), s = candidate.active.C;
    s.products[0].code = 'P-A'; s.products[0].stages = ['MISSING'];
    s.categoryGroups[0].defaultStages.push('MISSING');
    s.lines[0].stages[0].code = 'A-1';
    candidate.versions.find(v => v.id === pin.C).snapshot = structuredClone(s);
    const before = JSON.stringify(candidate), preview = await boundary.previewMasterDocumentSplit(candidate, pin), codes = preview.issues.map(i => i.code);
    for (const code of ['CATALOG_CODE_COLLISION_OR_INVALID', 'PRODUCT_ROUTE_INVALID', 'GROUP_ROUTE_INVALID']) assert.equal(codes.includes(code), true);
    assert.equal(preview.activationAvailable, false); assert.equal(JSON.stringify(candidate), before);
  });
  console.log(JSON.stringify({ status: 'PASS', checks, storageReads, storageWrites }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
