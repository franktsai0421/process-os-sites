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
    // Canonical records, with independent unrelated aggregates to expose read cost.
    const newPhoto=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
    const photoResponse=await h.load('app/api/ipqc-c/photo/route.ts').PUT(new Request('http://fixture/api/ipqc-c/photo',{method:'PUT',headers:{...h.sessions.editor,'Content-Type':'image/png'},body:newPhoto}));assert.equal(photoResponse.status,200);const newPhotoId=(await photoResponse.json()).id;assert.notEqual(newPhotoId,photoId);
    const initial=await h.core.readState();
    const benchmarkArg=process.argv.find(arg=>arg.startsWith('--benchmark=')),benchmarkItems=benchmarkArg?Number(benchmarkArg.split('=')[1]):0;
    if(benchmarkArg){assert([100,1000].includes(benchmarkItems));Object.assign(initial.values,{processCustomRoles:'[]',processRoleTemplateOverrides:'{}',processAccessControl:'{}',maintenanceMode:'0'});h.env.PROCESS_SESSION_REVOCATION_ENABLED='1';const control=JSON.parse(initial.values.ipqcCMasterControl),content=control.workflow.working,first=content.items[0];content.items=Array.from({length:benchmarkItems},(_,i)=>({...json(first),id:i?'benchmark-item-'+i:first.id,code:first.code.replace(/-\d+$/,'-'+String(i+1).padStart(2,'0'))}));control.versions.find(v=>v.status==='draft').snapshot=json(content);control.reservedItemCodes=[...new Set([...control.reservedItemCodes,...content.items.map(i=>i.code)])];initial.values.ipqcCMasterControl=JSON.stringify(control);}

    for(let i=0;i<24;i++)initial.values['syntheticUnrelated'+i]=JSON.stringify({text:'unrelated fixture '+i});
    const records=h.load('lib/state-records.ts'),adapter=h.load('lib/ipqc-c-create-record-mutation.ts');
    const encoded=await records.encodeRecordValues(h.env.STATE_ARCHIVE,initial.values);
    h.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(encoded);
    const seed={...h.db.prepare('SELECT * FROM shared_state WHERE id=1').get()},seedObjects=new Map(h.objects);
    const reset=()=>{h.db.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1').run(seed.revision,seed.values,seed.updated_at);h.objects.clear();for(const [k,v]of seedObjects)h.objects.set(k,v);};
    const model=JSON.parse(initial.values.ipqcCMasterControl),flow=model.workflow;
    const item={standard:'12 mm',description:'Synthetic added method 中文 Việt',standardEnabled:true,cpkEnabled:true,equipmentId:'source',equipmentGroupId:'group',rule:{cadence:'batch',batchKind:'aql',aqlValue:'0.25'},mediaItems:[{id:newPhotoId,name:'synthetic.png',note:'retained reference',afterParagraph:0}]};
    const command={action:'apply',moduleAction:'create-item',input:{errorId:flow.working.errors[0].id,item},operationId:'create-fixture-operation',clientId:'create-fixture-client',sequence:1,generation:flow.generation};
    const route=h.load('app/api/ipqc-c/workflow/route.ts'),wire=h.load('lib/workflow-wire.ts');
    const send=async(cmd=command,who='editor',status=200)=>{const response=await route.POST(new Request('http://fixture/api/ipqc-c/workflow?caseMetadata=1&compact=1',{method:'POST',headers:h.sessions[who],body:JSON.stringify({command:cmd})}));const body=wire.expandWorkflowPayload(await response.json());assert.equal(response.status,status,JSON.stringify(body));return body;};
    const readback=async(selected=true,who='editor',status=200,extra='')=>{const response=await route.GET(new Request('http://fixture/api/ipqc-c/workflow?caseMetadata=1'+(selected?'&readback=ipqc-c-create-v1':'')+extra,{headers:h.sessions[who]}));const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body;};
    if(benchmarkArg){await require('./ipqc-c-create-benchmark.cjs')({h,adapter,reset,send,readback,items:benchmarkItems});return;}
    const row=()=>({...h.db.prepare('SELECT * FROM shared_state WHERE id=1').get()});
    const full=async()=>JSON.parse((await h.core.readState()).values.ipqcCMasterControl);
    const manifest=()=>JSON.parse(row().values).__processRecords;
    const preserved=before=>{const after=manifest();for(const [key,ref]of Object.entries(before.values))if(key!=='ipqcCMasterControl')assert.deepEqual(after.values[key],ref);assert.deepEqual(after.legacySources,before.legacySources);for(const [key,ref]of Object.entries(before.allocations))if(key!=='ipqcCMasterControl')assert.deepEqual(after.allocations[key],ref);};
    reset();assert.deepEqual(await readback(),await readback(false));
    for(const who of ['viewer','editor','edit-only','no-view']){const status=who==='no-view'?403:200;assert.deepEqual(await readback(true,who,status),await readback(false,who,status));}
    assert.deepEqual(await readback(true,'editor',404,'&operationId=missing-operation'),await readback(false,'editor',404,'&operationId=missing-operation'));record('fresh readback full DTO/role parity; combined receipt selector retains old behavior');
    reset();const originalGet=h.env.STATE_ARCHIVE.get;let requested=[];h.env.STATE_ARCHIVE.get=async key=>{requested.push(key);return originalGet(key);};
    try{await readback(false);const fullCount=requested.length;requested=[];await readback();assert(requested.length<fullCount);const unrelated=manifest().values.syntheticUnrelated0.key;assert(!requested.includes(unrelated));h.objects.set(unrelated,Buffer.from('corrupt'));await readback();await readback(true,'editor',503,'&readbackExtra=1');}finally{h.env.STATE_ARCHIVE.get=originalGet;}record('opt-in readback excludes unrelated records; unknown selectors fall back');
    for(const key of ['platformUsers','ipqcCMasterControl']){reset();h.objects.set(manifest().values[key].key,Buffer.from('corrupt'));await readback(true,'editor',503);}record('readback required authority/content integrity fails closed');
    reset();h.env.PROCESS_SESSION_REVOCATION_ENABLED='1';const getOnRead=h.env.STATE_ARCHIVE.get;let revokedOnRead=false;h.env.STATE_ARCHIVE.get=async key=>{const value=await getOnRead(key);if(!revokedOnRead){revokedOnRead=true;await h.load('lib/session-revocation.ts').revokeSession(h.sessions.editor.Cookie.split('=').slice(1).join('='),Date.now()+60000);}return value;};try{await readback(true,'editor',403);}finally{h.env.STATE_ARCHIVE.get=getOnRead;delete h.env.PROCESS_SESSION_REVOCATION_ENABLED;h.db.prepare('DELETE FROM process_revoked_sessions').run();}record('fresh readback session revocation during hydration denied');
    const measure=async(fullRead)=>{reset();const read=adapter.readIpqcCCreateMutationState,get=h.env.STATE_ARCHIVE.get,put=h.env.STATE_ARCHIVE.put;let gets=0,puts=0;
      if(fullRead)adapter.readIpqcCCreateMutationState=async()=>null;
      h.env.STATE_ARCHIVE.get=async key=>{gets++;await new Promise(resolve=>setTimeout(resolve,2));return get(key);};h.env.STATE_ARCHIVE.put=async(...args)=>{puts++;return put(...args);};
      const start=performance.now();try{const result=await send();return{gets,puts,ms:performance.now()-start,receipt:result.receipt,working:(await full()).workflow.working};}finally{adapter.readIpqcCCreateMutationState=read;h.env.STATE_ARCHIVE.get=get;h.env.STATE_ARCHIVE.put=put;}
    };
    const samples=[];for(let i=0;i<3;i++){const before=await measure(true),after=await measure(false);assert.deepEqual(after.working,before.working);assert.deepEqual(after.receipt,before.receipt);assert(after.gets<before.gets);samples.push({full:{gets:before.gets,puts:before.puts,ms:before.ms},selected:{gets:after.gets,puts:after.puts,ms:after.ms}});}record('same-handler full-reader control versus selected reader: content/receipt parity and fewer R2 reads');
    reset();const beforeManifest=manifest(),result=await send(),created=(await full()).workflow.working.items.find(i=>i.id==='item-'+command.operationId);assert(created);for(const field of ['standard','description','cpkEnabled','standardEnabled','equipmentId','equipmentGroupId','rule','mediaItems'])assert.deepEqual(created[field],item[field]);assert.equal(created.equipmentSnapshot.id,'source');preserved(beforeManifest);
    const beforeReplay=row();assert((await send()).unchanged);assert.deepEqual(row(),beforeReplay);
    const receipt=await h.call('ipqc-c/workflow','GET',undefined,'editor',200,'?operationId='+command.operationId);assert.deepEqual(json(receipt.receipt),json(result.receipt));
    assert.equal((await h.call('ipqc-c/workflow','GET',undefined,'editor',404,'?operationId=missing-operation')).error,'OPERATION_NOT_FOUND');assert.deepEqual(row(),beforeReplay);record('photo/equipment/CPK complete readback, exact replay, receipt and missing receipt read-only');
    const index=JSON.parse(h.objects.get(manifest().allocations.ipqcCMasterControl.key));assert(index.items.some(i=>i.code===created.code));
    await send({...command,operationId:'create-second-operation',sequence:2});assert.equal(new Set((await full()).workflow.working.items.map(i=>i.code)).size,flow.working.items.length+2);record('allocation pointer updated and subsequent item code unique');
    reset();const race=await Promise.all([send(),send()]);assert(race.some(r=>r.unchanged));assert.equal((await full()).workflow.working.items.filter(i=>i.id==='item-'+command.operationId).length,1);record('overlapping identical operations commit one item');
    reset();await Promise.all([send(),send({...command,operationId:'concurrent-other-item',clientId:'concurrent-other-client'})]);const concurrent=(await full()).workflow.working.items;assert.equal(concurrent.length,flow.working.items.length+2);assert.equal(new Set(concurrent.map(i=>i.code)).size,concurrent.length);record('distinct writers CAS retry preserves both and unique codes');
    for(const who of ['viewer','edit-only','no-view']){reset();const before=row();await send(command,who,403);assert.deepEqual(row(),before);}record('view/edit/create authorization remains required');
    reset();await send({...command,expectedRevision:flow.revision+10},'editor',409);assert.equal(row().revision,seed.revision);record('stale revision rejects before commit');
    reset();await send();const beforeChanged=row();await send({...command,input:{...command.input,item:{...item,standard:'changed retry'}}},'editor',409);assert.deepEqual(row(),beforeChanged);record('same operation with changed payload cannot replay');
    reset();await send({...command,input:{...command.input,item:{...item,mediaItems:[{id:'f'.repeat(64),name:'missing.gif'}]}}},'editor',422);assert.equal(row().revision,seed.revision);
    await send({...command,input:{...command.input,item:{...item,equipmentId:'missing'}}},'editor',422);assert.equal(row().revision,seed.revision);record('missing photo/equipment fail without commit');
    for(const key of ['platformUsers','processCustomRoles','processRoleTemplateOverrides','ipqcCMasterControl','masterDataControl','routineEquipmentControl']){reset();const ref=manifest().values[key];if(!ref)continue;h.objects.set(ref.key,Buffer.from('corrupt'));const before=row();await send(command,'editor',500);assert.deepEqual(row(),before);}record('required aggregate corruption fails closed');
    reset();h.objects.set(manifest().values.syntheticUnrelated0.key,Buffer.from('corrupt'));await send();preserved(beforeManifest);record('unrelated immutable fault remains opaque and pointer unchanged');
    reset();const originalPut=h.env.STATE_ARCHIVE.put;h.env.STATE_ARCHIVE.put=async()=>{throw Error('synthetic storage failure');};try{await send(command,'editor',500);assert.deepEqual(row(),seed);}finally{h.env.STATE_ARCHIVE.put=originalPut;}record('storage failure leaves D1 and receipt uncommitted');
    reset();const originalPrepare=h.env.DB.prepare;let updates=0;h.env.DB.prepare=sql=>{const statement=originalPrepare(sql);if(sql.startsWith('UPDATE shared_state SET revision='))statement.run=async()=>{updates++;return{meta:{changes:0}};};return statement;};try{await send(command,'editor',409);assert.equal(updates,4);assert.deepEqual(row(),seed);}finally{h.env.DB.prepare=originalPrepare;}record('CAS exhaustion bounded to four attempts without receipt');
    reset();h.env.PROCESS_SESSION_REVOCATION_ENABLED='1';const putBeforeRevoke=h.env.STATE_ARCHIVE.put;let revoked=false;
    h.env.STATE_ARCHIVE.put=async(...args)=>{await putBeforeRevoke(...args);if(!revoked){revoked=true;const token=h.sessions.editor.Cookie.split('=').slice(1).join('=');await h.load('lib/session-revocation.ts').revokeSession(token,Date.now()+60000);}};
    try{await send(command,'editor',401);assert.deepEqual(row(),seed);}finally{h.env.STATE_ARCHIVE.put=putBeforeRevoke;delete h.env.PROCESS_SESSION_REVOCATION_ENABLED;h.db.prepare('DELETE FROM process_revoked_sessions').run();}record('revocation during immutable PUT refuses final CAS');
    reset();const getBeforeRevoke=h.env.STATE_ARCHIVE.get;let removed=false;
    h.env.STATE_ARCHIVE.get=async key=>{const value=await getBeforeRevoke(key);if(!removed){removed=true;const values={...initial.values},users=JSON.parse(values.platformUsers);users.find(u=>u.id==='preview-editor').accessOverrides['ipqc-c.create']=false;values.platformUsers=JSON.stringify(users);h.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(JSON.stringify(values));}return value;};
    try{await send(command,'editor',403);assert.equal(row().revision,seed.revision+1);assert.equal((await full()).workflow.working.items.length,flow.working.items.length);}finally{h.env.STATE_ARCHIVE.get=getBeforeRevoke;}record('permission revocation during read forces fresh CAS attempt and denial');
    reset();const currentRef=JSON.parse(h.objects.get(manifest().values.ipqcCMasterControl.key)).workflow.working.__immutableBody;h.objects.set(currentRef.key,Buffer.from('corrupt live content'));await send(command,'editor',500);assert.deepEqual(row(),seed);record('required live body hash corruption fails closed');
    reset();const pendingValues={...initial.values},pendingModel=JSON.parse(pendingValues.ipqcCMasterControl);pendingModel.workflow.pendingId='synthetic-pending';pendingModel.versions.find(v=>v.status==='draft').status='pending';pendingValues.ipqcCMasterControl=JSON.stringify(pendingModel);h.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(await records.encodeRecordValues(h.env.STATE_ARCHIVE,pendingValues));const pendingRow=row();await send(command,'editor',409);assert.deepEqual(row(),pendingRow);record('pending lock rejects creation');
    reset();const selected=await adapter.readIpqcCCreateMutationState(command);assert(selected);await assert.rejects(()=>h.core.encodeValues(selected.values,selected),/Partial read cannot be saved/);
    const prepared=selected.recordStorage.models;const handleValues={...selected.values};const output=await adapter.encodeIpqcCCreateMutationState(selected,handleValues,prepared);assert(output);await assert.rejects(()=>adapter.encodeIpqcCCreateMutationState(selected,handleValues,prepared),/Invalid IPQC-C Create mutation state/);await assert.rejects(()=>adapter.encodeIpqcCCreateMutationState({...selected},handleValues,prepared),/Invalid IPQC-C Create mutation state/);record('partial generic writes, consumed and foreign state handles denied');
    reset();const historicalValues={...initial.values},historicalModel=JSON.parse(historicalValues.ipqcCMasterControl);const historyVersion=historicalModel.versions.find(v=>v.status==='approved'),historicalItem={...historyVersion.snapshot.items[0],id:'history-only-item',code:historyVersion.snapshot.items[0].code.replace(/-\d+$/,'-99'),deleted:true};historyVersion.snapshot.items.push(historicalItem);historicalValues.ipqcCMasterControl=JSON.stringify(historicalModel);h.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(await records.encodeRecordValues(h.env.STATE_ARCHIVE,historicalValues));await send();const historyAfter=await full(),newItem=historyAfter.workflow.working.items.find(i=>i.id==='item-'+command.operationId);assert(newItem.code.endsWith('-100'));assert.deepEqual(historyAfter.versions.find(v=>v.id===historyVersion.id),historyVersion);assert.deepEqual(historyAfter.workflow.cases,historicalModel.workflow.cases);assert.deepEqual(historyAfter.workflow.saves,historicalModel.workflow.saves);record('history-only allocated number retained; approved version/cases/saves unchanged');
    // Legacy data and records lacking the allocation index use the full compatibility reader.
    for(const mode of ['inline','no-index','extra-field']){reset();if(mode==='inline')h.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify(initial.values));if(mode==='no-index'){const raw=JSON.parse(seed.values);delete raw.__processRecords.allocations.ipqcCMasterControl;h.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify(raw));}await send(mode==='extra-field'?{...command,reason:'compatibility'}:command);assert.equal((await full()).workflow.working.items.length,flow.working.items.length+1);}record('legacy/no-index/noncanonical full-reader compatibility');
    console.log(JSON.stringify({status:'PASS_IPQCC_CREATE',checks,samples,limits:'Synthetic SQLite/R2 handlers, 2ms artificial per-GET delay. No live latency or browser claim.'},null,2));
  }finally{h.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
