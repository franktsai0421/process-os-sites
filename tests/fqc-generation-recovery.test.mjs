import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const fixture=createRequire(import.meta.url)('../scripts/fqc-apply-fixture.cjs');
const edit=(name='Original',before='Synthetic error')=>({patches:[{op:'set',path:['errors',{id:'error'},'name'],value:name}],guards:[{path:['errors',{id:'error'},'name'],value:before}]});
async function setup(){
 const f=await fixture(),a=f.realm(),begun=await a.client.begin(),g=begun.control.workflow.generation;
 a.intercept(async(url,o,send)=>{if(o.method==='POST'){await send();throw Error('ACK_LOST');}if(url.includes('operationId='))throw Error('LOOKUP_DOWN');return send();});
 const command=a.client.prepare(g,'apply',edit());await assert.rejects(a.client.sendPrepared(command),/RESULT_UNKNOWN/);a.intercept(null);
 const peer=f.realm('other');peer.c.alert=()=>{};let flow=(await peer.client.read()).control.workflow;
 flow=(await peer.client.command(g,'save')).control.workflow;flow=(await peer.client.command(g,'submit',{savedId:flow.saved.id,expectedRevision:flow.revision,reason:'Synthetic'})).control.workflow;
 flow=(await peer.client.command(g,'withdraw',{caseId:flow.pendingId,reason:'Synthetic'})).control.workflow;
 return{f,a,peer,flow,command,g};
}
void test('reloaded receipt marker confirms history without claiming new-generation departure ownership',async()=>{
 const {f,a,flow}=await setup();try{const fresh=f.realm('editor',a.session),before=f.db.prepare('SELECT * FROM shared_state').get(),posts=f.requests.filter(r=>r.method==='POST').length;await fresh.client.read();const result=await fresh.client.resolveUnknown();assert(fresh.client.isSupersededRecovery(result));assert(fresh.client.hasUnknown());assert.equal(fresh.c.SharedDraftDeparture.owns(flow),false);fresh.client.acknowledgeSupersededRecovery(result);assert.equal(fresh.client.hasUnknown(),false);assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);assert.equal(f.requests.filter(r=>r.method==='POST').length,posts);}finally{f.close();}
});
for(const fault of ['equal-revision','lower-revision','wrong-operation','wrong-receipt-generation','denied-view','owner-change'])void test(`historical recovery preserves its marker on ${fault}`,async()=>{
 const {f,a,command}=await setup();try{const bytes=[...a.session],before=f.db.prepare('SELECT * FROM shared_state').get();let receiptRevision;
 a.intercept(async(url,o,send)=>{const response=await send(),body=await response.json();if(url.includes('operationId=')){receiptRevision=body.receipt.revision;if(fault==='wrong-operation')body.receipt.operationId='wrong';if(fault==='wrong-receipt-generation')body.receipt.generation='wrong';}else{if(fault==='equal-revision')body.control.workflow.revision=receiptRevision;if(fault==='lower-revision')body.control.workflow.revision=receiptRevision-1;if(fault==='denied-view')return Response.json({error:'FORBIDDEN'},{status:403});if(fault==='owner-change')a.rotate();}return Response.json(body,{status:response.status});});
 await assert.rejects(a.client.resolveUnknown());assert(a.client.hasUnknown());assert.deepEqual([...a.session],bytes);assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);assert.throws(()=>a.client.acknowledgeSupersededRecovery({receipt:{operationId:command.operationId},recoveryState:'confirmed-previous-generation'}),/CONFIRMED_HISTORICAL_RECEIPT_REQUIRED/);
 }finally{f.close();}
});
void test('observing a later peer edit invalidates historical proof; a fresh lookup can retire only the old operation',async()=>{
 const {f,a,peer,flow}=await setup();try{const result=await a.client.resolveUnknown();await peer.client.command(flow.generation,'apply',edit('Peer newer','Original'));await a.client.read();assert.equal(a.client.isSupersededRecovery(result),false);assert.throws(()=>a.client.acknowledgeSupersededRecovery(result),/CONFIRMED_HISTORICAL_RECEIPT_REQUIRED/);assert(a.client.hasUnknown());const current=await a.client.resolveUnknown();a.client.acknowledgeSupersededRecovery(current);assert.equal((await f.state()).workflow.working.errors[0].name,'Peer newer');assert.equal(a.c.SharedDraftDeparture.owns(current.control.workflow),false);}finally{f.close();}
});
void test('failed marker removal leaves recovery retryable and does not make another POST',async()=>{
 const {f,a}=await setup();try{const result=await a.client.resolveUnknown(),remove=a.c.sessionStorage.removeItem,bytes=[...a.session],posts=f.requests.filter(r=>r.method==='POST').length;a.c.sessionStorage.removeItem=()=>{throw Error('STORAGE_DENIED');};assert.throws(()=>a.client.acknowledgeSupersededRecovery(result),/STORAGE_DENIED/);assert.deepEqual([...a.session],bytes);assert(a.client.hasUnknown());a.c.sessionStorage.removeItem=remove;a.client.acknowledgeSupersededRecovery(await a.client.resolveUnknown());assert.equal(a.client.hasUnknown(),false);assert.equal(f.requests.filter(r=>r.method==='POST').length,posts);}finally{f.close();}
});
void test('explicit old receipt in a new tab supplies private historical proof without another tab marker',async()=>{
 const {f,a,command}=await setup();try{const fresh=f.realm(),bytes=[...a.session];await fresh.client.read();const result=await fresh.client.receipt(command.operationId,command.generation);assert(fresh.client.isSupersededRecovery(result));assert.equal(fresh.client.hasUnknown(),false);assert(fresh.client.acknowledgeSupersededRecovery(result));assert.equal(fresh.client.isSupersededRecovery(result),false);assert.deepEqual([...a.session],bytes,'another runtime marker is not removed');}finally{f.close();}
});
