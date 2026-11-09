/* oxlint-disable typescript/no-require-imports -- Actual adapters and access resolver on isolated in-memory ports. */
const assert = require('node:assert/strict');
let reads = 0, writes = 0;
const load = require('./ipqc-ab-import-harness.cjs')({ DB: { prepare() { reads++; throw Error('UNEXPECTED_DB'); } },
  STATE_ARCHIVE: { get() { reads++; throw Error('UNEXPECTED_R2'); }, put() { writes++; throw Error('UNEXPECTED_R2'); } } });
const api = load('lib/draft-page-boundaries.ts'), access = require('../public/process/access-policy.mjs');
const rows = api.draftPageBoundaries, checks = [];
async function check(name, fn) { await fn(); checks.push(name); }
(async () => {
  await check('all thirteen business draft pages have distinct stable owners and permission modules', () => {
    assert.equal(rows.length, 13); assert.equal(new Set(rows.map(row => row.scope)).size, rows.length);
    assert.equal(new Set(rows.map(row => row.permissionModule)).size, rows.length);
    assert.equal(Object.isFrozen(rows), true); assert.equal(rows.every(Object.isFrozen), true);
    for (const row of rows) { assert(access.catalog.some(cell => cell.id === row.permissionModule)); api.assertDraftPageOwner(row.page, row.scope); }
  });
  await check('actual existing adapter scopes and storage keys match their functional pages', () => {
    const adapters = [
      ['PROCESS_EDITOR', load('lib/process-authoring-workflow.ts').processAuthoringAdapter()],
      ['PROCESS', load('lib/master-workflow.ts').masterWorkflowAdapter('PROCESS')],
      ['FQC', load('lib/fqc-workflow.ts').fqcWorkflowAdapter()], ['IQC', load('lib/iqc-workflow.ts').iqcWorkflowAdapter],
      ['IPQC_AB', load('lib/ipqc-ab-module-workflow.ts').abModuleWorkflowAdapter()],
      ['BOM', load('lib/bom-workflow.ts').bomWorkflowAdapter], ['EQUIPMENT', load('lib/equipment-workflow.ts').equipmentWorkflowAdapter],
      ['TOOLING', load('lib/tooling-workflow.ts').toolingWorkflowAdapter],
    ];
    for (const [page, adapter] of adapters) { const row = api.draftPageBoundary(page); assert.equal(adapter.scope, row.scope); assert.equal(adapter.key, row.stateKey); }
    const control = { activeVersionId: null, versions: [] };
    assert.equal(load('lib/ipqc-c-workflow.ts').beginIpqcWorkflow(control, { id: () => 'generation-fixture' }).scope, api.draftPageBoundary('IPQC_C').scope);
  });
  await check('AB C line-admin and routine gaps remain explicit rather than counted as activated', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(rows.filter(row => row.migration !== 'existing').map(row => row.page))), ['AB', 'C', 'LINES', 'ROUTINE_FQC']);
    for (const scope of ['AB', 'C']) assert.equal(load('lib/master-workflow.ts').masterWorkflowAdapter(scope).scope, api.draftPageBoundary(scope).legacyScope);
    assert.notEqual(api.draftPageBoundary('LINES').scope, api.draftPageBoundary('AB').legacyScope);
    assert.notEqual(api.draftPageBoundary('ROUTINE_FQC').scope, 'routine-fqc:document-fixture');
  });
  await check('filters do not alter endpoint permission ownership or create another page owner', () => {
    for (const row of rows) for (const filter of ['A', 'B', 'C']) {
      const url = new URL(row.endpoint, 'http://fixture');
      for (const key of ['line', 'group', 'category', 'stage', 'documentId', 'workspaceId']) url.searchParams.set(key, filter);
      assert.equal(access.moduleForURL(url.href), row.permissionModule);
    }
    assert.equal(load('lib/process-authoring-workflow.ts').processAuthoringAdapter(true).scope, 'process:platform');
  });
  await check('LINES workflow permissions use only lines cells and cannot fall back to AB C or broad data rights', async () => {
    const calls = [], { workflowAccess } = load('lib/versioned-shared-workflow.ts');
    const permissions = await workflowAccess(new Request('http://fixture/api/master/workflow?scope=LINES'), { values: {} }, async key => { calls.push(key); return ['lines.view', 'lines.submit'].includes(key); });
    assert.equal(permissions.view, true); assert.equal(permissions.submit, true); assert.equal(permissions.edit, false);
    assert(calls.length > 0 && calls.every(key => key.startsWith('lines.')));
  });
  await check('no page can present another module or a filter-specific owner as its own', () => {
    for (const row of rows) for (const other of rows) if (row.page !== other.page)
      assert.throws(() => api.assertDraftPageOwner(row.page, other.scope), error => error.code === 'DRAFT_PAGE_OWNER_MISMATCH');
    assert.throws(() => api.assertDraftPageOwner('IPQC_AB', 'ipqc-ab:A:group'), error => error.code === 'DRAFT_PAGE_OWNER_MISMATCH');
    assert.throws(() => api.draftPageBoundary('PRIVATE_FEEDBACK'), error => error.code === 'DRAFT_PAGE_INVALID');
    assert.throws(() => api.draftPageBoundary('APPROVAL'), error => error.code === 'DRAFT_PAGE_INVALID');
    assert.equal(api.privateDraftBoundaries.length, 1); assert.equal(api.privateDraftBoundaries[0].isolation, 'origin-and-actor');
    assert.equal(api.privateDraftBoundaries[0].sharedWorkflow, false);
  });
  await check('confirmed choices preserve pending history receipts and explicit real-cutover confirmation', () => {
    const policy = api.confirmedDraftBoundaryPolicy;
    for (const key of ['discardUnapprovedWorking', 'wholePageABSubmission', 'routineFqcWholePage', 'resolvePendingBeforeCutover', 'preserveApprovedHistoryAndReceipts', 'requireExplicitRealCutoverConfirmation']) assert.equal(policy[key], true);
    assert.equal(Object.isFrozen(policy), true);
  });
  await check('AB submit permission sends the complete fixed A and B snapshot without granting edit', async () => {
    const { workflowAccess } = load('lib/versioned-shared-workflow.ts'), core = load('lib/shared-draft.ts');
    const rights = await workflowAccess(new Request('http://fixture/api/master/workflow?scope=AB'), { values: {} }, async key => ['ab.view', 'ab.submit'].includes(key));
    assert.equal(rights.edit, false); assert.equal(rights.submit, true);
    const original = { products: [{ id: 'A', line: 'A', name: 'Old A' }, { id: 'B', line: 'B', name: 'Old B' }], categoryGroups: [] };
    let flow = core.createSharedDraft('master:AB.catalog', original, 'approved-fixture', 'generation-fixture'), n = 0;
    const base = { actor: { id: 'editor-fixture', name: 'Synthetic editor', admin: false }, at: 'fixture', id: () => 'generated-' + ++n,
      activeId: 'approved-fixture', structure() {}, validate: () => [], semantic: value => value, allowed: () => true };
    flow = core.applyDraftCommand(flow, { action: 'apply', operationId: 'apply-fixture', clientId: 'client-fixture', sequence: 1, generation: flow.generation,
      patches: original.products.map(row => ({ op: 'set', path: ['products', { id: row.id }, 'name'], value: 'Changed ' + row.line })) }, base).state;
    flow = core.applyDraftCommand(flow, { action: 'save', operationId: 'save-fixture', clientId: 'client-fixture', sequence: 2, generation: flow.generation }, base).state;
    const result = core.applyDraftCommand(flow, { action: 'submit', operationId: 'submit-fixture', clientId: 'submit-client', sequence: 1,
      generation: flow.generation, expectedRevision: flow.revision, savedId: flow.saved.id, reason: 'Synthetic complete page' }, {
      ...base, actor: { id: 'submitter-fixture', name: 'Synthetic submitter', admin: false }, allowed: permission => rights[permission] === true,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(result.state.cases[0].content.products.map(row => row.line))), ['A', 'B']);
    assert.equal(result.state.cases.length, 1); assert.equal(result.state.cases[0].savedId, flow.saved.id);
  });
  assert.equal(reads, 0); assert.equal(writes, 0);
  console.log(JSON.stringify({ status: 'PASS', checks, pages: rows.map(row => ({ page: row.page, scope: row.scope, migration: row.migration })),
    storageReads: reads, storageWrites: writes, scope: 'ownership/access contracts; not thirteen-page UI or lifecycle acceptance' }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
