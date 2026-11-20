import test from 'node:test';
import {tinyPNG} from './quality-filter-dom-ports.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fixture from '../scripts/fqc-apply-fixture.cjs';

const origin='https://synthetic.invalid', endpoint=origin+'/api/routine-iqc';

void test('real route: IQC four scope guards and independent multi-batch approval / follow-up', async () => {
  const f=await fixture();
  try {
    const route=f.load('app/api/routine-iqc/route.ts'), photos=f.load('app/api/routine-iqc/photo/route.ts');
    const {companyDate}=f.load('lib/routine-fqc.ts'), today=companyDate();
    const [editor, reviewer]=f.users;
    for(const user of f.users)for(const key of Object.keys(user.accessOverrides))if(key.startsWith('routine.')||['iqc.view','approval.view','approval.approve','approval.return'].includes(key))user.accessOverrides[key]=true;
    const admin={...editor,id:'synthetic-settings-admin',role:'admin'}, readonly={...editor,id:'readonly',accessOverrides:{'routine.view':true,'iqc.view':true}};
    const denied={...editor,id:'denied',accessOverrides:{'iqc.view':true}};
    const routineOnly={...editor,id:'routine-only',accessOverrides:{'routine.view':true}};
    const reviewWithoutApproval={...reviewer,id:'review-without-approval',accessOverrides:{...reviewer.accessOverrides,'approval.approve':false}};
    const types=['month','month','month','fixed_count','legacy'];
    const snapshot={
      categories:[{id:'cat',nameVi:'Linh kiện'},{id:'empty',nameVi:'Vật liệu'}],suppliers:[],
      parts:['A','B'].map(code=>({id:code,code,nameVi:'TEST ONLY '+code,categoryId:'cat',supplierIds:[],photos:[],isEnabled:true})),
      errors:['A','B'].map(code=>({id:'error-'+code,partCode:code,code:'E-'+code})),
      items:types.map((kind,i)=>{
        const part=i===2?'B':'A';
        return {id:'item-'+i,partCode:part,errorId:'error-'+part,checkNo:'CHECK-'+i,nameVi:'Check '+i,isEnabled:true,frequencyRaw:i===4?'45 days':'',
          rules:[{id:'rule-'+i,cadence:i===3?'batch':i===4?'source':'time',kind,value:i===3?'5':'',...(i===4?{sourceTextVi:'45 days'}:{})}]};
      }),
    };
    const version={id:'source',number:1,status:'approved',createdAt:today+'T00:00:00+07:00',snapshot};
    const master=JSON.stringify({schemaVersion:1,versions:[version],activeVersionId:version.id});
    const originalFqc=JSON.stringify({schemaVersion:1,startDate:null,revision:7,jobs:[],documents:[],cases:[],receipts:{},events:[]});
    await f.mutate(values=>{
      values.platformUsers=JSON.stringify([editor,reviewer,admin,readonly,denied,routineOnly,reviewWithoutApproval]);values.iqcMasterControl=master;values.routineFqcControl=originalFqc;
    });
    const cookies={};
    for(const actor of [editor,reviewer,admin,readonly,denied,routineOnly,reviewWithoutApproval])cookies[actor.id]=f.core.sessionCookie(new Request(endpoint),await f.core.demoSession(new Request(endpoint),actor.id,false,1)).split(';')[0];
    async function request(method,{actor=editor.id,body,url=endpoint,handler=route,mime='application/json'}={}){
      const r=await handler[method](new Request(url,{method,headers:{origin,cookie:cookies[actor],'Content-Type':mime},...(body?{body}: {})}));
      return {status:r.status,data:r.headers.get('Content-Type')?.includes('json')?await r.json():await r.arrayBuffer()};
    }
    assert.equal((await request('GET')).status,404);
    await f.mutate(values=>{values.routineFqcEnabled='1';});
    assert.equal((await request('GET',{actor:denied.id})).status,403);
    assert.equal((await request('GET',{actor:routineOnly.id})).status,403);
    assert.equal((await request('GET',{actor:'anonymous'})).status,401);
    const read=async()=>{const r=await request('GET');assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
    let control=await read();
    assert.equal(control.catalog.items.length,3);assert.equal(control.jobs.length,0);
    const cmd=async(action,details={},actor=editor.id,status=200)=>{
      const json={action,operationId:randomUUID(),expectedRevision:control.revision,...details};
      const r=await request('POST',{actor,body:JSON.stringify(json)});
      assert.equal(r.status,status,JSON.stringify(r.data));
      if(status===200)control=await read();
      return {...r.data,json};
    };
    const initial=(await request('GET',{actor:admin.id})).data;
    const setup={start:today,reason:'TEST ONLY start',confirm:'START IQC',scope:'routine-iqc-only',startAck:true,expectedStateRevision:initial.stateRevision};
    await cmd('configure',setup,editor.id,403);
    assert.equal((await cmd('configure',{...setup,startAck:false},admin.id,422)).error,'IQC_START_CONFIRMATION_REQUIRED');
    assert.equal((await cmd('configure',{...setup,confirm:'RESET IQC'},admin.id,422)).error,'IQC_START_CONFIRMATION_REQUIRED');
    assert.equal((await cmd('configure',{...setup,reason:' '},admin.id,422)).error,'IQC_START_REASON_REQUIRED');
    assert.equal((await cmd('configure',{...setup,expectedStateRevision:initial.stateRevision+1},admin.id,409)).error,'REVISION_CONFLICT');
    await cmd('configure',setup,admin.id);
    const resetBefore=f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
    assert.equal((await cmd('admin-reset',{},admin.id,422)).error,'IQC_ACTION_INVALID');
    assert.deepEqual(f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get(),resetBefore);
    await cmd('generate');assert.deepEqual(control.jobs.map(job=>job.source.code),['CHECK-0','CHECK-1','CHECK-2']);
    const jobIds=control.jobs.map(job=>job.id), create={jobIds,start:today,end:today};
    await cmd('create-plan',create,readonly.id,403);
    const fake=JSON.stringify(['','A',JSON.stringify(['item-3','rule-3'])]);
    await cmd('create-plan',{...create,jobIds:['calendar:'+encodeURIComponent(fake)+'@'+control.jobs[0].period]},editor.id,409);
    const plan=(await cmd('create-plan',create)).result.documentId;
    await cmd('create-plan',create,editor.id,409);
    const get=id=>control.documents.find(doc=>doc.id===id);
    async function draft(id,action,details={},fields,actor=editor.id,status=200){
      const flow=get(id).flow,operationId=randomUUID();
      return cmd('draft',{documentId:id,operationId,draft:{action,operationId,clientId:randomUUID(),sequence:1,
        generation:flow.generation,expectedRevision:flow.revision,...details},...(fields?{fields}:{})},actor,status);
    }
    const save=(id,fields,status=200)=>draft(id,'save',{},fields,editor.id,status);
    const submit=(id,status=200)=>draft(id,'submit',{savedId:get(id).flow.saved.id},undefined,editor.id,status);
    const approve=id=>draft(id,'approve',{caseId:get(id).flow.pendingId},undefined,reviewer.id);
    const lots=[{partId:'A',batchNo:'0001',quantity:2},{partId:'A',batchNo:'0002',quantity:3},{partId:'B',batchNo:'0001',quantity:4}];
    await save(plan,{lots:[{...lots[0],quantity:null}]});assert.equal((await submit(plan,422)).error,'VALIDATION_FAILED');
    assert.equal((await save(plan,{lots:[...lots,{...lots[0],batchNo:' 0001 '}]},422)).error,'IQC_DUPLICATE_LOT');
    assert.equal((await save(plan,{lots:[{...lots[0],quantity:3.5}]},422)).error,'IQC_LOTS_INVALID');
    await save(plan,{lots});await submit(plan);
    await draft(plan,'approve',{caseId:get(plan).flow.pendingId},undefined,reviewWithoutApproval.id,403);
    assert.equal(get(plan).status,'pending');
    const pendingUrl=endpoint+'?pending-count=1';
    const badge=await request('GET',{url:pendingUrl});
    assert.equal(badge.status,200);
    assert.deepEqual(badge.data,{pendingCount:1,revision:control.revision,identityId:editor.id});
    assert.equal((await request('GET',{actor:denied.id,url:pendingUrl})).status,403);
    assert.equal((await request('GET',{url:pendingUrl+'&operationId='+randomUUID()})).status,422);
    assert.equal((await save(plan,{lots:[lots[0]]},409)).error,'PENDING_LOCKED');
    const prior=get(plan).flow.pendingId;
    await draft(plan,'return',{caseId:prior,reason:'TEST ONLY return'},undefined,reviewer.id);
    assert.deepEqual(get(plan).flow.cases.find(c=>c.id===prior).content.lots,lots);
    await submit(plan);
    const withdrawnPlan=get(plan).flow.pendingId;
    await draft(plan,'withdraw',{caseId:withdrawnPlan,reason:'TEST ONLY withdraw plan'});
    assert.equal(get(plan).flow.cases.find(c=>c.id===withdrawnPlan).status,'withdrawn');
    assert.deepEqual(get(plan).flow.working.lots,lots);
    await submit(plan);await approve(plan);
    assert.equal((await request('GET',{url:pendingUrl})).data.pendingCount,0);
    assert.equal((await save(plan,{lots:[...lots,{partId:'B',batchNo:'0009',quantity:3}]},409)).error,'IQC_DOCUMENT_FIXED');
    assert.equal((await cmd('dispose-draft',{documentId:plan},editor.id,409)).error,'IQC_DRAFT_LOCKED');
    await cmd('create-plan',create,editor.id,409);
    const report=(await cmd('create-report',{documentId:plan})).result.documentId;
    await cmd('create-report',{documentId:plan},editor.id,409);
    const rows=get(report).flow.working.inspections;
    assert.equal(rows.length,5);assert(rows.every(row=>row.batch.unit==='pcs'));
    let edit=rows.map((row,i)=>i?row:{...row,outcome:'pass',value:'OK'});
    await save(report,{inspections:edit});
    assert.equal((await submit(report,422)).error,'VALIDATION_FAILED');
    const invalid=edit.map((r,i)=>i?r:{...r,batch:{...r.batch,quantity:999}});
    assert.equal((await save(report,{inspections:invalid},422)).error,'IQC_BATCH_SNAPSHOT_FIXED');
    const png=Buffer.from(await tinyPNG().arrayBuffer());
    const uploaded=await request('PUT',{handler:photos,url:endpoint+'/photo',mime:'image/png',body:png});
    assert.equal(uploaded.status,200,JSON.stringify(uploaded.data));
    const photo=uploaded.data.id;
    assert(f.objects.has('routine-iqc/photos/'+photo)&&!f.objects.has('routine-fqc/photos/'+photo));
    const defective=rows.find(row=>row.batch.partId==='A'&&row.batch.batchNo==='0002');
    edit=rows.map(row=>row.id===defective.id?{...row,outcome:'fail',notes:'Defect',photos:[photo]}:row.batch.partId==='B'?
      {...row,outcome:'abnormal',notes:'Abnormality'}:{...row,outcome:'pass',value:'OK'});
    await save(report,{inspections:edit});
    for(const action of ['withdraw','return']){
      await submit(report);
      const reportReview=get(report).flow.pendingId;
      await draft(report,action,{caseId:reportReview,reason:'TEST ONLY report '+action},undefined,action==='return'?reviewer.id:editor.id);
      assert.equal(control.cases.length,0);
      assert.equal(get(report).flow.cases.find(c=>c.id===reportReview).status,action==='return'?'returned':'withdrawn');
      assert.deepEqual(get(report).flow.working.inspections,edit);
    }
    await submit(report);await approve(report);
    assert.equal(control.cases.length,2);
    assert(!control.cases.some(c=>c.batch.partId==='A'&&c.batch.batchNo==='0001'));
    const retestCase=control.cases.find(c=>c.batch.partId==='A'), abnormal=control.cases.find(c=>c.batch.partId==='B');
    assert.deepEqual(retestCase.jobIds,[defective.jobId]);
    const fixedReport=structuredClone(get(report).flow.active.content);
    const retestPlan=(await cmd('create-retest',{caseId:retestCase.id})).result.documentId;
    await cmd('create-report',{documentId:retestPlan},editor.id,409);
    await save(retestPlan,{start:today,end:today,reason:'TEST ONLY repeat test'});await submit(retestPlan);await approve(retestPlan);
    const retest=(await cmd('create-report',{documentId:retestPlan})).result.documentId;
    assert.deepEqual(get(retest).flow.working.inspections.map(row=>[row.jobId,row.batch]),[[defective.jobId,defective.batch]]);
    await save(retest,{inspections:get(retest).flow.working.inspections.map(row=>({...row,outcome:'fail',notes:'TEST ONLY failed again',photos:[photo]}))});
    await submit(retest);await approve(retest);
    const reopened=control.cases.find(c=>c.id===retestCase.id);
    assert.equal(reopened.status,'open');
    assert.deepEqual(reopened.batch,defective.batch);
    assert.deepEqual(reopened.reports,[report,retest]);
    const secondPlan=(await cmd('create-retest',{caseId:retestCase.id})).result.documentId;
    await save(secondPlan,{start:today,end:today,reason:'TEST ONLY second retest'});await submit(secondPlan);await approve(secondPlan);
    const secondReport=(await cmd('create-report',{documentId:secondPlan})).result.documentId;
    assert.deepEqual(get(secondReport).flow.working.inspections.map(row=>[row.jobId,row.batch]),[[defective.jobId,defective.batch]]);
    await save(secondReport,{inspections:get(secondReport).flow.working.inspections.map(row=>({...row,outcome:'pass',value:'OK after second retest'}))});
    await submit(secondReport);await approve(secondReport);
    assert.equal(control.cases.find(c=>c.id===retestCase.id).status,'closed');
    assert.equal(get(retest).flow.active.content.inspections[0].outcome,'fail');
    const disposal=(await cmd('create-disposal',{caseId:abnormal.id})).result.documentId;
    await save(disposal,{reason:'TEST ONLY',disposition:'Segregated'});
    await submit(disposal);
    assert.equal(control.cases.find(c=>c.id===abnormal.id).status,'open');
    const withdrawn=get(disposal).flow.pendingId;
    await draft(disposal,'withdraw',{caseId:withdrawn,reason:'TEST ONLY withdraw disposal'});
    assert.equal(control.cases.find(c=>c.id===abnormal.id).status,'open');
    assert.equal(get(disposal).flow.cases.find(c=>c.id===withdrawn).status,'withdrawn');
    assert.equal(get(disposal).flow.working.disposition,'Segregated');
    await submit(disposal);await approve(disposal);
    assert.equal(control.cases.find(c=>c.id===abnormal.id).status,'disposed');
    assert.deepEqual(get(report).flow.active.content,fixedReport);
    assert.equal((await request('GET',{handler:photos,url:endpoint+'/photo?id='+photo,actor:denied.id})).status,403);
    const state=(await f.core.readState({deferHistory:false})).values;
    assert.equal(state.routineFqcControl,originalFqc);assert.deepEqual(JSON.parse(state.iqcMasterControl),JSON.parse(master));
    await cmd('reset',{},admin.id,422);
  }finally{f.close();}
});

void test('unstarted IQC entry needs the active approved source but not inactive archives', async t => {
  const f = await fixture();
  t.after(() => f.close());
  const iqcRoute = f.load('app/api/routine-iqc/route.ts');
  const fqcRoute = f.load('app/api/routine-fqc/route.ts');
  const {companyDate,emptyRoutine} = f.load('lib/routine-fqc.ts');
  const today = companyDate(), date = '2025-01-01T00:00:00.000Z';
  const actor = {id:'synthetic-source-author',name:'Synthetic source author'};
  const version = {id:'active',number:2,status:'approved',createdAt:date,creatorId:actor.id,baseVersionId:'old',
    snapshot:{categories:[],suppliers:[],parts:[],errors:[],items:[]}};
  const approval = {id:version.id,status:'approved',actor,baseId:'old',at:date,savedId:'synthetic-saved-id',
    result:{actor:{id:'synthetic-source-reviewer',name:'Synthetic source reviewer'},at:date},
    content:{...version.snapshot,categories:[{id:'case',nameVi:'Approved case category'}]}};
  const old = {...version,id:'old',number:1,status:'superseded',
    snapshot:{...version.snapshot,categories:[{id:'archived',nameVi:'Archived test only'}]}};
  await f.mutate(values => {
    const users = JSON.parse(values.platformUsers);
    Object.assign(users[0].accessOverrides, {'routine.view':true,'iqc.view':true});
    values.platformUsers = JSON.stringify(users);
    values.routineFqcEnabled = '1';
    values.iqcMasterControl = JSON.stringify({schemaVersion:1,activeVersionId:version.id,versions:[old,version],workflow:{cases:[approval]}});
  });
  const stored = () => f.db.prepare('SELECT revision,"values" FROM shared_state').get();
  const masterRef = JSON.parse(stored().values).__processRecords.values.iqcMasterControl.key;
  const model = JSON.parse(f.objects.get(masterRef).toString());
  const archived = model.versions, approvedKey = model.workflow.cases[0].content.__immutableBody.key;
  const oldKey = archived.find(row=>row.id===old.id).snapshot.__immutableBody.key;
  const activeKey = archived.find(row=>row.id===version.id).snapshot.__immutableBody.key;
  const template = new Request(endpoint,{headers:{cookie:f.cookies.editor}});
  async function read(path = '', handler = iqcRoute) {
    const result = await handler.GET(new Request(endpoint+path,template));
    return {status:result.status,data:await result.json()};
  }
  const pristine = await read();
  assert.equal(pristine.status,200);
  assert.equal(pristine.data.catalog.categories[0].id,'case');
  const before = stored();
  const fetched = [];
  f.hooks.get = key => {fetched.push(key);if(key===oldKey)throw Error('Synthetic inactive snapshot unavailable');};
  assert.equal((await read('?pending-count=1')).status,200);
  assert(!fetched.includes(oldKey));
  const reachable = await read();
  assert.equal(reachable.status,200);
  assert.deepEqual(reachable.data,pristine.data);
  assert(!fetched.includes(oldKey));
  assert(fetched.includes(activeKey));
  assert(fetched.includes(approvedKey));
  assert.deepEqual(stored(),before);
  for(const required of [activeKey,approvedKey]){
    f.hooks.get = key => {if(key===required)throw Error('Synthetic required snapshot unavailable');};
    assert.deepEqual(await read(),{status:503,data:{error:'IQC_UNAVAILABLE'}});
  }

  f.hooks.get = undefined;
  await f.mutate(values => {
    values.routineIqcControl = JSON.stringify({schemaVersion:1,revision:1,documents:[],cases:[],receipts:{},
      calendar:{...emptyRoutine(),startDate:today,calendarPolicy:{version:2,adoptedAt:today+'T00:00:00+07:00',scopes:{}}}});
  });
  assert.equal((await read()).data.scheduleDue,true);
  f.hooks.get = key => {if(key===oldKey)throw Error('Synthetic historical read unavailable');};
  assert.equal((await read('?pending-count=1')).status,200);
  assert.deepEqual(await read(),{status:503,data:{error:'IQC_UNAVAILABLE'}});
  // The routine entry probe has separate dependencies and never reads IQC history.
  const entry = await fqcRoute.GET(new Request(origin+'/api/routine-fqc?availability=1',
    {headers:{cookie:f.cookies.editor,'X-Process-Routine-Pending':'1'}}));
  assert.deepEqual(await entry.json(),{enabled:true,iqcEnabled:true});
});
