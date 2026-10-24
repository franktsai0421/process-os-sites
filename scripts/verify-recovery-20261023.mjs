// REVIEW-ONLY one-incident maintenance primitive. No CLI, HTTP endpoint,
// credentials, automatic execution, lock release, or resume operation.
import {nativeRequestHash} from '../lib/snapshot-native-capability.mjs';
import {sha256} from '../lib/snapshot-contract.mjs';
const fail=(v)=>{if(!v)throw Error('IMPORT_VERIFY_RECOVERY_PRECONDITION');};
export const incident=Object.freeze({
 projectId:'appgprj_6ad9abaff47c8191846eb9821034696b',origin:'https://process-os-test.franktsai0421.chatgpt.site',ownerId:'frank',
 targetFingerprint:'c5311ad0524330b7c913757fc2dc54796ecd569f0b0755f6a3b31396c8d58e80',manifestSha256:'326dc9372fab57554b96965c19815044d0cab6e6a28b6849f6d224c4906b7510',
 transferId:'35006091ac686b2d6288015904f45d74338752151975334b9c7da3b3c500853e',
 sourceCommit:'4b3b7d4e7685cc8a6d9c3dd768fe449435e2a251',capabilityId:'ic_0ffc8eafd7e710c312997f29c158481b',
 requestId:'88eed174-82c1-4347-8427-7873c58bcd75',nonce:'c69cfd5d-522c-4646-b1d3-cf51488d006f',requestSha256:'98644b5afff1ad2d432a1a22f45bdeaf58853aaa486f3bc9764211c5fd9296ca',
 version:18,cursor:272,chunks:1401,bytes:275566702,generation:1,
});
const pinKeys=['projectId','origin','ownerId','targetFingerprint','manifestSha256','transferId'];
export async function proveIncidentVersion(){
 const pins=Object.fromEntries(pinKeys.map(k=>[k,incident[k]]));
 const url=new URL('/api/snapshots/import',pins.origin);
 for(const [k,v]of Object.entries({id:pins.transferId,action:'verify',version:incident.version}))url.searchParams.set(k,String(v));
 const digest=await nativeRequestHash({method:'POST',url:url.href,body:new Uint8Array(),pins});
 fail(digest===incident.requestSha256);
 // Deployed verify requires row.version === expectedVersion before capturing
 // its window; its advance WHERE version=? therefore uses EXACTLY 18.
 return{capturedVersion:18,requestSha256:digest,sourceCommit:incident.sourceCommit};
}
const tables=Object.freeze({
 transfer:{table:'process_snapshot_transfers',where:'id=?',args:[incident.transferId],columns:['id','project_id','target','manifest_sha','manifest_key','owner_id','phase','version','verify_cursor','chunk_count','total_bytes','created_at','expires_at']},
 target:{table:'process_snapshot_target',where:'id=1',args:[],columns:['id','target','transfer_id']},
 budget:{table:'process_import_budget',where:'id=1',args:[],columns:['id','policy_sha','policy','state','active_request','reason','write_bytes','write_calls','requests','db_bytes','db_statements']},
 request:{table:'process_import_native_requests',where:'request_id=?',args:[incident.requestId],columns:['capability_id','nonce','request_sha256','request_id','action','generation','state','created_at','finalized_at','reason']},
 attempt:{table:'process_import_attempts',where:'id=?',args:[incident.requestId],columns:['id','action','state','created_at']},
 capability:{table:'process_import_capabilities',where:'id=?',args:[incident.capabilityId],columns:['id','pins','scope','generation','reserved_operations','revoked_at','write_expires_at','receipt_expires_at']},
});
const opColumns=['ordinal','kind','expected_bytes','expected_sha256','generation','state','admitted_at','finalized_at','evidence'];
// Copy of fixed identifiers only; callers cannot mutate the recovery shape.
export function incidentRecoveryShape(){return structuredClone({tables,opColumns});}
export async function planIncidentRecovery(db){
 await proveIncidentVersion();
 const queries=Object.values(tables).map(t=>db.prepare(`SELECT ${t.columns.join(',')} FROM ${t.table} WHERE ${t.where}`).bind(...t.args));
 const result=await db.batch([...queries,
  db.prepare(`SELECT ${opColumns.join(',')} FROM process_import_native_operations WHERE request_id=? ORDER BY ordinal LIMIT 513`).bind(incident.requestId),
  db.prepare('SELECT COUNT(*) n,SUM(bytes) bytes FROM process_snapshot_chunks WHERE transfer_id=?').bind(incident.transferId),
  db.prepare('SELECT COUNT(*) n FROM process_snapshot_activations WHERE transfer_id=?').bind(incident.transferId),
 ]);
 fail(result.length===9&&result.every(r=>r.success));
 const saved={};Object.keys(tables).forEach((k,i)=>{fail(result[i].results.length===1);saved[k]={...result[i].results[0]};});
 saved.operations=result[6].results.map(r=>({...r}));
 const{transfer:t,target,budget:b,request:r,attempt:a,capability:c}=saved;
 fail(t.project_id===incident.projectId&&t.target===incident.targetFingerprint&&t.manifest_sha===incident.manifestSha256&&t.owner_id===incident.ownerId&&t.phase==='receiving'&&t.version===18&&t.verify_cursor===272&&t.chunk_count===1401&&t.total_bytes===incident.bytes);
 fail(target.target===incident.targetFingerprint&&target.transfer_id===incident.transferId);
 fail(b.state==='open'&&b.active_request===incident.requestId&&b.reason===null);
 fail(r.capability_id===incident.capabilityId&&r.nonce===incident.nonce&&r.request_sha256===incident.requestSha256&&r.action==='verify'&&r.generation===1&&r.state==='running'&&r.finalized_at===null&&r.reason===null);
 fail(a.action==='verify'&&a.state==='running'&&c.scope==='staging'&&c.generation===1&&c.revoked_at===null);
 const p=JSON.parse(c.pins);fail(pinKeys.every(k=>p[k]===incident[k]));
 fail(saved.operations.length===11&&saved.operations.every((o,i)=>o.ordinal===i+1&&o.kind==='r2-get'&&o.generation===1&&o.state==='succeeded'));
 fail(result[7].results[0].n===1401&&result[7].results[0].bytes===incident.bytes&&result[8].results[0].n===0);
 const sha=await sha256(new TextEncoder().encode(JSON.stringify(saved)));
 return Object.freeze({format:'PROCESS_OS_VERIFY_RECOVERY_20261023',snapshotSha256:sha,snapshot:saved});
}
// A failed SQL assertion is intentional: D1 batch rolls the ENTIRE transaction
// back. An UPDATE returning zero by itself would not provide that guarantee.
const assertion=condition=>`SELECT json(CASE WHEN (${condition}) THEN 'true' ELSE 'IMPORT_VERIFY_RECOVERY_CAS_CONFLICT' END) AS recovery_assertion`;
export async function buildIncidentRecoveryBatch(db,plan,{at}={}){
 fail(plan?.format==='PROCESS_OS_VERIFY_RECOVERY_20261023'&&Number.isSafeInteger(at)&&at>0);
 fail(await sha256(new TextEncoder().encode(JSON.stringify(plan.snapshot)))===plan.snapshotSha256);
 // Revalidate a freshly read plan, not arbitrary caller-supplied table names or
 // values. The transaction rechecks EVERY observed field after this read.
 const fresh=await planIncidentRecovery(db);fail(fresh.snapshotSha256===plan.snapshotSha256);
 const statements=[];
 for(const[k,t]of Object.entries(tables))statements.push(db.prepare(assertion(`EXISTS(SELECT 1 FROM ${t.table} WHERE ${t.where} AND ${t.columns.map(c=>c+' IS ?').join(' AND ')})`)).bind(...t.args,...t.columns.map(c=>plan.snapshot[k][c])));
 statements.push(db.prepare(assertion('(SELECT COUNT(*) FROM process_import_native_operations WHERE request_id=?)=11')).bind(incident.requestId));
 for(const op of plan.snapshot.operations)statements.push(db.prepare(assertion(`EXISTS(SELECT 1 FROM process_import_native_operations WHERE request_id=? AND ${opColumns.map(c=>c+' IS ?').join(' AND ')})`)).bind(incident.requestId,...opColumns.map(k=>op[k])));
 statements.push(db.prepare(assertion('(SELECT COUNT(*) FROM process_snapshot_chunks WHERE transfer_id=?)=1401 AND (SELECT SUM(bytes) FROM process_snapshot_chunks WHERE transfer_id=?)=? AND NOT EXISTS(SELECT 1 FROM process_snapshot_activations WHERE transfer_id=?)')).bind(incident.transferId,incident.transferId,incident.bytes,incident.transferId));
 const update=(sql,args)=>{statements.push(db.prepare(sql).bind(...args),db.prepare(assertion('changes()=1')));};
 update("UPDATE process_snapshot_transfers SET version=version+1 WHERE id=? AND version=18 AND verify_cursor=272 AND phase='receiving'",[incident.transferId]);
 update("UPDATE process_import_native_requests SET state='blocked',reason=?,finalized_at=? WHERE request_id=? AND state='running' AND request_sha256=? AND generation=1",['verify-recovery-fenced:'+plan.snapshotSha256,at,incident.requestId,incident.requestSha256]);
 update("UPDATE process_import_budget SET state='stopped',reason=? WHERE id=1 AND state='open' AND active_request=?",['IMPORT_VERIFY_RECOVERY_FENCED',incident.requestId]);
 update("UPDATE process_import_attempts SET state='stopped' WHERE id=? AND state='running'",[incident.requestId]);
 // active_request is deliberately RETAINED. Charges, operations, capability,
 // cursor, chunks and all business tables are untouched. This is NOT an unlock.
 return statements;
}
export async function applyIncidentRecovery(db,plan,{at}={}){
 const statements=await buildIncidentRecoveryBatch(db,plan,{at});
 const result=await db.batch(statements);fail(result.length===statements.length&&result.every(r=>r.success));
 return{state:'fenced-stopped',transferVersion:19,verifiedCursor:272,requestState:'blocked',activeRequestRetained:true,planSha256:plan.snapshotSha256,automaticResumeAllowed:false};
}
