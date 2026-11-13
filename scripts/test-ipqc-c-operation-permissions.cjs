/* Normal-login, normal-approved synthetic sources; actual in-process handlers.
 * Legacy compatibility uses explicit projections derived from those approvals.
 * No browser, HTTP server, live accounts, network or installation.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { fixture, json } = require('./ipqc-c-operation-fixture.cjs');
const checks = [], trace = [], legacySaveMatrix = [], legacySubmitMatrix = [];
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
      for (const operation of ['edit', 'save', 'submit']) assert.equal(result.permissions[operation], who === operation + '-only'||operation==='save'&&who==='edit-only', who + ' ' + operation + ' follows edit-implies-save with independent submit');
      // Accepted explicit cells: viewing alone does not permit withdrawal.
      assert.equal(result.permissions.view, true); assert.equal(result.permissions.withdraw, who === 'edit-only');
      assert.equal(result.permissions.history, true);
    }
    assert.equal(permissionMatrix['module-reviewer'].return,true);assert.equal(permissionMatrix['module-reviewer'].approve,false);
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
    await h.command('ipqc-c','save',{},'edit-only');
    for (const who of ['viewer', 'submit-only', 'no-view']) await unchanged(h, () => h.command('ipqc-c', 'save', {}, who, 403));
    for (const who of ['viewer', 'edit-only', 'save-only', 'no-view']) await unchanged(h, () => h.command('ipqc-c', 'submit', { savedId: 'not-authorized' }, who, 403));
    await unchanged(h, () => h.command('ipqc-c', 'apply', { moduleAction: 'delete-item', input: { id: itemId } }, 'delete-only', 403));
    record('V3 view-only/partial/no-view cannot bypass own operation cells; edit-only guarded replacement preserves saved/effective/media; preview is read-only');
    const saved = h.flow(await h.command('ipqc-c', 'save', {}, 'save-only')).saved;
    assert.equal(saved.content.items[0].equipmentId, 'target');
    await unchanged(h, () => h.call('ipqc-c/workflow', 'GET', undefined, 'save-only', 403, '?restoreSaveId=' + saved.id));
    await unchanged(h,()=>h.call('ipqc-c/workflow','GET',undefined,'edit-only',403,'?restoreSaveId='+saved.id));
    await unchanged(h,async()=>{const denied=await h.call('ipqc-c/workflow','GET',undefined,'editor',422,'?restoreSaveId='+saved.id);assert.equal(denied.error,'DRAFT_RESTORE_NOT_SUPPORTED');});
    await unchanged(h,async()=>{const denied=await h.command('ipqc-c','restore',{restoreSaveId:saved.id},'editor',422);assert.equal(denied.error,'DRAFT_RESTORE_NOT_SUPPORTED');});
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
    await h.command('ipqc-c', 'return', { caseId: resubmitted.receipt.caseId, reason: 'Synthetic module-authorized return' }, 'module-reviewer');
    assert.equal((await caseRead(h,resubmitted.receipt.caseId)).reviewCase.status,'returned');
    const reviewerSubmit=await h.command('ipqc-c','submit',{savedId:saved.id,reason:'Synthetic reviewer return'},'submit-only');
    await h.command('ipqc-c', 'return', { caseId: reviewerSubmit.receipt.caseId, reason: 'Synthetic retained return' }, 'reviewer');
    const finalSubmit = await h.command('ipqc-c', 'submit', { savedId: saved.id, reason: 'Synthetic independent adoption' }, 'submit-only');
    await unchanged(h,()=>h.command('ipqc-c', 'approve', { caseId: finalSubmit.receipt.caseId }, 'module-reviewer',403));
    await h.command('ipqc-c', 'approve', { caseId: finalSubmit.receipt.caseId }, 'reviewer');
    current = await full(h); assert.equal(current.workflow.active.content.items[0].equipmentId, 'target');
    const historyBefore=h.snapshot();
    const approvedList=await h.call('ipqc-c/workflow','GET',undefined,'editor',200,'?approvedOnly=1&uiHistory=1');
    assert(approvedList.versions.rows.some(row=>row.id===finalSubmit.receipt.caseId));
    assert(!approvedList.versions.rows.some(row=>row.id.startsWith('shared-')));
    const approvedBody=await h.call('ipqc-c/workflow','GET',undefined,'editor',200,'?approvedOnly=1&versionId='+finalSubmit.receipt.caseId);
    assert.deepEqual(approvedBody.version.snapshot,current.workflow.active.content);
    await h.call('ipqc-c/workflow','GET',undefined,'editor',404,'?approvedOnly=1&versionId='+submitted.receipt.caseId);
    assert.deepEqual(h.snapshot(),historyBefore,'history metadata and immutable body are read-only');
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
      const oldPolicy = require('./read-performance-harness.cjs').makeLoader(legacy.env, {baseline:['public/process/access-policy.mjs']})('app/api/ipqc-c/route.ts');
      const effects = {db:0,r2:0}, prepare = legacy.env.DB.prepare.bind(legacy.env.DB), put = legacy.env.STATE_ARCHIVE.put.bind(legacy.env.STATE_ARCHIVE);
      legacy.env.DB.prepare = sql => { const statement=prepare(sql); return { ...statement,
        bind(...args){statement.bind(...args);return this;},
        async run(){if(/^\s*(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql))effects.db++;return statement.run();},
      }; };
      legacy.env.STATE_ARCHIVE.put = async (...args) => { effects.r2++; return put(...args); };
      const legacyUnchanged = async task => {const before={...effects},result=await unchanged(legacy,task);assert.deepEqual(effects,before,'legacy denial attempts zero D1/R2 writes');return result;};
      const legacyCall = async (action, who, expected = 200, details = {}, api) => {
        const state = await legacy.core.readState(), control = JSON.parse(state.values.ipqcCMasterControl), open = control.versions.find(row => row.status === 'draft' || row.status === 'pending');
        const body={ action, baseRevision: state.revision, versionId: open?.id, versionRevision: open?.revision, ...details };
        if(!api)return legacy.call('ipqc-c', 'POST', body, who, expected);
        const response=await api.POST(new Request('http://fixture/api/ipqc-c',{method:'POST',headers:legacy.sessions[who],body:JSON.stringify(body)})),data=await response.json();
        legacy.trace.push({endpoint:'ipqc-c',method:'POST',action,who,policy:'genuine pre-Edit-Save',status:response.status});assert.equal(response.status,expected,JSON.stringify(data));return data;
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
      async function rejectNewLegacySubmit(who='editor') {
        const rejected=await legacyUnchanged(()=>legacyCall('submit',who,409,{snapshot:legacySnapshot}));
        assert.equal(rejected.code,'WORKFLOW_V3_REQUIRED');assert.equal(rejected.details.reason,'LEGACY_SUBMIT_CANNOT_VERIFY_SAVED_VERSION');
        legacySubmitMatrix.push({who,status:409,code:rejected.code,unchanged:true});
      }
      for (const who of ['viewer', 'save-only', 'submit-only', 'no-view']) await legacyUnchanged(() => legacyCall('begin', who, 403));
      await legacyCall('begin', 'edit-only');
      await legacyUnchanged(() => legacyCall('create-error', 'submit-only', 403, { productCode: 'C100', stageCode: 'C-CUT', name: 'Denied' }));
      await legacyUnchanged(()=>legacyCall('create-error','edit-only',403,{productCode:'C100',stageCode:'C-CUT',name:'Denied without create'}));
      await legacyCall('create-error', 'editor', 200, { productCode: 'C100', stageCode: 'C-CUT', name: 'Synthetic legacy added' });
      let l = await full(legacy);const draft = l.versions.find(row => row.status === 'draft'),extraError = draft.snapshot.errors.at(-1);
      for (const who of ['delete-only', 'edit-only']) await legacyUnchanged(() => legacyCall('delete-error', who, 403, { id: extraError.id }));
      await legacyCall('delete-error', 'edit-delete', 200, { id: extraError.id });
      const legacySnapshot = json((await full(legacy)).versions.find(row => row.status === 'draft').snapshot); legacySnapshot.items[0].standard = '11 mm';
      // The real old policy still rejects all six original negative rows.
      // Current Edit supplies effective Save; legacy full-snapshot Save still
      // requires View+Edit, so V3 Save-only does not authorize this replacement.
      for (const who of ['viewer','edit-only','save-only','submit-only','edit-submit','no-view']) {
        await legacyUnchanged(()=>legacyCall('save',who,403,{snapshot:legacySnapshot},oldPolicy));
        legacySaveMatrix.push({who,policy:'old',status:403,unchanged:true});
      }
      for (const who of ['viewer','save-only','submit-only','no-view']) {
        await legacyUnchanged(()=>legacyCall('save',who,403,{snapshot:legacySnapshot}));
        legacySaveMatrix.push({who,policy:'current',status:403,unchanged:true});
      }
      async function verifiedLegacySave(who,standard,api) {
        const before=await legacy.core.readState(),control=JSON.parse(before.values.ipqcCMasterControl),objects=new Map(legacy.objects),user=JSON.parse(before.values.platformUsers).find(row=>row.id==='preview-'+who),cells=legacy.load('lib/user-access.ts').effectiveAccess(user,before.values).cells;
        assert.equal(user.accessOverrides['ipqc-c.save'],who==='edit-save','explicit raw Save choice retained');assert.equal(cells['ipqc-c.save'],true);
        legacySnapshot.items[0].standard=standard;await legacyCall('save',who,200,{snapshot:legacySnapshot},api);
        const after=await legacy.core.readState(),next=JSON.parse(after.values.ipqcCMasterControl);assert.deepEqual(next.versions.find(row=>row.status==='draft').snapshot,legacySnapshot,'full saved snapshot exactly reread');
        assert.deepEqual(next.versions.filter(row=>row.status==='approved'),control.versions.filter(row=>row.status==='approved'));assert.equal(next.activeVersionId,control.activeVersionId);
        assert.deepEqual(Object.keys(after.values),Object.keys(before.values));for(const key of Object.keys(before.values))if(key!=='ipqcCMasterControl')assert.equal(after.values[key],before.values[key],'Save does not rewrite '+key);
        for(const [key,bytes]of objects)assert(legacy.objects.get(key)?.equals(bytes),'existing R2 and original photo bytes retained');
        legacySaveMatrix.push({who,policy:api?'old':'current',status:200,rawSave:user.accessOverrides['ipqc-c.save'],readback:true,aclUnchanged:true});
      }
      await verifiedLegacySave('edit-save','10.99 mm',oldPolicy);
      await verifiedLegacySave('edit-only','11.01 mm');await verifiedLegacySave('edit-submit','11.02 mm');await verifiedLegacySave('edit-save','11 mm');
      const forbiddenDelete=json(legacySnapshot);forbiddenDelete.items[0].deleted=true;
      await legacyUnchanged(()=>legacyCall('save','edit-only',403,{snapshot:forbiddenDelete}));
      for (const who of ['viewer','edit-only','save-only','submit-only','edit-save','no-view']) {
        await legacyUnchanged(()=>legacyCall('submit',who,403,{snapshot:legacySnapshot}));legacySubmitMatrix.push({who,status:403,unchanged:true});
      }
      await legacyUnchanged(()=>legacyCall('submit','edit-submit',403,{snapshot:legacySnapshot},oldPolicy));
      await rejectNewLegacySubmit('edit-submit');
      await rejectNewLegacySubmit();const legacyPending = await installHistoricalPendingFixture();
      const pending = legacyPending.control.versions.find(row => row.status === 'pending'); assert(pending);
      await legacyUnchanged(() => legacyCall('begin', 'editor', 409));
      await legacyUnchanged(() => legacyCall('save', 'editor', 409, { snapshot: legacySnapshot }));
      await legacyUnchanged(() => legacy.begin('ipqc-c', 'editor', 409));
      await legacyUnchanged(() => legacyCall('approve', 'viewer', 403));
      await legacyUnchanged(() => legacyCall('withdraw', 'reviewer', 403));
      await legacyUnchanged(() => legacyCall('withdraw', 'editor', 403));
      await legacyCall('withdraw', 'edit-only');
      await rejectNewLegacySubmit();await installHistoricalPendingFixture();await legacyCall('reject', 'reviewer');
      await rejectNewLegacySubmit();await installHistoricalPendingFixture();await legacyCall('approve', 'reviewer');
      l = await full(legacy); assert.equal(l.versions.find(row => row.id === l.activeVersionId).snapshot.items[0].standard, '11 mm');
      assert.deepEqual(l.versions.find(row => row.id === originalCaseId).snapshot, original.workflow.active.content);
      await legacyUnchanged(() => legacyCall('seed', 'editor', 403));
      record('Derived legacy compatibility: genuine old-policy Save403/current Edit-derived Save200 exact readback with unchanged raw ACL; no-edit/no-view/forged-delete and missing-Submit403 zero writes; authorized legacy Submit409; historical review/withdraw/seed and approved/photo bytes retained');
      trace.push(...legacy.trace);
    } finally { legacy.close(); }
    const version = (await full(h)).versions.find(row => row.status === 'draft');
    await unchanged(h, () => h.call('ipqc-c', 'POST', { action: 'save', baseRevision: (h.db.prepare('SELECT revision FROM shared_state').get()).revision,
      versionId: version.id, versionRevision: version.revision, snapshot: version.snapshot }, 'editor', 409)).then(body => assert.equal(body.code, 'WORKFLOW_V3_REQUIRED'));
    record('Adopted V3 still refuses fully authorized legacy whole-snapshot writes');
    trace.push(...h.trace);
    const result = { status: 'PASS_C_OPERATION_ALIGNMENT_BOUNDED', groups: checks.length, directHandlerInvocations: trace.length, checks, permissionMatrix, legacySaveMatrix, legacySubmitMatrix, legacyPolicyBaseline:{commit:require('./read-performance-harness.cjs').baselineCommits['public/process/access-policy.mjs'],sha256:require('./read-performance-harness.cjs').baselineHashes()['public/process/access-policy.mjs']}, trace,
      limits: ['Private normal-login synthetic handlers, not native UI/live speed or real-user role audit.',
        'C requires an explicit empty legacy draft bootstrap in this fixture; not blank-install acceptance.',
        'Legacy compatibility source derives from normal approvals; no legacy import/seed performed.',
        'Revocation injection changes only ephemeral synthetic account cells; not account-admin UI acceptance.',
        'Snapshot assertions compare shared_state row and R2 key/body hashes, not every DB table or metadata.',
        'Legacy denials additionally assert zero intercepted mutating D1 run and R2 put attempts.'] };
    if (process.env.IPQCC_OPERATION_EVIDENCE_PATH) fs.writeFileSync(process.env.IPQCC_OPERATION_EVIDENCE_PATH, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ status: result.status, groups: result.groups, directHandlerInvocations: result.directHandlerInvocations }));
  } finally { h.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
