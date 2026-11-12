/* oxlint-disable typescript/no-require-imports -- Production modules in an isolated no-storage VM. */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const harness = require('./ipqc-ab-import-harness.cjs');
let reads = 0, writes = 0;
const load = harness({ DB: { prepare() { reads++; throw Error('UNEXPECTED_DB_READ'); } },
  STATE_ARCHIVE: { get() { reads++; throw Error('UNEXPECTED_R2_READ'); }, put() { writes++; throw Error('UNEXPECTED_R2_WRITE'); } } });
const api = load('lib/master-page-boundary.ts'), draft = load('lib/shared-draft.ts');
const route = load('app/api/master/workflow/route.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(draft.stableDraftJSON(value)).digest('hex');
const expectCode = (fn, code) => assert.throws(fn, e => e.code === code);
const rejects = (promise, code) => assert.rejects(promise, e => e.code === code);
const checks = [];
const actor = { id: 'synthetic-author', name: 'Synthetic author', admin: false };
function fixture() {
  const catalog = line => ({ products: [{ id: 'product-' + line, code: 'P-' + line, line, name: 'Product',
    category: 'Group', stages: [line + '-1'], routeMode: 'exception', media: { src: '/synthetic/photo', note: '保留照片' } }],
    categoryGroups: [{ id: 'group-' + line, line, name: 'Group', defaultStages: [line + '-1', line + '-2'] }],
    lines: [{ id: 'line-' + line, code: line, name: line, stages: [1, 2].map(n => ({ id: 'stage-' + n,
      code: line + '-' + n, name: 'Stage ' + n, extension: { media: '/synthetic/stage' } })) }],
    unknownTopLevel: { keep: true } });
  const root = { active: { AB: catalog('A'), C: catalog('C'), PROCESS: { 'A-1': [{ id: 'template-a',
    name: 'Máy', editorType: 'machine', equipment: [{ id: 'machine-a', mediaItems: [{ src: '/synthetic/machine' }] }] }] } },
    versions: [], workflowScopes: {}, unknownRoot: { keep: ['old-extension'] } };
  const versions = { AB: 'approved-ab', C: 'approved-c', PROCESS: 'approved-process' };
  for (const scope of ['AB', 'C', 'PROCESS']) {
    root.versions.push({ id: versions[scope], scope, status: 'approved', snapshot: structuredClone(root.active[scope]) });
    root.workflowScopes[scope] = plain(draft.createSharedDraft('master:' + scope, root.active[scope], versions[scope], 'generation-' + scope));
  }
  root.versions.push({ id: 'old-case', scope: 'AB', status: 'superseded', snapshot: { original: 'history-preserved' } });
  return { revision: 42, root };
}
const pin = source => ({ revision: source.revision, rootDigest: hash(source.root),
  versions: { AB: 'approved-ab', C: 'approved-c', PROCESS: 'approved-process' } });
const patch = (scope = 'AB', value = 'Edited') => ({ op: 'set', path: [scope, 'lines', { id: 'line-' + (scope === 'AB' ? 'A' : 'C') }, 'name'], value });
const save = (patches = [patch()]) => ({ action: 'save', moduleAction: 'save-local-v1', patches,
  input: { batches: [{ patches: structuredClone(patches), guards: patches.map(p => ({ path: p.path, value: 'Old' })) }] } });
async function check(name, fn) { await fn(); checks.push(name); }
(async () => {
  await check('one topology page owns one scope; PROCESS templates and equipment remain one existing page', async () => {
    assert.deepEqual(plain(api.masterPageDescriptors).map(d => [d.page, d.scope, d.permissionModule]), [
      ['AB', 'master:AB.catalog', 'ab'], ['C', 'master:C.catalog', 'c'],
      ['LINES', 'master:LINES', 'lines'], ['PROCESS', 'master:PROCESS', 'templates']]);
    assert.equal(Object.isFrozen(api.masterPageDescriptors), true);
    assert.equal(api.masterPageDescriptors.every(Object.isFrozen), true);
    const source = fixture(), result = await api.previewMasterPageSplit(source, pin(source));
    assert.equal(result.documents.length, 3);
    const lines = result.documents.find(d => d.page === 'LINES');
    assert.deepEqual(Object.keys(lines.content), ['AB', 'C']);
    assert.equal(lines.sources.length, 2);
    assert.equal(result.documents.some(d => /AB\.lines|C\.lines/.test(d.scope)), false);
    assert.equal(result.unchangedPages[0].scope, 'master:PROCESS');
    assert.equal(result.activationAvailable, false);
  });
  await check('approved-only catalog and topology exclude mixed legacy drafts and preserve hidden stages', async () => {
    const source = fixture(), flow = source.root.workflowScopes.AB;
    flow.working.lines[0].stages.push({ id: 'not-approved', code: 'A-NEW', name: 'Draft' });
    flow.working.products[0].name = 'Unapproved product';
    flow.saved = { id: 'legacy-save', actor, at: 'synthetic-time', revision: 1, content: structuredClone(flow.working) };
    flow.saves.push(structuredClone(flow.saved));
    const result = await api.previewMasterPageSplit(source, pin(source));
    assert.equal(result.documents[0].content.products[0].name, 'Product');
    assert.equal(result.documents[0].content.products[0].stages.length, 1);
    assert.equal(result.documents[0].content.categoryGroups[0].defaultStages.length, 2);
    assert.equal(result.documents[2].content.AB.lines[0].stages.length, 2);
    assert.equal(result.retainedSource.content.workflowScopes.AB.saved.content.lines[0].stages.length, 3);
    assert.equal(result.issues.some(i => i.code === 'LEGACY_WORKING_REQUIRES_EXPLICIT_CUTOFF_DECISION'), true);
  });
  await check('all saved/pending/history/receipts, stable IDs, media, extensions and original ownership survive unchanged', async () => {
    const source = fixture(), flow = source.root.workflowScopes.AB;
    flow.saved = { id: 'save-original', actor, at: 'synthetic-time', revision: 2, content: structuredClone(flow.working) };
    flow.saves.push(structuredClone(flow.saved));
    flow.pendingId = 'pending-original';
    flow.cases.push({ id: flow.pendingId, savedId: flow.saved.id, status: 'pending', actor,
      before: structuredClone(flow.active.content), content: structuredClone(flow.saved.content),
      linkedProcess: { baseVersionId: 'approved-process', content: structuredClone(source.root.active.PROCESS) } });
    flow.receipts['original-operation'] = { actorId: actor.id, fingerprint: 'original-exact-fingerprint',
      result: { savedId: flow.saved.id, caseId: flow.pendingId, generation: flow.generation } };
    flow.unknownExtension = { pending: 'keep-marker' };
    const before = JSON.stringify(source), result = await api.previewMasterPageSplit(source, pin(source));
    assert.equal(JSON.stringify(source), before);
    assert.deepEqual(plain(result.retainedSource.content), source.root);
    assert.equal(result.retainedSource.digest, hash(source.root));
    for (const code of ['OPEN_REVIEW_CASE', 'LINKED_PROCESS_CASE_PENDING', 'LEGACY_SAVED_REQUIRES_RETENTION_PLAN'])
      assert.equal(result.issues.some(i => i.code === code), true, code);
    assert.equal(result.documents.some(d => d.workflow || d.saved || d.approvedBy || d.caseId), false);
    result.retainedSource.content.workflowScopes.AB.receipts = {};
    result.documents[2].content.AB.lines[0].name = 'Separate output';
    assert.equal(JSON.stringify(source), before);
  });
  await check('exact revision, full root digest and effective-version vector reject changed or partial sources', async () => {
    for (const mutate of [p => { p.revision++; }, p => { p.rootDigest = 'f'.repeat(64); },
      p => { p.rootDigest = ''; }, p => { delete p.rootDigest; }, p => { p.extra = true; },
      p => { p.versions.AB = 'changed-approved'; }, p => { delete p.versions.C; }]) {
      const source = fixture(), expected = pin(source); mutate(expected);
      await rejects(api.previewMasterPageSplit(source, expected), expected.versions.AB !== 'approved-ab' || !expected.versions.C
        ? 'MASTER_DOCUMENT_SOURCE_CHANGED' : 'MASTER_PAGE_SOURCE_CHANGED');
    }
    for (const revision of [-1, 1.1, Infinity, '42']) {
      const source = fixture(); source.revision = revision;
      await rejects(api.previewMasterPageSplit(source, pin(source)), 'MASTER_PAGE_SOURCE_CHANGED');
    }
    const source = fixture(), expected = pin(source);
    source.root.workflowScopes.AB.receipts.late = { private: true };
    await rejects(api.previewMasterPageSplit(source, expected), 'MASTER_PAGE_SOURCE_CHANGED');
  });
  await check('source mutation during hashing cannot combine old approved data with later private cases', async () => {
    const source = fixture(), expected = pin(source), before = await api.previewMasterPageSplit(source, expected);
    const pending = api.previewMasterPageSplit(source, expected);
    source.root.active.AB.products[0].name = 'Later'; source.revision++;
    source.root.workflowScopes.AB.cases.push({ id: 'later', status: 'pending' });
    expected.versions.AB = 'later-version'; expected.revision++;
    assert.deepEqual(plain(await pending), plain(before));
  });
  await check('unhydrated historical, saved, pending, PROCESS and unknown bodies all refuse', async () => {
    const marker = { __immutableBody: { key: 'state-records/v1/' + 'a'.repeat(64) + '.json', sha256: 'a'.repeat(64) } };
    for (const mutate of [
      r => { r.versions.at(-1).snapshot = marker; },
      r => { r.workflowScopes.AB.saved = { content: marker }; },
      r => { r.workflowScopes.C.cases.push({ before: marker }); },
      r => { r.active.PROCESS['A-1'][0].equipment = marker; },
      r => { r.unknownRoot.nested = { __liveContent: {} }; },
    ]) { const source = fixture(); mutate(source.root); await rejects(api.previewMasterPageSplit(source, pin(source)), 'MASTER_PAGE_SOURCE_NOT_HYDRATED'); }
  });
  await check('new line content has both partitions and cannot include products, catalogs, extension owners or partial filters', () => {
    const source = fixture(), content = { AB: { lines: source.root.active.AB.lines }, C: { lines: source.root.active.C.lines } };
    api.assertMasterPageContent('LINES', content);
    for (const invalid of [{ AB: content.AB }, { C: content.C }, { ...content, products: [] },
      { ...content, AB: { ...content.AB, products: [] } }, { ...content, C: null }]) {
      assert.throws(() => api.assertMasterPageContent('LINES', invalid));
    }
    expectCode(() => api.assertMasterPageContent('AB', source.root.active.AB), 'MASTER_DOCUMENT_OWNERSHIP_VIOLATION');
    api.assertMasterPageContent('AB', { products: [], categoryGroups: [] });
    expectCode(() => api.assertMasterPageContent('AB.lines', content), 'MASTER_PAGE_OWNERSHIP_VIOLATION');
  });
  await check('one explicit Save may carry both AB/C topology batches without foreign catalog edits', () => {
    const command = save([patch(), patch('C')]), before = JSON.stringify(command);
    api.assertMasterPageSave('LINES', command);
    assert.equal(JSON.stringify(command), before);
    for (const scope of ['AB', 'C']) {
      const value = { op: 'set', path: ['products', { id: 'p' }, 'name'], value: 'Allowed' };
      api.assertMasterPageSave(scope, save([value]));
      expectCode(() => api.assertMasterPageSave(scope, save([{ ...value, path: ['lines', { id: 'line' }, 'name'] }])), 'MASTER_DOCUMENT_OWNERSHIP_VIOLATION');
    }
    for (const action of ['apply', 'submit', 'restore']) expectCode(() => api.assertMasterPageSave('LINES', { ...command, action }), 'MASTER_PAGE_EXPLICIT_SAVE_REQUIRED');
  });
  await check('foreign patches in any batch, direct partition replacement and collection replacement fail closed', () => {
    for (const path of [['AB', 'products', { id: 'p' }, 'name'], ['C', 'categoryGroups', { id: 'g' }, 'name'],
      ['PROCESS', 'A-1'], ['AB'], ['AB', 'lines']]) {
      const value = { op: 'set', path, value: [] };
      assert.throws(() => api.assertMasterPageSave('LINES', save([value])));
      const command = save(); command.input.batches.push({ patches: [value], guards: [] });
      assert.throws(() => api.assertMasterPageSave('LINES', command));
    }
    for (const op of ['insert', 'remove', 'order']) {
      const value = { op, path: ['AB', 'products'], value: { id: 'foreign' }, ids: [] };
      expectCode(() => api.assertMasterPageSave('LINES', save([value])), 'MASTER_DOCUMENT_OWNERSHIP_VIOLATION');
    }
  });
  await check('ordered batches must exactly match flat patches, preserve guards and reject nested commands', () => {
    for (const mutate of [c => { c.patches = []; }, c => { c.input.batches[0].patches[0].value = 'Smuggled'; },
      c => { c.input.batches[0].commands = []; }, c => { c.input.batches[0].guards = null; },
      c => { c.input.other = {}; }, c => { c.input.batches = Array(257).fill({ patches: [], guards: [] }); }]) {
      const command = save(); mutate(command); expectCode(() => api.assertMasterPageSave('LINES', command), 'INVALID_LOCAL_SAVE');
    }
    for (const path of [['AB', 'products'], ['PROCESS', 'A-1'], ['AB']]) {
      const command = save(); command.input.batches[0].guards = [{ path, value: [] }];
      expectCode(() => api.assertMasterPageSave('LINES', command), 'MASTER_PAGE_OWNERSHIP_VIOLATION');
    }
  });
  await check('flags, new page IDs and split selectors cannot activate real GET/POST routes or storage', async () => {
    for (const query of ['scope=LINES&area=lines&layout=split-v1', 'scope=AB&area=lines&layout=page-v1',
      'scope=AB&area=lines&layout=split-v1&activate=1', 'scope=C&area=catalog&layout=split-v1',
      'scope=AB&page=LINES', 'scope=C&page=C', 'scope=PROCESS&page=PROCESS', 'scope=AB&page=']) {
      for (const method of ['GET', 'POST']) {
        const response = await route[method](new Request('https://fixture.invalid/api/master/workflow?' + query,
          { method, ...(method === 'POST' ? { body: JSON.stringify({ action: 'begin', activate: true }) } : {}) }));
        assert.equal([409, 422].includes(response.status), true);
        assert.equal(response.headers.get('cache-control'), 'no-store');
      }
    }
    assert.equal(reads, 0); assert.equal(writes, 0);
  });
  console.log(JSON.stringify({ status: 'PASS', checks, storageReads: reads, storageWrites: writes }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
