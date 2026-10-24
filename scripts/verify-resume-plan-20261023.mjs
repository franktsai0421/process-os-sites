// Incident-specific transaction builder. This module issues no key, opens no
// HTTP/CLI entry and executes no batch. The default-off local runtime lives in
// lib/snapshot-incident-recovery.mjs; live use still requires exact authorization,
// reviewed source publication and a fresh matching before-image.
import {incident,incidentRecoveryShape,proveIncidentVersion} from './verify-recovery-20261023.mjs';
import {incidentVerifyRecord} from '../lib/snapshot-native-capability.mjs';
import {sha256} from '../lib/snapshot-contract.mjs';
const fail=v=>{if(!v)throw Error('IMPORT_VERIFY_RESUME_PRECONDITION');};
const digest=v=>sha256(new TextEncoder().encode(JSON.stringify(v)));
export const requiredResumeRuntime='incident-verify-audit-only-v1';
const {tables,opColumns}=incidentRecoveryShape();
const pins=Object.fromEntries(['projectId','origin','ownerId','targetFingerprint','manifestSha256','transferId'].map(k=>[k,incident[k]]));
const assertion=c=>`SELECT json(CASE WHEN (${c}) THEN 'true' ELSE 'IMPORT_VERIFY_RESUME_CAS_CONFLICT' END) AS resume_assertion`;
function fixedSnapshot(s,holdSha){
 const t=s?.transfer,r=s?.request,b=s?.budget,c=s?.capability;
 fail(t?.id===incident.transferId&&t.project_id===incident.projectId&&t.target===incident.targetFingerprint&&t.manifest_sha===incident.manifestSha256&&t.owner_id==='frank'&&t.version===19&&t.verify_cursor===272&&t.phase==='receiving'&&t.chunk_count===1401&&t.total_bytes===incident.bytes);
 fail(r?.request_id===incident.requestId&&r.capability_id===incident.capabilityId&&r.nonce===incident.nonce&&r.request_sha256===incident.requestSha256&&r.generation===1&&r.state==='blocked'&&r.reason==='verify-recovery-fenced:'+holdSha);
 fail(b?.state==='stopped'&&b.active_request===incident.requestId&&b.reason==='IMPORT_VERIFY_RECOVERY_FENCED'&&c?.id===incident.capabilityId&&c.generation===1&&c.revoked_at===null);
 fail(s.target?.transfer_id===incident.transferId&&s.target.target===incident.targetFingerprint&&s.attempt?.id===incident.requestId&&s.attempt.state==='stopped');
 fail(s.operations?.length===11&&s.operations.every((o,i)=>o.ordinal===i+1&&o.kind==='r2-get'&&o.generation===1&&o.state==='succeeded'));
}
async function capture(db){
 const results=await db.batch([
  ...Object.values(tables).map(t=>db.prepare(`SELECT ${t.columns.join(',')} FROM ${t.table} WHERE ${t.where}`).bind(...t.args)),
  db.prepare(`SELECT ${opColumns.join(',')} FROM process_import_native_operations WHERE request_id=? ORDER BY ordinal LIMIT 513`).bind(incident.requestId),
  db.prepare('SELECT COUNT(*) n,SUM(bytes) bytes FROM process_snapshot_chunks WHERE transfer_id=?').bind(incident.transferId),
  db.prepare('SELECT COUNT(*) n FROM process_snapshot_activations WHERE transfer_id=?').bind(incident.transferId),
 ]);
 fail(results.length===9&&results.every(r=>r.success));const s={};
 Object.keys(tables).forEach((k,i)=>{fail(results[i].results.length===1);s[k]={...results[i].results[0]};});
 s.operations=results[6].results.map(r=>({...r}));
 fail(results[7].results[0].n===1401&&results[7].results[0].bytes===incident.bytes&&results[8].results[0].n===0);
 return s;
}
export async function planIncidentMaintenance(db,{holdPlan,newGrant,reviewedProgramCommit,at}){
 await proveIncidentVersion();
 fail(holdPlan?.format==='PROCESS_OS_VERIFY_RECOVERY_20261023'&&await digest(holdPlan.snapshot)===holdPlan.snapshotSha256);
 fail(/^[a-f0-9]{40}$/.test(reviewedProgramCommit||'')&&!/^0+$/.test(reviewedProgramCommit)&&Number.isSafeInteger(at)&&at>0);
 const s=await capture(db),expected=structuredClone(holdPlan.snapshot);
 fail(expected.transfer.version===18&&expected.transfer.verify_cursor===272&&expected.request.request_id===incident.requestId&&expected.request.request_sha256===incident.requestSha256&&expected.request.state==='running');
 expected.transfer.version=19;
 expected.request.state='blocked';expected.request.reason='verify-recovery-fenced:'+holdPlan.snapshotSha256;
 fail(Number.isSafeInteger(s.request.finalized_at)&&s.request.finalized_at>0);expected.request.finalized_at=s.request.finalized_at;
 expected.budget.state='stopped';expected.budget.reason='IMPORT_VERIFY_RECOVERY_FENCED';
 expected.attempt.state='stopped';
 fail(await digest(s)===await digest(expected));
 fixedSnapshot(s,holdPlan.snapshotSha256);
 const record=incidentVerifyRecord({...newGrant,pins});
 fail(record.id!==incident.capabilityId&&record.owner_epoch===0&&record.request_limit===1000&&record.operation_limit===20000&&at>=record.issued_at&&at<record.write_expires_at);
 // No reuse of old key/ID or policy lifetime. Only digest metadata is accepted.
 fail(record.id==='ic_'+record.credential_sha256.slice(0,32));
 const existing=await db.prepare('SELECT id FROM process_import_verify_capabilities WHERE id=?').bind(record.id).first(),legacy=await db.prepare('SELECT id FROM process_import_capabilities WHERE id=?').bind(record.id).first();fail(!existing&&!legacy);
 const value={format:'PROCESS_OS_VERIFY_RESUME_PLAN_20261023',requiredRuntime:requiredResumeRuntime,reviewedProgramCommit,holdPlanSha256:holdPlan.snapshotSha256,at,snapshot:s,newGrant:{...record,baseline_receipts:1401,baseline_chunks:1401,baseline_version:19}};
 return Object.freeze({...value,planSha256:await digest(value),liveReady:false});
}
async function validate(plan){
 fail(plan?.format==='PROCESS_OS_VERIFY_RESUME_PLAN_20261023'&&plan.requiredRuntime===requiredResumeRuntime&&plan.liveReady===false);
 const {planSha256,liveReady,...value}=plan;fail(await digest(value)===planSha256);
 fixedSnapshot(plan.snapshot,plan.holdPlanSha256);
 // Revalidate the new public grant metadata, not a caller-selected SQL shape.
 const g=plan.newGrant,normalized=incidentVerifyRecord({id:g.id,credentialSha256:g.credential_sha256,pins,ownerEpoch:g.owner_epoch,issuedAt:g.issued_at,writeExpiresAt:g.write_expires_at,receiptExpiresAt:g.receipt_expires_at,requestLimit:g.request_limit,operationLimit:g.operation_limit});
 fail(JSON.stringify(g)===JSON.stringify({...normalized,baseline_receipts:1401,baseline_chunks:1401,baseline_version:19}));
 fail(g.id!==incident.capabilityId&&g.id==='ic_'+g.credential_sha256.slice(0,32)&&g.owner_epoch===0&&g.request_limit===1000&&g.operation_limit===20000);
}
export async function assertIncidentResumePlan(plan){await validate(plan);}
function guards(db,s){
 const out=[];
 for(const[key,t]of Object.entries(tables))out.push(db.prepare(assertion(`EXISTS(SELECT 1 FROM ${t.table} WHERE ${t.where} AND ${t.columns.map(c=>c+' IS ?').join(' AND ')})`)).bind(...t.args,...t.columns.map(c=>s[key][c])));
 out.push(db.prepare(assertion('(SELECT COUNT(*) FROM process_import_native_operations WHERE request_id=?)=11')).bind(incident.requestId));
 for(const op of s.operations)out.push(db.prepare(assertion(`EXISTS(SELECT 1 FROM process_import_native_operations WHERE request_id=? AND ${opColumns.map(c=>c+' IS ?').join(' AND ')})`)).bind(incident.requestId,...opColumns.map(c=>op[c])));
 out.push(db.prepare(assertion('(SELECT COUNT(*) FROM process_snapshot_chunks WHERE transfer_id=?)=1401 AND (SELECT SUM(bytes) FROM process_snapshot_chunks WHERE transfer_id=?)=? AND NOT EXISTS(SELECT 1 FROM process_snapshot_activations WHERE transfer_id=?)')).bind(incident.transferId,incident.transferId,incident.bytes,incident.transferId));
 return out;
}
function update(db,list,sql,args){list.push(db.prepare(sql).bind(...args),db.prepare(assertion('changes()=1')));}
export async function buildIncidentMaintenanceBatch(db,plan){
 await validate(plan);const out=guards(db,plan.snapshot);
 update(db,out,"UPDATE process_import_native_requests SET reason=? WHERE request_id=? AND state='blocked' AND reason=?",['verify-recovery-maintenance:'+plan.holdPlanSha256+':'+plan.planSha256,incident.requestId,'verify-recovery-fenced:'+plan.holdPlanSha256]);
 update(db,out,"UPDATE process_import_budget SET reason=? WHERE id=1 AND state='stopped' AND active_request=? AND reason=?",['IMPORT_VERIFY_MAINTENANCE:'+plan.planSha256,incident.requestId,'IMPORT_VERIFY_RECOVERY_FENCED']);
 return out;
}
export async function buildIncidentResumeBatch(db,plan,{at}={}){
 await validate(plan);const s=structuredClone(plan.snapshot);
 fail(Number.isSafeInteger(at)&&at>=plan.at&&at>=plan.newGrant.issued_at&&at<plan.newGrant.write_expires_at);
 s.request.reason='verify-recovery-maintenance:'+plan.holdPlanSha256+':'+plan.planSha256;s.budget.reason='IMPORT_VERIFY_MAINTENANCE:'+plan.planSha256;
 const out=guards(db,s),g=plan.newGrant;
 out.push(db.prepare(assertion('NOT EXISTS(SELECT 1 FROM process_import_capabilities WHERE id=?)')).bind(g.id));
 out.push(db.prepare(assertion('NOT EXISTS(SELECT 1 FROM process_import_verify_capabilities WHERE id=?)')).bind(g.id));
 // New T0 was fixed when the future host generated its key. No extension.
 out.push(db.prepare(assertion('?>=? AND ?<?')).bind(at,g.issued_at,at,g.write_expires_at));
 update(db,out,'UPDATE process_import_capabilities SET revoked_at=?,generation=generation+1 WHERE id=? AND generation=1 AND revoked_at IS NULL',[at,incident.capabilityId]);
 const stored={...g,hold_plan_sha:plan.holdPlanSha256,resume_plan_sha:plan.planSha256,program_commit:plan.reviewedProgramCommit},columns=Object.keys(stored);
 update(db,out,`INSERT INTO process_import_verify_capabilities(${columns.join(',')}) VALUES(${columns.map(()=>'?')})`,Object.values(stored));
 update(db,out,"UPDATE process_import_native_requests SET reason=? WHERE request_id=? AND state='blocked' AND reason=?",['verify-recovery-resumed:'+plan.holdPlanSha256+':'+plan.planSha256,incident.requestId,s.request.reason]);
 update(db,out,"UPDATE process_import_budget SET state='open',active_request=NULL,reason=? WHERE id=1 AND state='stopped' AND active_request=? AND reason=?",['IMPORT_VERIFY_RESUME_ONLY:'+plan.planSha256,incident.requestId,s.budget.reason]);
 // Cursor/version/charges/old operations/history stay intact. The default-off
 // incident runtime supplies server time and one-use authority, and executes
 // this entire guarded batch atomically. Local implementation is not live use.
 return out;
}
