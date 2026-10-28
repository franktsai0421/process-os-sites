import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {consumeImportBody} from '../lib/snapshot-body.mjs';
import {sha256} from '../lib/snapshot-contract.mjs';
import {incident,proveIncidentVersion,planIncidentRecovery,applyIncidentRecovery} from '../scripts/verify-recovery-20261023.mjs';
import {d1} from './hosted-import-fixtures.mjs';
import {createHostedTransfer} from '../lib/snapshot-hosted-transfer.mjs';
import '../lib/snapshot-hosted-store.mjs';
const bytes=new Uint8Array([1,2,3]),encode=v=>new TextEncoder().encode(JSON.stringify(v));
function stalled(cancel=()=>{}){return new ReadableStream({pull(){return new Promise(()=>{});},cancel});}
void test('body timeout bounds a stalled read AND never-settling provider cancel',async()=>{
 let cancellations=0;const body=stalled(()=>{cancellations++;return new Promise(()=>{});}),at=performance.now();
 await assert.rejects(consumeImportBody(body,20,{timeoutMs:15}),/IMPORT_BODY_TIMEOUT/);
 assert.equal(cancellations,1);assert.equal(body.locked,false);assert.ok(performance.now()-at<1000);
});
void test('external abort cancels once and removes abort listener',async()=>{
 const controller=new AbortController();let add=0,remove=0,cancel=0;
 const signal={get aborted(){return controller.signal.aborted;},addEventListener(...a){add++;controller.signal.addEventListener(...a);},removeEventListener(...a){remove++;controller.signal.removeEventListener(...a);}};
 const body=stalled(()=>cancel++),run=consumeImportBody(body,20,{signal,timeoutMs:100});controller.abort();await assert.rejects(run,/IMPORT_BODY_CANCELLED/);
 assert.equal(cancel,1);assert.equal(body.locked,false);assert.equal(add,remove);
});
void test('already-aborted body makes no source pull; exact successful body/hash checks and cleanup',async()=>{
 const c=new AbortController();c.abort();let read=0,cancel=0;const body=new ReadableStream({pull(){read++;},cancel(){cancel++;}},{highWaterMark:0});
 await assert.rejects(consumeImportBody(body,20,{signal:c.signal,timeoutMs:100}),/CANCELLED/);assert.equal(read,0);assert.equal(cancel,1);
 const ok=new Blob([bytes]).stream(),result=await consumeImportBody(ok,3,{expectedBytes:3,expectedSha256:await sha256(bytes),timeoutMs:100});assert.deepEqual(result.bytes,bytes);assert.equal(ok.locked,false);
});
void test('oversize, wrong size/hash, source errors do not become successful body proof',async()=>{
 await assert.rejects(consumeImportBody(new Blob([bytes]).stream(),2),/BODY_LIMIT/);
 await assert.rejects(consumeImportBody(new Blob([bytes]).stream(),3,{expectedBytes:2}),/BODY_INTEGRITY/);
 await assert.rejects(consumeImportBody(new Blob([bytes]).stream(),3,{expectedSha256:'0'.repeat(64)}),/BODY_INTEGRITY/);
 const broken=new ReadableStream({start(c){c.error(Error('SYNTHETIC_STREAM_ERROR'));}});await assert.rejects(consumeImportBody(broken,3),/SYNTHETIC_STREAM_ERROR/);assert.equal(broken.locked,false);
});
function fixture(){
 const sqlite=new DatabaseSync(':memory:');for(const name of fs.readdirSync(new URL('../drizzle-sites-fresh/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle-sites-fresh/'+name,import.meta.url),'utf8'));
 const db=d1(sqlite),insert=(table,row)=>{const keys=Object.keys(row);sqlite.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));};
 const pins=Object.fromEntries(['projectId','origin','ownerId','targetFingerprint','manifestSha256','transferId'].map(k=>[k,incident[k]]));
 insert('process_snapshot_transfers',{id:incident.transferId,project_id:incident.projectId,target:incident.targetFingerprint,manifest_sha:incident.manifestSha256,manifest_key:'process-import/v1/'+incident.transferId+'/manifest.json',owner_id:'frank',phase:'receiving',version:18,verify_cursor:272,chunk_count:1401,total_bytes:incident.bytes,created_at:1,expires_at:9999999999999});
 insert('process_snapshot_target',{id:1,target:incident.targetFingerprint,transfer_id:incident.transferId});
 insert('process_import_budget',{id:1,policy_sha:'a'.repeat(64),policy:'SYNTHETIC_POLICY',state:'open',active_request:incident.requestId,reason:null,write_bytes:276216440,write_calls:1402,requests:157,db_bytes:7654321,db_statements:9461});
 insert('process_import_attempts',{id:incident.requestId,action:'verify',state:'running',created_at:10});
 insert('process_import_native_requests',{capability_id:incident.capabilityId,nonce:incident.nonce,request_sha256:incident.requestSha256,request_id:incident.requestId,action:'verify',generation:1,state:'running',created_at:10,finalized_at:null,reason:null});
 insert('process_import_capabilities',{id:incident.capabilityId,credential_sha256:'b'.repeat(64),pins:JSON.stringify(pins),scope:'staging',owner_epoch:0,generation:1,reserved_operations:1914,issued_at:1,write_expires_at:100,receipt_expires_at:200});
 for(let i=0;i<1401;i++)insert('process_snapshot_chunks',{transfer_id:incident.transferId,chunk_id:'c'+i,sequence:i,bytes:i===1400?incident.bytes-196692*1400:196692,sha256:'c'.repeat(64)});
 for(let i=1;i<=11;i++)insert('process_import_native_operations',{request_id:incident.requestId,ordinal:i,kind:'r2-get',object_key:'process-import/v1/'+incident.transferId+'/chunks/c'+(270+i),generation:1,state:'succeeded',admitted_at:10,finalized_at:11,evidence:'provider-read-response'});
 insert('process_import_attempts',{id:'historical-complete',action:'verify',state:'complete',created_at:1});
 const dump=table=>sqlite.prepare('SELECT * FROM '+table).all().map(v=>({...v})),oldAdvance=()=>sqlite.prepare("UPDATE process_snapshot_transfers SET version=version+1,verify_cursor=288 WHERE id=? AND version=18 AND phase='receiving'").run(incident.transferId).changes;
 return{db,sqlite,dump,oldAdvance,close:()=>sqlite.close()};
}
void test('exact stored request digest proves captured version 18, not a guessed elapsed-time fence',async()=>{
 const proof=await proveIncidentVersion();assert.equal(proof.requestSha256,incident.requestSha256);assert.equal(proof.capturedVersion,18);
});
void test('recovery fences old advance atomically, preserves cursor/data/charges/capability/operations/history and RETAINS lock',async()=>{
 const f=fixture();try{
  const before={budget:f.dump('process_import_budget')[0],ops:f.dump('process_import_native_operations'),chunks:f.dump('process_snapshot_chunks'),cap:f.dump('process_import_capabilities'),history:f.dump('process_import_attempts')[1]};
  const plan=await planIncidentRecovery(f.db),result=await applyIncidentRecovery(f.db,plan,{at:500});assert.equal(result.transferVersion,19);assert.equal(result.verifiedCursor,272);assert.equal(result.automaticResumeAllowed,false);assert.equal(f.oldAdvance(),0);
  const budget=f.dump('process_import_budget')[0];assert.equal(budget.state,'stopped');assert.equal(budget.active_request,incident.requestId);
  for(const k of ['write_bytes','write_calls','requests','db_bytes','db_statements','policy','policy_sha'])assert.equal(budget[k],before.budget[k]);
  assert.deepEqual(f.dump('process_import_native_operations'),before.ops);assert.deepEqual(f.dump('process_snapshot_chunks'),before.chunks);assert.deepEqual(f.dump('process_import_capabilities'),before.cap);assert.deepEqual(f.dump('process_import_attempts')[1],before.history);
  assert.equal(f.dump('process_import_native_requests')[0].state,'blocked');assert.equal(f.dump('process_snapshot_transfers')[0].phase,'receiving');
  // Exact OLD catch/completion shapes cannot overwrite the stopped fence.
  assert.equal(f.sqlite.prepare("UPDATE process_import_native_requests SET state='unknown' WHERE request_id=? AND generation=1 AND state='running'").run(incident.requestId).changes,0);
  assert.equal(f.sqlite.prepare("UPDATE process_import_budget SET state='stopped',reason='OLD_ERROR' WHERE id=1 AND active_request=? AND state='open'").run(incident.requestId).changes,0);
  await assert.rejects(applyIncidentRecovery(f.db,plan,{at:501}),/PRECONDITION/);
 }finally{f.close();}
});
void test('if old advance wins BETWEEN fresh read and recovery transaction, ENTIRE recovery fails without overwriting cursor',async()=>{
 const f=fixture();try{const plan=await planIncidentRecovery(f.db),batch=f.db.batch.bind(f.db);let calls=0;f.db.batch=async items=>{if(++calls===2)assert.equal(f.oldAdvance(),1);return batch(items);};
  await assert.rejects(applyIncidentRecovery(f.db,plan,{at:500}),/malformed JSON/);
  assert.equal(f.dump('process_snapshot_transfers')[0].version,19);assert.equal(f.dump('process_snapshot_transfers')[0].verify_cursor,288);assert.equal(f.dump('process_import_native_requests')[0].state,'running');assert.equal(f.dump('process_import_budget')[0].state,'open');
 }finally{f.close();}
});
void test('later statement failure rolls back transfer fence/request/budget together',async()=>{
 const f=fixture();try{const plan=await planIncidentRecovery(f.db),before=['process_snapshot_transfers','process_import_budget','process_import_native_requests','process_import_attempts'].map(t=>f.dump(t));f.sqlite.exec("CREATE TRIGGER synthetic_fail BEFORE UPDATE ON process_import_attempts BEGIN SELECT RAISE(ABORT,'SYNTHETIC_LATE_CAS_FAILURE'); END");
 await assert.rejects(applyIncidentRecovery(f.db,plan,{at:500}),/SYNTHETIC_LATE_CAS_FAILURE/);assert.deepEqual(['process_snapshot_transfers','process_import_budget','process_import_native_requests','process_import_attempts'].map(t=>f.dump(t)),before);
 }finally{f.close();}
});
for(const [name,sql]of Object.entries({pins:"UPDATE process_snapshot_transfers SET target='wrong'",state:"UPDATE process_import_native_requests SET state='unknown'",cursor:'UPDATE process_snapshot_transfers SET verify_cursor=288',request:"UPDATE process_import_native_requests SET request_sha256='bad'",operations:"UPDATE process_import_native_operations SET state='pending' WHERE ordinal=11",accounting:'UPDATE process_import_budget SET db_statements=db_statements+1'}))void test('wrong or changed '+name+' refuses recovery without mutation',async()=>{
 const f=fixture();try{const plan=await planIncidentRecovery(f.db);f.sqlite.exec(sql);const before=['process_snapshot_transfers','process_import_budget','process_import_native_requests'].map(t=>f.dump(t));await assert.rejects(applyIncidentRecovery(f.db,plan,{at:500}),/PRECONDITION/);assert.deepEqual(['process_snapshot_transfers','process_import_budget','process_import_native_requests'].map(t=>f.dump(t)),before);}finally{f.close();}
});
void test('post-fence verify rehashes committed window; corrupt/stalled body cannot advance; no reupload',async()=>{
 // Synthetic manifest/bytes intentionally differ from real pins. This tests
 // the service's post-fence verification semantics, not online admission.
 const raw=new Uint8Array([5,6,7]),hash=await sha256(raw),id='a'.repeat(64),manifest={format:'PROCESS_OS_SNAPSHOT_V1',schemaVersion:1,direction:'site-to-isolated-local',credentialPolicy:'excluded',programCommit:'d'.repeat(40),schemaFingerprint:'e'.repeat(64),sourceRevision:{},createdAt:'2026-10-23T00:00:00Z',chunks:[]};
 // Obtain the exact contract header from an existing synthetic fixture, then
 // make a contiguous bounded resource with 1,401 tiny chunks.
 const {setup}=await import('./hosted-import-fixtures.mjs'),base=await setup({canonical:false});
 try{Object.assign(manifest,base.pack.completed);manifest.chunks=Array.from({length:1401},(_,i)=>({id:'c'+i,resource:i<3?['db/shared_state','db/state_backups','db/web_feedback_store'][i]:'r2/synthetic/window',offset:i<3?0:(i-3)*3,totalBytes:i<3?3:1398*3,bytes:3,sha256:hash,metadata:{}}));
 const mbytes=encode(manifest),mhash=await sha256(mbytes),config={enabled:true,projectId:incident.projectId,targetFingerprint:incident.targetFingerprint,manifestSha256:mhash,ownerId:'frank'},actor={id:'frank',role:'admin',sessionType:'platform',exportAllowed:true};let version=19,cursor=272,bad=true,stall=false,cancellations=0,advance=0;const reads=[];
 const store={get:async()=>({id,project_id:config.projectId,target:config.targetFingerprint,manifest_sha:mhash,manifest_key:'manifest',owner_id:'frank',phase:'receiving',version,verify_cursor:cursor,chunk_count:1401,expires_at:Date.now()+10000}),receivedCount:async()=>1401,chunk:async(_id,c)=>({sequence:Number(c.slice(1)),bytes:3,sha256:hash}),advance:async(_id,v,end)=>{assert.equal(v,19);advance++;version++;cursor=end;return true;}};
 const bucket={get:async key=>{if(key==='manifest')return{size:mbytes.length,body:new Blob([mbytes]).stream()};const c=key.split('/').at(-1);reads.push(c);return{size:3,body:stall&&c==='c280'?stalled(()=>cancellations++):new Blob([bad&&c==='c280'?new Uint8Array([0,0,0]):raw]).stream()};},put(){assert.fail('verification must not upload');}};
 const service=createHostedTransfer({store,bucket,config,bodyTimeoutMs:25});await assert.rejects(service.verify(actor,id,{expectedVersion:19,limit:16}),/INTEGRITY/);assert.equal(cursor,272);assert.equal(advance,0);bad=false;stall=true;
 await assert.rejects(service.verify(actor,id,{expectedVersion:19,limit:16}),/IMPORT_BODY_TIMEOUT/);assert.equal(cursor,272);assert.equal(advance,0);assert.equal(cancellations,1);stall=false;reads.length=0;
 await service.verify(actor,id,{expectedVersion:19,limit:16});assert.deepEqual(reads,Array.from({length:16},(_,i)=>'c'+(272+i)));assert.equal(cursor,288);assert.equal(advance,1);
 }finally{await base.close();}
});
