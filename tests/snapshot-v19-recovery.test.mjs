import {test} from 'node:test';import assert from 'node:assert/strict';
import {incidentFixture} from './incident-recovery-fixture.mjs';
import {incidentVerifyScope,credentialDigest,createIncidentVerifyAuthority} from '../lib/snapshot-native-capability.mjs';
import {v19,v19ReceiptSchema,proveV19,planV19Recovery,buildV19RecoveryBatch,readV19RecoveryReceipt,checkV19Continuation} from '../scripts/verify-recovery-v19-20261024.mjs';
const insert=(db,table,v)=>{const keys=Object.keys(v);return db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?')})`).bind(...Object.values(v)).run();};
async function fixture(){
 const f=await incidentFixture();await f.advanceTo('resumed');
 const prior=f.sqlite.prepare('SELECT * FROM process_import_verify_capabilities').get();
 f.sqlite.prepare('UPDATE process_import_verify_capabilities SET id=?,credential_sha256=?,reserved_operations=3').run(v19.capabilityId,v19.capabilityId.slice(3)+'0'.repeat(32));
 await insert(f.db,'process_import_native_requests',{capability_id:v19.capabilityId,nonce:v19.nonce,request_sha256:v19.requestSha256,request_id:v19.requestId,action:'verify',generation:1,state:'unknown',created_at:f.now()-100,finalized_at:f.now()-10,reason:'request-incomplete-or-provider-uncertain'});
 await insert(f.db,'process_import_attempts',{id:v19.requestId,action:'verify',state:'stopped',created_at:f.now()-100});
 f.sqlite.prepare("UPDATE process_import_budget SET state='stopped',active_request=?,reason='IMPORT_ATTEMPT_PROVIDER_OR_UNCERTAIN',requests=requests+1").run(v19.requestId);
 for(let i=0;i<3;i++)await insert(f.db,'process_import_native_operations',{request_id:v19.requestId,ordinal:i+1,kind:'r2-get',object_key:'process-import/v1/'+v19.transferId+'/'+['manifest.json','chunks/c272','chunks/c273'][i],expected_bytes:null,expected_sha256:null,generation:1,state:i===2?'unknown':'succeeded',admitted_at:f.now()-100+i,finalized_at:f.now()-10+i,evidence:i===0?'provider-body-sha256:'+v19.manifestSha256:i===1?'provider-body-sha256:36102900dbb1078dc5c6f8007b404bf3757a03a74e3b1dcb354f3dcb4fc8c94b':'provider-or-receipt-uncertain'});
 const token=Buffer.alloc(32,8).toString('base64url'),gd=await credentialDigest(token),md=await credentialDigest(Buffer.alloc(32,9).toString('base64url'));
 const options={newGrant:{id:'ic_'+gd.slice(0,32),credentialSha256:gd,ownerEpoch:0,issuedAt:f.now(),writeExpiresAt:f.now()+14400000,receiptExpiresAt:f.now()+18000000,requestLimit:1000,operationLimit:20000},maintenance:{credentialSha256:md,issuedAt:f.now(),expiresAt:f.now()+600000},nonce:'30000000-0000-4000-8000-000000000019',programCommit:'b'.repeat(40)};
 const plan=await planV19Recovery(f.db,options),build=()=>buildV19RecoveryBatch(f.db,plan,{now:f.now,readOwnerEligibility:f.readOwnerEligibility});
 return{...f,options,plan,build,token,prior};
}
function preserved(f){return JSON.stringify({request:f.sqlite.prepare('SELECT * FROM process_import_native_requests WHERE request_id=?').get(v19.requestId),ops:f.sqlite.prepare('SELECT * FROM process_import_native_operations WHERE request_id=? ORDER BY ordinal').all(v19.requestId),attempt:f.sqlite.prepare('SELECT * FROM process_import_attempts WHERE id=?').get(v19.requestId),maintenance:f.sqlite.prepare('SELECT * FROM process_import_verify_maintenance').get(),charges:f.sqlite.prepare('SELECT write_bytes,write_calls,requests,db_bytes,db_statements FROM process_import_budget').get(),chunks:f.sqlite.prepare('SELECT COUNT(*) n,SUM(bytes) bytes FROM process_snapshot_chunks WHERE transfer_id=?').get(v19.transferId)});}
void test('request hash proves the old handler captured exact version19',async()=>assert.deepEqual(await proveV19(),{capturedVersion:19,requestSha256:v19.requestSha256}));
void test('atomic supersession preserves unknown/history/charges and leaves cursor272; consumed singleton untouched',async()=>{
 const f=await fixture();try{const before=preserved(f);await f.db.batch(await f.build());assert.equal(preserved(f),before);
  assert.deepEqual({...f.sqlite.prepare('SELECT version,verify_cursor FROM process_snapshot_transfers').get()},{version:20,verify_cursor:272});
  const b=f.sqlite.prepare('SELECT state,active_request,reason FROM process_import_budget').get();assert.equal(b.state,'open');assert.equal(b.active_request,null);assert.equal(b.reason,'IMPORT_V19_VERIFY_ONLY:'+f.plan.planSha256);
  const old=f.sqlite.prepare('SELECT generation,revoked_at FROM process_import_verify_capabilities WHERE id=?').get(v19.capabilityId);assert.equal(old.generation,2);assert.equal(old.revoked_at,f.now());
  const r=await readV19RecoveryReceipt(f.db,f.plan);assert.equal(r.state,'resumed-receipt');assert.equal(r.automaticRetryAllowed,false);await assert.rejects(f.build(),/PRECONDITION/);
 }finally{f.close();}
});
void test('old advance first makes the whole recovery fail, without replacing its committed cursor',async()=>{
 const f=await fixture();try{const batch=await f.build();f.sqlite.prepare("UPDATE process_snapshot_transfers SET version=20,verify_cursor=288 WHERE version=19 AND phase='receiving'").run();await assert.rejects(f.db.batch(batch));
  assert.equal(f.sqlite.prepare('SELECT verify_cursor FROM process_snapshot_transfers').get().verify_cursor,288);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM process_import_verify_v19_supersession').get().n,0);assert.equal(f.sqlite.prepare('SELECT generation FROM process_import_verify_capabilities WHERE id=?').get(v19.capabilityId).generation,1);
 }finally{f.close();}
});
void test('recovery first fences late old version19 advance',async()=>{
 const f=await fixture();try{await f.db.batch(await f.build());assert.equal(f.sqlite.prepare("UPDATE process_snapshot_transfers SET version=version+1,verify_cursor=288 WHERE id=? AND version=19 AND phase='receiving'").run(v19.transferId).changes,0);assert.equal(f.sqlite.prepare('SELECT verify_cursor FROM process_snapshot_transfers').get().verify_cursor,272);
 }finally{f.close();}
});
void test('failure after revocation/new grant/receipt rolls the entire batch back',async()=>{
 const f=await fixture();try{const before=preserved(f);f.sqlite.exec("CREATE TRIGGER v19_fail BEFORE UPDATE ON process_import_budget WHEN NEW.state='open' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_FINAL_FAILURE'); END");await assert.rejects(f.db.batch(await f.build()));assert.equal(preserved(f),before);assert.equal(f.sqlite.prepare('SELECT version FROM process_snapshot_transfers').get().version,19);assert.equal(f.sqlite.prepare('SELECT generation,revoked_at FROM process_import_verify_capabilities WHERE id=?').get(v19.capabilityId).generation,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM process_import_verify_capabilities').get().n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM process_import_verify_v19_supersession').get().n,0);
 }finally{f.close();}
});
void test('applied but lost ACK is read back, never replayed; pre-apply loss stays not-confirmed',async()=>{
 const f=await fixture();try{assert.deepEqual(await readV19RecoveryReceipt(f.db,f.plan),{state:'not-confirmed',automaticRetryAllowed:false});const batch=await f.build();await assert.rejects((async()=>{await f.db.batch(batch);throw Error('SYNTHETIC_LOST_ACK');})(),/LOST_ACK/);const r=await readV19RecoveryReceipt(f.db,f.plan);assert.equal(r.state,'resumed-receipt');assert.equal(r.automaticRetryAllowed,false);await assert.rejects(f.build(),/PRECONDITION/);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM process_import_verify_v19_supersession').get().n,1);
 }finally{f.close();}
});
for(const [name,sql]of Object.entries({pins:"UPDATE process_snapshot_transfers SET target='wrong'",charges:'UPDATE process_import_budget SET db_statements=db_statements+1',operation:"UPDATE process_import_native_operations SET evidence='changed' WHERE ordinal=3 AND state='unknown'",lock:"UPDATE process_import_budget SET active_request='other'",oldSingleton:"UPDATE process_import_verify_maintenance SET config_sha='changed'"}))void test('atomic before-image rejects '+name+' drift',async()=>{
 const f=await fixture();try{const batch=await f.build();f.sqlite.exec(sql);await assert.rejects(f.db.batch(batch));assert.equal(f.sqlite.prepare('SELECT version FROM process_snapshot_transfers').get().version,19);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM process_import_verify_v19_supersession').get().n,0);}finally{f.close();}
});
void test('server time after delayed owner lookup refuses expired maintenance with zero batch',async()=>{
 const f=await fixture();try{await assert.rejects(buildV19RecoveryBatch(f.db,f.plan,{now:f.now,readOwnerEligibility:async()=>{const o=await f.readOwnerEligibility();f.setTime(f.now()+600001);return o;}}),/PRECONDITION/);assert.equal(f.sqlite.prepare('SELECT version FROM process_snapshot_transfers').get().version,19);}finally{f.close();}
});
void test('new restricted authority binds supersession, rejects stage actions, expiry and malformed continuation',async()=>{
 const f=await fixture();try{await f.db.batch(await f.build());const authority=createIncidentVerifyAuthority({db:f.db,pins:f.pins,readOwnerEligibility:f.readOwnerEligibility,now:f.now,checkRecovery:(g,a)=>checkV19Continuation(f.db,f.plan,g,a)}),handle=await authority.authenticate({capabilityId:f.plan.newGrant.id,token:f.token});
  for(const action of ['batch','copy','restore','activate','reconcile-existing'])await assert.rejects(authority.principal(handle,action),/SCOPE/);
  await authority.principal(handle,'verify');const grant=f.sqlite.prepare('SELECT * FROM process_import_verify_capabilities WHERE id=?').get(handle.id);assert.equal(grant.baseline_verified,0);assert.equal(grant.scope,incidentVerifyScope);
  assert.deepEqual(await checkV19Continuation(f.db,f.plan,grant),{cursor:272,version:20,uploadAllowed:false,baselineVerified:false});
  f.sqlite.exec('UPDATE process_snapshot_transfers SET version=21,verify_cursor=288');await authority.principal(handle,'verify');
  f.sqlite.exec('UPDATE process_snapshot_transfers SET version=20');await assert.rejects(authority.principal(handle,'verify'),/PRECONDITION/);f.sqlite.exec('UPDATE process_snapshot_transfers SET version=21');
  f.setTime(f.plan.newGrant.write_expires_at);await assert.rejects(authority.principal(handle,'verify'),/EXPIRED/);await authority.inspect(handle,'receipt');f.setTime(f.plan.newGrant.receipt_expires_at);await assert.rejects(authority.inspect(handle,'receipt'),/EXPIRED/);
 }finally{f.close();}
});
void test('old deployed recovery authority cannot authenticate the new grant',async()=>{
 const f=await fixture();try{await f.db.batch(await f.build());await assert.rejects(f.runtime.authority.authenticate({capabilityId:f.plan.newGrant.id,token:f.token}),/SCOPE/);}finally{f.close();}
});
