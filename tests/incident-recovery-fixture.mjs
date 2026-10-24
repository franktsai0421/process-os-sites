// Test-only synthetic metadata. Never imported by application code.
import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';
import {d1,fakeR2} from './hosted-import-fixtures.mjs';
import {incident} from '../scripts/verify-recovery-20261023.mjs';
import {credentialDigest} from '../lib/snapshot-native-capability.mjs';
import {sha256} from '../lib/snapshot-contract.mjs';
import {attemptCeilings,validateAttemptPolicy} from '../lib/snapshot-attempt-policy.mjs';
import {createIncidentRecoveryRuntime} from '../lib/snapshot-incident-recovery.mjs';
import {createNativeImportHandler} from '../lib/snapshot-native-handler.mjs';
export async function seedIncidentMetadata(db,{time,programCommit='a'.repeat(40)}={}){
 const pins=Object.fromEntries(['projectId','origin','ownerId','targetFingerprint','manifestSha256','transferId'].map(k=>[k,incident[k]]));
 const maintenanceToken=Buffer.alloc(32,3).toString('base64url'),applicationToken=Buffer.alloc(32,4).toString('base64url'),oldToken='s'.repeat(43),md=await credentialDigest(maintenanceToken),gd=await credentialDigest(applicationToken);
 const config={format:'PROCESS_OS_INCIDENT_RECOVERY_V1',programCommit,maintenance:{id:'im_'+md.slice(0,32),credentialSha256:md,issuedAt:time,expiresAt:time+600000,receiptExpiresAt:time+18000000},grant:{id:'ic_'+gd.slice(0,32),credentialSha256:gd,ownerEpoch:0,issuedAt:time,writeExpiresAt:time+14400000,receiptExpiresAt:time+18000000,requestLimit:1000,operationLimit:20000}};
 const policy=validateAttemptPolicy({mode:'bounded-attempt',capacityKnown:false,approvalId:'synthetic-incident-recovery',...Object.fromEntries(['projectId','origin','ownerId','targetFingerprint','manifestSha256'].map(k=>[k,pins[k]])),issuedAt:new Date(time-1000).toISOString(),expiresAt:new Date(time+86400000).toISOString(),...attemptCeilings},pins,time),text=JSON.stringify(policy);
 const insert=(table,v)=>{const k=Object.keys(v);return db.prepare(`INSERT INTO ${table}(${k.map(c=>'"'+c+'"').join(',')}) VALUES(${k.map(()=>'?')})`).bind(...Object.values(v));};
 await db.batch([
  insert('shared_state',{id:1,revision:7,values:JSON.stringify({maintenanceMode:'1',platformUsers:JSON.stringify([{id:'frank',role:'admin',enabled:true,authEpoch:0,passwordHash:'SYNTHETIC_OWNER_ONLY'}])}),updated_at:'synthetic-incident'}),
  insert('process_snapshot_transfers',{id:incident.transferId,project_id:incident.projectId,target:incident.targetFingerprint,manifest_sha:incident.manifestSha256,manifest_key:'process-import/v1/'+incident.transferId+'/manifest.json',owner_id:'frank',phase:'receiving',version:18,verify_cursor:272,chunk_count:1401,total_bytes:incident.bytes,created_at:time-1000,expires_at:time+86400000}),
  insert('process_snapshot_target',{id:1,target:incident.targetFingerprint,transfer_id:incident.transferId}),
  insert('process_import_budget',{id:1,policy_sha:await sha256(new TextEncoder().encode(text)),policy:text,state:'open',active_request:incident.requestId,reason:null,write_bytes:276216440,write_calls:1402,requests:157,db_bytes:7654321,db_statements:9461}),
  insert('process_import_attempts',{id:incident.requestId,action:'verify',state:'running',created_at:time-1000}),
  insert('process_import_native_requests',{capability_id:incident.capabilityId,nonce:incident.nonce,request_sha256:incident.requestSha256,request_id:incident.requestId,action:'verify',generation:1,state:'running',created_at:time-1000,finalized_at:null,reason:null}),
  insert('process_import_capabilities',{id:incident.capabilityId,credential_sha256:await credentialDigest(oldToken),pins:JSON.stringify(pins),scope:'staging',owner_epoch:0,generation:1,reserved_operations:1914,issued_at:time-3600000,write_expires_at:time+3600000,receipt_expires_at:time+7200000}),
  db.prepare("WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<1400) INSERT INTO process_snapshot_chunks(transfer_id,chunk_id,sequence,bytes,sha256) SELECT ?,'c'||i,i,CASE WHEN i=1400 THEN ? ELSE 196692 END,? FROM n").bind(incident.transferId,incident.bytes-196692*1400,'c'.repeat(64)),
  db.prepare("WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<11) INSERT INTO process_import_native_operations(request_id,ordinal,kind,object_key,generation,state,admitted_at,finalized_at,evidence) SELECT ?,i,'r2-get',?||i,1,'succeeded',10,11,'provider-read-response' FROM n").bind(incident.requestId,'process-import/v1/'+incident.transferId+'/chunks/c'),
 ]);
 const readOwnerEligibility=async()=>{const r=await db.prepare('SELECT revision,"values" v,updated_at FROM shared_state WHERE id=1').first(),u=r&&JSON.parse(JSON.parse(r.v).platformUsers)[0];return u?{id:u.id,enabled:u.enabled!==false,role:u.role,exportAllowed:u.role==='admin',authEpoch:u.authEpoch,revision:r.revision,updatedAt:r.updated_at}:null;};
 return{pins,config,policy,maintenanceToken,applicationToken,oldToken,readOwnerEligibility};
}
export async function incidentFixture({time=1800000000000,programCommit='a'.repeat(40)}={}){
 const sqlite=new DatabaseSync(':memory:');for(const name of fs.readdirSync(new URL('../drizzle-sites-fresh/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle-sites-fresh/'+name,import.meta.url),'utf8'));
 const raw=d1(sqlite);let queue=Promise.resolve(),clock=time;const db={prepare:s=>raw.prepare(s),batch(items){const result=queue.then(()=>raw.batch(items));queue=result.catch(()=>{});return result;}};
 const meta=await seedIncidentMetadata(db,{time:clock,programCommit}),bucket=fakeR2();
 const runtime=await createIncidentRecoveryRuntime({db,config:meta.config,programCommit:meta.config.programCommit,projectId:incident.projectId,origin:incident.origin,bindingsPins:meta.pins,readOwnerEligibility:meta.readOwnerEligibility,now:()=>clock});
 const native=createNativeImportHandler({enabled:true,db,bucket,pins:meta.pins,policy:meta.policy,readOwnerEligibility:meta.readOwnerEligibility,recovery:runtime,bootstrapClosed:true,now:()=>clock});let serial=0;
 async function request(action,{method='GET',body,token=meta.maintenanceToken,headers={}}={}){return runtime.handle(new Request(incident.origin+'/api/snapshots/import?action='+action,{method,headers:{Authorization:'Bearer '+meta.config.maintenance.id+'.'+token,Origin:incident.origin,...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}));}
 async function step(action,planSha256){return request(action,{method:'POST',body:{nonce:'10000000-0000-4000-8000-'+String(++serial).padStart(12,'0'),planSha256}});}
 async function advanceTo(stage){await request('incident-register',{method:'POST'});const hold=await(await request('incident-plan')).json();if(stage==='registered')return hold;const h=await step('incident-hold',hold.planSha256);if(h.status!==200)throw Error('FIXTURE_HOLD');const next=await(await request('incident-plan')).json();if(stage==='held')return next;const m=await step('incident-maintenance',next.planSha256);if(m.status!==200)throw Error('FIXTURE_MAINTENANCE');if(stage==='maintenance')return next;const r=await step('incident-resume',next.planSha256);if(r.status!==200)throw Error('FIXTURE_RESUME');return next;}
 return{...meta,db,sqlite,bucket,runtime,native,request,step,advanceTo,now:()=>clock,setTime:v=>clock=v,close:()=>sqlite.close()};
}
