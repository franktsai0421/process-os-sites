// Exact compiled application, local workerd D1/R2, synthetic keys/rows only.
// True pinned manifest cannot be synthesized: the final test deliberately
// supplies a wrong body and proves checksum refusal, not real R1 acceptance.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';
import {incidentFixture,seedIncidentMetadata} from './incident-recovery-fixture.mjs';
import {incident} from '../scripts/verify-recovery-20261023.mjs';
import {nativeRequestHash,createNativeAuthority} from '../lib/snapshot-native-capability.mjs';
let f,stage='startup',serial=0;const report={cases:[],realData:false,realCredentials:false,remoteBindings:false,liveRecovery:false};
async function test(name,run){stage=name;await run();report.cases.push(name);}
try{
 const time=Date.now(),programCommit=process.env.PROCESS_PROGRAM_COMMIT,prepared=await incidentFixture({time,programCommit}),config=prepared.config,policy=prepared.policy;prepared.close();
 f=await createRootEntryFixture({syntheticBindings:{PROCESS_VERIFY_RECOVERY_ENABLED:'1',PROCESS_VERIFY_RECOVERY_JSON:JSON.stringify(config),PROCESS_NATIVE_IMPORT_ENABLED:'1',PROCESS_IMPORT_ORIGIN:incident.origin,PROCESS_IMPORT_OWNER_ID:'frank',PROCESS_IMPORT_TARGET_FINGERPRINT:incident.targetFingerprint,PROCESS_IMPORT_MANIFEST_SHA256:incident.manifestSha256,PROCESS_IMPORT_ATTEMPT_JSON:JSON.stringify(policy)}});
 const meta=await seedIncidentMetadata(f.db,{time,programCommit}),base=incident.origin+'/api/snapshots/import';assert.deepEqual(meta.config,config);report.programCommit=programCommit;report.buildEntrySha256=f.buildEntrySha256;
 const auth='Bearer '+config.maintenance.id+'.'+meta.maintenanceToken;
 const request=(action,options={})=>f.mf.dispatchFetch(base+'?action='+action,{...options,headers:{Authorization:auth,Origin:incident.origin,...options.headers},redirect:'manual'});
 const step=(action,planSha256)=>request(action,{method:'POST',body:JSON.stringify({nonce:'10000000-0000-4000-8000-'+String(++serial).padStart(12,'0'),planSha256})});
 await test('compiled entry rejects missing/wrong credentials, foreign origin and arbitrary SQL fields',async()=>{
  assert.equal((await request('incident-register',{method:'POST',headers:{Authorization:''}})).status,401);
  assert.equal((await request('incident-register',{method:'POST',headers:{Origin:'https://other.synthetic.invalid'}})).status,403);
  assert.equal((await request('incident-register',{method:'POST'})).status,200);
  const p=await(await request('incident-plan')).json();assert.equal((await request('incident-hold',{method:'POST',body:JSON.stringify({nonce:'10000000-0000-4000-8000-000000000001',planSha256:p.planSha256,sql:'DELETE FROM shared_state'})})).status,409);
  assert.equal((await f.db.prepare('SELECT version FROM process_snapshot_transfers').first()).version,18);
 });
 let resumePlan;
 await test('compiled hold and maintenance retain exact lock/cursor; new record not enabled early',async()=>{
  const p=await(await request('incident-plan')).json();assert.equal((await step('incident-hold',p.planSha256)).status,200);resumePlan=await(await request('incident-plan')).json();assert.equal((await step('incident-maintenance',resumePlan.planSha256)).status,200);
  const b=await f.db.prepare('SELECT state,active_request FROM process_import_budget').first();assert.equal(b.state,'stopped');assert.equal(b.active_request,incident.requestId);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM process_import_verify_capabilities').first()).n,0);assert.equal((await f.db.prepare('SELECT verify_cursor FROM process_snapshot_transfers').first()).verify_cursor,272);
 });
 await test('compiled D1 failure AFTER restricted insert rolls back authorities and preserves unknown admission',async()=>{
  await f.db.prepare("CREATE TRIGGER compiled_incident_failure BEFORE UPDATE ON process_import_budget WHEN NEW.state='open' BEGIN SELECT RAISE(ABORT,'COMPILED_AFTER_RESTRICTED_INSERT'); END").run();
  const r=await step('incident-resume',resumePlan.planSha256);assert.equal(r.status,409);const old=await f.db.prepare('SELECT generation,revoked_at FROM process_import_capabilities').first();assert.equal(old.generation,1);assert.equal(old.revoked_at,null);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM process_import_verify_capabilities').first()).n,0);
  const s=await(await request('incident-status')).json();assert.equal(s.stage,'maintenance');assert.equal(s.inFlight,true);assert.equal(s.receipts.at(-1).state,'unknown');await f.db.prepare('DROP TRIGGER compiled_incident_failure').run();
 });
 // Fresh synthetic DB state for the positive path, not an unlock of the failed
 // campaign: dispose runtime and create a new isolated fixture with new rows.
 await f.close();f=null;
 f=await createRootEntryFixture({syntheticBindings:{PROCESS_VERIFY_RECOVERY_ENABLED:'1',PROCESS_VERIFY_RECOVERY_JSON:JSON.stringify(config),PROCESS_NATIVE_IMPORT_ENABLED:'1',PROCESS_IMPORT_ORIGIN:incident.origin,PROCESS_IMPORT_OWNER_ID:'frank',PROCESS_IMPORT_TARGET_FINGERPRINT:incident.targetFingerprint,PROCESS_IMPORT_MANIFEST_SHA256:incident.manifestSha256,PROCESS_IMPORT_ATTEMPT_JSON:JSON.stringify(policy)}});const seeded=await seedIncidentMetadata(f.db,{time,programCommit});
 await test('compiled positive transition revokes legacy grant, inserts independent scope, leaves baseline unverified',async()=>{
  assert.equal((await request('incident-register',{method:'POST'})).status,200);let p=await(await request('incident-plan')).json();assert.equal((await step('incident-hold',p.planSha256)).status,200);p=await(await request('incident-plan')).json();assert.equal((await step('incident-maintenance',p.planSha256)).status,200);assert.equal((await step('incident-resume',p.planSha256)).status,200);
  const s=await(await request('incident-status')).json();assert.equal(s.stage,'resumed');assert.equal(s.inFlight,false);assert.equal(s.importInFlight,false);
  const row=await f.db.prepare('SELECT scope,baseline_verified,baseline_checked FROM process_import_verify_capabilities').first();assert.equal(row.scope,'incident-verify-audit-only-v1');assert.equal(row.baseline_verified,0);assert.equal(row.baseline_checked,0);
  const legacy=createNativeAuthority({db:f.db,pins:seeded.pins,readOwnerEligibility:seeded.readOwnerEligibility});await assert.rejects(legacy.authenticate({capabilityId:config.grant.id,token:meta.applicationToken}),/CREDENTIAL/);
 });
 const restricted={Authorization:'Bearer '+config.grant.id+'.'+meta.applicationToken,Origin:incident.origin};
 await test('compiled grant cannot stage/upload/materialize or read normal company APIs',async()=>{
  for(const action of ['register','begin','batch','reconcile-existing','copy','restore','activate']){const u=base+'?action='+action+(action==='register'?'':'&id='+incident.transferId);assert.equal((await f.mf.dispatchFetch(u,{method:'POST',headers:restricted})).status,403);}
  const c=await(await f.mf.dispatchFetch(base+'?action=configuration',{headers:restricted})).json();assert.equal(c.nativeScope,'incident-verify-audit-only-v1');assert.equal(c.baseline.verified,false);assert.equal(c.continuation.cursor,272);assert.equal(c.continuation.uploadAllowed,false);
  assert.equal((await f.mf.dispatchFetch(incident.origin+'/api/shared-state',{headers:restricted})).status,503);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM state_backups').first()).n,0);
 });
 await test('compiled continuation reaches real checksum gate without faking baseline or advancing cursor',async()=>{
  const bucket=await f.mf.getR2Bucket('STATE_ARCHIVE');await bucket.put('process-import/v1/'+incident.transferId+'/manifest.json','SYNTHETIC_INVALID_PINNED_MANIFEST');
  const u=base+'?id='+incident.transferId+'&action=verify&version=19',nonce='20000000-0000-4000-8000-000000000001',hash=await nativeRequestHash({method:'POST',url:u,body:new Uint8Array(),pins:meta.pins}),r=await f.mf.dispatchFetch(u,{method:'POST',headers:{...restricted,'X-Process-Import-Nonce':nonce,'X-Process-Import-Request-SHA256':hash}});assert.equal(r.status,409);assert.equal((await r.json()).error,'IMPORT_MANIFEST_INTEGRITY');
  assert.equal((await f.db.prepare('SELECT verify_cursor FROM process_snapshot_transfers').first()).verify_cursor,272);const receipt=await f.mf.dispatchFetch(base+'?id='+incident.transferId+'&action=request-status&nonce='+nonce,{headers:restricted});assert.equal(receipt.status,200);assert.notEqual((await receipt.json()).state,'complete');assert.equal((await f.db.prepare('SELECT baseline_verified FROM process_import_verify_capabilities').first()).baseline_verified,0);
 });
 report.status='PASS_COMPILED_SYNTHETIC_INCIDENT_RECOVERY';
}catch(e){report.status='FAIL_COMPILED_SYNTHETIC_INCIDENT_RECOVERY';report.failedStage=stage;report.errorType=e.constructor.name;if(/^[A-Z0-9_]+$/.test(e.message))report.code=e.message;if(typeof e.actual==='number')report.actual=e.actual;if(typeof e.expected==='number')report.expected=e.expected;}
finally{if(f)await f.close();report.disposed=true;report.caseCount=report.cases.length;report.finishedAt=new Date().toISOString();fs.writeFileSync(path.resolve('../incident-recovery-compiled-20261023.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));process.exitCode=report.status.startsWith('PASS_')?0:1;
