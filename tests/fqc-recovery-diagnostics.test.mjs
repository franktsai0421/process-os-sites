import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const fixture=createRequire(import.meta.url)('../scripts/fqc-apply-fixture.cjs');
const edit=()=>({patches:[{op:'set',path:['errors',{id:'error'},'name'],value:'Changed'}],guards:[{path:['errors',{id:'error'},'name'],value:'Synthetic error'}]});
const tick=()=>new Promise(setImmediate);
for(const phase of ['headers','body'])void test(`FQC unknown retains original ${phase} deadline and failed lookup without replay`,async()=>{
 const f=await fixture(),a=f.realm();try{
  const begun=await a.client.begin();let posts=0,lookups=0;
  a.intercept((url,o)=>{
   if(o.method==='POST'){posts++;const wait=()=>new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true}));return phase==='headers'?wait():{ok:true,status:200,json:wait};}
   if(url.includes('operationId=')){lookups++;return Response.json({error:'WORKFLOW_LOAD_FAILED',requestId:'12345678-1234-4234-8234-123456789abc'},{status:503});}
   throw Error('UNEXPECTED_REQUEST');
  });
  const command=a.client.prepare(begun.control.workflow.generation,'apply',edit()),pending=a.client.sendPrepared(command).then(()=>assert.fail('must remain unknown'),error=>error);
  await tick();const bytes=[...a.session];a.advance(45000);const error=await pending;
  assert.equal(error.message,'RESULT_UNKNOWN_CHECK_BEFORE_RETRY');assert.equal(error.operationId,command.operationId);
  assert.equal(error.cause.code,'WORKFLOW_MUTATION_TIMEOUT_UNKNOWN');assert.equal(error.cause.phase,phase);assert.equal(error.cause.deadlineMs,45000);assert.equal(error.cause.outcome,'unknown');assert.equal(error.cause.cause.name,'AbortError');
  assert.equal(error.recoveryCause.message,'WORKFLOW_LOAD_FAILED');assert.equal(error.recoveryCause.status,503);assert.equal(error.recoveryCause.requestId,'12345678-1234-4234-8234-123456789abc');
  assert(a.client.hasUnknown());assert.deepEqual([...a.session],bytes);assert.equal(posts,1);assert.equal(lookups,1);assert.equal((await f.state()).workflow.working.errors[0].name,'Synthetic error');
 }finally{f.close();}
});
void test('real peer withdrawal confirms historical Apply separately and requires explicit retirement',async()=>{
 const f=await fixture(),a=f.realm();try{
  const begun=await a.client.begin(),g=begun.control.workflow.generation;let posts=0;
  a.intercept(async(url,o,send)=>{if(o.method==='POST'){posts++;await send();throw Error('SYNTHETIC_ACK_LOST');}if(url.includes('operationId='))throw Error('SYNTHETIC_RECEIPT_UNAVAILABLE');return send();});
  const command=a.client.prepare(g,'apply',edit()),error=await a.client.sendPrepared(command).then(()=>assert.fail('must remain unknown'),error=>error);
  assert.equal(error.cause.message,'SYNTHETIC_ACK_LOST');assert.equal(error.recoveryCause.message,'SYNTHETIC_RECEIPT_UNAVAILABLE');
  const bytes=[...a.session],peer=f.realm('other');peer.c.alert=()=>{};let flow=(await peer.client.read()).control.workflow;
  flow=(await peer.client.command(g,'save')).control.workflow;
  flow=(await peer.client.command(g,'submit',{savedId:flow.saved.id,expectedRevision:flow.revision,reason:'Synthetic generation check'})).control.workflow;
  flow=(await peer.client.command(g,'withdraw',{caseId:flow.pendingId,reason:'Synthetic withdrawal'})).control.workflow;
  assert.notEqual(flow.generation,g);const before=f.db.prepare('SELECT * FROM shared_state').get();
  a.intercept((url,o,send)=>{if(o.method==='POST')posts++;return send();});
  const original=await f.call('/api/fqc/workflow?operationId='+command.operationId),receipt=(await original.json()).receipt;assert.equal(original.status,200);assert.equal(receipt.generation,g);assert.equal(receipt.operationId,command.operationId);
  const result=await a.client.resolveUnknown();assert.equal(result.recoveryState,'confirmed-previous-generation');assert(a.client.isSupersededRecovery(result));assert(a.client.isVerifiedReadback(result));assert.equal(result.receipt.generation,g);assert.equal(result.control.workflow.generation,flow.generation);
  assert.equal(a.client.isSupersededRecovery({...result}),false);assert.throws(()=>a.client.acknowledgeSupersededRecovery({...result}),/CONFIRMED_HISTORICAL_RECEIPT_REQUIRED/);
  assert(a.client.hasUnknown());assert.deepEqual([...a.session],bytes);assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);assert.equal(posts,1);
  await assert.rejects(a.client.command(flow.generation,'apply',edit()));assert.equal(posts,1);
  assert(a.client.acknowledgeSupersededRecovery(result));assert.equal(a.client.hasUnknown(),false);assert.equal(a.session.size,0);assert.equal(a.c.SharedDraftDeparture.owns(result.control.workflow),false);assert.throws(()=>a.client.acknowledgeSupersededRecovery(result),/CONFIRMED_HISTORICAL_RECEIPT_REQUIRED/);
  await assert.rejects(a.client.command(g,'apply',edit()));assert.equal(posts,1,'old generation cannot dispatch after retirement');
 }finally{f.close();}
});
