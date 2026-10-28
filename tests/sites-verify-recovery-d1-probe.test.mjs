// One narrow compiled-app / real local workerd-D1 binding probe. No Site HTTP,
// real grant, R2 payloads, persisted database, network or business data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {incident,planIncidentRecovery,applyIncidentRecovery} from '../scripts/verify-recovery-20261023.mjs';
import {planIncidentMaintenance,buildIncidentMaintenanceBatch,buildIncidentResumeBatch} from '../scripts/verify-resume-plan-20261023.mjs';
const report={realData:false,realCredentials:false,remoteBindings:false,compiledMaintenanceRoute:false,cases:[],programCommit:process.env.PROCESS_PROGRAM_COMMIT};let f,stage='startup';
async function test(name,run){stage=name;await seed();await run();report.cases.push(name);}
async function seed(){
 const db=f.db;
 await db.batch(['process_import_native_operations','process_import_native_requests','process_import_verify_capabilities','process_import_capabilities','process_import_attempts','process_import_budget','process_snapshot_chunks','process_snapshot_target','process_snapshot_transfers'].map(t=>db.prepare('DELETE FROM '+t)));
 const pins=JSON.stringify(Object.fromEntries(['projectId','origin','ownerId','targetFingerprint','manifestSha256','transferId'].map(k=>[k,incident[k]])));
 const insert=(table,row)=>{const k=Object.keys(row);return db.prepare(`INSERT INTO ${table}(${k.join(',')}) VALUES(${k.map(()=>'?').join(',')})`).bind(...Object.values(row));};
 await db.batch([
  insert('process_snapshot_transfers',{id:incident.transferId,project_id:incident.projectId,target:incident.targetFingerprint,manifest_sha:incident.manifestSha256,manifest_key:'process-import/v1/'+incident.transferId+'/manifest.json',owner_id:'frank',phase:'receiving',version:18,verify_cursor:272,chunk_count:1401,total_bytes:incident.bytes,created_at:1,expires_at:9999999999999}),
  insert('process_snapshot_target',{id:1,target:incident.targetFingerprint,transfer_id:incident.transferId}),
  insert('process_import_budget',{id:1,policy_sha:'a'.repeat(64),policy:'SYNTHETIC_POLICY',state:'open',active_request:incident.requestId,reason:null,write_bytes:276216440,write_calls:1402,requests:157,db_bytes:7654321,db_statements:9461}),
  insert('process_import_attempts',{id:incident.requestId,action:'verify',state:'running',created_at:10}),
  insert('process_import_native_requests',{capability_id:incident.capabilityId,nonce:incident.nonce,request_sha256:incident.requestSha256,request_id:incident.requestId,action:'verify',generation:1,state:'running',created_at:10,finalized_at:null,reason:null}),
  insert('process_import_capabilities',{id:incident.capabilityId,credential_sha256:'b'.repeat(64),pins,scope:'staging',owner_epoch:0,generation:1,reserved_operations:1914,issued_at:1,write_expires_at:100,receipt_expires_at:200}),
  db.prepare("WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<1400) INSERT INTO process_snapshot_chunks(transfer_id,chunk_id,sequence,bytes,sha256) SELECT ?,'c'||i,i,CASE WHEN i=1400 THEN ? ELSE 196692 END,? FROM n").bind(incident.transferId,incident.bytes-196692*1400,'c'.repeat(64)),
  db.prepare("WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<11) INSERT INTO process_import_native_operations(request_id,ordinal,kind,object_key,generation,state,admitted_at,finalized_at,evidence) SELECT ?,i,'r2-get',?||i,1,'succeeded',10,11,'provider-read-response' FROM n").bind(incident.requestId,'process-import/v1/'+incident.transferId+'/chunks/c'),
 ]);
}
const row=table=>f.db.prepare('SELECT * FROM '+table).first();
const oldAdvance=()=>f.db.prepare("UPDATE process_snapshot_transfers SET version=version+1,verify_cursor=288 WHERE id=? AND version=18 AND phase='receiving'").bind(incident.transferId).run();
const all=async table=>(await f.db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()).results;
async function preparedResume(){
 const hold=await planIncidentRecovery(f.db);await applyIncidentRecovery(f.db,hold,{at:500});
 const newGrant={id:'ic_'+'d'.repeat(32),credentialSha256:'d'.repeat(64),ownerEpoch:0,issuedAt:1000,writeExpiresAt:1000+4*3600_000,receiptExpiresAt:1000+5*3600_000,requestLimit:1000,operationLimit:20000};
 const plan=await planIncidentMaintenance(f.db,{holdPlan:hold,newGrant,reviewedProgramCommit:'6'.repeat(40),at:1001});
 return{hold,plan};
}
try{
 f=await createRootEntryFixture();report.buildEntrySha256=f.buildEntrySha256;
 await test('D1 false SQL assertion rolls back prior mutation',async()=>{
  await assert.rejects(f.db.batch([f.db.prepare("UPDATE process_snapshot_transfers SET version=90"),f.db.prepare("SELECT json(CASE WHEN changes()=0 THEN 'true' ELSE 'PROBE_ROLLBACK' END)")]),/malformed JSON/);
  assert.equal((await row('process_snapshot_transfers')).version,18);
 });
 await test('D1 hold wins; stale handler cannot advance and charges/operations remain',async()=>{
  const before=await row('process_import_budget'),ops=await all('process_import_native_operations'),plan=await planIncidentRecovery(f.db);
  await applyIncidentRecovery(f.db,plan,{at:500});assert.equal((await oldAdvance()).meta.changes,0);
  const budget=await row('process_import_budget');assert.equal(budget.state,'stopped');assert.equal(budget.active_request,incident.requestId);
  for(const k of ['write_bytes','write_calls','requests','db_bytes','db_statements'])assert.equal(budget[k],before[k]);
  assert.deepEqual(await all('process_import_native_operations'),ops);assert.equal((await row('process_snapshot_transfers')).verify_cursor,272);assert.equal((await row('process_import_native_requests')).state,'blocked');
 });
 await test('D1 old advance wins between fresh read and transaction; no partial fence',async()=>{
  const plan=await planIncidentRecovery(f.db);let calls=0;const raced={prepare:s=>f.db.prepare(s),async batch(items){if(++calls===2)assert.equal((await oldAdvance()).meta.changes,1);return f.db.batch(items);}};
  await assert.rejects(applyIncidentRecovery(raced,plan,{at:500}),/malformed JSON/);
  assert.equal((await row('process_snapshot_transfers')).verify_cursor,288);assert.equal((await row('process_import_budget')).state,'open');assert.equal((await row('process_import_native_requests')).state,'running');
 });
 await test('D1 late statement failure rolls back every earlier fence mutation',async()=>{
  const plan=await planIncidentRecovery(f.db),before=await row('process_import_budget');
  await f.db.prepare("CREATE TRIGGER recovery_probe_fail BEFORE UPDATE ON process_import_attempts BEGIN SELECT RAISE(ABORT,'PROBE_LATE_FAILURE'); END").run();
  try{await assert.rejects(applyIncidentRecovery(f.db,plan,{at:500}),/PROBE_LATE_FAILURE/);assert.equal((await row('process_snapshot_transfers')).version,18);assert.equal((await row('process_import_native_requests')).state,'running');assert.deepEqual(await row('process_import_budget'),before);}finally{await f.db.prepare('DROP TRIGGER recovery_probe_fail').run();}
 });
 await test('D1 maintenance/resume planner preserves charges and old receipts; new baseline is NOT falsely verified',async()=>{
  const{plan}=await preparedResume(),before=await row('process_import_budget'),ops=await all('process_import_native_operations');
  assert.equal(plan.liveReady,false);assert.equal(plan.requiredRuntime,'incident-verify-audit-only-v1');
  await f.db.batch(await buildIncidentMaintenanceBatch(f.db,plan));assert.equal((await row('process_import_budget')).state,'stopped');assert.equal((await row('process_import_budget')).active_request,incident.requestId);
  await f.db.batch(await buildIncidentResumeBatch(f.db,plan,{at:1002}));
  const b=await row('process_import_budget');assert.equal(b.state,'open');assert.equal(b.active_request,null);for(const k of ['write_bytes','write_calls','requests','db_bytes','db_statements'])assert.equal(b[k],before[k]);
  const old=await f.db.prepare('SELECT * FROM process_import_capabilities WHERE id=?').bind(incident.capabilityId).first(),next=await f.db.prepare('SELECT * FROM process_import_verify_capabilities WHERE id=?').bind(plan.newGrant.id).first();assert.equal(old.generation,2);assert.equal(old.revoked_at,1002);assert.equal(old.reserved_operations,1914);assert.equal(next.scope,'incident-verify-audit-only-v1');assert.equal(next.baseline_verified,0);assert.equal(next.baseline_checked,0);assert.equal(next.baseline_cursor,0);assert.equal(next.baseline_version,19);
  assert.equal((await row('process_snapshot_transfers')).verify_cursor,272);assert.equal((await row('process_snapshot_transfers')).version,19);assert.equal((await row('process_import_native_requests')).state,'blocked');assert.deepEqual(await all('process_import_native_operations'),ops);
  await assert.rejects(f.db.batch(await buildIncidentResumeBatch(f.db,plan,{at:1003})),/malformed JSON/);
 });
 await test('D1 resume refuses absent maintenance, state drift and expired T0; no partial authority insertion',async()=>{
  const{plan}=await preparedResume();await assert.rejects(f.db.batch(await buildIncidentResumeBatch(f.db,plan,{at:1002})),/malformed JSON/);
  await f.db.batch(await buildIncidentMaintenanceBatch(f.db,plan));await assert.rejects(buildIncidentResumeBatch(f.db,plan,{at:plan.newGrant.write_expires_at}),/PRECONDITION/);
  await f.db.prepare('UPDATE process_import_budget SET db_statements=db_statements+1 WHERE id=1').run();await assert.rejects(f.db.batch(await buildIncidentResumeBatch(f.db,plan,{at:1002})),/malformed JSON/);
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM process_import_capabilities').first()).n,1);assert.equal((await row('process_import_capabilities')).revoked_at,null);assert.equal((await row('process_import_budget')).state,'stopped');
 });
 await test('D1 failure after old revocation and new restricted insert rolls back both authorities',async()=>{
  const{plan}=await preparedResume();await f.db.batch(await buildIncidentMaintenanceBatch(f.db,plan));const before=await row('process_import_budget');
  await f.db.prepare("CREATE TRIGGER resume_probe_fail BEFORE UPDATE ON process_import_budget WHEN NEW.state='open' BEGIN SELECT RAISE(ABORT,'PROBE_AFTER_RESTRICTED_INSERT'); END").run();
  try{await assert.rejects(f.db.batch(await buildIncidentResumeBatch(f.db,plan,{at:1002})),/PROBE_AFTER_RESTRICTED_INSERT/);assert.equal((await row('process_import_capabilities')).revoked_at,null);assert.equal((await row('process_import_capabilities')).generation,1);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM process_import_verify_capabilities').first()).n,0);assert.deepEqual(await row('process_import_budget'),before);}finally{await f.db.prepare('DROP TRIGGER resume_probe_fail').run();}
 });
 report.status='PASS_LOCAL_COMPILED_D1_VERIFY_RECOVERY_PROBE';
}catch(error){report.status='FAIL_LOCAL_COMPILED_D1_VERIFY_RECOVERY_PROBE';report.failedStage=stage;report.errorType=error.constructor.name;if(/^[A-Z0-9_]+$/.test(error.message))report.code=error.message;}
finally{if(f){await f.close();report.disposed=true;}report.finishedAt=new Date().toISOString();report.caseCount=report.cases.length;fs.writeFileSync(path.resolve('../verify-recovery-d1-probe-v2-20261023.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));process.exitCode=report.status.startsWith('PASS_')?0:1;
