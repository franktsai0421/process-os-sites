/* Normal-login, normal-approved synthetic sources; actual in-process handlers.
 * Legacy compatibility uses explicit projections derived from those approvals.
 * No browser, HTTP server, live accounts, network or installation.
 */
const assert = require('node:assert/strict');
const _fs = require('node:fs');
const { createHash } = require('node:crypto');
process.env.IPQCC_OPERATION_SOURCE_ROOT ||= require('node:path').resolve(__dirname,'..');
const { fixture, json } = require(require('node:path').join(process.env.IPQCC_OPERATION_SOURCE_ROOT,'scripts/ipqc-c-operation-fixture.cjs'));
const checks = [], _trace = [];
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
const _full = async h => JSON.parse((await h.core.readState()).values.ipqcCMasterControl);
const caseRead = (h, id, who = 'editor') => h.call('ipqc-c/workflow', 'GET', undefined, who, 200, '?caseId=' + id);
async function _unchanged(h, task) { const before = h.snapshot(); const result = await task(); assert.deepEqual(h.snapshot(), before); return result; }
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
    const originalCaseId = await h.promote('ipqc-c'), _originalCase = await caseRead(h, originalCaseId);

    await h.begin('ipqc-c');
    const initial=await h.core.readState();
    const recordSeed=await h.load('lib/state-records.ts').encodeRecordValues(h.env.STATE_ARCHIVE,initial.values);h.db.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1').run(initial.revision,recordSeed,'synthetic-record-seed');
    const load=h.load,route=load('app/api/ipqc-c/workflow/route.ts'),dataRoute=load('app/api/ipqc-c/route.ts'),wire=load('lib/workflow-wire.ts');
    const read=async()=>{const r=await dataRoute.GET(new Request('http://fixture/api/ipqc-c?caseMetadata=1',{headers:h.sessions.editor}));assert.equal(r.status,200);return r.json();};
    let seq=100;const send=async(command,{opt=true,who='editor',status=200}={})=>{const response=await route.POST(new Request('http://fixture/api/ipqc-c/workflow?caseMetadata=1&compact=1',{method:'POST',headers:{...h.sessions[who],...(opt?{'X-IPQC-C-Save-Projection':'1'}:{})},body:JSON.stringify({command})})),body=wire.expandWorkflowPayload(await response.json());assert.equal(response.status,status,JSON.stringify(body));return body;};
    const prepare=before=>({operationId:'projection-safety-'+(++seq),clientId:'projection-safety-client',sequence:seq,generation:before.control.workflow.generation,expectedRevision:before.control.workflow.revision,action:'save'});
    const reconstruct=(before,post)=>{const p=post.cSaveProjection;assert(p);assert(!post.control);assert.equal(p.saved.id,post.receipt.savedId);assert.equal(p.generation,post.receipt.generation);assert.equal(p.baseStateRevision,before.revision);return{...before.control,workflow:{...before.control.workflow,revision:p.flowRevision,saved:{...p.saved,content:json(before.control.workflow.working)},contributors:p.contributors},versions:before.control.versions.map(v=>v.id===p.draft.id?{...p.draft,snapshot:json(before.control.workflow.working)}:v)};};
    for(const changed of [true,false]){if(changed){const current=await read(),item=current.control.workflow.working.items[0];await h.command('ipqc-c','apply',{patches:[{op:'set',path:['items',{id:item.id},'standard'],value:'Projection changed standard'}],guards:[{path:['items',{id:item.id},'standard'],value:item.standard}]});}
      const before=await read(),command=prepare(before),post=await send(command),after=await read();assert.equal(post.receipt.unchanged,!changed);assert.deepEqual(structuredClone(reconstruct(before,post)),structuredClone(after.control));
      const full=JSON.parse((await h.core.readState()).values.ipqcCMasterControl);assert.deepEqual(full.workflow.saved.content,full.workflow.working);assert.equal(full.workflow.receipts[command.operationId].result.savedId,post.receipt.savedId);assert.deepEqual(full.workflow.working.items[0].mediaItems,before.control.workflow.working.items[0].mediaItems);assert.deepEqual(full.workflow.working.items[0].equipmentSnapshot,before.control.workflow.working.items[0].equipmentSnapshot);assert.deepEqual(full.workflow.working.items[0].rule,before.control.workflow.working.items[0].rule);
      const snapshot=h.snapshot(),replay=await send(command);assert(replay.control);assert(!replay.cSaveProjection);assert.deepEqual(h.snapshot(),snapshot);record(changed?'changed Save projection full readback parity + replay full':'unchanged Save original metadata parity + replay full');
    }
    for(const mode of ['no-header','no-expected-revision','noncanonical']){const before=await read(),command=prepare(before);if(mode==='no-expected-revision')delete command.expectedRevision;if(mode==='noncanonical')command.input={};const post=await send(command,{opt:mode!=='no-header'});assert(post.control);assert(!post.cSaveProjection);record(mode+' retains full response');}
    {const before=await read(),command=prepare(before);command.expectedRevision--;const state=h.snapshot(),post=await send(command,{status:409});assert.equal(post.error,'DRAFT_REVISION_CHANGED_RECONFIRM');assert.deepEqual(h.snapshot(),state);record('revision mismatch no mutation');}
    {const before=await read(),command=prepare(before);const state=h.snapshot();await send(command,{who:'viewer',status:403});assert.deepEqual(h.snapshot(),state);record('save denied no mutation');}
    {const before=await read(),command=prepare(before);command.action='apply';command.patches=[];const post=await send(command);assert(post.control);assert(!post.cSaveProjection);record('non-Save retains full response');}
    {const before=await read(),command=prepare(before),original=h.env.DB.prepare.bind(h.env.DB);let updates=0;h.env.DB.prepare=sql=>{const statement=original(sql);if(sql.startsWith('UPDATE shared_state SET revision=')){const run=statement.run.bind(statement);statement.run=async()=>++updates===1?{meta:{changes:0}}:run();}return statement;};try{const post=await send(command),after=await read();assert.equal(updates,2);assert.deepEqual(structuredClone(reconstruct(before,post)),structuredClone(after.control));record('CAS retry revalidates and projection matches committed attempt');}finally{h.env.DB.prepare=original;}}
    {const before=await read(),command=prepare(before),row=h.db.prepare('SELECT * FROM shared_state WHERE id=1').get(),put=h.env.STATE_ARCHIVE.put;h.env.STATE_ARCHIVE.put=async()=>{throw Error('SYNTHETIC_PUT_FAILURE');};try{const post=await send(command,{status:500});assert.equal(post.error,'WORKFLOW_WRITE_FAILED');assert(!post.cSaveProjection);assert.deepEqual(h.db.prepare('SELECT * FROM shared_state WHERE id=1').get(),row);record('PUT failure no ACK projection or database commit');}finally{h.env.STATE_ARCHIVE.put=put;}}
    {const current=await read();await h.command('ipqc-c','submit',{savedId:current.control.workflow.saved.id,reason:'Synthetic history projection guard'});const pending=(await read()).control.workflow.pendingId;await h.command('ipqc-c','return',{caseId:pending,reason:'Synthetic return for history checks'},'reviewer');
      for(const mode of ['missing-reviewed-metadata','missing-historical-version']){const state=await h.core.readState(),model=JSON.parse(state.values.ipqcCMasterControl);if(mode==='missing-reviewed-metadata'){const historical=model.versions.find(v=>v.id===pending);assert(historical);delete historical.reviewedAt;delete historical.reviewedBy;}else model.versions=model.versions.filter(v=>v.id!==pending);
        const encoded=await h.load('lib/state-records.ts').encodeRecordValues(h.env.STATE_ARCHIVE,{...state.values,ipqcCMasterControl:JSON.stringify(model)});h.db.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1').run(state.revision,encoded,'synthetic-history-guard');const before=await read(),post=await send(prepare(before));assert(post.control);assert(!post.cSaveProjection);record(mode+' full fallback retains repaired history');}
    }
    console.log(JSON.stringify({status:'PASS_C_SAVE_PROJECTION_SERVER',checks,limits:'Actual in-memory handlers and true GET with normal auth/crypto. Not browser/hosted timing. Old Save-only fault policy unchanged.'},null,2));
  }finally{h.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
