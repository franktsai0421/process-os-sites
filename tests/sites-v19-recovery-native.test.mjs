// Actual compiled HTTP + ephemeral workerd D1. All rows/tokens are synthetic.
// Direct D1 probes use the same adapter/primitive, without production endpoints.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {v19Fixture,seedV19D1} from './v19-recovery-fixture.mjs';
import {v19,planV19Recovery,buildV19RecoveryBatch} from '../scripts/verify-recovery-v19-20261024.mjs';
import {createV19RecoveryRuntime} from '../lib/snapshot-v19-recovery.mjs';
import {nativeRequestHash} from '../lib/snapshot-native-capability.mjs';
let f,synthetic,stage='startup';const report={cases:[],realData:false,realCredentials:false,remoteBindings:false,liveRecovery:false};
const programCommit=process.env.PROCESS_PROGRAM_COMMIT,base=v19.origin+'/api/snapshots/import';
async function fresh(){
 if(f){await f.close();f=null;}synthetic?.close();stage='synthetic-fixture';synthetic=await v19Fixture({time:Date.now(),programCommit});stage='compiled-runtime-start';
 f=await createRootEntryFixture({syntheticBindings:{PROCESS_V19_RECOVERY_ENABLED:'1',PROCESS_V19_RECOVERY_JSON:JSON.stringify(synthetic.config),PROCESS_NATIVE_IMPORT_ENABLED:'1',PROCESS_IMPORT_ORIGIN:v19.origin,PROCESS_IMPORT_OWNER_ID:'frank',PROCESS_IMPORT_TARGET_FINGERPRINT:v19.targetFingerprint,PROCESS_IMPORT_MANIFEST_SHA256:v19.manifestSha256,PROCESS_IMPORT_ATTEMPT_JSON:JSON.stringify(synthetic.policy)}});
 stage='synthetic-D1-seed';await seedV19D1(f.db,synthetic);report.buildEntrySha256=f.buildEntrySha256;report.programCommit=programCommit;
}
async function test(name,run){stage=name;await run();report.cases.push(name);}
const request=(action,body,headers={})=>f.mf.dispatchFetch(base+'?action='+action,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+synthetic.config.maintenance.id+'.'+synthetic.maintenanceToken,Origin:v19.origin,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
async function body(){const r=await request('v19-plan');assert.equal(r.status,200);return{nonce:synthetic.config.nonce,planSha256:(await r.json()).planSha256};}
const options=()=>({newGrant:synthetic.config.grant,maintenance:{credentialSha256:synthetic.config.maintenance.credentialSha256,issuedAt:synthetic.config.maintenance.issuedAt,expiresAt:synthetic.config.maintenance.expiresAt},nonce:synthetic.config.nonce,programCommit});
async function unchanged(){return JSON.stringify((await f.db.batch([
 f.db.prepare('SELECT * FROM process_import_native_requests WHERE request_id=?').bind(v19.requestId),f.db.prepare('SELECT * FROM process_import_native_operations WHERE request_id=? ORDER BY ordinal').bind(v19.requestId),f.db.prepare('SELECT * FROM process_import_verify_maintenance'),f.db.prepare('SELECT write_bytes,write_calls,requests,db_bytes,db_statements FROM process_import_budget'),f.db.prepare('SELECT COUNT(*) n,SUM(bytes) bytes FROM process_snapshot_chunks'),f.db.prepare('SELECT * FROM shared_state'),
 ])).map(x=>x.results));}
try{
 await fresh();
 await test('compiled authentication, nonce and plan rejection leave admission empty',async()=>{
  const b=await body();assert.equal((await request('v19-resume',b,{Authorization:''})).status,401);
  assert.equal((await request('v19-resume',b,{Origin:'https://wrong.invalid'})).status,403);assert.equal((await request('v19-resume',b,{Cookie:'synthetic=x'})).status,403);
  assert.equal((await request('v19-resume',{...b,nonce:'40000000-0000-4000-8000-000000000019'})).status,409);assert.equal((await request('v19-resume',{...b,planSha256:'a'.repeat(64)})).status,409);
  assert.equal((await request('incident-plan')).status,404);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM process_import_verify_v19_admission').first()).n,0);
 });
 await test('actual D1 old advance wins: recovery CAS rolls back and preserves committed cursor',async()=>{
  const p=await planV19Recovery(f.db,options()),batch=await buildV19RecoveryBatch(f.db,p,{now:synthetic.now,readOwnerEligibility:synthetic.readOwnerEligibility});
  await f.db.prepare("UPDATE process_snapshot_transfers SET version=20,verify_cursor=288 WHERE version=19 AND phase='receiving'").run();await assert.rejects(f.db.batch(batch));
  assert.equal((await f.db.prepare('SELECT verify_cursor FROM process_snapshot_transfers').first()).verify_cursor,288);assert.equal((await f.db.prepare('SELECT generation FROM process_import_verify_capabilities WHERE id=?').bind(v19.capabilityId).first()).generation,1);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM process_import_verify_v19_supersession').first()).n,0);
 });
 await fresh();
 await test('compiled final-write failure rolls back revocation/insert/version but admission stays unknown',async()=>{
  const before=await unchanged(),b=await body();await f.db.prepare("CREATE TRIGGER v19_compiled_failure BEFORE UPDATE ON process_import_budget WHEN NEW.state='open' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_AFTER_GRANT_INSERT'); END").run();
  assert.equal((await request('v19-resume',b)).status,409);assert.equal(await unchanged(),before);assert.equal((await f.db.prepare('SELECT version FROM process_snapshot_transfers').first()).version,19);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM process_import_verify_capabilities').first()).n,1);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM process_import_verify_v19_supersession').first()).n,0);
  const s=await(await request('v19-status')).json();assert.equal(s.stage,'unknown');assert.equal(s.importInFlight,true);assert.equal((await request('v19-resume',b)).status,409);
 });
 await fresh();
 await test('actual D1 delayed owner crosses expiry after admission: zero supersession, no delayed dispatch',async()=>{
  let delayed=false;const runtime=await createV19RecoveryRuntime({db:f.db,config:synthetic.config,programCommit,projectId:v19.projectId,origin:v19.origin,bindingsPins:synthetic.pins,now:synthetic.now,readOwnerEligibility:async()=>{const o=await synthetic.readOwnerEligibility();if((await f.db.prepare('SELECT COUNT(*) n FROM process_import_verify_v19_admission').first()).n){synthetic.setTime(synthetic.config.maintenance.expiresAt);delayed=true;}return o;}});
  const b=await body(),before=await unchanged();const r=await runtime.handle(new Request(base+'?action=v19-resume',{method:'POST',headers:{Authorization:'Bearer '+synthetic.config.maintenance.id+'.'+synthetic.maintenanceToken,Origin:v19.origin,'Content-Type':'application/json'},body:JSON.stringify(b)}));
  assert.equal(r.status,409);assert.equal(delayed,true);assert.equal(await unchanged(),before);assert.equal((await f.db.prepare('SELECT version FROM process_snapshot_transfers').first()).version,19);assert.equal((await f.db.prepare('SELECT state FROM process_import_verify_v19_admission').first()).state,'unknown');assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM process_import_verify_v19_supersession').first()).n,0);
 });
 await fresh();
 await test('compiled resume wins: atomic version20 fences old handler and retains all historical evidence/charges',async()=>{
  const before=await unchanged(),b=await body(),r=await request('v19-resume',b);assert.equal(r.status,200);assert.equal((await r.json()).receipt.state,'complete');assert.equal(await unchanged(),before);
  const s=await(await request('v19-status')).json();assert.equal(s.stage,'resumed');assert.equal(s.inFlight,false);assert.equal(s.importInFlight,false);assert.equal(s.version,20);assert.equal(s.verifiedCursor,272);
  const old=await f.db.prepare("UPDATE process_snapshot_transfers SET version=version+1,verify_cursor=288 WHERE id=? AND version=19 AND phase='receiving'").bind(v19.transferId).run();assert.equal(old.meta.changes,0);assert.equal((await request('v19-resume',b)).status,409);
  const revoked=await f.db.prepare('SELECT generation,revoked_at FROM process_import_verify_capabilities WHERE id=?').bind(v19.capabilityId).first();assert.equal(revoked.generation,2);assert.ok(revoked.revoked_at);
 });
 const auth={Authorization:'Bearer '+synthetic.config.grant.id+'.'+synthetic.applicationToken,Origin:v19.origin};
 await test('compiled restricted grant exposes exact continuation but cannot upload/restore/activate',async()=>{
  for(const a of ['register','begin','batch','reconcile-existing','copy','restore','activate'])assert.equal((await f.mf.dispatchFetch(base+'?action='+a+'&id='+v19.transferId,{method:'POST',headers:auth})).status,403);
  const c=await(await f.mf.dispatchFetch(base+'?action=configuration',{headers:auth})).json();assert.equal(c.nativeScope,'incident-verify-audit-only-v1');assert.equal(c.baseline.verified,false);assert.deepEqual(c.continuation,{version:20,cursor:272,uploadAllowed:false});
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM process_snapshot_activations').first()).n,0);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM state_backups').first()).n,0);
 });
 await test('compiled first verify reaches actual hash gate: invalid synthetic manifest cannot advance or fake success',async()=>{
  const bucket=await f.mf.getR2Bucket('STATE_ARCHIVE');await bucket.put('process-import/v1/'+v19.transferId+'/manifest.json','SYNTHETIC_NOT_THE_REAL_MANIFEST');
  const url=base+'?id='+v19.transferId+'&action=verify&version=20',nonce='50000000-0000-4000-8000-000000000019',hash=await nativeRequestHash({method:'POST',url,body:new Uint8Array(),pins:synthetic.pins});
  const r=await f.mf.dispatchFetch(url,{method:'POST',headers:{...auth,'X-Process-Import-Nonce':nonce,'X-Process-Import-Request-SHA256':hash}});assert.equal(r.status,409);assert.equal((await r.json()).error,'IMPORT_MANIFEST_INTEGRITY');assert.equal((await f.db.prepare('SELECT verify_cursor FROM process_snapshot_transfers').first()).verify_cursor,272);
  const receipt=await f.mf.dispatchFetch(base+'?id='+v19.transferId+'&action=request-status&nonce='+nonce,{headers:auth});assert.equal(receipt.status,200);assert.notEqual((await receipt.json()).state,'complete');
 });
 report.status='PASS_COMPILED_SYNTHETIC_V19_RECOVERY';
}catch(e){report.status='FAIL_COMPILED_SYNTHETIC_V19_RECOVERY';report.failedStage=stage;report.errorType=e.constructor.name;if(/^[A-Z0-9_]+$/.test(e.message))report.code=e.message;if(typeof e.actual==='number')report.actual=e.actual;if(typeof e.expected==='number')report.expected=e.expected;}
finally{if(f)await f.close();synthetic?.close();report.disposed=true;report.caseCount=report.cases.length;report.finishedAt=new Date().toISOString();fs.writeFileSync(path.resolve('../v19-recovery-compiled-20261024.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));process.exitCode=report.status.startsWith('PASS_')?0:1;
