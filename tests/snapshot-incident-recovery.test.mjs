import {test} from 'node:test';import assert from 'node:assert/strict';
import {incidentFixture} from './incident-recovery-fixture.mjs';
import {incident} from '../scripts/verify-recovery-20261023.mjs';
import {createNativeAuthority,nativeRequestHash} from '../lib/snapshot-native-capability.mjs';
import {createNativeIntentLedger} from '../lib/snapshot-native-intents.mjs';
import {createAttemptBudget} from '../lib/snapshot-attempt-budget.mjs';
import {createIncidentRecoveryRuntime} from '../lib/snapshot-incident-recovery.mjs';
async function run(fn){const f=await incidentFixture();try{await fn(f);}finally{f.close();}}
test('maintenance credentials, origin, extra fields and server clock fail closed',()=>run(async f=>{
 assert.equal((await f.request('incident-register',{method:'POST',token:'z'.repeat(43)})).status,401);
 assert.equal((await f.request('incident-register',{method:'POST',headers:{Origin:'https://wrong.invalid'}})).status,403);
 await f.advanceTo('registered');const p=await(await f.request('incident-plan')).json();assert.equal((await f.request('incident-hold',{method:'POST',body:{nonce:'10000000-0000-4000-8000-000000000001',planSha256:p.planSha256,at:1,sql:'SELECT 1'}})).status,409);
 f.setTime(f.config.maintenance.expiresAt);assert.equal((await f.step('incident-hold',p.planSha256)).status,401);assert.equal((await f.request('incident-status')).status,200);f.setTime(f.config.maintenance.receiptExpiresAt);assert.equal((await f.request('incident-status')).status,401);
 assert.equal((await f.db.prepare('SELECT version FROM process_snapshot_transfers').first()).version,18);
}));
test('fixed transitions retain old receipts/charges and independently persist restricted grant',()=>run(async f=>{
 const before=await f.db.prepare('SELECT * FROM process_import_budget').first();await f.advanceTo('resumed');const b=await f.db.prepare('SELECT * FROM process_import_budget').first();for(const k of ['write_bytes','write_calls','requests','db_bytes','db_statements'])assert.equal(b[k],before[k]);assert.equal(b.active_request,null);
 const old=await f.db.prepare('SELECT * FROM process_import_capabilities').first(),next=await f.db.prepare('SELECT * FROM process_import_verify_capabilities').first();assert.equal(old.generation,2);assert.equal(next.scope,'incident-verify-audit-only-v1');assert.equal(next.baseline_verified,0);assert.equal(next.baseline_checked,0);assert.equal((await f.db.prepare('SELECT verify_cursor FROM process_snapshot_transfers').first()).verify_cursor,272);
 const legacy=createNativeAuthority({db:f.db,pins:f.pins,readOwnerEligibility:f.readOwnerEligibility,now:f.now});await assert.rejects(legacy.authenticate({capabilityId:f.config.grant.id,token:f.applicationToken}),/CREDENTIAL/);
}));
test('post-insert failure rolls back old revocation and restricted record together; maintenance receipt unknown keeps nonce',()=>run(async f=>{
 const p=await f.advanceTo('maintenance'),before=await f.db.prepare('SELECT * FROM process_import_budget').first();f.sqlite.exec("CREATE TRIGGER incident_late_failure BEFORE UPDATE ON process_import_budget WHEN NEW.state='open' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_AFTER_NEW_GRANT'); END");
 const response=await f.step('incident-resume',p.planSha256);assert.equal(response.status,409);
 const old=await f.db.prepare('SELECT generation,revoked_at,reserved_operations FROM process_import_capabilities').first();assert.equal(old.generation,1);assert.equal(old.revoked_at,null);assert.equal(old.reserved_operations,1914);assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM process_import_verify_capabilities').first()).n,0);assert.deepEqual(await f.db.prepare('SELECT * FROM process_import_budget').first(),before);
 const r=await(await f.request('incident-status')).json();assert.equal(r.stage,'maintenance');assert.equal(r.inFlight,true);assert.equal(r.receipts.at(-1).state,'unknown');assert.equal((await f.step('incident-resume',p.planSha256)).status,409);
}));
test('same maintenance nonce cannot admit two writers; replay returns existing receipt without a new charge',()=>run(async f=>{
 const p=await f.advanceTo('registered'),body={nonce:'10000000-0000-4000-8000-000000000007',planSha256:p.planSha256};const responses=await Promise.all([f.request('incident-hold',{method:'POST',body}),f.request('incident-hold',{method:'POST',body})]);assert.ok(responses.some(r=>r.status===200));const r=await f.db.prepare('SELECT * FROM process_import_verify_maintenance').first();assert.equal(r.admitted,1);assert.equal(r.stage,'held');assert.equal((await f.request('incident-hold',{method:'POST',body})).status,200);assert.equal((await f.db.prepare('SELECT admitted FROM process_import_verify_maintenance').first()).admitted,1);
}));
test('restricted native actions deny registration, baseline bypass, payload and business mutation before provider calls',()=>run(async f=>{
 await f.advanceTo('resumed');const header={Authorization:'Bearer '+f.config.grant.id+'.'+f.applicationToken,Origin:incident.origin};for(const action of ['register','begin','batch','reconcile-existing','copy','restore','activate']){const u=new URL('/api/snapshots/import',incident.origin);u.searchParams.set('action',action);if(action!=='register')u.searchParams.set('id',incident.transferId);assert.equal((await f.native.handle(new Request(u,{method:'POST',headers:header}))).status,403);}
 const config=await(await f.native.handle(new Request(incident.origin+'/api/snapshots/import?action=configuration',{headers:header}))).json();assert.equal(config.nativeScope,'incident-verify-audit-only-v1');assert.equal(config.baseline.verified,false);assert.deepEqual(config.continuation,{version:19,cursor:272,uploadAllowed:false});
 const h=await f.runtime.authority.authenticate({capabilityId:f.config.grant.id,token:f.applicationToken}),ledger=createNativeIntentLedger({db:f.db,authority:f.runtime.authority,handle:h,pins:f.pins,nonce:'10000000-0000-4000-8000-000000000009',requestSha256:'d'.repeat(64),action:'verify',now:f.now});let puts=0;await assert.rejects(ledger.wrapBucket({put(){puts++;}}).put('process-import/v1/'+incident.transferId+'/chunks/c0',new Uint8Array([1]),{onlyIf:{etagDoesNotMatch:'*'}}),/SCOPE/);assert.equal(puts,0);
 await assert.rejects(ledger.metadataBatch([{sql:'UPDATE shared_state SET revision=revision+1',args:[incident.transferId]}]),/BUSINESS_WRITE_REFUSED/);
}));
test('trusted cursor-272 rule does not waive actual manifest checksum; stopped request receipts remain readable',()=>run(async f=>{
 await f.advanceTo('resumed');await f.bucket.put('process-import/v1/'+incident.transferId+'/manifest.json',new TextEncoder().encode('synthetic-wrong-manifest'),{});
 const url=incident.origin+'/api/snapshots/import?id='+incident.transferId+'&action=verify&version=19',nonce='10000000-0000-4000-8000-000000000010',hash=await nativeRequestHash({method:'POST',url,body:new Uint8Array(),pins:f.pins}),headers={Authorization:'Bearer '+f.config.grant.id+'.'+f.applicationToken,Origin:incident.origin,'X-Process-Import-Nonce':nonce,'X-Process-Import-Request-SHA256':hash};
 const result=await(await f.native.handle(new Request(url,{method:'POST',headers}))).json();assert.equal(result.error,'IMPORT_MANIFEST_INTEGRITY');assert.equal((await f.db.prepare('SELECT verify_cursor FROM process_snapshot_transfers').first()).verify_cursor,272);assert.equal((await f.db.prepare('SELECT baseline_verified FROM process_import_verify_capabilities').first()).baseline_verified,0);
 const receiptResponse=await f.native.handle(new Request(incident.origin+'/api/snapshots/import?action=request-status&id='+incident.transferId+'&nonce='+nonce,{headers:{Authorization:headers.Authorization}}));assert.equal(receiptResponse.status,200);assert.notEqual((await receiptResponse.json()).state,'complete');
}));
test('write expiry forbids new provider reads while accepted read may settle; metadata receipt survives only its own deadline',()=>run(async f=>{
 await f.advanceTo('resumed');const h=await f.runtime.authority.authenticate({capabilityId:f.config.grant.id,token:f.applicationToken}),ledger=createNativeIntentLedger({db:f.db,authority:f.runtime.authority,handle:h,pins:f.pins,nonce:'10000000-0000-4000-8000-000000000011',requestSha256:'d'.repeat(64),action:'verify',now:f.now}),budget=await createAttemptBudget({db:f.db,bucket:f.bucket,policy:f.policy,pins:f.pins,now:f.now});let reads=0;
 await budget.run('verify',false,async storage=>{const b=storage.bucket({async get(){reads++;return{size:1,body:new ReadableStream({start(c){f.setTime(f.config.grant.writeExpiresAt);c.enqueue(new Uint8Array([1]));c.close();}})};}});await b.get('process-import/v1/'+incident.transferId+'/chunks/c0');await assert.rejects(b.get('process-import/v1/'+incident.transferId+'/chunks/c1'),/EXPIRED/);},ledger);
 assert.equal(reads,1);assert.equal((await ledger.receipt()).state,'complete');f.setTime(f.config.grant.receiptExpiresAt);await assert.rejects(ledger.receipt(),/RECEIPT_EXPIRED/);
}));
test('runtime/program mismatch and revocation cannot authenticate a restricted grant',()=>run(async f=>{
 await assert.rejects(createIncidentRecoveryRuntime({db:f.db,config:f.config,programCommit:'b'.repeat(40),projectId:incident.projectId,origin:incident.origin,readOwnerEligibility:f.readOwnerEligibility,now:f.now}),/CONFIGURATION/);
 await f.advanceTo('resumed');const headers={Authorization:'Bearer '+f.config.grant.id+'.'+f.applicationToken};await f.db.prepare('UPDATE process_import_verify_capabilities SET revoked_at=?,generation=generation+1').bind(f.now()).run();assert.equal((await f.native.handle(new Request(incident.origin+'/api/snapshots/import?action=configuration',{headers}))).status,401);
}));
test('lost resume acknowledgement preserves committed complete receipt; no automatic replay or second grant',()=>run(async f=>{
 const p=await f.advanceTo('maintenance'),batch=f.db.batch;let lost=0;
 f.db.batch=async items=>{const result=await batch(items),r=await f.db.prepare('SELECT stage FROM process_import_verify_maintenance').first();if(r.stage==='resumed'&&!lost++){throw Error('SYNTHETIC_COMMIT_ACK_LOST');}return result;};
 assert.equal((await f.step('incident-resume',p.planSha256)).status,409);const status=await(await f.request('incident-status')).json();assert.equal(status.stage,'resumed');assert.equal(status.inFlight,false);assert.equal(status.receipts.at(-1).state,'complete');assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM process_import_verify_capabilities').first()).n,1);assert.equal((await f.db.prepare('SELECT admitted FROM process_import_verify_maintenance').first()).admitted,3);
}));
test('delayed final owner lookup crossing maintenance expiry cannot dispatch the recovery batch',()=>run(async f=>{
 const p=await f.advanceTo('registered'),before=await f.db.prepare('SELECT * FROM process_import_budget').first();let ownerReads=0;
 const runtime=await createIncidentRecoveryRuntime({db:f.db,config:f.config,programCommit:f.config.programCommit,projectId:incident.projectId,origin:incident.origin,bindingsPins:f.pins,now:f.now,readOwnerEligibility:async()=>{
  const current=await f.readOwnerEligibility();if(++ownerReads===2){await Promise.resolve();f.setTime(f.config.maintenance.expiresAt);}return current;
 }});
 const nonce='10000000-0000-4000-8000-000000000012',response=await runtime.handle(new Request(incident.origin+'/api/snapshots/import?action=incident-hold',{method:'POST',headers:{Authorization:'Bearer '+f.config.maintenance.id+'.'+f.maintenanceToken,Origin:incident.origin},body:JSON.stringify({nonce,planSha256:p.planSha256})}));
 assert.equal(ownerReads,2);assert.equal(response.status,401);assert.equal((await response.json()).error,'IMPORT_VERIFY_EXPIRED');
 assert.equal((await f.db.prepare('SELECT version FROM process_snapshot_transfers').first()).version,18);assert.deepEqual(await f.db.prepare('SELECT * FROM process_import_budget').first(),before);
 const r=await f.db.prepare('SELECT stage,active_nonce,admitted,receipts FROM process_import_verify_maintenance').first();assert.equal(r.stage,'registered');assert.equal(r.active_nonce,nonce);assert.equal(r.admitted,1);assert.equal(JSON.parse(r.receipts).at(-1).state,'unknown');
}));
test('expiry after durable admission prevents mutation and retains unknown receipt/lock',()=>run(async f=>{
 const p=await f.advanceTo('registered'),prepare=f.db.prepare;
 f.db.prepare=sql=>{const original=prepare(sql);if(!sql.startsWith('UPDATE process_import_verify_maintenance SET active_nonce='))return original;return{bind(...args){const bound=original.bind(...args);return{async run(){const result=await bound.run();f.setTime(f.config.maintenance.expiresAt);return result;}};}};};
 assert.equal((await f.step('incident-hold',p.planSha256)).status,401);assert.equal((await f.db.prepare('SELECT version FROM process_snapshot_transfers').first()).version,18);const s=await(await f.request('incident-status')).json();assert.equal(s.stage,'registered');assert.equal(s.inFlight,true);assert.equal(s.receipts[0].state,'unknown');
}));
