import test from 'node:test';import assert from 'node:assert/strict';
import {v19Fixture} from './v19-recovery-fixture.mjs';
import {v19} from '../scripts/verify-recovery-v19-20261024.mjs';
import {createV19RecoveryRuntime} from '../lib/snapshot-v19-recovery.mjs';
async function setup(options={}){
 const f=await v19Fixture(),runtime=await createV19RecoveryRuntime({db:options.wrapDb?.(f)||f.db,config:f.config,programCommit:f.config.programCommit,projectId:v19.projectId,origin:v19.origin,bindingsPins:f.pins,readOwnerEligibility:()=>options.owner?options.owner(f):f.readOwnerEligibility(),now:f.now});
 const request=(action,body,headers={})=>runtime.handle(new Request(v19.origin+'/api/snapshots/import?action='+action,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+f.config.maintenance.id+'.'+f.maintenanceToken,Origin:v19.origin,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}));
 const resume=async()=>{const p=await(await request('v19-plan')).json();return request('v19-resume',{nonce:f.config.nonce,planSha256:p.planSha256});};return{...f,runtime,request,resume};
}
void test('authenticated single admission atomically resumes, preserves evidence and refuses replay/actions',async()=>{
 const f=await setup();try{const before=f.snapshot(),r=await f.resume();assert.equal(r.status,200);assert.equal((await r.json()).receipt.state,'complete');assert.equal(f.snapshot(),before);
  assert.deepEqual({...f.sqlite.prepare('SELECT version,verify_cursor FROM process_snapshot_transfers').get()},{version:20,verify_cursor:272});
  assert.equal((await f.request('v19-resume',{nonce:f.config.nonce,planSha256:'a'.repeat(64)})).status,409);
  const status=await(await f.request('v19-status')).json();assert.equal(status.stage,'resumed');assert.equal(status.receipts.length,1);assert.equal(status.automaticRetryAllowed,false);
  const h=await f.runtime.authority.authenticate({capabilityId:f.config.grant.id,token:f.applicationToken});await f.runtime.authority.principal(h,'verify');
  for(const a of ['batch','copy','restore','activate','reconcile-existing'])assert.throws(()=>f.runtime.authorizeAction(h.id,a,'POST'),/SCOPE/);
  assert.equal(f.sqlite.prepare('SELECT baseline_verified FROM process_import_verify_capabilities WHERE id=?').get(h.id).baseline_verified,0);
 }finally{f.close();}
});
void test('wrong credential, origin, cookie, nonce and plan cannot consume singleton',async()=>{
 const f=await setup();try{const p=await(await f.request('v19-plan')).json(),b={nonce:f.config.nonce,planSha256:p.planSha256};
  assert.equal((await f.request('v19-resume',b,{Authorization:'Bearer bad'})).status,401);assert.equal((await f.request('v19-resume',b,{Origin:'https://wrong.invalid'})).status,403);assert.equal((await f.request('v19-resume',b,{Cookie:'synthetic=x'})).status,403);
  assert.equal((await f.request('v19-resume',{...b,nonce:'40000000-0000-4000-8000-000000000019'})).status,409);assert.equal((await f.request('v19-resume',{...b,planSha256:'a'.repeat(64)})).status,409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM process_import_verify_v19_admission').get().n,0);
 }finally{f.close();}
});
void test('delayed owner after durable admission crosses deadline: unknown receipt, zero supersession',async()=>{
 let delayed=false;const f=await setup({owner:async f=>{const o=await f.readOwnerEligibility();if(f.sqlite.prepare('SELECT COUNT(*) n FROM process_import_verify_v19_admission').get().n){f.setTime(f.config.maintenance.expiresAt);delayed=true;}return o;}});
 try{const before=f.snapshot();assert.equal((await f.resume()).status,409);assert.equal(delayed,true);assert.equal(f.snapshot(),before);assert.equal(f.sqlite.prepare('SELECT version FROM process_snapshot_transfers').get().version,19);assert.equal(f.sqlite.prepare('SELECT state FROM process_import_verify_v19_admission').get().state,'unknown');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM process_import_verify_v19_supersession').get().n,0);assert.equal((await f.resume()).status,401);}finally{f.close();}
});
void test('failure after new grant insert rolls back atomically, leaves nonreplayable unknown admission',async()=>{
 const f=await setup();try{const before=f.snapshot();f.sqlite.exec("CREATE TRIGGER v19_final_fail BEFORE UPDATE ON process_import_budget WHEN NEW.state='open' BEGIN SELECT RAISE(ABORT,'SYNTHETIC'); END");assert.equal((await f.resume()).status,409);assert.equal(f.snapshot(),before);assert.equal(f.sqlite.prepare('SELECT version FROM process_snapshot_transfers').get().version,19);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM process_import_verify_capabilities').get().n,1);assert.equal(f.sqlite.prepare('SELECT state FROM process_import_verify_v19_admission').get().state,'unknown');assert.equal((await f.resume()).status,409);}finally{f.close();}
});
void test('committed batch lost ACK remains complete in durable readback; never repeats mutation',async()=>{
 let commits=0;const f=await setup({wrapDb:f=>({prepare:s=>f.db.prepare(s),async batch(a){const result=await f.db.batch(a);if(f.sqlite.prepare("SELECT COUNT(*) n FROM process_import_verify_v19_admission WHERE state='complete'").get().n){commits++;throw Error('SYNTHETIC_ACK_LOST');}return result;}})});
 try{assert.equal((await f.resume()).status,409);const r=await(await f.request('v19-status')).json();assert.equal(r.stage,'resumed');assert.equal(r.receipts[0].state,'complete');assert.equal(commits,1);assert.equal((await f.resume()).status,409);assert.equal(commits,1);}finally{f.close();}
});
void test('simultaneous same nonce admits only one writer and completion',async()=>{
 const f=await setup();try{const p=await(await f.request('v19-plan')).json(),b={nonce:f.config.nonce,planSha256:p.planSha256};const r=await Promise.all([f.request('v19-resume',b),f.request('v19-resume',b)]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM process_import_verify_v19_admission').get().n,1);assert.equal(f.sqlite.prepare('SELECT generation FROM process_import_verify_capabilities WHERE id=?').get(v19.capabilityId).generation,2);}finally{f.close();}
});
void test('runtime program, target, nonce and exact configuration shape fail closed before admission',async()=>{
 const f=await v19Fixture();try{const o={db:f.db,config:f.config,programCommit:f.config.programCommit,projectId:v19.projectId,origin:v19.origin,bindingsPins:f.pins,readOwnerEligibility:f.readOwnerEligibility,now:f.now};
  for(const change of [{programCommit:'c'.repeat(40)},{bindingsPins:{...f.pins,targetFingerprint:'a'.repeat(64)}},{config:{...f.config,nonce:'invalid'}},{config:{...f.config,sql:'arbitrary'}}])await assert.rejects(createV19RecoveryRuntime({...o,...change}),/CONFIGURATION/);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM process_import_verify_v19_admission').get().n,0);
 }finally{f.close();}
});
void test('receipt access has its own fixed expiry and cannot confer renewed mutation rights',async()=>{
 const f=await setup();try{assert.equal((await f.resume()).status,200);f.setTime(f.config.maintenance.expiresAt);assert.equal((await f.request('v19-status')).status,200);assert.equal((await f.resume()).status,401);f.setTime(f.config.maintenance.receiptExpiresAt);assert.equal((await f.request('v19-status')).status,401);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM process_import_verify_v19_admission').get().n,1);}finally{f.close();}
});
