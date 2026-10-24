// Synthetic operational rows only; never opens a live DB or reads real payloads.
import {c273Case as C} from '../lib/snapshot-c273-observation.mjs';
export const observationPins=Object.fromEntries(['projectId','origin','ownerId','targetFingerprint','manifestSha256','transferId'].map(k=>[k,C[k]]));
export const observationOwner={id:'frank',enabled:true,role:'admin',exportAllowed:true,authEpoch:0,revision:0,updatedAt:'synthetic-observation'};
export async function seedObservationCase(db,values={}){
 await db.batch([
  db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,0,?,?)').bind(JSON.stringify(values),'synthetic-observation'),
  db.prepare('INSERT INTO process_snapshot_transfers(id,project_id,target,manifest_sha,manifest_key,owner_id,phase,version,verify_cursor,chunk_count,total_bytes,created_at,expires_at) VALUES(?,?,?,?,?,?,?,19,272,1401,275566702,0,9999999999999)').bind(C.transferId,C.projectId,C.targetFingerprint,C.manifestSha256,'process-import/v1/'+C.transferId+'/manifest.json','frank','receiving'),
  db.prepare("INSERT INTO process_import_budget(id,policy_sha,policy,state,active_request,reason,write_bytes,write_calls,requests,db_bytes,db_statements) VALUES(1,?,'{}','stopped',?,'IMPORT_ATTEMPT_PROVIDER_OR_UNCERTAIN',276216440,1402,158,2271529,9476)").bind(C.policySha256,C.requestId),
  db.prepare("INSERT INTO process_import_native_requests(capability_id,nonce,request_sha256,request_id,action,generation,state,created_at,finalized_at,reason) VALUES(?,?,?,?,'verify',1,'unknown',1792807686316,1792807703351,'request-incomplete-or-provider-uncertain')").bind(C.capabilityId,C.nonce,C.requestSha256,C.requestId),
  ...[1,2,3].map(ordinal=>db.prepare('INSERT INTO process_import_native_operations(request_id,ordinal,kind,object_key,generation,state,admitted_at,finalized_at,evidence) VALUES(?,?,?,?,1,?,?,?,?)').bind(C.requestId,ordinal,'r2-get','process-import/v1/'+C.transferId+'/'+(ordinal===1?'manifest.json':ordinal===2?'chunks/c272':'chunks/c273'),ordinal===3?'unknown':'succeeded',ordinal===3?1792807701395:0,ordinal===3?1792807703103:1,ordinal===3?'provider-or-receipt-uncertain':'provider-body-sha256:'+(ordinal===1?C.manifestSha256:'36102900dbb1078dc5c6f8007b404bf3757a03a74e3b1dcb354f3dcb4fc8c94b'))),
  db.prepare('INSERT INTO process_snapshot_chunks(transfer_id,chunk_id,sequence,bytes,sha256) VALUES(?,?,273,?,?)').bind(C.transferId,'c273',C.bytes,C.sha256),
 ]);
}
