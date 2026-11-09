import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),fixture=require('../scripts/fqc-apply-fixture.cjs'),{fixture:uiFixture}=require('../scripts/test-fqc-feedback-races.cjs');
for(const mode of ['required-read','encode','cas-before','cas-after'])void test(`actual first Save 500 then retry unknown guard: ${mode}`,async()=>{
 const f=await fixture(),messages=[],originalLog=console.error;console.error=(...args)=>messages.push(args);
 try{
  const initial=await(await f.call('/api/fqc/workflow?caseMetadata=1')).json();
  const ui=await uiFixture({initialControl:initial.control,identityUser:{id:'editor',name:'Synthetic editor',role:'staff'},send:(url,o)=>f.call(url,o)});
  await ui.c.__fqcTest.sharedAction('begin');ui.c.__fqcTest.openErrorModal('error');const form=ui.doc.querySelector('.fqc-modal-form'),input=form.querySelector('[name="name"]');input.value='Synthetic error test';
  const before=f.db.prepare('SELECT * FROM shared_state').get(),start=f.requests.length,prepare=f.env.DB.prepare.bind(f.env.DB);
  const fault=()=>{throw Error('SYNTHETIC_PRIVATE_DETAIL Bearer synthetic-secret');};
  // Keep this failure on the original POST business-read, after fresh comparison.
  const prepared=()=>{if(mode==='required-read'){const key=JSON.parse(before.values).__processRecords.values.qualityMasterControl.key;f.hooks.get=k=>{if(k===key)fault();};}};
  if(mode==='encode')f.hooks.put=fault;
  if(mode==='cas-before')f.hooks.run=sql=>{if(sql.startsWith('UPDATE shared_state'))fault();};
  if(mode==='cas-after')f.env.DB.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('UPDATE shared_state')){const run=statement.run.bind(statement);statement.run=async()=>{await run();fault();};}return statement;};
  await form.onsubmit({preventDefault(){},target:form});assert.equal(f.requests.slice(start).filter(r=>r.method==='POST').length,0);await assert.rejects(ui.c.__fqcTest.sharedAction('save',{},prepared),/WORKFLOW_WRITE_FAILED/);assert.equal(ui.c.__fqcTest.ui.lastError,'WORKFLOW_WRITE_FAILED');assert(ui.c.__fqcTest.transport().hasUnknown());assert.equal(input.value,'Synthetic error test');
  const writes=f.requests.slice(start).filter(r=>r.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].status,500);assert.equal(writes[0].result.error,'WORKFLOW_WRITE_FAILED');assert.match(writes[0].result.requestId,/^[0-9a-f-]{36}$/);
  const log=messages.find(args=>args[0]==='[shared-workflow]');assert(log);assert.equal(log[2],writes[0].result.requestId);assert.deepEqual(JSON.parse(log[4]),{stage:mode==='required-read'?'business-read':mode==='encode'?'record-encode':'state-cas',reason:'UNCLASSIFIED_EXCEPTION'});assert(!JSON.stringify(log).includes('synthetic-secret'));assert(!JSON.stringify(writes[0].result).includes('SYNTHETIC_PRIVATE_DETAIL'));
  await assert.rejects(ui.c.__fqcTest.sharedAction('save'),/UNKNOWN_OPERATION_CHECK_REQUIRED/);assert(ui.c.__fqcTest.transport().hasUnknown());assert.equal(f.requests.slice(start).filter(r=>r.method==='POST').length,1);
  f.hooks.get=undefined;f.hooks.put=undefined;f.hooks.run=undefined;f.env.DB.prepare=prepare;
  if(mode==='cas-after'){
   assert.equal((await f.state()).workflow.working.errors[0].name,'Synthetic error test');const result=await ui.c.__fqcTest.transport().resolveUnknown();assert(result.receipt);assert.equal(ui.c.__fqcTest.transport().hasUnknown(),false);
  }else{
   assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);await assert.rejects(ui.c.__fqcTest.transport().resolveUnknown(),/OPERATION_NOT_FOUND/);assert(ui.c.__fqcTest.transport().hasUnknown());
  }
  assert.equal(f.requests.slice(start).filter(r=>r.method==='POST').length,1);
 }finally{console.error=originalLog;f.close();}
});
void test('failure diagnostics identify exact known integrity errors without exposing arbitrary text',async()=>{
 const f=await fixture();try{const {fqcWriteFailureReason}=f.load('lib/fqc-write-failure.ts');assert.equal(fqcWriteFailureReason(Error('Immutable record missing')),'RECORD_MISSING');assert.equal(fqcWriteFailureReason(Error('Immutable record corrupt')),'RECORD_INTEGRITY_FAILED');assert.equal(fqcWriteFailureReason(Error('Invalid FQC inline authority')),'INLINE_AUTHORITY_INVALID');assert.equal(fqcWriteFailureReason(Error('D1_ERROR secret SQL values')),'UNCLASSIFIED_EXCEPTION');assert.equal(fqcWriteFailureReason('secret'),'NON_ERROR_EXCEPTION');}finally{f.close();}
});
for(const dependency of ['masterDataControl','routineEquipmentControl'])void test(`FQC GET can succeed while Apply fails closed on missing required ${dependency}`,async()=>{
 const f=await fixture();try{
  const a=f.realm(),flow=(await a.client.begin()).control.workflow,before=f.db.prepare('SELECT * FROM shared_state').get(),ref=JSON.parse(before.values).__processRecords.values[dependency];
  f.objects.delete(ref.key);
  assert.equal((await f.call('/api/fqc/workflow?caseMetadata=1&compact=1')).status,200);
  const command=a.client.prepare(flow.generation,'apply',{patches:[{op:'set',path:['errors',{id:'error'},'name'],value:'Synthetic error test'}],guards:[{path:['errors',{id:'error'},'name'],value:'Synthetic error'}]});
  const response=await f.call('/api/fqc/workflow?caseMetadata=1&compact=1&projection=fqc-apply-ack-v1',{method:'POST',body:JSON.stringify({command})});assert.equal(response.status,500);assert.equal((await response.json()).error,'WORKFLOW_WRITE_FAILED');assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);
 }finally{f.close();}
});
