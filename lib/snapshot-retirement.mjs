// Explicit owner-approved retirement of ONE receiving campaign. No deletion,
// credential access, lock expiry or reuse of cancelled receipts. Old namespaces
// remain quarantined even if an already-issued provider write finishes late.
import {sha256} from './snapshot-contract.mjs';
import {validateAttemptPolicy,boundedAttemptSite} from './snapshot-attempt-policy.mjs';
import {authorizeImport,importNamespace} from './snapshot-hosted-transfer.mjs';
const fail=(v,c)=>{if(!v)throw Error(c);},encode=v=>new TextEncoder().encode(JSON.stringify(v)),hex=/^[a-f0-9]{64}$/;
async function checkedRetirementPlan(plan,pins,policy,now,requireLiveApproval){
 const fields=['format','projectId','ownerId','targetFingerprint','oldManifestSha256','oldPolicySha256','oldTransferId','expectedActiveRequest','nextManifestSha256','issuedAt','expiresAt'];
 fail(plan&&Object.keys(plan).length===fields.length&&fields.every(k=>typeof plan[k]==='string'),'IMPORT_RETIREMENT_CONFIGURATION');
 fail(plan.format==='PROCESS_OS_CANCELLED_CAMPAIGN_V1'&&pins.projectId===boundedAttemptSite&&pins.ownerId==='frank'&&plan.projectId===pins.projectId&&plan.ownerId===pins.ownerId&&plan.targetFingerprint===pins.targetFingerprint&&plan.nextManifestSha256===pins.manifestSha256&&plan.oldManifestSha256!==plan.nextManifestSha256&&[plan.targetFingerprint,plan.oldManifestSha256,plan.oldPolicySha256,plan.oldTransferId,plan.nextManifestSha256].every(x=>hex.test(x))&&/^[a-f0-9-]{36}$/.test(plan.expectedActiveRequest),'IMPORT_RETIREMENT_TARGET');
 const start=Date.parse(plan.issuedAt),end=Date.parse(plan.expiresAt);fail(Number.isFinite(start)&&Number.isFinite(end)&&start<=now&&(!requireLiveApproval||now<end)&&end-start<=24*3600_000&&end>start,'IMPORT_RETIREMENT_EXPIRED');
 fail(await sha256(encode([pins.projectId,pins.targetFingerprint,plan.oldManifestSha256]))===plan.oldTransferId,'IMPORT_RETIREMENT_TARGET');
 const next=validateAttemptPolicy(policy,pins,now);return{plan,next,nextPolicySha:await sha256(encode(next)),nextId:await sha256(encode([pins.projectId,pins.targetFingerprint,pins.manifestSha256]))};
}
export async function validateRetirementPlan(plan,pins,policy,now=Date.now()){
 return checkedRetirementPlan(plan,pins,policy,now,true);
}
export async function retirementRows(db){const r=await db.prepare('SELECT * FROM process_import_retirements ORDER BY transfer_id LIMIT 17').all();fail(r.success&&r.results.length<=16,'IMPORT_RETIREMENT_INVENTORY');return r.results;}
export async function assertQuarantinedInventory(db,bucket,{currentId=null,fencedId=null}={}){
 const rows=await retirementRows(db),allowed=new Set(rows.filter(r=>r.state==='retired'||r.transfer_id===fencedId&&r.state==='fenced').map(r=>r.transfer_id));if(currentId)allowed.add(currentId);
 let cursor,seen=new Set(),count=0;do{const page=await bucket.list({limit:100,...(cursor?{cursor}:{})});fail(Array.isArray(page.objects),'IMPORT_RETIREMENT_INVENTORY');for(const o of page.objects){const match=/^process-import\/v1\/([a-f0-9]{64})\/(manifest\.json|chunks\/c(?:0|[1-9][0-9]*))$/.exec(o.key);fail(match&&allowed.has(match[1]),'IMPORT_TARGET_OCCUPIED');count++;fail(count<=160_000,'IMPORT_RETIREMENT_INVENTORY_LIMIT');}if(!page.truncated)break;fail(typeof page.cursor==='string'&&!seen.has(page.cursor),'IMPORT_RETIREMENT_INVENTORY');seen.add(page.cursor);cursor=page.cursor;}while(true);return{objects:count};
}
export async function assertNewCampaignFresh(db,bucket,id){
 const rows=await retirementRows(db),retired=new Set(rows.filter(r=>r.state==='retired').map(r=>r.transfer_id));
 fail(!rows.some(r=>r.transfer_id===id),'IMPORT_RETIRED_CAMPAIGN_REUSE');
 const transfers=await db.prepare('SELECT id FROM process_snapshot_transfers').all();fail(transfers.success&&transfers.results.every(r=>retired.has(r.id)),'IMPORT_ATTEMPT_TARGET_NOT_FRESH');
 for(const table of ['process_snapshot_activations','process_snapshot_resource_audits']){const n=await db.prepare('SELECT COUNT(*) n FROM '+table).first();fail(n?.n===0,'IMPORT_ATTEMPT_TARGET_NOT_FRESH');}
 const target=await db.prepare('SELECT transfer_id FROM process_snapshot_target WHERE id=1').first();fail(!target||target.transfer_id===id,'IMPORT_ATTEMPT_TARGET_NOT_FRESH');
 await assertQuarantinedInventory(db,bucket); // No new staging is accepted yet.
}
export function createRetirement({db,bucket,pins,policy,plan,now=()=>Date.now()}){
 const config={...pins,enabled:true};
 async function selected(){return validateRetirementPlan(plan,pins,policy,now());}
 function same(r,p){fail(r.project_id===pins.projectId&&r.target===pins.targetFingerprint&&r.manifest_sha===plan.oldManifestSha256&&r.policy_sha===plan.oldPolicySha256&&r.next_policy_sha===p.nextPolicySha&&r.next_manifest_sha===pins.manifestSha256,'IMPORT_RETIREMENT_CONFLICT');}
 async function status(){
  if(!plan)return null;
  // A completed retirement is durable quarantine, not a renewable permission.
  // Validate every plan/policy pin first; only the completed receipt outlives
  // its old execution window. Pending/fenced status and retire() keep expiry.
  const p=await checkedRetirementPlan(plan,pins,policy,now(),false),r=await db.prepare('SELECT * FROM process_import_retirements WHERE transfer_id=?').bind(plan.oldTransferId).first();
  if(r)same(r,p);
  if(r?.state!=='retired')await selected();
  return{oldTransferId:plan.oldTransferId,nextTransferId:p.nextId,state:r?.state||'required',preservesStaging:true};
 }
 async function retire(actor){
  authorizeImport(actor,config);const p=await selected(),existing=await db.prepare('SELECT * FROM process_import_retirements WHERE transfer_id=?').bind(plan.oldTransferId).first();if(existing){same(existing,p);if(existing.state==='retired')return status();}
  // Campaign IDs are never recycled: A -> B -> A must not revive A's receipts.
  const used=await db.prepare('SELECT id FROM process_snapshot_transfers WHERE id=?').bind(p.nextId).first(),retiredNext=await db.prepare('SELECT transfer_id FROM process_import_retirements WHERE transfer_id=?').bind(p.nextId).first(),nextReceipts=await db.prepare('SELECT COUNT(*) n FROM process_snapshot_chunks WHERE transfer_id=?').bind(p.nextId).first();
  fail(!used&&!retiredNext&&nextReceipts?.n===0,'IMPORT_RETIRED_CAMPAIGN_REUSE');
  if(!existing){
   const old=await db.prepare('SELECT * FROM process_import_budget WHERE id=1').first(),target=await db.prepare('SELECT * FROM process_snapshot_target WHERE id=1').first(),transfer=await db.prepare('SELECT * FROM process_snapshot_transfers WHERE id=?').bind(plan.oldTransferId).first(),attempt=await db.prepare('SELECT action,state FROM process_import_attempts WHERE id=?').bind(plan.expectedActiveRequest).first();
   fail(old&&old.policy_sha===plan.oldPolicySha256&&await sha256(encode(JSON.parse(old.policy)))===old.policy_sha&&old.active_request===plan.expectedActiveRequest&&['open','stopped'].includes(old.state)&&attempt&&['chunk','batch'].includes(attempt.action)&&['running','stopped'].includes(attempt.state),'IMPORT_RETIREMENT_CONFLICT');
   fail(target?.transfer_id===plan.oldTransferId&&target.target===pins.targetFingerprint&&transfer?.project_id===pins.projectId&&transfer.target===pins.targetFingerprint&&transfer.owner_id===pins.ownerId&&transfer.manifest_sha===plan.oldManifestSha256&&transfer.phase==='receiving'&&transfer.verify_cursor===0,'IMPORT_RETIREMENT_CONFLICT');
   for(const table of ['process_snapshot_activations','process_snapshot_resource_audits']){const n=await db.prepare('SELECT COUNT(*) n FROM '+table).first();fail(n?.n===0,'IMPORT_RETIREMENT_TOO_LATE');}
   const archive=JSON.stringify({budget:old,target,transfer,unresolvedAttemptId:plan.expectedActiveRequest});
   // The constraint-checked INSERT rolls back the entire D1 batch if the
   // expected snapshot changed between read and fencing. No partial unlock.
   const r=await db.batch([
    db.prepare("UPDATE process_import_budget SET state='stopped',reason='IMPORT_ATTEMPT_RETIRED' WHERE id=1 AND policy_sha=? AND active_request=? AND state=? AND write_bytes=? AND write_calls=? AND requests=? AND db_bytes=? AND db_statements=?").bind(old.policy_sha,old.active_request,old.state,old.write_bytes,old.write_calls,old.requests,old.db_bytes,old.db_statements),
    db.prepare("INSERT INTO process_import_retirements(transfer_id,project_id,target,manifest_sha,policy_sha,next_manifest_sha,next_policy_sha,archive,state,created_at) VALUES(?,?,?,?,?,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM process_import_budget WHERE id=1 AND policy_sha=? AND active_request=? AND state='stopped' AND reason='IMPORT_ATTEMPT_RETIRED' AND write_bytes=? AND write_calls=? AND requests=? AND db_bytes=? AND db_statements=?) THEN 'fenced' ELSE 'conflict' END,?)").bind(plan.oldTransferId,pins.projectId,pins.targetFingerprint,plan.oldManifestSha256,old.policy_sha,pins.manifestSha256,p.nextPolicySha,archive,old.policy_sha,old.active_request,old.write_bytes,old.write_calls,old.requests,old.db_bytes,old.db_statements,now()),
   ]);fail(r.every(x=>x.success)&&r[0].meta.changes===1,'IMPORT_RETIREMENT_CONFLICT');
  }
  await assertQuarantinedInventory(db,bucket,{fencedId:plan.oldTransferId});
  const fence=await db.prepare('SELECT * FROM process_import_retirements WHERE transfer_id=?').bind(plan.oldTransferId).first();fail(fence?.state==='fenced','IMPORT_RETIREMENT_CONFLICT');same(fence,p);
  let saved;try{saved=JSON.parse(fence.archive);}catch{throw Error('IMPORT_RETIREMENT_ARCHIVE');}
  const old=saved?.budget,t=saved?.transfer,oldTarget=saved?.target,counters=['write_bytes','write_calls','requests','db_bytes','db_statements'];
  fail(old&&old.id===1&&old.policy_sha===plan.oldPolicySha256&&old.active_request===plan.expectedActiveRequest&&await sha256(encode(JSON.parse(old.policy)))===old.policy_sha&&counters.every(k=>Number.isSafeInteger(old[k])&&old[k]>=0)&&oldTarget?.id===1&&oldTarget.transfer_id===plan.oldTransferId&&oldTarget.target===pins.targetFingerprint&&t?.id===plan.oldTransferId&&t.project_id===pins.projectId&&t.target===pins.targetFingerprint&&t.manifest_sha===plan.oldManifestSha256&&t.owner_id===pins.ownerId&&t.phase==='receiving'&&t.verify_cursor===0&&t.manifest_key===importNamespace+plan.oldTransferId+'/manifest.json'&&['version','chunk_count','total_bytes','created_at','expires_at'].every(k=>Number.isSafeInteger(t[k])&&t[k]>0),'IMPORT_RETIREMENT_ARCHIVE');
  // Older deployed requests can still overwrite stopped.reason. The immutable
  // archive, exact policy/owner/target pins and all counters are authoritative;
  // mutable diagnostic reason is deliberately absent from this proof.
  const budgetWhere="id=1 AND policy_sha=? AND policy=? AND active_request=? AND state='stopped' AND write_bytes=? AND write_calls=? AND requests=? AND db_bytes=? AND db_statements=?",budgetArgs=[old.policy_sha,old.policy,old.active_request,...counters.map(k=>old[k])];
  const transferWhere="id=? AND project_id=? AND target=? AND manifest_sha=? AND owner_id=? AND phase='receiving' AND version=? AND verify_cursor=0 AND chunk_count=? AND total_bytes=? AND manifest_key=? AND created_at=? AND expires_at=?",transferArgs=[t.id,t.project_id,t.target,t.manifest_sha,t.owner_id,t.version,t.chunk_count,t.total_bytes,t.manifest_key,t.created_at,t.expires_at];
  // The original receipts/attempts/staging stay intact. Only the singleton
  // active pointer and budget change; their old values are durably archived.
  const r=await db.batch([
   db.prepare("UPDATE process_import_retirements SET state=CASE WHEN EXISTS(SELECT 1 FROM process_import_budget WHERE "+budgetWhere+") AND EXISTS(SELECT 1 FROM process_snapshot_target WHERE id=1 AND transfer_id=? AND target=?) AND EXISTS(SELECT 1 FROM process_snapshot_transfers WHERE "+transferWhere+") AND NOT EXISTS(SELECT 1 FROM process_snapshot_transfers WHERE id=?) AND NOT EXISTS(SELECT 1 FROM process_import_retirements WHERE transfer_id=?) AND NOT EXISTS(SELECT 1 FROM process_snapshot_chunks WHERE transfer_id=?) THEN 'fenced' ELSE 'conflict' END WHERE transfer_id=? AND state='fenced' AND next_policy_sha=? AND archive=?").bind(...budgetArgs,plan.oldTransferId,pins.targetFingerprint,...transferArgs,p.nextId,p.nextId,p.nextId,plan.oldTransferId,p.nextPolicySha,fence.archive),
   db.prepare("UPDATE process_snapshot_target SET transfer_id=? WHERE id=1 AND transfer_id=? AND target=? AND EXISTS(SELECT 1 FROM process_import_budget WHERE "+budgetWhere+") AND EXISTS(SELECT 1 FROM process_import_retirements WHERE transfer_id=? AND state='fenced' AND archive=?)").bind(p.nextId,plan.oldTransferId,pins.targetFingerprint,...budgetArgs,plan.oldTransferId,fence.archive),
   db.prepare("UPDATE process_import_budget SET policy_sha=?,policy=?,state='open',active_request=NULL,reason=NULL,write_bytes=0,write_calls=0,requests=0,db_bytes=0,db_statements=0 WHERE "+budgetWhere+" AND EXISTS(SELECT 1 FROM process_snapshot_target WHERE id=1 AND transfer_id=?) AND EXISTS(SELECT 1 FROM process_import_retirements WHERE transfer_id=? AND state='fenced' AND archive=?)").bind(p.nextPolicySha,JSON.stringify(p.next),...budgetArgs,p.nextId,plan.oldTransferId,fence.archive),
   db.prepare("UPDATE process_import_retirements SET state=CASE WHEN EXISTS(SELECT 1 FROM process_import_budget WHERE id=1 AND policy_sha=? AND policy=? AND state='open' AND active_request IS NULL AND requests=0 AND write_bytes=0 AND write_calls=0 AND db_bytes=0 AND db_statements=0) AND EXISTS(SELECT 1 FROM process_snapshot_target WHERE id=1 AND transfer_id=?) THEN 'retired' ELSE 'conflict' END WHERE transfer_id=? AND state='fenced' AND next_policy_sha=? AND archive=?").bind(p.nextPolicySha,JSON.stringify(p.next),p.nextId,plan.oldTransferId,p.nextPolicySha,fence.archive),
  ]);fail(r.every(x=>x.success)&&r.every(x=>x.meta.changes===1),'IMPORT_RETIREMENT_CONFLICT');return status();
 }
 return{status,retire};
}
