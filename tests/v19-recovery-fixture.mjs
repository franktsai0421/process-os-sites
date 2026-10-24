// Synthetic incident only. Uses real schema/old transition; no private payloads.
import {incidentFixture} from './incident-recovery-fixture.mjs';
import {credentialDigest} from '../lib/snapshot-native-capability.mjs';
import {v19} from '../scripts/verify-recovery-v19-20261024.mjs';
export async function v19Fixture(options={}){
 const f=await incidentFixture(options);await f.advanceTo('resumed');
 f.sqlite.prepare('UPDATE process_import_verify_capabilities SET id=?,credential_sha256=?,reserved_operations=3').run(v19.capabilityId,v19.capabilityId.slice(3)+'0'.repeat(32));
 const put=(table,v)=>{const k=Object.keys(v);f.sqlite.prepare(`INSERT INTO ${table}(${k.join(',')}) VALUES(${k.map(()=>'?')})`).run(...Object.values(v));};
 put('process_import_native_requests',{capability_id:v19.capabilityId,nonce:v19.nonce,request_sha256:v19.requestSha256,request_id:v19.requestId,action:'verify',generation:1,state:'unknown',created_at:f.now()-100,finalized_at:f.now()-10,reason:'request-incomplete-or-provider-uncertain'});
 put('process_import_attempts',{id:v19.requestId,action:'verify',state:'stopped',created_at:f.now()-100});
 f.sqlite.prepare("UPDATE process_import_budget SET state='stopped',active_request=?,reason='IMPORT_ATTEMPT_PROVIDER_OR_UNCERTAIN',requests=requests+1").run(v19.requestId);
 for(let i=0;i<3;i++)put('process_import_native_operations',{request_id:v19.requestId,ordinal:i+1,kind:'r2-get',object_key:'process-import/v1/'+v19.transferId+'/'+['manifest.json','chunks/c272','chunks/c273'][i],expected_bytes:null,expected_sha256:null,generation:1,state:i===2?'unknown':'succeeded',admitted_at:f.now()-100+i,finalized_at:f.now()-10+i,evidence:i===0?'provider-body-sha256:'+v19.manifestSha256:i===1?'provider-body-sha256:36102900dbb1078dc5c6f8007b404bf3757a03a74e3b1dcb354f3dcb4fc8c94b':'provider-or-receipt-uncertain'});
 const applicationToken=Buffer.alloc(32,8).toString('base64url'),maintenanceToken=Buffer.alloc(32,9).toString('base64url'),gd=await credentialDigest(applicationToken),md=await credentialDigest(maintenanceToken),issuedAt=f.now();
 const config={format:'PROCESS_OS_V19_RECOVERY_V1',programCommit:options.programCommit||'b'.repeat(40),nonce:'30000000-0000-4000-8000-000000000019',maintenance:{id:'im_'+md.slice(0,32),credentialSha256:md,issuedAt,expiresAt:issuedAt+600000,receiptExpiresAt:issuedAt+18000000},grant:{id:'ic_'+gd.slice(0,32),credentialSha256:gd,ownerEpoch:0,issuedAt,writeExpiresAt:issuedAt+14400000,receiptExpiresAt:issuedAt+18000000,requestLimit:1000,operationLimit:20000}};
 const snapshot=()=>JSON.stringify({request:f.sqlite.prepare('SELECT * FROM process_import_native_requests WHERE request_id=?').get(v19.requestId),operations:f.sqlite.prepare('SELECT * FROM process_import_native_operations WHERE request_id=? ORDER BY ordinal').all(v19.requestId),attempt:f.sqlite.prepare('SELECT * FROM process_import_attempts WHERE id=?').get(v19.requestId),maintenance:f.sqlite.prepare('SELECT * FROM process_import_verify_maintenance').get(),charges:f.sqlite.prepare('SELECT write_bytes,write_calls,requests,db_bytes,db_statements FROM process_import_budget').get(),chunks:f.sqlite.prepare('SELECT COUNT(*) n,SUM(bytes) bytes FROM process_snapshot_chunks').get()});
 return{...f,config,applicationToken,maintenanceToken,snapshot};
}
export async function seedV19D1(db,f){
 const tables=f.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
 for(const table of tables){const rows=f.sqlite.prepare('SELECT * FROM '+table).all();for(let start=0;start<rows.length;start+=40){const batch=rows.slice(start,start+40).map(r=>{const k=Object.keys(r);return db.prepare(`INSERT INTO "${table}"(${k.map(n=>'"'+n+'"').join(',')}) VALUES(${k.map(()=>'?')})`).bind(...Object.values(r));});if(batch.length)await db.batch(batch);}}
}
