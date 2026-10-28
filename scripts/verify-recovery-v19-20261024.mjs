// Fixed-incident transaction primitive. Authentication and immediate dispatch
// live in snapshot-v19-recovery.mjs; importing this file executes nothing.
import {incident as previous,incidentRecoveryShape} from './verify-recovery-20261023.mjs';
import {incidentVerifyRecord,incidentVerifyScope,nativeRequestHash} from '../lib/snapshot-native-capability.mjs';
import {sha256} from '../lib/snapshot-contract.mjs';
const fail=v=>{if(!v)throw Error('IMPORT_V19_RECOVERY_PRECONDITION');};
const hash=v=>sha256(new TextEncoder().encode(JSON.stringify(v)));
export const v19=Object.freeze({...previous,version:19,requestId:'787e1f35-5e06-4db9-a9f9-cc5fc61b8670',capabilityId:'ic_5de30c8b8ec5524a4ccbe71b4e405e17',nonce:'9517c2ec-3e4b-4590-97a7-2b4889fbbac9',requestSha256:'7545c9f10691d093183e35a3e6faaa077737db42251c3c5574cdd49520087257'});
const pins=Object.fromEntries(['projectId','origin','ownerId','targetFingerprint','manifestSha256','transferId'].map(k=>[k,v19[k]]));
const digestPattern=/^[a-f0-9]{64}$/,noncePattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const grantColumns=['id','credential_sha256','pins','scope','owner_epoch','generation','request_limit','operation_limit','reserved_operations','baseline_cursor','baseline_checked','baseline_receipts','baseline_chunks','baseline_version','baseline_verified','hold_plan_sha','resume_plan_sha','program_commit','issued_at','write_expires_at','receipt_expires_at','revoked_at'];
const original=incidentRecoveryShape().tables;
const tables={transfer:original.transfer,target:original.target,budget:original.budget,
 request:{...original.request,args:[v19.requestId]},attempt:{...original.attempt,args:[v19.requestId]},
 grant:{table:'process_import_verify_capabilities',where:'id=?',args:[v19.capabilityId],columns:grantColumns},
 maintenance:{table:'process_import_verify_maintenance',where:'id=1',args:[],columns:['id','capability_id','credential_sha256','config_sha','issued_at','expires_at','receipt_expires_at','stage','active_nonce','receipts','admitted','hold_plan','resume_plan','held_at']}};
const opColumns=['request_id','ordinal','kind','object_key','expected_bytes','expected_sha256','generation','state','admitted_at','finalized_at','evidence'];
// Receipt shape retained for primitive consumers; formal migration 0008 also
// installs a distinct, nonresettable admission record for ambiguous requests.
export const v19ReceiptSchema=`CREATE TABLE process_import_verify_v19_supersession (
 id INTEGER PRIMARY KEY CHECK(id=1), nonce TEXT NOT NULL UNIQUE, plan_sha TEXT NOT NULL,
 before_sha TEXT NOT NULL, before_image TEXT NOT NULL, old_request_id TEXT NOT NULL,
 new_grant_id TEXT NOT NULL UNIQUE, program_commit TEXT NOT NULL,
 maintenance_digest TEXT NOT NULL, applied_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state='resumed'))`;
