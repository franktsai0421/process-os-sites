// Default-off HTTP adapter. No ambient user identity, signing secret or SQL API.
import {capabilityRecord,credentialMatches,createNativeAuthority,nativeRequestHash,nativePinsText} from './snapshot-native-capability.mjs';
import {createNativeIntentLedger,nativeOperationLimits} from './snapshot-native-intents.mjs';
import {createAttemptBudget} from './snapshot-attempt-budget.mjs';
import {dispatchHostedImport} from './snapshot-import-dispatch.mjs';
import {readImportBody} from './snapshot-hosted-transfer.mjs';
import {decodeBatchBody,batchType,batchGzipType,maximumBatchBytes} from './snapshot-batch.mjs';
import {sha256} from './snapshot-contract.mjs';
import {validateAttemptPolicy} from './snapshot-attempt-policy.mjs';
const fail=(v,c)=>{if(!v)throw Error(c);};
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
/** @typedef {{id:string,credentialSha256:string,ownerEpoch:number,issuedAt:number,writeExpiresAt:number,receiptExpiresAt:number,requestLimit?:number,operationLimit?:number}} NativeGrantTemplate */
export function createNativeImportHandler({enabled=false,db,bucket,pins,policy,readOwnerEligibility,grantTemplate=/** @type {string | NativeGrantTemplate | null} */(null),bootstrapClosed=true,now=()=>Date.now(),recovery=/** @type {Awaited<ReturnType<typeof import('./snapshot-incident-recovery.mjs').createIncidentRecoveryRuntime>> | null} */(null)}){
 if(!enabled)return{handle:async()=>reply({error:'IMPORT_NATIVE_DISABLED'},404)};
 nativePinsText(pins);const authority=recovery?.authority||createNativeAuthority({db,pins,readOwnerEligibility,now});
 const configuredPolicy=()=>typeof policy==='string'?JSON.parse(policy):policy;
 async function transfer(){const r=await db.prepare('SELECT * FROM process_snapshot_transfers WHERE id=?').bind(pins.transferId).first();fail(r&&r.project_id===pins.projectId&&r.target===pins.targetFingerprint&&r.manifest_sha===pins.manifestSha256&&r.owner_id===pins.ownerId,'IMPORT_NATIVE_PINS');return r;}
 async function budgetStatus(){const r=await db.prepare('SELECT state,active_request,reason,write_bytes,write_calls,requests,db_bytes,db_statements FROM process_import_budget WHERE id=1').first();return r?{mode:'bounded-attempt',capacityKnown:false,state:r.state,inFlight:!!r.active_request,reason:r.reason,used:{writeBytes:r.write_bytes,writeCalls:r.write_calls,requests:r.requests,dbBytes:r.db_bytes,dbStatements:r.db_statements}}:null;}
 async function register(capabilityId,token){
  fail(grantTemplate&&bootstrapClosed,'IMPORT_NATIVE_REGISTRATION_DISABLED');const configured=typeof grantTemplate==='string'?JSON.parse(grantTemplate):grantTemplate,record=capabilityRecord({...configured,pins});
  fail(record.id===capabilityId&&await credentialMatches(token,record.credential_sha256),'IMPORT_NATIVE_CREDENTIAL');fail(now()>=record.issued_at&&now()<record.write_expires_at,'IMPORT_NATIVE_EXPIRED');
  const owner=await readOwnerEligibility();fail(owner&&owner.id===pins.ownerId&&owner.enabled===true&&owner.role==='admin'&&owner.exportAllowed===true&&owner.authEpoch===record.owner_epoch,'IMPORT_NATIVE_OWNER_CHANGED');const target=await transfer(),count=await db.prepare('SELECT COUNT(*) n FROM process_snapshot_chunks WHERE transfer_id=?').bind(pins.transferId).first();
  const initial={...record,baseline_receipts:count.n,baseline_chunks:target.chunk_count,baseline_version:target.version};
  const columns=Object.keys(initial);const inserted=await db.prepare('INSERT INTO process_import_capabilities('+columns.join(',')+') SELECT '+columns.map(()=>'?').join(',')+' WHERE EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=? AND updated_at=?) AND EXISTS(SELECT 1 FROM process_snapshot_transfers WHERE id=? AND version=? AND chunk_count=?) AND (SELECT COUNT(*) FROM process_snapshot_chunks WHERE transfer_id=?)=? ON CONFLICT(id) DO NOTHING').bind(...Object.values(initial),owner.revision,owner.updatedAt,pins.transferId,target.version,target.chunk_count,pins.transferId,count.n).run();fail(inserted.success,'IMPORT_NATIVE_REGISTRATION_UNCERTAIN');
  // Existing revoked/expired records are never updated or resurrected.
  const handle=await authority.authenticate({capabilityId,token}),{grant}=await authority.inspect(handle);for(const key of ['id','credential_sha256','pins','scope','owner_epoch','issued_at','write_expires_at','receipt_expires_at','request_limit','operation_limit'])fail(grant[key]===record[key],'IMPORT_NATIVE_REGISTRATION_CONFLICT');return{registered:true,capabilityId,scope:'staging',writeExpiresAt:grant.write_expires_at,receiptExpiresAt:grant.receipt_expires_at};
 }
 async function objectStatus(handle,capabilityId,nonce,ordinal){
  fail(Number.isSafeInteger(ordinal)&&ordinal>=1&&ordinal<=nativeOperationLimits.perRequest,'IMPORT_NATIVE_RECEIPT_CURSOR');await authority.inspect(handle,'receipt');
  const op=await db.prepare('SELECT o.* FROM process_import_native_operations o JOIN process_import_native_requests r ON r.request_id=o.request_id WHERE r.capability_id=? AND r.nonce=? AND o.ordinal=?').bind(capabilityId,nonce,ordinal).first();
  fail(op&&op.kind==='r2-put'&&new RegExp('^process-import/v1/'+pins.transferId+'/chunks/c(?:0|[1-9][0-9]*)$').test(op.object_key)&&op.expected_bytes>0&&op.expected_bytes<=1024*1024,'IMPORT_NATIVE_OBJECT_SCOPE');
  const {grant,owner}=await authority.inspect(handle,'receipt');const charged=await db.prepare('UPDATE process_import_capabilities SET reserved_operations=reserved_operations+1 WHERE id=? AND generation=? AND revoked_at IS NULL AND receipt_expires_at>? AND reserved_operations<operation_limit AND EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=? AND updated_at=?)').bind(capabilityId,grant.generation,now(),owner.revision,owner.updatedAt).run();fail(charged.success&&charged.meta.changes===1,'IMPORT_NATIVE_OPERATION_LIMIT');
  let observation='unavailable';try{await authority.inspect(handle,'receipt');const object=await bucket.get(op.object_key);if(!object)observation='missing';else if(object.size!==op.expected_bytes)observation='conflict';else{const reader=object.body?.getReader();fail(reader,'IMPORT_NATIVE_OBJECT_UNCONFIRMED');const out=new Uint8Array(op.expected_bytes);let size=0;try{for(;;){const r=await reader.read();if(r.done)break;fail(size+r.value.length<=out.length,'IMPORT_NATIVE_OBJECT_UNCONFIRMED');out.set(r.value,size);size+=r.value.length;}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}observation=size===out.length&&await sha256(out)===op.expected_sha256?'matches':'conflict';}}catch{/* Observation failure never changes an original intent to failed. */}
  return{nonce,ordinal,state:op.state,observation,originalStateUnchanged:true,businessReadOnly:true,operationalMeterUpdated:true,automaticResumeAllowed:false};
 }
 return{async handle(request){let ledger;
  try{
   const u=new URL(request.url);fail(u.origin===pins.origin&&u.pathname==='/api/snapshots/import'&&!u.hash&&!u.username&&!u.password,'IMPORT_NATIVE_PINS');
   fail(!request.headers.has('Cookie'),'IMPORT_NATIVE_MIXED_IDENTITY');
   const match=/^Bearer (ic_[a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization')||'');fail(match,'IMPORT_NATIVE_CREDENTIAL');const [,capabilityId,token]=match,action=u.searchParams.get('action')||'status';
   recovery?.authorizeAction(capabilityId,action,request.method);
   if(request.method!=='GET')fail(request.headers.get('Origin')===pins.origin&&request.headers.get('Sec-Fetch-Site')!=='cross-site','IMPORT_NATIVE_CROSS_ORIGIN');
   if(request.method==='POST'&&action==='register'){fail([...u.searchParams.keys()].join()==='action','IMPORT_NATIVE_REQUEST');if(request.body)fail((await readImportBody(request,1)).length===0,'IMPORT_NATIVE_BODY');return reply(await register(capabilityId,token));}
   const handle=await authority.authenticate({capabilityId,token,access:request.method==='GET'?'receipt':'write'});await transfer();
   let body;if(request.method==='POST')body=request.body?await readImportBody(request,action==='batch'?maximumBatchBytes:1):new Uint8Array();
   const requestSha256=await nativeRequestHash({method:request.method,url:request.url,body,pins});
   if(request.method==='POST')fail(request.headers.get('X-Process-Import-Request-SHA256')===requestSha256,'IMPORT_NATIVE_REQUEST_DIGEST');
   if(request.method==='GET'){
    if(action==='configuration'){let attempt=null;try{attempt=validateAttemptPolicy(configuredPolicy(),pins,now());}catch{/* Receipt access must not require current write-policy validity. */}const {grant}=await authority.inspect(handle,'receipt');return reply({pins,bootstrapClosed,capacity:null,attempt,budget:await budgetStatus(),nativeScope:recovery?'incident-verify-audit-only-v1':'staging',nativeOperationLimits,writeAvailable:attempt!==null&&now()<grant.write_expires_at,writeExpiresAt:grant.write_expires_at,baseline:{verified:grant.baseline_verified===1,cursor:grant.baseline_cursor,checked:grant.baseline_checked,expected:grant.baseline_receipts},...(recovery?{continuation:{version:19,cursor:272,uploadAllowed:false}}:{})});}
    if(action==='budget-status')return reply(await budgetStatus());
    if(action==='request-status'||action==='object-status'){
     const nonce=u.searchParams.get('nonce'),row=await db.prepare('SELECT request_sha256,action FROM process_import_native_requests WHERE capability_id=? AND nonce=?').bind(capabilityId,nonce).first();fail(row,'IMPORT_NATIVE_REQUEST_NOT_FOUND');
     if(action==='object-status')return reply(await objectStatus(handle,capabilityId,nonce,Number(u.searchParams.get('cursor'))));
     ledger=createNativeIntentLedger({db,authority,handle,pins,nonce,requestSha256:row.request_sha256,action:row.action,now});return reply(await ledger.receipt({cursor:Number(u.searchParams.get('cursor')||0)}));
    }
    const row=await transfer(),cursor=Number(u.searchParams.get('cursor')||0),end=Math.min(cursor+100,row.chunk_count);fail(Number.isSafeInteger(cursor)&&cursor>=0&&cursor<=row.chunk_count&&row.chunk_count<=100000,'IMPORT_NATIVE_RECEIPT_CURSOR');
    const got=await db.prepare('SELECT chunk_id FROM process_snapshot_chunks WHERE transfer_id=? AND sequence>=? AND sequence<?').bind(pins.transferId,cursor,end).all(),count=await db.prepare('SELECT COUNT(*) n FROM process_snapshot_chunks WHERE transfer_id=?').bind(pins.transferId).first();fail(got.success,'IMPORT_NATIVE_RECEIPT_UNAVAILABLE');const seen=new Set(got.results.map(r=>r.chunk_id));
    return reply({id:pins.transferId,phase:row.phase,version:row.version,chunkCount:row.chunk_count,received:count.n,verifiedCursor:row.verify_cursor,missing:Array.from({length:end-cursor},(_,i)=>'c'+(cursor+i)).filter(id=>!seen.has(id)),nextCursor:end<row.chunk_count?end:null,dataReady:false,businessTrafficEnabled:false});
   }
   fail(request.method==='POST'&&bootstrapClosed,'IMPORT_NATIVE_SCOPE');
   const {grant}=await authority.inspect(handle);if(recovery)await recovery.assertContinuation(handle,action);else if(action!=='reconcile-existing')fail(grant.baseline_verified===1,'IMPORT_NATIVE_BASELINE_REQUIRED');
   const nonce=request.headers.get('X-Process-Import-Nonce');ledger=createNativeIntentLedger({db,authority,handle,pins,nonce,requestSha256,action,now,signal:request.signal});
   if(await ledger.prior())return reply({error:'IMPORT_NATIVE_NONCE_REPLAY',receipt:await ledger.receipt()},409);
   if(action==='batch'){const type=request.headers.get('Content-Type')?.split(';')[0];fail(type===batchType||type===batchGzipType,'IMPORT_BATCH_FORMAT');body=await decodeBatchBody(body,type);}else fail(body.length===0,'IMPORT_NATIVE_BODY');
   const principal=await authority.principal(handle,action),budget=await createAttemptBudget({db,bucket,policy:configuredPolicy(),pins,now});
   const value=await dispatchHostedImport({budget,db,bucket,config:{enabled:true,...pins},principal,method:'POST',action,id:pins.transferId,expectedVersion:u.searchParams.has('version')?Number(u.searchParams.get('version')):undefined,body,cursor:0,native:ledger,signal:request.signal});return reply(recovery?{...value,receipt:await ledger.receipt(),budget:await budgetStatus()}:value);
  }catch(error){const code=/^IMPORT_[A-Z0-9_]+$/.test(error?.message||'')?error.message:'IMPORT_NATIVE_UNAVAILABLE';let receipt;if(ledger)try{receipt=await ledger.receipt();}catch{/* Do not bypass revocation/expiry to return a receipt. */}return reply({error:code,...(receipt?{receipt}:{}),automaticRetryAllowed:false},/CREDENTIAL|EXPIRED|REVOKED|FENCED|OWNER_CHANGED/.test(code)?401:/SCOPE|CROSS_ORIGIN|MIXED_IDENTITY/.test(code)?403:code==='IMPORT_NATIVE_UNAVAILABLE'?503:409);}
 }};
}
