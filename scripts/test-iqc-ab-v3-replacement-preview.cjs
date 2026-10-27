/* Actual handlers, normal-approved synthetic sources; never starts a server.
 * Scope compatibility inputs are derived projections, not legacy acceptance.
 * IPQC-C is intentionally excluded pending a separate access-policy decision.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { fixture, json } = require('./quality-replacement-preview-fixture.cjs');
const groups = [], traces = [];
const record = name => { groups.push({ name, status: 'PASS' }); console.log(JSON.stringify(groups.at(-1))); };
const insert = (collection, value) => ({ op: 'insert', path: [collection], value });
const empty = { AB: { products: [], lines: [], categoryGroups: [] }, C: { products: [], lines: [], categoryGroups: [] }, PROCESS: {} };
const master = { active: json(empty), versions: Object.entries(empty).map(([scope, snapshot]) => ({
  id: 'initial-empty-' + scope, scope, number: 1, status: 'approved', snapshot, revision: 1,
  creatorId: 'fixture-initializer', creatorName: 'Synthetic empty initialization', createdAt: 'synthetic', updatedAt: 'synthetic', history: [],
})) };
const scopeQ = group => '&scope=' + encodeURIComponent('A:' + group);
(async () => {
  const h = await fixture({ masterDataControl: JSON.stringify(master), processMasterData: '{}' });
  try {
    await h.begin('master', 'editor', 200, '&scope=AB');
    await h.command('master', 'apply', { patches: [
      insert('lines', { id: 'line-A', code: 'A', name: 'Synthetic A', stages: [{ id: 'stage-A-CUT', code: 'A-CUT', name: 'Synthetic cut' }] }),
      ...['G-A', 'G-L'].map(name => insert('categoryGroups', { id: 'group-' + name, line: 'A', name, defaultStages: ['A-CUT'] })),
    ] }, 'editor', 200, '&scope=AB');
    await h.promote('master', '&scope=AB');
    await h.begin('master', 'editor', 200, '&scope=AB');
    await h.command('master', 'apply', { patches: ['G-A', 'G-L'].map((category, i) => insert('products', {
      id: 'product-' + i, code: 'A' + (100 + i), name: 'Synthetic product ' + i, line: 'A', category,
      routeMode: 'group', stages: ['A-CUT'], specification: '10 mm', unit: 'PCS',
    })) }, 'editor', 200, '&scope=AB');
    await h.promote('master', '&scope=AB');
    await h.begin('routine-equipment');
    await h.command('routine-equipment', 'apply', { patches: [
      insert('categories', { id: 'category', name: 'Synthetic category' }),
      insert('subcategories', { id: 'subcategory', categoryId: 'category', name: 'Synthetic subcategory' }),
      insert('groups', { id: 'group', categoryId: 'category', subcategoryId: 'subcategory', name: 'Synthetic group' }),
    ] });
    await h.command('routine-equipment', 'apply', { patches: ['source', 'target'].map((id, i) => insert('equipment', {
      id, assetCode: 'FX800' + i, name: 'Synthetic ' + id, groupId: 'group', spec: '0–150 mm', unit: '支',
      enabled: true, confirmed: true, calibrationMethod: 'none', calibratedAt: '', expiresAt: '',
    })) });
    await h.promote('routine-equipment');
    await h.begin('iqc');
    await h.command('iqc', 'apply', { patches: [
      insert('categories', { id: 'category', nameVi: 'Synthetic category' }),
      insert('suppliers', { id: 'supplier', nameVi: 'Synthetic supplier' }),
      insert('parts', { id: 'part', code: 'PART1', nameVi: 'Synthetic part', specificationVi: '10 mm', categoryId: 'category', supplierIds: ['supplier'], supplierRaw: '', standardCode: '', photos: [] }),
    ] });
    await h.command('iqc', 'apply', { moduleAction: 'createError', input: { partCode: 'PART1', nameVi: 'Synthetic error' } });
    const errorId = h.flow(await h.read('iqc')).working.errors[0].id;
    await h.command('iqc', 'apply', { moduleAction: 'createItem', input: { errorId, nameVi: 'Synthetic item', methodVi: 'Keep method',
      rules: [{ id: 'rule', cadence: 'batch', kind: 'aql', value: '0.25' }], inspectionMode: 'equipment', equipmentId: 'source' } });
    await h.promote('iqc');
    for (const [i, group] of ['G-A', 'G-L'].entries()) {
      const q = scopeQ(group);
      await h.begin('ipqc-ab', 'editor', 200, q);
      await h.command('ipqc-ab', 'apply', { moduleAction: 'create-error', input: { stageCode: 'A-CUT', name: 'Synthetic error ' + group } }, 'editor', 200, q);
      const errorId = h.flow(await h.read('ipqc-ab', 'editor', q)).working.errors[0].id;
      await h.command('ipqc-ab', 'apply', { moduleAction: 'create-item', input: { errorId, item: { standard: '10 mm', methodText: 'Keep method',
        inspectionMode: 'equipment', equipmentId: 'source', productCodes: ['A' + (100 + i)], rules: [{ id: 'rule-' + i, cadence: 'batch', kind: 'aql', value: '0.25' }] } } }, 'editor', 200, q);
    }
    await h.begin('ipqc-ab', 'editor', 200, '&module=1');
    await h.promote('ipqc-ab', '&module=1');
    const baseValues = (await h.core.readState()).values;
    const initial = await h.preview();
    const entry = (body, moduleId) => body.modules.find(row => row.moduleId === moduleId);
    for (const moduleId of ['iqc', 'ipqc-ab']) {
      assert(entry(initial, moduleId).items.length > 0);
      assert(entry(initial, moduleId).items.every(row => row.selectable), moduleId + ' V3 editor must be selectable without legacy approval.submit');
    }
    assert.equal(entry(initial, 'iqc').openVersion, null, 'closed approved IQC round can be previewed before Begin');
    assert(entry(initial, 'ipqc-ab').scopes.every(scope => scope.openVersion === null), 'closed approved AB scopes can be previewed before Begin');
    for (const [who, allowedModule, deniedModule] of [['iqc-only', 'iqc', 'ipqc-ab'], ['ab-only', 'ipqc-ab', 'iqc']]) {
      const preview = await h.preview(who);
      assert(entry(preview, allowedModule).items.every(row => row.selectable));
      assert(entry(preview, deniedModule).items.every(row => !row.selectable));
    }
    record('Normal-approved IQC and two AB scopes: existing view/edit staff selects despite no legacy Submit; GET writes nothing');
    const legacyRoot = JSON.parse(baseValues.ipqcABMasterControl);
    delete legacyRoot.scopes['A:G-L'].workflow;
    const projection = { ...baseValues, ipqcABMasterControl: JSON.stringify(legacyRoot) };
    // Use normal Begin to reopen a closed round; preview does not write/adopt it.
    for (const [moduleId, q] of [['iqc', ''], ['ipqc-ab', scopeQ('G-A')]]) {
      const original = json(h.flow(await h.read(moduleId, 'editor', q)));
      await h.begin(moduleId, 'editor', 200, q);
      const current = () => h.read(moduleId, 'editor', q);
      const row = h.flow(await current()).working.items[0];
      const patch = target => [{ op: 'set', path: ['items', { id: row.id }, 'equipmentId'], value: target },
        { op: 'set', path: ['items', { id: row.id }, 'inspectionMode'], value: 'equipment' }];
      async function replace(target, who = 'editor', expected = 200, guardValue) {
        const currentRow = h.flow(await current()).working.items[0], patches = patch(target);
        return h.command(moduleId, 'apply', { patches, guards: patches.map(p => ({ path: p.path,
          value: p.path.at(-1) === 'equipmentId' && guardValue !== undefined ? guardValue : currentRow[p.path.at(-1)] })) }, who, expected, q);
      }
      assert.equal((await h.read(moduleId, 'edit-only', q)).permissions.edit, true);
      assert.equal((await h.read(moduleId, 'edit-only', q)).permissions.submit, false);
      assert(entry(await h.preview('edit-only'), moduleId).items.every(row => row.selectable));
      await replace('target', 'edit-only');
      const changed = h.flow(await current());
      assert.equal(changed.working.items[0].equipmentId, 'target');
      assert.deepEqual(changed.active, original.active); assert.deepEqual(changed.saved, original.saved);
      for (const who of ['no-edit', 'no-view']) {
        assert(entry(await h.preview(who), moduleId).items.every(row => !row.selectable));
        const before = h.snapshot(); await replace('source', who, 403); assert.deepEqual(h.snapshot(), before);
      }
      let before = h.snapshot(); const stale = await replace('source', 'editor', 409, 'source');
      assert.equal(stale.error, 'DEPENDENCY_CHANGED_RECONFIRM'); assert.deepEqual(h.snapshot(), before);
      await replace('source');
      await replace('target');
      const saveQ = moduleId === 'ipqc-ab' ? '&module=1' : q;
      if (moduleId === 'ipqc-ab') await h.begin(moduleId, 'editor', 200, saveQ);
      const save = h.flow(await h.command(moduleId, 'save', {}, 'edit-only', 200, saveQ)).saved;
      before = h.snapshot(); const denied = await h.command(moduleId, 'submit', { savedId: save.id, reason: 'Must remain forbidden' }, 'edit-only', 403, saveQ);
      assert.equal(denied.error, 'FORBIDDEN'); assert.deepEqual(h.snapshot(), before);
      const submitted = await h.command(moduleId, 'submit', { savedId: save.id, reason: 'Synthetic pending lock' }, 'editor', 200, saveQ);
      const pending = entry(await h.preview(), moduleId);
      assert(pending.items.every(row => !row.selectable && row.unavailableReason === '待審範圍已鎖定；結案後請重新選取'));
      before = h.snapshot(); const locked = await replace('source', 'editor', 409); assert.equal(locked.error, 'PENDING_LOCKED'); assert.deepEqual(h.snapshot(), before);
      if (moduleId === 'ipqc-ab') {
        before = h.snapshot(); const blockedBegin = await h.begin(moduleId, 'editor', 409, scopeQ('G-L'));
        assert.equal(blockedBegin.error, 'PENDING_LOCKED'); assert.deepEqual(h.snapshot(), before);
      }
      await h.command(moduleId, 'approve', { caseId: submitted.receipt.caseId }, 'reviewer', 200, saveQ);
      record(moduleId + ': edit/no-Submit Apply succeeds; Submit denied, view/edit denials, stale guard and pending reject without writes; explicit reviewer adoption only');
    }
    // Missing scope remains a real adapter rejection, never an implicit new scope.
    let before = h.snapshot(); const invalid = await h.begin('ipqc-ab', 'editor', 422, scopeQ('NOT-IN-CATALOG'));
    assert.equal(invalid.error, 'SCOPE_INVALID'); assert.deepEqual(h.snapshot(), before);
    record('AB missing catalog scope rejected with zero persistence');
    const mixed = await fixture(projection);
    try {
      const p = entry(await mixed.preview(), 'ipqc-ab');
      assert(p.scopes.find(s => s.items.some(r => r.scopeKey === 'A:G-A')).items.every(r => r.selectable));
      assert(p.scopes.find(s => s.items.some(r => r.scopeKey === 'A:G-L')).items.every(r => !r.selectable));
      const noEdit = entry(await mixed.preview('no-edit'), 'ipqc-ab');
      assert(noEdit.items.filter(r => r.scopeKey === 'A:G-A').every(r => !r.selectable));
      assert(noEdit.items.filter(r => r.scopeKey === 'A:G-L').every(r => r.selectable));
      record('Derived mixed AB projection: V3 uses moduleId edit; legacy scope independently retains global Submit gate; no cross-scope enabling');
      traces.push(...mixed.trace);
    } finally { mixed.close(); }
    // Deliberately retain the approved scope projection while only moduleDraft
    // is pending: this compatibility shape isolates the root-level fence.
    const rootLocked = JSON.parse(projection.ipqcABMasterControl);
    rootLocked.moduleDraft.workflow.pendingId = 'synthetic-root-only-pending';
    const rootFixture = await fixture({ ...projection, ipqcABMasterControl: JSON.stringify(rootLocked) });
    try {
      for (const who of ['editor', 'no-edit']) {
        const p = entry(await rootFixture.preview(who), 'ipqc-ab');
        assert(p.items.length === 2 && p.items.every(r => !r.selectable && r.unavailableReason === '待審範圍已鎖定；結案後請重新選取'));
      }
      before = rootFixture.snapshot(); const locked = await rootFixture.begin('ipqc-ab', 'editor', 409, scopeQ('G-A'));
      assert.equal(locked.error, 'PENDING_LOCKED'); assert.deepEqual(rootFixture.snapshot(), before);
      record('Derived root-only pending projection blocks V3 and legacy AB scopes even when each scope has no pending version; GET stays read-only');
      traces.push(...rootFixture.trace);
    } finally { rootFixture.close(); }
    traces.push(...h.trace);
    const result = { status: 'PASS_BOUNDED_IQC_AB_V3_PREVIEW', groups: groups.length, directHandlerInvocations: traces.length, checks: groups, trace: traces,
      limits: ['No IPQC-C repair: its view-implies-edit/save/submit contract requires separate policy decision.',
        'Mixed-adoption and root-only-lock inputs are explicitly derived synthetic projections, not normal legacy creation or whole-module submission acceptance.',
        'Direct guarded handlers, not executeTransfer/native UI, live data or per-button speed. No full build/CI/publication claim.'] };
    if (process.env.REPLACEMENT_PREVIEW_EVIDENCE_PATH) fs.writeFileSync(process.env.REPLACEMENT_PREVIEW_EVIDENCE_PATH, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ status: result.status, groups: groups.length, directHandlerInvocations: traces.length }));
  } finally { h.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