export async function proveV19(){
 const url=new URL('/api/snapshots/import',v19.origin);for(const[k,x]of Object.entries({id:v19.transferId,action:'verify',version:19}))url.searchParams.set(k,String(x));
 fail(await nativeRequestHash({method:'POST',url:url.href,body:new Uint8Array(),pins})===v19.requestSha256);
 return{capturedVersion:19,requestSha256:v19.requestSha256};
}
function fixed(s){
 const t=s.transfer,b=s.budget,r=s.request,g=s.grant,m=s.maintenance;
 fail(t.id===v19.transferId&&t.project_id===v19.projectId&&t.target===v19.targetFingerprint&&t.manifest_sha===v19.manifestSha256&&t.manifest_key==='process-import/v1/'+v19.transferId+'/manifest.json'&&t.owner_id==='frank'&&t.phase==='receiving'&&t.version===19&&t.verify_cursor===272&&t.chunk_count===1401&&t.total_bytes===v19.bytes);
 fail(s.target.target===v19.targetFingerprint&&s.target.transfer_id===v19.transferId);
 fail(b.state==='stopped'&&b.active_request===v19.requestId&&b.reason==='IMPORT_ATTEMPT_PROVIDER_OR_UNCERTAIN');
 fail(r.request_id===v19.requestId&&r.capability_id===v19.capabilityId&&r.nonce===v19.nonce&&r.request_sha256===v19.requestSha256&&r.action==='verify'&&r.generation===1&&r.state==='unknown'&&r.reason==='request-incomplete-or-provider-uncertain'&&Number.isSafeInteger(r.finalized_at));
 fail(s.attempt.id===v19.requestId&&s.attempt.action==='verify'&&s.attempt.state==='stopped');
 fail(g.id===v19.capabilityId&&g.id==='ic_'+g.credential_sha256.slice(0,32)&&g.scope===incidentVerifyScope&&g.generation===1&&g.revoked_at===null&&g.reserved_operations===3&&g.baseline_version===19&&g.baseline_verified===0&&g.baseline_checked===0&&g.baseline_cursor===0&&g.baseline_receipts===1401&&g.baseline_chunks===1401&&g.owner_epoch===0);
 const gp=JSON.parse(g.pins);fail(Object.keys(gp).sort().join()===Object.keys(pins).sort().join()&&Object.keys(pins).every(k=>gp[k]===pins[k]));
 fail(m.stage==='resumed'&&m.active_nonce===null&&m.admitted===3&&JSON.parse(m.receipts).length===3);
 fail(s.operations.length===3&&s.operations.every((o,i)=>o.request_id===v19.requestId&&o.ordinal===i+1&&o.kind==='r2-get'&&o.generation===1&&o.expected_bytes===null&&o.expected_sha256===null&&o.state===(i===2?'unknown':'succeeded')&&o.object_key==='process-import/v1/'+v19.transferId+'/'+['manifest.json','chunks/c272','chunks/c273'][i]));
 fail(s.operations[0].evidence==='provider-body-sha256:'+v19.manifestSha256&&s.operations[1].evidence==='provider-body-sha256:36102900dbb1078dc5c6f8007b404bf3757a03a74e3b1dcb354f3dcb4fc8c94b'&&s.operations[2].evidence==='provider-or-receipt-uncertain');
}
async function capture(db){
 const specs=Object.values(tables),res=await db.batch([...specs.map(t=>db.prepare(`SELECT ${t.columns.join(',')} FROM ${t.table} WHERE ${t.where}`).bind(...t.args)),
 db.prepare(`SELECT ${opColumns.join(',')} FROM process_import_native_operations WHERE request_id=? ORDER BY ordinal LIMIT 4`).bind(v19.requestId),
 db.prepare('SELECT COUNT(*) n,SUM(bytes) bytes FROM process_snapshot_chunks WHERE transfer_id=?').bind(v19.transferId),
 db.prepare('SELECT COUNT(*) n FROM process_snapshot_activations WHERE transfer_id=?').bind(v19.transferId)]);
 fail(res.length===specs.length+3&&res.every(x=>x.success));const s={};Object.keys(tables).forEach((k,i)=>{fail(res[i].results.length===1);s[k]={...res[i].results[0]};});s.operations=res[specs.length].results.map(x=>({...x}));
 fail(res[specs.length+1].results[0].n===1401&&res[specs.length+1].results[0].bytes===v19.bytes&&res[specs.length+2].results[0].n===0);fixed(s);return s;
}
function normalizedGrant(g){const r=incidentVerifyRecord(g);fail(r.id!==v19.capabilityId&&r.id==='ic_'+r.credential_sha256.slice(0,32));return{...r,baseline_receipts:1401,baseline_chunks:1401,baseline_version:19};}
async function valid(plan){
 fail(plan?.format==='PROCESS_OS_V19_SUPERSESSION_LOCAL_V1'&&plan.liveReady===false);const{planSha256,liveReady:_liveReady,...body}=plan;fail(await hash(body)===planSha256&&await hash(plan.snapshot)===plan.beforeSha256);fixed(plan.snapshot);
 fail(/^[a-f0-9]{40}$/.test(plan.programCommit)&&!/^0+$/.test(plan.programCommit)&&noncePattern.test(plan.nonce));
 const m=plan.maintenance;fail(digestPattern.test(m?.credentialSha256||'')&&Number.isSafeInteger(m.issuedAt)&&m.issuedAt>=0&&m.expiresAt===m.issuedAt+600000);
 const g=plan.newGrant,n=normalizedGrant({id:g.id,credentialSha256:g.credential_sha256,pins,ownerEpoch:g.owner_epoch,issuedAt:g.issued_at,writeExpiresAt:g.write_expires_at,receiptExpiresAt:g.receipt_expires_at,requestLimit:g.request_limit,operationLimit:g.operation_limit});
 fail(JSON.stringify(n)===JSON.stringify(g)&&g.issued_at===m.issuedAt&&g.credential_sha256!==m.credentialSha256&&g.credential_sha256!==plan.snapshot.grant.credential_sha256);
}
export async function planV19Recovery(db,{newGrant,programCommit,maintenance,nonce}){
 await proveV19();const s=await capture(db),g=normalizedGrant({...newGrant,pins});
 fail(!(await db.prepare('SELECT id FROM process_import_verify_v19_supersession WHERE id=1').first()));
 const body={format:'PROCESS_OS_V19_SUPERSESSION_LOCAL_V1',programCommit,maintenance,nonce,beforeSha256:await hash(s),snapshot:s,newGrant:g};const plan={...body,planSha256:await hash(body),liveReady:false};await valid(plan);return plan;
}
const assertion=c=>`SELECT json(CASE WHEN (${c}) THEN 'true' ELSE 'IMPORT_V19_RECOVERY_CAS' END)`;
function guards(db,s){const out=[];for(const[k,t]of Object.entries(tables))out.push(db.prepare(assertion(`EXISTS(SELECT 1 FROM ${t.table} WHERE ${t.where} AND ${t.columns.map(c=>c+' IS ?').join(' AND ')})`)).bind(...t.args,...t.columns.map(c=>s[k][c])));
 out.push(db.prepare(assertion('(SELECT COUNT(*) FROM process_import_native_operations WHERE request_id=?)=3')).bind(v19.requestId));for(const o of s.operations)out.push(db.prepare(assertion(`EXISTS(SELECT 1 FROM process_import_native_operations WHERE ${opColumns.map(c=>c+' IS ?').join(' AND ')})`)).bind(...opColumns.map(c=>o[c])));
 out.push(db.prepare(assertion('(SELECT COUNT(*) FROM process_snapshot_chunks WHERE transfer_id=?)=1401 AND (SELECT SUM(bytes) FROM process_snapshot_chunks WHERE transfer_id=?)=? AND NOT EXISTS(SELECT 1 FROM process_snapshot_activations WHERE transfer_id=?)')).bind(v19.transferId,v19.transferId,v19.bytes,v19.transferId));return out;}
