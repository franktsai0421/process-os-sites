/* Normal-login, normal-approved synthetic sources; actual in-process handlers.
 * Legacy compatibility uses explicit projections derived from those approvals.
 * No browser, HTTP server, live accounts, network or installation.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const repoRoot=require('node:path').resolve(__dirname,'..');
const { fixture, json } = require(require('node:path').join(repoRoot,'scripts/ipqc-c-operation-fixture.cjs'));
const checks = [], _trace = [];
const _record = name => { checks.push({ name, status: 'PASS' }); console.log(JSON.stringify(checks.at(-1))); };
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

    const path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{webcrypto}=require('node:crypto'),root=repoRoot;
    const initial=await h.core.readState(),seedValues={...initial.values,sentinel:'"before"'};
    for(const key of ['toolingMasterControl','iqcMasterControl','processAuthoringControl','unrelatedFixtureControl'])seedValues[key]=JSON.stringify({schemaVersion:1,activeVersionId:'approved-'+key,versions:[{id:'approved-'+key,status:'approved',snapshot:{rows:Array.from({length:400},(_,i)=>({id:key+'-'+i,text:'Synthetic unrelated '+key+' '+i+' '+('x'.repeat(1000))}))}}]});
    const encoded=await h.load('lib/state-records.ts').encodeRecordValues(h.env.STATE_ARCHIVE,seedValues);
    h.db.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1').run(initial.revision,encoded,'fixed');
    const row=h.db.prepare('SELECT * FROM shared_state WHERE id=1').get(),envelope=JSON.parse(row.values);
    const alternative=JSON.parse(await h.load('lib/state-records.ts').encodeRecordValues(h.env.STATE_ARCHIVE,{...seedValues,sentinel:'"concurrent-other-module"'}));
    const frozenObjects=new Map([...h.objects].map(([k,v])=>[k,Buffer.from(v)]));
    const restore=()=>{h.db.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1').run(row.revision,row.values,row.updated_at);h.objects.clear();for(const[k,v]of frozenObjects)h.objects.set(k,Buffer.from(v));};
    const loaderFile=path.join(root,'scripts/ipqc-ab-import-harness.cjs'),loaderRaw=fs.readFileSync(loaderFile,'utf8'),needle="fs.readFileSync(file,'utf8')";assert.equal(loaderRaw.split(needle).length-1,1);
    const routeFile=path.join(root,'app/api/ipqc-c/workflow/route.ts'),routeSource=fs.readFileSync(routeFile,'utf8');
    const admission="const saveMutationState=body.action===undefined&&Object.keys(body).every(key=>key==='command')&&ipqcCSaveCommand(body.command)?await readIpqcCSaveMutationState(body.command):null;";
    assert.equal(routeSource.split(admission).length-1,1,'fixed Save-only admission required');
    // Reference path disables only the capability admission; the production full
    // reader, ACL, receipt, projection and encoder remain the tested reference.
    const fullPath=new Map([[routeFile,routeSource.replace(admission,'const saveMutationState=null;')]]);
    const fixed=Date.now();class Clock extends Date{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}}
    function makeLoader(candidate){let sequence=0;const fixtureCrypto={subtle:webcrypto.subtle,randomUUID:()=> '00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0')};
      const raw=loaderRaw.replace(needle,"(overrides.get(file)??fs.readFileSync(file,'utf8'))").replace("const {webcrypto}=require('node:crypto');","const webcrypto=fixtureCrypto;").replace(',Date,TextEncoder',',Date:Clock,TextEncoder');
      const mod={exports:{}};vm.runInThisContext('(function(module,exports,require,overrides,fixtureCrypto,Clock){'+raw+'\n})',{filename:loaderFile})(mod,mod.exports,createRequire(loaderFile),candidate?new Map():fullPath,fixtureCrypto,Clock);return mod.exports(h.env);
    }
    const events=[];let beforeCAS=null;const prepare=h.env.DB.prepare.bind(h.env.DB);h.env.DB.prepare=sql=>{const statement=prepare(sql);const originalRun=statement.run;statement.run=async()=>{if(sql.startsWith('UPDATE shared_state')){events.push({type:'CAS'});const task=beforeCAS;beforeCAS=null;task?.();}return originalRun();};return statement;};
    for(const method of ['get','head','put']){const original=h.env.STATE_ARCHIVE[method].bind(h.env.STATE_ARCHIVE);h.env.STATE_ARCHIVE[method]=async(...args)=>{events.push({type:method,key:args[0],bytes:method==='get'?(h.objects.get(args[0])?.length||0):method==='put'?Buffer.byteLength(args[1]):0});return original(...args);};}
    const flow=JSON.parse(initial.values.ipqcCMasterControl).workflow;
    const canonical={operationId:'bounded-save-operation',clientId:'bounded-client',sequence:1,generation:flow.generation,expectedRevision:flow.revision,action:'save'};
    const metric=()=>({gets:events.filter(e=>e.type==='get').length,readBytes:events.filter(e=>e.type==='get').reduce((n,e)=>n+e.bytes,0),puts:events.filter(e=>e.type==='put').length,cas:events.filter(e=>e.type==='CAS').length});
    async function run(candidate,{who='editor',command=canonical,concurrent=false,alter=null}={}){restore();await alter?.();const load=makeLoader(candidate),route=load('app/api/ipqc-c/workflow/route.ts');events.length=0;
      if(concurrent)beforeCAS=()=>{const current=h.db.prepare('SELECT * FROM shared_state').get(),next=JSON.parse(current.values);next.__processRecords.values.sentinel=alternative.__processRecords.values.sentinel;h.db.prepare('UPDATE shared_state SET revision=?,"values"=? WHERE id=1').run(current.revision+1,JSON.stringify(next));};
      const start=performance.now(),response=await route.POST(new Request('http://fixture/api/ipqc-c/workflow?caseMetadata=1&compact=1',{method:'POST',headers:h.sessions[who],body:JSON.stringify({command})})),body=await response.json(),elapsedMs=performance.now()-start,m=metric(),savedRow=h.db.prepare('SELECT * FROM shared_state').get(),objects=new Map(h.objects);
      let after;try{after=await h.core.readState();}catch(error){after={values:null,readError:error.message};}return{readError:after.readError,status:response.status,body,row:savedRow,objects,values:after.values,metrics:m,elapsedMs,load};}
    const results=[];
    const base=await run(false),next=await run(true);assert.equal(base.status,200);assert.equal(next.status,200);assert.deepEqual(next.body,base.body);assert.deepEqual(next.row,base.row);assert.deepEqual([...next.objects],[...base.objects]);assert.deepEqual(next.values,base.values);assert(next.metrics.gets<base.metrics.gets);assert(next.metrics.readBytes<base.metrics.readBytes);
    for(const[key,ref]of Object.entries(envelope.__processRecords.values))if(key!=='ipqcCMasterControl')assert.deepEqual(JSON.parse(next.row.values).__processRecords.values[key],ref);
    assert.deepEqual(JSON.parse(next.row.values).__processRecords.allocations,envelope.__processRecords.allocations);assert.deepEqual(JSON.parse(next.row.values).__processRecords.legacySources,envelope.__processRecords.legacySources);
    results.push({name:'canonical save full-state parity with fewer unrelated body reads',baseline:base.metrics,candidate:next.metrics,diagnosticElapsed:[base.elapsedMs,next.elapsedMs]});
    for(const who of ['viewer','edit-only','no-view']){const a=await run(false,{who}),b=await run(true,{who});assert.equal(a.status,b.status);assert(a.status>=400);assert.deepEqual(a.body,b.body);assert.equal(b.metrics.cas,0);assert.equal(b.row.values,row.values);results.push({name:'denied '+who,status:b.status});}
    const withInput={...canonical,input:{stateRevision:row.revision}},a=await run(false,{command:withInput}),b=await run(true,{command:withInput});assert.equal(a.status,b.status);assert.deepEqual(a.row,b.row);assert.deepEqual(a.metrics,b.metrics);results.push({name:'noncanonical input uses original full path'});
    const ca=await run(false,{concurrent:true}),cb=await run(true,{concurrent:true});assert.equal(ca.status,200);assert.equal(cb.status,200);assert.deepEqual(ca.row,cb.row);assert.equal(JSON.parse(cb.values.sentinel),'concurrent-other-module');results.push({name:'concurrent other-module CAS retained with original retry',baseline:ca.metrics,candidate:cb.metrics});
    restore();{const load=makeLoader(true),records=load('lib/state-records.ts'),selected=await records.readIpqcCSaveRecordMutation(h.env.STATE_ARCHIVE,envelope,row.revision);assert(selected);const model=selected.recordStorage.models.get('ipqcCMasterControl');await assert.rejects(records.encodeIpqcCSaveRecordMutation(h.env.STATE_ARCHIVE,{},row.revision,selected.values,selected.recordStorage,model));await assert.rejects(records.encodeIpqcCSaveRecordMutation({...h.env.STATE_ARCHIVE},selected.handle,row.revision,selected.values,selected.recordStorage,model));await assert.rejects(records.encodeIpqcCSaveRecordMutation(h.env.STATE_ARCHIVE,selected.handle,row.revision+1,selected.values,selected.recordStorage,model));await records.encodeIpqcCSaveRecordMutation(h.env.STATE_ARCHIVE,selected.handle,row.revision,selected.values,selected.recordStorage,model);await assert.rejects(records.encodeIpqcCSaveRecordMutation(h.env.STATE_ARCHIVE,selected.handle,row.revision,selected.values,selected.recordStorage,model));results.push({name:'opaque handle forged bucket revision reuse rejected'});}
    const aggregate=key=>JSON.parse(frozenObjects.get(envelope.__processRecords.values[key].key).toString());
    const unrelatedBody=aggregate('unrelatedFixtureControl').versions[0].snapshot.__immutableBody.key,requiredBody=aggregate('ipqcCMasterControl').workflow.working.__immutableBody.key;
    for(const [name,alter]of [['required missing body',()=>h.objects.delete(requiredBody)],['corrupt unrelated aggregate',()=>h.objects.set(envelope.__processRecords.values.unrelatedFixtureControl.key,Buffer.from('bad'))]]){const a=await run(false,{alter}),b=await run(true,{alter});assert(a.status>=400);assert.equal(a.status,b.status);assert.deepEqual(a.body,b.body);assert.equal(a.metrics.cas,0);assert.equal(b.metrics.cas,0);assert.equal(b.row.values,row.values);results.push({name,status:b.status,originalFailurePreserved:true});}
    {const alter=()=>h.objects.delete(unrelatedBody),a=await run(false,{alter}),b=await run(true,{alter});assert(a.status>=400);assert.equal(b.status,200);assert.equal(JSON.parse(b.row.values).__processRecords.values.unrelatedFixtureControl.key,envelope.__processRecords.values.unrelatedFixtureControl.key);results.push({name:'explicit excluded-body fault policy',baselineStatus:a.status,candidateStatus:b.status,unrelatedReferenceRetained:true});}
    {const alter=()=>h.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify(seedValues)),a=await run(false,{alter}),b=await run(true,{alter});assert.equal(a.status,200);assert.equal(b.status,200);assert.deepEqual(a.row,b.row);assert.deepEqual(a.body,b.body);results.push({name:'inline legacy original fallback'});}
    {const alter=()=>{const value=JSON.stringify({version:1,errors:[],items:[],equipment:[],categories:[]}),sha=createHash('sha256').update(value).digest('hex'),ref={key:'state-records/v1/'+sha+'.json',sha256:sha},next=json(envelope);h.objects.set(ref.key,Buffer.from(value));next.__processRecords.allocations.ipqcCMasterControl=ref;h.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify(next));},a=await run(false,{alter}),b=await run(true,{alter});assert.equal(a.status,200);assert.equal(b.status,200);assert.deepEqual(a.row,b.row);results.push({name:'allocation mismatch eligibility falls back before writes'});}
    {const saved=await run(true);events.length=0;const response=await saved.load('app/api/ipqc-c/workflow/route.ts').POST(new Request('http://fixture/api/ipqc-c/workflow?caseMetadata=1&compact=1',{method:'POST',headers:h.sessions.editor,body:JSON.stringify({command:canonical})})),body=await response.json();assert.equal(response.status,200);assert.deepEqual(body.receipt,saved.body.receipt);assert.equal(metric().cas,0);assert.equal(metric().puts,0);assert.deepEqual(h.db.prepare('SELECT * FROM shared_state').get(),saved.row);results.push({name:'same receipt replay no encode CAS or duplicate save'});}
    for(const mutation of ['foreign-reference','known-set','manifest']){restore();const records=makeLoader(true)('lib/state-records.ts'),selected=await records.readIpqcCSaveRecordMutation(h.env.STATE_ARCHIVE,envelope,row.revision),model=selected.recordStorage.models.get('ipqcCMasterControl');if(mutation==='foreign-reference')model.extra={__immutableBody:alternative.__processRecords.values.sentinel};if(mutation==='known-set')selected.recordStorage.known.add('a'.repeat(64));if(mutation==='manifest')selected.recordStorage.envelope.__processRecords.values.sentinel=alternative.__processRecords.values.sentinel;events.length=0;await assert.rejects(records.encodeIpqcCSaveRecordMutation(h.env.STATE_ARCHIVE,selected.handle,row.revision,selected.values,selected.recordStorage,model));assert.equal(metric().cas,0);assert.equal(h.db.prepare('SELECT * FROM shared_state').get().values,row.values);results.push({name:mutation+' rejected'});}
    for(const kind of ['chunks','legacy-r2']){const alter=async()=>{const value=kind==='chunks'?await h.load('lib/state-chunks.ts').encodeChunkedValues(h.env.STATE_ARCHIVE,seedValues):await h.core.encodeValues(seedValues);h.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(value);},a=await run(false,{alter}),b=await run(true,{alter});assert.equal(a.status,200);assert.equal(b.status,200);assert.deepEqual(a.row,b.row);assert.deepEqual(a.body,b.body);results.push({name:kind+' compressed legacy full-reader fallback'});}
    {const alter=async()=>{const values={...seedValues},model=JSON.parse(values.ipqcCMasterControl),item=model.workflow.working.items[0];model.workflow.working.items.push({...json(item),id:'reserved-deleted-item',code:item.code+'-999',deleted:true});model.versions.find(v=>v.status==='draft').snapshot=json(model.workflow.working);values.ipqcCMasterControl=JSON.stringify(model);const encoded=await h.load('lib/state-records.ts').encodeRecordValues(h.env.STATE_ARCHIVE,values);h.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(encoded);},a=await run(false,{alter}),b=await run(true,{alter});assert.equal(a.status,200);assert.equal(b.status,200);assert.deepEqual(a.row,b.row);const model=JSON.parse(b.values.ipqcCMasterControl);assert(model.workflow.saved.content.items.some(i=>i.id==='reserved-deleted-item'&&i.deleted));results.push({name:'Save projection preserves deleted reserved code and allocator parity'});}
    {const users=JSON.parse(seedValues.platformUsers);users.find(u=>u.id==='preview-editor').enabled=false;const alt=JSON.parse(await h.load('lib/state-records.ts').encodeRecordValues(h.env.STATE_ARCHIVE,{...seedValues,platformUsers:JSON.stringify(users)}));const aclObjects=new Map([...h.objects].map(([k,v])=>[k,Buffer.from(v)]));const outputs=[];for(const candidate of [false,true]){restore();for(const[k,v]of aclObjects)h.objects.set(k,Buffer.from(v));const load=makeLoader(candidate),route=load('app/api/ipqc-c/workflow/route.ts');events.length=0;beforeCAS=()=>{const current=h.db.prepare('SELECT * FROM shared_state').get(),value=JSON.parse(current.values);value.platformUsers=alt.platformUsers;value.__processRecords.values.platformUsers=alt.__processRecords.values.platformUsers;h.db.prepare('UPDATE shared_state SET revision=?,"values"=? WHERE id=1').run(current.revision+1,JSON.stringify(value));};const response=await route.POST(new Request('http://fixture/api/ipqc-c/workflow?caseMetadata=1&compact=1',{method:'POST',headers:h.sessions.editor,body:JSON.stringify({command:canonical})})),body=await response.json(),after=h.db.prepare('SELECT * FROM shared_state').get();assert.equal(response.status,401);assert.deepEqual(JSON.parse(after.values).__processRecords.values.ipqcCMasterControl,envelope.__processRecords.values.ipqcCMasterControl);outputs.push({status:response.status,body,row:after});}assert.deepEqual(outputs[0],outputs[1]);results.push({name:'CAS retry rereads revoked current ACL and never commits C'});}
    {const outputs=[];for(const candidate of [false,true]){const original=h.env.STATE_ARCHIVE.put;try{const output=await run(candidate,{alter:()=>{h.env.STATE_ARCHIVE.put=async()=>{throw Error('SYNTHETIC_UPLOAD_FAILURE');};}});assert(output.status>=400);assert.equal(output.metrics.cas,0);assert.equal(output.row.values,row.values);outputs.push({status:output.status,body:output.body,row:output.row});}finally{h.env.STATE_ARCHIVE.put=original;}}assert.deepEqual(outputs[0],outputs[1]);results.push({name:'immutable upload failure leaves original manifest uncommitted'});}
    console.log(JSON.stringify({status:'PASS_IPQC_C_SAVE_BOUNDARY',results,limits:['Diagnostic single pairs, not performance target or native browser timing.','Synthetic unrelated bodies test hydration boundaries; no production data.','Selected fault/legacy/foreign-reference/replay/deleted allocation/ACL CAS gates covered; excluded-body policy is explicitly non-equivalent and requires user acceptance.']},null,2));
  }finally{h.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
