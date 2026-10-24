// One owner-authorized incident. No arbitrary ID, SQL, lock, credential or payload input.
import {sha256} from './snapshot-contract.mjs';
import {createHostedTransfer} from './snapshot-hosted-transfer.mjs';
import {createHostedTransferStore} from './snapshot-hosted-store.mjs';
import {hostedCopyContext} from './snapshot-hosted-audit.mjs';
import {consumeImportBody} from './snapshot-body.mjs';
import {validateAttemptPolicy} from './snapshot-attempt-policy.mjs';
export const copyIncident=Object.freeze({
 projectId:'appgprj_6ad9abaff47c8191846eb9821034696b',origin:'https://process-os-test.franktsai0421.chatgpt.site',ownerId:'frank',
 targetFingerprint:'c5311ad0524330b7c913757fc2dc54796ecd569f0b0755f6a3b31396c8d58e80',manifestSha256:'326dc9372fab57554b96965c19815044d0cab6e6a28b6849f6d224c4906b7510',transferId:'35006091ac686b2d6288015904f45d74338752151975334b9c7da3b3c500853e',
 requestId:'0378517a-8ca8-46ae-a354-081cfc21a9fd',requestCreatedAt:1792844686991,version:1419,cursor:161,auditCursor:1256,transferVersion:91,chunks:1401,transferCreatedAt:1792750945357,transferExpiresAt:1793355745357,totalBytes:275566702,
 policySha:'4b8059c0e1fac3a6df065e31210d26b4681cbbf749c291b17959df0a9cb9b78e',bootstrapSha:'87a9f3ca6fd7e2d68856edc53c3e5285d3502a5e35196f5288e22c40e5aeced0',
 charges:{write_bytes:282975356,write_calls:1563,requests:586,db_bytes:3070197,db_statements:12458},completedBytes:6758916,
 resource:'r2/canonical-images/ce4e0caba0c4a4cfaa27d8e5476b6e6d71dcc332b8a8fdca28a2856d7dae3c6a/fe4433a1bd44cf2e8bd70dccb965f1a2af93b36c499381a836ca127e351b9651.webp',ordinal:164,bytes:26370,sha256:'fe4433a1bd44cf2e8bd70dccb965f1a2af93b36c499381a836ca127e351b9651',
});
const encode=v=>new TextEncoder().encode(JSON.stringify(v)),fail=(v,c='IMPORT_COPY_RECOVERY_MISMATCH')=>{if(!v)throw Error(c);};
const assertion=condition=>`SELECT json(CASE WHEN (${condition}) THEN 'true' ELSE 'IMPORT_COPY_RECOVERY_CAS' END)`;
// Injectable case is for isolated module fixtures; the HTTP route never accepts or supplies it.
export function createCopyIncident({db,bucket,config,principal,signal,recheckOwner,now=()=>Date.now(),incident=copyIncident,proofTimeoutMs=30000}){
 const C=incident,marker='copy-recovery:'+C.requestId;
 function owner(p){fail(p?.id===C.ownerId&&p.role==='admin'&&p.sessionType==='platform'&&p.exportAllowed===true,'IMPORT_OWNER_REQUIRED');}
 function configuration(){for(const k of ['projectId','origin','targetFingerprint','manifestSha256','ownerId'])fail(config[k]===C[k]);owner(principal);fail(typeof recheckOwner==='function');}
 const readMarker=()=>db.prepare('SELECT action,state,created_at FROM process_import_attempts WHERE id=?').bind(marker).first();
 async function before(){
  configuration();fail(!signal?.aborted,'IMPORT_BODY_CANCELLED');
  const b=await db.prepare('SELECT * FROM process_import_budget WHERE id=1').first();
  fail(b?.state==='stopped'&&b.active_request===C.requestId&&b.reason==='IMPORT_ATTEMPT_PROVIDER_OR_UNCERTAIN'&&b.policy_sha===C.policySha);
  fail(await sha256(new TextEncoder().encode(b.policy))===C.policySha);const policy=validateAttemptPolicy(JSON.parse(b.policy),C,now());
  for(const[k,v]of Object.entries(C.charges))fail(b[k]===v);
  const a=await db.prepare('SELECT * FROM process_snapshot_activations WHERE transfer_id=?').bind(C.transferId).first();
  fail(a?.phase==='copying'&&a.version===C.version&&a.copy_cursor===C.cursor&&a.db_cursor===0&&a.audit_cursor===C.auditCursor&&a.bootstrap_sha===C.bootstrapSha);
  const t=await db.prepare('SELECT * FROM process_snapshot_transfers WHERE id=?').bind(C.transferId).first();
  fail(t?.project_id===C.projectId&&t.target===C.targetFingerprint&&t.manifest_sha===C.manifestSha256&&t.owner_id===C.ownerId&&t.phase==='integrity-verified'&&t.version===C.transferVersion&&t.verify_cursor===C.chunks&&t.chunk_count===C.chunks&&t.created_at===C.transferCreatedAt&&t.expires_at===C.transferExpiresAt&&t.total_bytes===C.totalBytes&&t.expires_at>now());
  const target=await db.prepare('SELECT target,transfer_id FROM process_snapshot_target WHERE id=1').first();fail(target?.target===C.targetFingerprint&&target.transfer_id===C.transferId);
  const attempt=await db.prepare('SELECT action,state,created_at FROM process_import_attempts WHERE id=?').bind(C.requestId).first();fail(attempt?.action==='copy'&&attempt.state==='stopped'&&attempt.created_at===C.requestCreatedAt);fail(!await readMarker(),'IMPORT_COPY_RECOVERY_ALREADY_USED');
  const r=await db.prepare('SELECT * FROM process_snapshot_resource_audits WHERE transfer_id=? AND resource=?').bind(C.transferId,C.resource).first();fail(r?.ordinal===C.ordinal&&r.bytes===C.bytes&&r.sha256===C.sha256&&r.copy_version===0&&r.copy_state===null);
  const receipts=await db.prepare("SELECT resource,ordinal,bytes,sha256,copy_version,copy_state FROM process_snapshot_resource_audits WHERE transfer_id=? AND resource LIKE 'r2/%' AND copy_state IS NOT NULL ORDER BY ordinal").bind(C.transferId).all();
  fail(receipts.success&&receipts.results.length===C.cursor&&receipts.results.every((r,i)=>r.ordinal===i+3&&JSON.parse(r.copy_state).phase==='complete')&&receipts.results.reduce((n,r)=>n+r.bytes,0)===C.completedBytes);
  const rows=await db.prepare('SELECT id,revision,"values",updated_at FROM shared_state LIMIT 2').all();fail(rows.success&&rows.results.length===1&&rows.results[0].id===1);const bootstrap=rows.results[0];fail(await sha256(encode(bootstrap))===C.bootstrapSha,'IMPORT_BOOTSTRAP_CHANGED');
  return{budget:b,policy,bootstrap,receipts:JSON.stringify(receipts.results)};
 }
 async function proof(proofSignal){
  const source=createHostedTransfer({store:createHostedTransferStore({db,bucket}),bucket,config,signal:proofSignal,now});const view=await source.source(principal,C.transferId),ctx=await hostedCopyContext(view),r=ctx.resources.get(C.resource);fail(r&&r.bytes===C.bytes,'IMPORT_COPY_RECOVERY_SOURCE');
  const parts=[];for(const c of r.descriptors){fail(!proofSignal.aborted,'IMPORT_BODY_CANCELLED');parts.push(await view.readChunk(c.id));}const value=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let pos=0;for(const p of parts){value.set(p,pos);pos+=p.length;}fail(value.length===C.bytes&&await sha256(value)===C.sha256,'IMPORT_COPY_RECOVERY_SOURCE');
  fail(!proofSignal.aborted,'IMPORT_BODY_CANCELLED');const target=await bucket.get(C.resource.slice(3));fail(!proofSignal.aborted,'IMPORT_BODY_CANCELLED');if(!target)return{source:'matched',target:'absent',bytes:C.bytes,sha256:C.sha256};
  fail(target.size===C.bytes,'IMPORT_ORIGINAL_OBJECT_CONFLICT');await consumeImportBody(target.body,C.bytes,{signal:proofSignal,expectedBytes:C.bytes,expectedSha256:C.sha256});return{source:'matched',target:'matched',bytes:C.bytes,sha256:C.sha256};
 }
 return{
  async status(){configuration();const m=await readMarker();return{incident:C.requestId,state:m?.state==='complete'?'recovered':'not-recovered',automaticRetryAllowed:false};},
  async recover(){
   fail(Number.isSafeInteger(proofTimeoutMs)&&proofTimeoutMs>0&&proofTimeoutMs<=30000);const b=await before();let timer,expired=false;const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;controller.abort();reject(Error('IMPORT_COPY_RECOVERY_TIMEOUT'));},proofTimeoutMs);});let evidence;
   try{evidence=await Promise.race([proof(controller.signal),timeout]);}finally{clearTimeout(timer);controller.abort();signal?.removeEventListener('abort',abort);}fail(!expired&&!signal?.aborted,'IMPORT_BODY_CANCELLED');
   owner(await recheckOwner());const at=now();validateAttemptPolicy(b.policy,C,at);fail(!signal?.aborted,'IMPORT_BODY_CANCELLED');
   const guards=[],args=[];const add=(sql,...values)=>{guards.push(sql);args.push(...values);};
   add("EXISTS(SELECT 1 FROM process_import_budget WHERE id=1 AND policy_sha=? AND policy=? AND state='stopped' AND active_request=? AND reason='IMPORT_ATTEMPT_PROVIDER_OR_UNCERTAIN' AND write_bytes=? AND write_calls=? AND requests=? AND db_bytes=? AND db_statements=?)",C.policySha,b.budget.policy,C.requestId,...Object.values(C.charges));
   add("EXISTS(SELECT 1 FROM process_snapshot_activations WHERE transfer_id=? AND phase='copying' AND version=? AND copy_cursor=? AND db_cursor=0 AND audit_cursor=? AND bootstrap_sha=?)",C.transferId,C.version,C.cursor,C.auditCursor,C.bootstrapSha);
   add("EXISTS(SELECT 1 FROM process_import_attempts WHERE id=? AND action='copy' AND state='stopped' AND created_at=?) AND NOT EXISTS(SELECT 1 FROM process_import_attempts WHERE id=?)",C.requestId,C.requestCreatedAt,marker);
   add('EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=? AND "values"=? AND updated_at=?)',b.bootstrap.revision,b.bootstrap.values,b.bootstrap.updated_at);
   add('EXISTS(SELECT 1 FROM process_snapshot_target WHERE id=1 AND target=? AND transfer_id=?)',C.targetFingerprint,C.transferId);
   add("EXISTS(SELECT 1 FROM process_snapshot_transfers WHERE id=? AND project_id=? AND target=? AND manifest_sha=? AND owner_id=? AND phase='integrity-verified' AND version=? AND verify_cursor=? AND chunk_count=? AND created_at=? AND expires_at=? AND total_bytes=? AND expires_at>?)",C.transferId,C.projectId,C.targetFingerprint,C.manifestSha256,C.ownerId,C.transferVersion,C.chunks,C.chunks,C.transferCreatedAt,C.transferExpiresAt,C.totalBytes,at);
   add('EXISTS(SELECT 1 FROM process_snapshot_resource_audits WHERE transfer_id=? AND resource=? AND ordinal=? AND bytes=? AND sha256=? AND copy_version=0 AND copy_state IS NULL)',C.transferId,C.resource,C.ordinal,C.bytes,C.sha256);
   add("(SELECT COUNT(*) FROM process_snapshot_resource_audits WHERE transfer_id=? AND resource LIKE 'r2/%' AND copy_state IS NOT NULL)=? AND (SELECT SUM(bytes) FROM process_snapshot_resource_audits WHERE transfer_id=? AND resource LIKE 'r2/%' AND json_extract(copy_state,'$.phase')='complete' AND ordinal>=3 AND ordinal<?)=?",C.transferId,C.cursor,C.transferId,C.ordinal,C.completedBytes);
   add("NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN process_snapshot_resource_audits r ON r.transfer_id=? AND r.resource=json_extract(j.value,'$.resource') WHERE r.resource IS NULL OR r.ordinal!=json_extract(j.value,'$.ordinal') OR r.bytes!=json_extract(j.value,'$.bytes') OR r.sha256!=json_extract(j.value,'$.sha256') OR r.copy_version!=json_extract(j.value,'$.copy_version') OR r.copy_state!=json_extract(j.value,'$.copy_state'))",b.receipts,C.transferId);
   const statements=[db.prepare(assertion(guards.join(' AND '))).bind(...args),db.prepare("INSERT INTO process_import_attempts(id,action,state,created_at) VALUES(?,'copy-recovery','complete',?)").bind(marker,at),db.prepare(assertion('changes()=1')),db.prepare("UPDATE process_snapshot_activations SET version=version+1 WHERE transfer_id=? AND version=? AND phase='copying' AND copy_cursor=?").bind(C.transferId,C.version,C.cursor),db.prepare(assertion('changes()=1')),db.prepare("UPDATE process_import_budget SET state='open',active_request=NULL,reason=? WHERE id=1 AND state='stopped' AND active_request=? AND policy_sha=?").bind('IMPORT_COPY_INCIDENT_RESUMED:'+C.requestId,C.requestId,C.policySha),db.prepare(assertion('changes()=1'))];
   // No await or caller-selected SQL between the fresh owner/time check and dispatch.
   let result;try{result=await db.batch(statements);}catch{throw Error('IMPORT_COPY_RECOVERY_OUTCOME_UNKNOWN');}fail(result.every(r=>r.success),'IMPORT_COPY_RECOVERY_OUTCOME_UNKNOWN');
   return{incident:C.requestId,state:'recovered',version:C.version+1,copyCursor:C.cursor,evidence,automaticRetryAllowed:false};
  },
 };
}
