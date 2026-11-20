import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
const fixture=createRequire(import.meta.url)('../scripts/fqc-apply-fixture.cjs');
void test('actual FQC route preserves legacy custom on unrelated Save, rejects custom edits without writes, and accepts standard replacement',async()=>{
 const f=await fixture();try{
 await f.mutate(values=>{const c=JSON.parse(values.qualityMasterControl);c.libraries.fqc.versions[0].snapshot.items[0].rule={cadence:'time',timeFrequency:'custom',customTimeText:'  every 45 days  '};values.qualityMasterControl=JSON.stringify(c);});
 assert.equal((await f.call('/api/fqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({action:'begin'})})).status,200);
 async function change(field,value){const c=await f.state(),path=['items',{id:'item'},field],command={action:'save',moduleAction:'save-local-v1',input:{matrixCells:[]},operationId:randomUUID(),clientId:randomUUID(),sequence:1,generation:c.workflow.generation,patches:[{op:'set',path,value}],guards:[{path,value:c.workflow.working.items[0][field]}]};const r=await f.call('/api/fqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command})});return {status:r.status,body:await r.json()};}
 let r=await change('name','Changed unrelated name');assert.equal(r.status,200,JSON.stringify(r.body));const before=await f.state();assert.equal(before.workflow.saved.content.items[0].rule.customTimeText,'  every 45 days  ');
 r=await change('rule',{cadence:'time',timeFrequency:'custom',customTimeText:'60 days'});assert.equal(r.status,422);assert.equal(r.body.error,'CUSTOM_TIME_FREQUENCY_READ_ONLY');assert.deepEqual(await f.state(),before);
 r=await change('rule',{cadence:'time',timeFrequency:'monthly'});assert.equal(r.status,200,JSON.stringify(r.body));const standard=await f.state();r=await change('rule',{cadence:'time',timeFrequency:'custom',customTimeText:'  every 45 days  '});assert.equal(r.status,422);assert.deepEqual(await f.state(),standard);
 }finally{f.close();}
});
import {setup as iqcSetup} from './iqc-save-choice-fixture.mjs';
void test('actual IQC route and editor preserve legacy custom while rejecting new or changed custom',async()=>{
 const h=await iqcSetup();try{
 await h.f.mutate(values=>{const c=JSON.parse(values.iqcMasterControl);c.workflow.revision++;c.workflow.working.items[0].rules=[{id:'legacy',cadence:'time',kind:'custom',nameVi:'  45 days  ',value:''}];for(const v of c.versions)if(v.snapshot)v.snapshot.items[0].rules=structuredClone(c.workflow.working.items[0].rules);values.iqcMasterControl=JSON.stringify(c);});
 await h.probe.load();const ui=h.probe.get().ui;ui.partCode='P';ui.errorId='error';h.probe.render();{const button=h.main.querySelector('[data-edit-item="item"]');button.dispatchEvent({type:'click',target:button,currentTarget:button});}const form=h.doc.querySelector('#iqc-item-form');assert(form);assert(form.querySelector('[data-rule-kind] [value="custom"]')?.disabled,form.textContent);assert(form.querySelector('[data-rule-name]').hasAttribute('readonly'));
 const before=await h.state();await h.peerSave({nameVi:'Unrelated'});assert.equal((await h.state()).workflow.saved.content.items[0].rules[0].nameVi,'  45 days  ');
 await assert.rejects(h.peerSave({rules:[{...before.workflow.working.items[0].rules[0],nameVi:'60 days'}]}),/CUSTOM_TIME_FREQUENCY_READ_ONLY/);
 await h.peerSave({rules:[{id:'legacy',cadence:'time',kind:'month',nameVi:'',value:''}]});await assert.rejects(h.peerSave({rules:before.workflow.working.items[0].rules}),/CUSTOM_TIME_FREQUENCY_READ_ONLY/);
 }finally{h.close();}
});
void test('actual FQC save submit and independent approval changes effective frequency only after approval',async()=>{
 const f=await fixture();try{await f.mutate(values=>{const c=JSON.parse(values.qualityMasterControl);c.libraries.fqc.versions[0].snapshot.items[0].rule={cadence:'time',timeFrequency:'monthly'};values.qualityMasterControl=JSON.stringify(c);});const original=await f.state(),old=structuredClone(original.versions.find(v=>v.id===original.activeVersionId));assert.equal((await f.call('/api/fqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({action:'begin'})})).status,200);
 async function send(action,extra={},actor='editor'){const c=await f.state(),flow=c.workflow;const command={action,operationId:randomUUID(),clientId:randomUUID(),sequence:1,generation:flow.generation,expectedRevision:flow.revision,...extra};const r=await f.call('/api/fqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command})},actor);const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;}
 const c=await f.state(),path=['items',{id:'item'},'rule'];await send('save',{moduleAction:'save-local-v1',input:{matrixCells:[]},patches:[{op:'set',path,value:{cadence:'time',timeFrequency:'quarterly'}}],guards:[{path,value:c.workflow.working.items[0].rule}]});const saved=await f.state();assert.equal(saved.activeVersionId,old.id);await send('submit',{savedId:saved.workflow.saved.id,reason:'TEST ONLY frequency transition'});const pending=await f.state();assert.equal(pending.activeVersionId,old.id);assert.deepEqual(pending.versions.find(v=>v.id===old.id).snapshot,old.snapshot);await send('approve',{caseId:pending.workflow.pendingId},'other');const approved=await f.state();assert.notEqual(approved.activeVersionId,old.id);assert.equal(approved.versions.find(v=>v.id===approved.activeVersionId).snapshot.items[0].rule.timeFrequency,'quarterly');assert.deepEqual(approved.versions.find(v=>v.id===old.id).snapshot,old.snapshot);
 }finally{f.close();}
});

void test('calendar GET is read-only and distinguishes rejected, unknown and committed operations',async()=>{
 const f=await fixture({format:'inline'});
 try {
  const route=f.load('app/api/routine-fqc/route.ts');
  const {emptyRoutine,companyDate}=f.load('lib/routine-fqc.ts');
  const today=companyDate();
  const control=emptyRoutine();
  control.startDate=today;
  control.calendarPolicy={version:2,adoptedAt:today+'T00:00:00+07:00',scopes:{}};
  await f.mutate(values=>{
   const users=JSON.parse(values.platformUsers);
   for(const user of users)for(const op of ['view','edit','create'])user.accessOverrides['routine.'+op]=true;
   const master=JSON.parse(values.qualityMasterControl).libraries.fqc;
   for(const version of master.versions){
    version.createdAt=today+'T01:00:00+07:00';
    version.updatedAt=version.createdAt;
    version.snapshot.items[0].rule={cadence:'time',timeFrequency:'monthly'};
   }
   const quality=JSON.parse(values.qualityMasterControl);quality.libraries.fqc=master;
   values.qualityMasterControl=JSON.stringify(quality);
   values.platformUsers=JSON.stringify(users);
   values.routineFqcEnabled='1';values.routineFqcControl=JSON.stringify(control);
  });
  const origin='https://synthetic.invalid',endpoint=origin+'/api/routine-fqc';
  async function via(method,query='',command){
   const res=await route[method](new Request(endpoint+query,{method,headers:{origin,cookie:f.cookies.editor,'Content-Type':'application/json'},
    ...(command?{body:JSON.stringify(command)}:{})}));
   return {status:res.status,data:await res.json()};
  }
  const preserved=()=>f.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
  const before=preserved();
  const opening=await via('GET');
  assert.equal(opening.status,200,JSON.stringify(opening.data));
  assert.deepEqual(opening.data.control.jobs,[]);
  assert.deepEqual(preserved(),before);
  const unknown=randomUUID();
  assert.deepEqual(await via('GET','?operationId='+unknown),{status:404,data:{error:'OPERATION_NOT_FOUND'}});
  const denied=randomUUID();
  const rejected=await via('POST','',{action:'create-plan',operationId:denied,expectedRevision:control.revision+10,jobIds:['synthetic']});
  assert.equal(rejected.status,409,JSON.stringify(rejected.data));
  assert.equal(rejected.data.error,'REVISION_CONFLICT');
  assert.match(rejected.data.requestId,/^[a-f0-9-]{36}$/);
  assert.deepEqual(preserved(),before);
  assert.equal((await via('GET','?operationId='+denied)).status,404);
  const id=randomUUID(),written=await via('POST','',{action:'generate',operationId:id});
  assert.equal(written.status,200,JSON.stringify(written.data));
  assert.equal(preserved().revision,before.revision+1);
  const committed=preserved();
  assert.deepEqual(await via('GET','?operationId='+id),{status:200,data:{result:written.data.result,revision:written.data.revision}});
  const after=await via('GET');
  assert.equal(after.data.control.jobs.length,written.data.result.generated);
  assert.equal(await via('GET','?operationId='+id).then(r=>r.status),200);
  assert.deepEqual(preserved(),committed);
 }finally{f.close();}
});