// Only the authenticated server caller may supply the validated config.
// This builder does NOT authenticate a bearer and must not be exposed directly.
export async function buildV19RecoveryBatch(db,plan,{now=()=>Date.now(),readOwnerEligibility}){
 await valid(plan);fail(typeof readOwnerEligibility==='function');const m=plan.maintenance,g=plan.newGrant;
 fail(await hash(await capture(db))===plan.beforeSha256);const owner=await readOwnerEligibility(),at=now();
 fail(owner?.id==='frank'&&owner.enabled===true&&owner.role==='admin'&&owner.exportAllowed===true&&owner.authEpoch===0&&Number.isSafeInteger(owner.revision)&&typeof owner.updatedAt==='string');
 fail(Number.isSafeInteger(at)&&at>=m.issuedAt&&at<m.expiresAt&&at<g.write_expires_at);
 const out=guards(db,plan.snapshot),update=(sql,args)=>out.push(db.prepare(sql).bind(...args),db.prepare(assertion('changes()=1')));
 out.push(db.prepare(assertion('NOT EXISTS(SELECT 1 FROM process_import_verify_v19_supersession WHERE id=1) AND NOT EXISTS(SELECT 1 FROM process_import_verify_capabilities WHERE id=?) AND NOT EXISTS(SELECT 1 FROM process_import_capabilities WHERE id=?)')).bind(g.id,g.id));
 out.push(db.prepare(assertion('?>=? AND ?<? AND EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=? AND updated_at=?)')).bind(at,m.issuedAt,at,m.expiresAt,owner.revision,owner.updatedAt));
 update("UPDATE process_snapshot_transfers SET version=20 WHERE id=? AND version=19 AND verify_cursor=272 AND phase='receiving'",[v19.transferId]);
 update('UPDATE process_import_verify_capabilities SET revoked_at=?,generation=generation+1 WHERE id=? AND generation=1 AND revoked_at IS NULL',[at,v19.capabilityId]);
 const stored={...g,hold_plan_sha:plan.beforeSha256,resume_plan_sha:plan.planSha256,program_commit:plan.programCommit},columns=Object.keys(stored);
 update(`INSERT INTO process_import_verify_capabilities(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`,Object.values(stored));
 update("INSERT INTO process_import_verify_v19_supersession(id,nonce,plan_sha,before_sha,before_image,old_request_id,new_grant_id,program_commit,maintenance_digest,applied_at,state) VALUES(1,?,?,?,?,?,?,?,?,?,'resumed')",[plan.nonce,plan.planSha256,plan.beforeSha256,JSON.stringify(plan.snapshot),v19.requestId,g.id,plan.programCommit,m.credentialSha256,at]);
 update("UPDATE process_import_budget SET state='open',active_request=NULL,reason=? WHERE id=1 AND state='stopped' AND active_request=? AND reason='IMPORT_ATTEMPT_PROVIDER_OR_UNCERTAIN'",['IMPORT_V19_VERIFY_ONLY:'+plan.planSha256,v19.requestId]);
 // Original request, operations, attempts, consumed maintenance, cursor, chunk
 // receipts and every charge remain untouched. No R2/provider operation occurs.
 return out;
}
export async function readV19RecoveryReceipt(db,plan){
 await valid(plan);const r=await db.prepare('SELECT * FROM process_import_verify_v19_supersession WHERE id=1').first();
 if(!r)return{state:'not-confirmed',automaticRetryAllowed:false};
 fail(r.nonce===plan.nonce&&r.plan_sha===plan.planSha256&&r.before_sha===plan.beforeSha256&&r.before_image===JSON.stringify(plan.snapshot)&&r.old_request_id===v19.requestId&&r.new_grant_id===plan.newGrant.id&&r.program_commit===plan.programCommit&&r.state==='resumed');
 return{state:'resumed-receipt',planSha256:r.plan_sha,appliedAt:r.applied_at,automaticRetryAllowed:false};
}
// Callback for the existing restricted authority, selected only in v19 mode.
// The authority still enforces credential, expiry/revocation, owner and generation.
export async function checkV19Continuation(db,plan,grant,access='write'){
 await valid(plan);fail(['write','receipt'].includes(access));const receipt=await readV19RecoveryReceipt(db,plan);fail(receipt.state==='resumed-receipt');
 const expected={...plan.newGrant,hold_plan_sha:plan.beforeSha256,resume_plan_sha:plan.planSha256,program_commit:plan.programCommit};
 for(const k of Object.keys(expected))if(!['reserved_operations'].includes(k))fail(grant[k]===expected[k]);
 fail(grant.scope===incidentVerifyScope&&grant.revoked_at===null&&grant.generation===1);
 const [t,b,old,r]=await Promise.all([db.prepare('SELECT * FROM process_snapshot_transfers WHERE id=?').bind(v19.transferId).first(),db.prepare('SELECT * FROM process_import_budget WHERE id=1').first(),db.prepare('SELECT generation,revoked_at FROM process_import_verify_capabilities WHERE id=?').bind(v19.capabilityId).first(),db.prepare('SELECT * FROM process_import_native_requests WHERE request_id=?').bind(v19.requestId).first()]);
 fail(old?.generation===2&&old.revoked_at===receipt.appliedAt&&JSON.stringify(r)===JSON.stringify(plan.snapshot.request));
 fail(t?.project_id===v19.projectId&&t.target===v19.targetFingerprint&&t.manifest_sha===v19.manifestSha256&&t.owner_id==='frank'&&t.chunk_count===1401);
 fail(b?.policy_sha===plan.snapshot.budget.policy_sha&&(access==='receipt'?['open','stopped'].includes(b.state):b.state==='open'&&b.reason==='IMPORT_V19_VERIFY_ONLY:'+plan.planSha256));
 if(access==='write')fail(t.verify_cursor>=272&&t.verify_cursor<=1401&&t.version===20+Math.ceil((t.verify_cursor-272)/16)&&t.phase===(t.verify_cursor===1401?'integrity-verified':'receiving'));
 return{cursor:t.verify_cursor,version:t.version,uploadAllowed:false,baselineVerified:false};
}
