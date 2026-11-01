/* Normal-login, normal-approved synthetic sources; actual in-process handlers.
 * Legacy compatibility uses explicit projections derived from those approvals.
 * No browser, HTTP server, live accounts, network or installation.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { fixture, json } = require('./ipqc-c-operation-fixture.cjs');
const checks = [], trace = [];
const record = name => { checks.push({ name, status: 'PASS' }); console.log(JSON.stringify(checks.at(-1))); };
const insert = (collection, value) => ({ op: 'insert', path: [collection], value });
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const photoId = createHash('sha256').update(gif).digest('hex');
const empty = { AB: { products: [], lines: [], categoryGroups: [] }, C: { products: [], lines: [], categoryGroups: [] }, PROCESS: {} };
const master = { active: json(empty), versions: Object.entries(empty).map(([scope, snapshot]) => ({
  id: 'initial-empty-' + scope, scope, number: 1, status: 'approved', snapshot, revision: 1,
  creatorId: 'fixture-initializer', creatorName: 'Synthetic empty initialization', createdAt: 'synthetic', updatedAt: 'synthetic', history: [],
})) };
const emptyC = { schemaVersion: 1, activeVersionId: null, source: null, issues: [], reservedErrorCodes: [], reservedItemCodes: [],
  versions: [{ id: 'synthetic-empty-draft', number: 1, status: 'draft', snapshot: { errors: [], items: [] }, baseVersionId: null,
    revision: 1, creatorId: 'fixture-initializer', creatorName: 'Synthetic empty initialization', createdAt: 'synthetic', updatedAt: 'synthetic', history: [] }] };
async function upload(h, who, expected = 200) {
  const response = await h.load('app/api/ipqc-c/photo/route.ts').PUT(new Request('http://fixture/api/ipqc-c/photo', {
    method: 'PUT', headers: { ...h.sessions[who], Origin: 'http://fixture', 'Content-Type': 'image/gif' }, body: gif,
  }));
  const body = await response.json(); h.trace.push({ endpoint: 'ipqc-c/photo', method: 'PUT', who, status: response.status });
  assert.equal(response.status, expected, JSON.stringify(body)); if (expected === 200) assert.equal(body.id, photoId); return body;
}
const full = async h => JSON.parse((await h.core.readState()).values.ipqcCMasterControl);
const caseRead = (h, id, who = 'editor') => h.call('ipqc-c/workflow', 'GET', undefined, who, 200, '?caseId=' + id);
async function unchanged(h, task) { const before = h.snapshot(); const result = await task(); assert.deepEqual(h.snapshot(), before); return result; }
(async () => {
  const h = await fixture({ masterDataControl: JSON.stringify(master), processMasterData: '{}', ipqcCMasterControl: JSON.stringify(emptyC) });
  try {
    await h.begin('master', 'editor', 200, '&scope=C');
    await h.command('master', 'apply', { patches: [
      insert('lines', { id: 'line-C', code: 'C', name: 'Synthetic C', stages: [{ id: 'stage-C-CUT', code: 'C-CUT', name: 'Synthetic cut' }] }),
      insert('categoryGroups', { id: 'group-C', line: 'C', name: 'G-C', defaultStages: ['C-CUT'] }),
    ] }, 'editor', 200, '&scope=C'); await h.promote('master', '&scope=C');
    await h.begin('master', 'editor', 200, '&scope=C');
    await h.command('master', 'apply', { patches: [insert('products', { id: 'product-C', code: 'C100', name: 'Synthetic product', line: 'C', category: 'G-C',
      routeMode: 'group', stages: ['C-CUT'], specification: '10 mm', unit: 'PCS' })] }, 'editor', 200, '&scope=C'); await h.promote('master', '&scope=C');
    await h.begin('routine-equipment');
    await h.command('routine-equipment', 'apply', { patches: [
      insert('categories', { id: 'category', name: 'Synthetic category' }),
      insert('subcategories', { id: 'subcategory', categoryId: 'category', name: 'Synthetic subcategory' }),
      insert('groups', { id: 'group', categoryId: 'category', subcategoryId: 'subcategory', name: 'Synthetic group' }),
    ] });
    await h.command('routine-equipment', 'apply', { patches: ['source', 'target'].map((id, i) => insert('equipment', { id,
      assetCode: 'FX900' + i, name: 'Synthetic ' + id, groupId: 'group', spec: '0–150 mm', unit: '支', enabled: true,
      confirmed: true, calibrationMethod: 'none', calibratedAt: '', expiresAt: '' })) }); await h.promote('routine-equipment');
    await upload(h, 'editor');
    await h.begin('ipqc-c');
    await h.command('ipqc-c', 'apply', { moduleAction: 'create-error', input: { productCode: 'C100', stageCode: 'C-CUT', name: 'Synthetic error' } });
    const errorId = h.flow(await h.read('ipqc-c')).working.errors[0].id;
    await h.command('ipqc-c', 'apply', { moduleAction: 'create-item', input: { errorId, item: { standard: '10 mm', description: 'Keep original method',
      standardEnabled: true, equipmentId: 'source', equipmentGroupId: 'group', rule: { cadence: 'batch', batchKind: 'aql', aqlValue: '0.25' },
      mediaItems: [{ id: photoId, name: 'Synthetic original.gif', note: 'Keep full original photo reference', afterParagraph: 0 }] } } });
    const originalCaseId = await h.promote('ipqc-c'), originalCase = await caseRead(h, originalCaseId);
    const baseState = await h.core.readState(), original = await full(h), originalObjects = new Map(h.objects);
    const permissionMatrix = {};
    await unchanged(h,()=>h.call('ipqc-c/workflow','GET',undefined,'no-view',403,'?permissions=1'));
    for (const who of ['viewer', 'edit-only', 'save-only', 'submit-only', 'reviewer','module-reviewer']) {
      const result = await h.read('ipqc-c', who, '&permissions=1'); permissionMatrix[who] = result.permissions;
      for (const operation of ['edit', 'save', 'submit']) assert.equal(result.permissions[operation], who === operation + '-only', who + ' ' + operation + ' must follow its own cell');
      // Accepted explicit cells: viewing alone does not permit withdrawal.
      assert.equal(result.permissions.view, true); assert.equal(result.permissions.withdraw, who === 'edit-only');
      assert.equal(result.permissions.history, true);
    }
    assert.equal(permissionMatrix.reviewer.approve, true); assert.equal(permissionMatrix.reviewer.return, true);
    assert.equal(permissionMatrix.viewer.approve, false); assert.equal(permissionMatrix.viewer.return, false);
    const deletionOnly = (await h.read('ipqc-c', 'delete-only', '&permissions=1')).permissions;
    assert.equal(deletionOnly.edit, false); assert.equal(deletionOnly.delete, false, 'delete DTO must match existing edit-plus-delete mutation requirement');
    const editableDeletion = (await h.read('ipqc-c', 'edit-delete', '&permissions=1')).permissions;
    assert.equal(editableDeletion.edit, true); assert.equal(editableDeletion.delete, true);
    record('Normal master/equipment/C approval and nonempty uploaded photo; distinct operation cells with explicit view/review/history/withdraw DTO semantics');
    for (const who of ['viewer', 'save-only', 'submit-only', 'no-view']) await unchanged(h, () => h.begin('ipqc-c', who, 403));
    await h.begin('ipqc-c', 'edit-only');
    const itemId = h.flow(await h.read('ipqc-c')).working.items[0].id;
    async function patch(who, target, expected = 200) {
      const row = h.flow(await h.read('ipqc-c')).working.items[0], patches = [{ op: 'set', path: ['items', { id: itemId }, 'equipmentId'], value: target }];
      return h.command('ipqc-c', 'apply', { patches, guards: [{ path: patches[0].path, value: row.equipmentId }] }, who, expected);
    }
    const cPreview = async who => (await h.preview(who)).modules.find(row => row.moduleId === 'ipqc-c');
    assert.equal((await cPreview('edit-only')).items[0].selectable, true);
    for (const who of ['viewer', 'save-only', 'submit-only', 'no-view']) assert((await cPreview(who)).items.every(row => !row.selectable));
    await patch('edit-only', 'target');
    let current = await full(h); assert.equal(current.workflow.working.items[0].equipmentId, 'target');
    assert.deepEqual(current.workflow.active, original.workflow.active); assert.deepEqual(current.workflow.saved, original.workflow.saved);
    assert.deepEqual(current.workflow.working.items[0].mediaItems, original.workflow.active.content.items[0].mediaItems);
    for (const who of ['viewer', 'save-only', 'submit-only', 'no-view']) await unchanged(h, () => patch(who, 'source', 403));
    for (const who of ['viewer', 'edit-only', 'submit-only', 'no-view']) await unchanged(h, () => h.command('ipqc-c', 'save', {}, who, 403));
    for (const who of ['viewer', 'edit-only', 'save-only', 'no-view']) await unchanged(h, () => h.command('ipqc-c', 'submit', { savedId: 'not-authorized' }, who, 403));
    await unchanged(h, () => h.command('ipqc-c', 'apply', { moduleAction: 'delete-item', input: { id: itemId } }, 'delete-only', 403));
    record('V3 view-only/partial/no-view cannot bypass own operation cells; edit-only guarded replacement preserves saved/effective/media; preview is read-only');
    const saved = h.flow(await h.command('ipqc-c', 'save', {}, 'save-only')).saved;
    assert.equal(saved.content.items[0].equipmentId, 'target');
    await unchanged(h, () => h.call('ipqc-c/workflow', 'GET', undefined, 'save-only', 403, '?restoreSaveId=' + saved.id));
    await unchanged(h,()=>h.call('ipqc-c/workflow','GET',undefined,'edit-only',403,'?restoreSaveId='+saved.id));
    const restorePreview = await h.call('ipqc-c/workflow', 'GET', undefined, 'editor', 200, '?restoreSaveId=' + saved.id);
    assert.equal(restorePreview.after.items[0].equipmentId, 'target');
    const submitted = await h.command('ipqc-c', 'submit', { savedId: saved.id, reason: 'Synthetic separate submit' }, 'submit-only');
    const fixed = await caseRead(h, submitted.receipt.caseId); assert.deepEqual(fixed.reviewCase.content, saved.content);
    assert((await cPreview('editor')).items.every(row => !row.selectable));
    for (const [who, action, detail] of [['edit-only', 'apply', { patches: [], guards: [] }], ['save-only', 'save', {}], ['submit-only', 'submit', { savedId: saved.id }]]) {
      const locked = await unchanged(h, () => h.command('ipqc-c', action, detail, who, 409)); assert.equal(locked.error, 'PENDING_LOCKED');
    }
    await unchanged(h, () => h.command('ipqc-c', 'approve', { caseId: submitted.receipt.caseId }, 'viewer', 403));
    await unchanged(h, () => h.command('ipqc-c', 'return', { caseId: submitted.receipt.caseId, reason: 'not allowed' }, 'viewer', 403));
    await unchanged(h,()=>h.command('ipqc-c','withdraw',{caseId:submitted.receipt.caseId,reason:'View must not authorize withdrawal'},'viewer',403));
    await h.command('ipqc-c','withdraw',{caseId:submitted.receipt.caseId,reason:'Explicitly authorized withdrawal'},'edit-only');
    assert.equal((await caseRead(h, submitted.receipt.caseId)).reviewCase.status, 'withdrawn');
    const resubmitted = await h.command('ipqc-c', 'submit', { savedId: saved.id, reason: 'Synthetic reviewer return' }, 'submit-only');
    await h.command('ipqc-c', 'return', { caseId: resubmitted.receipt.caseId, reason: 'Synthetic retained return' }, 'module-reviewer');
    const finalSubmit = await h.command('ipqc-c', 'submit', { savedId: saved.id, reason: 'Synthetic independent adoption' }, 'submit-only');
    await h.command('ipqc-c', 'approve', { caseId: finalSubmit.receipt.caseId }, 'module-reviewer');
    current = await full(h); assert.equal(current.workflow.active.content.items[0].equipmentId, 'target');
    assert.deepEqual(current.workflow.active.content.items[0].mediaItems, original.workflow.active.content.items[0].mediaItems);
    assert.deepEqual(await caseRead(h, originalCaseId), originalCase);
    for (const [key, bytes] of originalObjects) assert(h.objects.get(key)?.equals(bytes), 'preexisting R2 bytes retained');
    record('Save-only snapshots existing working; submit-only submits exact saved; pending locks; existing withdrawal/return and independent approval preserve old full case and R2 bytes');
    await upload(h, 'edit-only');
    for (const who of ['viewer', 'save-only', 'submit-only', 'no-view', 'anonymous']) await unchanged(h, () => upload(h, who, 403));
    const readPhoto = await h.load('app/api/ipqc-c/photo/route.ts').GET(new Request('http://fixture/api/ipqc-c/photo?id=' + photoId, { headers: h.sessions.viewer }));
    h.trace.push({ endpoint: 'ipqc-c/photo', method: 'GET', who: 'viewer', status: readPhoto.status }); assert.equal(readPhoto.status, 200); assert(Buffer.from(await readPhoto.arrayBuffer()).equals(gif));
    await unchanged(h, () => h.call('ipqc-c/workflow', 'GET', undefined, 'anonymous', 403));
    await unchanged(h, () => h.begin('ipqc-c', 'anonymous', 401));
    await unchanged(h, () => h.call('ipqc-c', 'POST', { action: 'begin', baseRevision: 1 }, 'anonymous', 401));
    record('Photo upload follows edit, not Submit; no-edit/unauth denied without persistence; photo GET and own-account authentication remain unchanged');
    await h.begin('ipqc-c');
    const beforePermission = await h.read('ipqc-c', 'revocable', '&permissions=1'); assert.equal(beforePermission.permissions.edit, true);
    const state = await h.core.readState(), users = JSON.parse(state.values.platformUsers), user = users.find(row => row.id === 'preview-revocable');
    for (const operation of ['edit', 'save', 'submit']) user.accessOverrides['ipqc-c.' + operation] = false;
    // Test-only account revocation inside this private fixture; not admin-UI acceptance.
    const encoded = await h.load('lib/state-records.ts').encodeRecordValues(h.env.STATE_ARCHIVE, { ...state.values, platformUsers: JSON.stringify(users) });
    h.db.prepare('UPDATE shared_state SET revision=?,"values"=? WHERE id=1').run(state.revision + 1, encoded);
    const flow = h.flow(await h.read('ipqc-c')), refreshed = await h.read('ipqc-c', 'revocable', '&since=' + flow.generation + ':' + flow.revision);
    assert.equal(refreshed.unchanged, true); assert.equal(refreshed.permissions.edit, false); assert.equal(refreshed.permissions.save, false); assert.equal(refreshed.permissions.submit, false);
    await unchanged(h, () => patch('revocable', 'source', 403)); await unchanged(h, () => h.command('ipqc-c', 'save', {}, 'revocable', 403));
    await unchanged(h, () => h.command('ipqc-c', 'submit', { savedId: saved.id }, 'revocable', 403)); await unchanged(h, () => upload(h, 'revocable', 403));
    record('Synthetic cell revocation appears even on unchanged:true refresh; next Apply/Save/Submit/upload fail closed without changing draft/history');
    // Preserve old approved source as explicit legacy compatibility input.
    const legacyRoot = JSON.parse(baseState.values.ipqcCMasterControl); delete legacyRoot.workflow;
    const legacy = await fixture({ ...baseState.values, ipqcCMasterControl: JSON.stringify(legacyRoot) });
    try {
      // The referenced bytes are copied only into this separate private R2 map.
      for (const [key, bytes] of originalObjects) legacy.objects.set(key, Buffer.from(bytes));
      const legacyCall = async (action, who, expected = 200, details = {}) => {
        const state = await legacy.core.readState(), control = JSON.parse(state.values.ipqcCMasterControl), open = control.versions.find(row => row.status === 'draft' || row.status === 'pending');
        return legacy.call('ipqc-c', 'POST', { action, baseRevision: state.revision, versionId: open?.id, versionRevision: open?.revision, ...details }, who, expected);
      };
      // Only stored pre-policy cases may still be decided through legacy routes.
      // This explicit isolated fixture admission is not a successful new Submit.
      async function installHistoricalPendingFixture() {
        const state=await legacy.core.readState(),control=JSON.parse(state.values.ipqcCMasterControl),draft=control.versions.find(row=>row.status==='draft');assert(draft);
        const content=json(draft.snapshot),otherVersions=json(control.versions.filter(row=>row.id!==draft.id)),at='2026-10-01T00:00:00.000Z';
        draft.status='pending';draft.submittedBy='Synthetic editor';draft.submittedAt=at;draft.updatedAt=at;draft.revision++;
        draft.history.push({action:'submit',actorId:'preview-editor',actorName:'Synthetic editor',at,comment:'Explicit historical pending fixture admitted under the previous policy; no new legacy Submit'});
        state.values.ipqcCMasterControl=JSON.stringify(control);
        legacy.db.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1').run(state.revision+1,await legacy.load('lib/state-records.ts').encodeRecordValues(legacy.env.STATE_ARCHIVE,state.values),at);
        const stored=await full(legacy);assert.deepEqual(stored.versions.find(row=>row.id===draft.id).snapshot,content);assert.deepEqual(stored.versions.filter(row=>row.id!==draft.id),otherVersions);
        return legacy.call('ipqc-c');
      }
      async function rejectNewLegacySubmit() {
        const rejected=await unchanged(legacy,()=>legacyCall('submit','editor',409,{snapshot:legacySnapshot}));
        assert.equal(rejected.code,'WORKFLOW_V3_REQUIRED');assert.equal(rejected.details.reason,'LEGACY_SUBMIT_CANNOT_VERIFY_SAVED_VERSION');
      }
      for (const who of ['viewer', 'save-only', 'submit-only', 'no-view']) await unchanged(legacy, () => legacyCall('begin', who, 403));
      await legacyCall('begin', 'edit-only');
      await unchanged(legacy, () => legacyCall('create-error', 'submit-only', 403, { productCode: 'C100', stageCode: 'C-CUT', name: 'Denied' }));
      await unchanged(legacy,()=>legacyCall('create-error','edit-only',403,{productCode:'C100',stageCode:'C-CUT',name:'Denied without create'}));
      await legacyCall('create-error', 'editor', 200, { productCode: 'C100', stageCode: 'C-CUT', name: 'Synthetic legacy added' });
      let l = await full(legacy);const draft = l.versions.find(row => row.status === 'draft'),extraError = draft.snapshot.errors.at(-1);
      for (const who of ['delete-only', 'edit-only']) await unchanged(legacy, () => legacyCall('delete-error', who, 403, { id: extraError.id }));
      await legacyCall('delete-error', 'edit-delete', 200, { id: extraError.id });
      const legacySnapshot = json((await full(legacy)).versions.find(row => row.status === 'draft').snapshot); legacySnapshot.items[0].standard = '11 mm';
      for (const who of ['viewer', 'edit-only', 'save-only', 'submit-only', 'edit-submit', 'no-view']) await unchanged(legacy, () => legacyCall('save', who, 403, { snapshot: legacySnapshot }));
      await legacyCall('save', 'edit-save', 200, { snapshot: legacySnapshot });
      for (const who of ['viewer', 'save-only', 'submit-only', 'edit-save', 'edit-submit', 'no-view']) await unchanged(legacy, () => legacyCall('submit', who, 403, { snapshot: legacySnapshot }));
      await rejectNewLegacySubmit();const legacyPending = await installHistoricalPendingFixture();
      const pending = legacyPending.control.versions.find(row => row.status === 'pending'); assert(pending);
      await unchanged(legacy, () => legacyCall('begin', 'editor', 409));
      await unchanged(legacy, () => legacyCall('save', 'editor', 409, { snapshot: legacySnapshot }));
      await unchanged(legacy, () => legacy.begin('ipqc-c', 'editor', 409));
      await unchanged(legacy, () => legacyCall('approve', 'viewer', 403));
      await unchanged(legacy, () => legacyCall('withdraw', 'reviewer', 403));
      await unchanged(legacy, () => legacyCall('withdraw', 'editor', 403));
      await legacyCall('withdraw', 'edit-only');
      await rejectNewLegacySubmit();await installHistoricalPendingFixture();await legacyCall('reject', 'reviewer');
      await rejectNewLegacySubmit();await installHistoricalPendingFixture();await legacyCall('approve', 'reviewer');
      l = await full(legacy); assert.equal(l.versions.find(row => row.id === l.activeVersionId).snapshot.items[0].standard, '11 mm');
      assert.deepEqual(l.versions.find(row => row.id === originalCaseId).snapshot, original.workflow.active.content);
      await unchanged(legacy, () => legacyCall('seed', 'editor', 403));
      record('Derived legacy compatibility: edit-only Begin/Create/delete and compound Save/Submit403 gates retained; authorized new legacy Submit409 with no mutation; explicit historical pending fixtures retain review/withdraw/seed boundaries and old approved content');
      trace.push(...legacy.trace);
    } finally { legacy.close(); }
    const version = (await full(h)).versions.find(row => row.status === 'draft');
    await unchanged(h, () => h.call('ipqc-c', 'POST', { action: 'save', baseRevision: (h.db.prepare('SELECT revision FROM shared_state').get()).revision,
      versionId: version.id, versionRevision: version.revision, snapshot: version.snapshot }, 'editor', 409)).then(body => assert.equal(body.code, 'WORKFLOW_V3_REQUIRED'));
    record('Adopted V3 still refuses fully authorized legacy whole-snapshot writes');
    trace.push(...h.trace);
    const result = { status: 'PASS_C_OPERATION_ALIGNMENT_BOUNDED', groups: checks.length, directHandlerInvocations: trace.length, checks, permissionMatrix, trace,
      limits: ['Private normal-login synthetic handlers, not native UI/live speed or real-user role audit.',
        'C requires an explicit empty legacy draft bootstrap in this fixture; not blank-install acceptance.',
        'Legacy compatibility source derives from normal approvals; no legacy import/seed performed.',
        'Revocation injection changes only ephemeral synthetic account cells; not account-admin UI acceptance.',
        'Snapshot assertions compare shared_state row and R2 key/body hashes, not every DB table or metadata.'] };
    if (process.env.IPQCC_OPERATION_EVIDENCE_PATH) fs.writeFileSync(process.env.IPQCC_OPERATION_EVIDENCE_PATH, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ status: result.status, groups: result.groups, directHandlerInvocations: result.directHandlerInvocations }));
  } finally { h.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
