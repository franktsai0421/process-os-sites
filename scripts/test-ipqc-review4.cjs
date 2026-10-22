/* oxlint-disable typescript/no-require-imports -- isolated production handlers. */
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fixture=require('./ipqc-assignment-fixture.cjs');
(async()=>{const f=await fixture(process.argv[2]),events=[];
try{
 for(const mod of ['ipqc-ab','ipqc-c']){
  const endpoint='/api/'+mod+'/workflow'+(mod==='ipqc-ab'?'?scope=A%3ABORUAXE1021':''),read=async()=>{const c=(await f.request('/api/'+mod,'GET',undefined,'admin')).body.control;return mod==='ipqc-ab'?c.scopes['A:BORUAXE1021']:c;};
  let control=await read();const clientId=randomUUID();let sequence=0;
  const command=async(action,fields={},user='admin')=>{const r=await f.request(endpoint,'POST',{command:{generation:control.workflow.generation,operationId:randomUUID(),clientId,sequence:++sequence,action,...fields}},user);events.push({module:mod,action,user,status:r.status,error:r.body.error});if(r.status===200)control=r.body.control;return r;};
  const ok=async(...args)=>{const r=await command(...args);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
  if(control.workflow.pendingId)await ok('withdraw',{caseId:control.workflow.pendingId,reason:'Isolated review4 continuation'});
  const item=control.workflow.working.items.find(i=>!i.deleted&&i.standard);
  await ok('apply',{patches:[{op:'set',path:['items',{id:item.id},'standard'],value:item.standard+' · review4 isolated self-review'}]});
  await ok('save');await ok('submit',{savedId:control.workflow.saved.id,reason:'Isolated ADMIN submits own case'});
  const caseId=control.workflow.pendingId;
  assert.equal((await command('approve',{caseId})).body.error,'SELF_REVIEW_CONFIRM_REQUIRED');
  assert.equal((await command('approve',{caseId:'wrong-case',selfReviewConfirmed:true})).status,409);
  await ok('approve',{caseId,selfReviewConfirmed:true});assert.equal(control.activeVersionId,caseId);assert.equal(control.workflow.cases.find(c=>c.id===caseId).result.selfReview,true);
  assert.equal((await f.request(endpoint,'POST',{action:'begin'},'a')).status,200);control=await read();
  await ok('apply',{patches:[{op:'set',path:['items',{id:item.id},'standard'],value:item.standard+' · review4 staff'}]},'a');await ok('save',{},'a');await ok('submit',{savedId:control.workflow.saved.id,reason:'Isolated staff case'},'a');
  const staffCase=control.workflow.pendingId;assert.equal((await command('approve',{caseId:staffCase,selfReviewConfirmed:true},'a')).body.error,'SELF_REVIEW_FORBIDDEN');
  assert.equal((await command('withdraw',{caseId:staffCase,reason:''},'a')).status,422);
  await ok('return',{caseId:staffCase,reason:'Isolated return validation'},'reviewer');assert.equal(control.workflow.pendingId,null);
 }
 for(const [line,category,stage]of [['B','PHAODIEN','B-PHAO'],['A','INOX','A-ASSY']]){const r=await f.request('/api/process-ipqc?'+new URLSearchParams({mode:'choices',line,category,stage}));assert.equal(r.body.reason,'SOURCE_NOT_APPROVED');events.push({line,category,reason:r.body.reason});}
 const empty=await f.request('/api/process-ipqc?'+new URLSearchParams({mode:'choices',line:'C',category:'PVC',stage:'C-PREP'}));assert.equal(empty.body.reason,'NO_PRODUCTS');events.push({line:'C',category:'PVC',reason:empty.body.reason});
 console.log(JSON.stringify({result:'PASS',tests:'Real AB/C normal Save/Submit/Admin self-approve with explicit confirmation and audit; ordinary self-review forbidden; stale case rejected; required reason and return preserved; exact missing-source diagnostics',events,formalWrites:0},null,2));
}finally{f.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
