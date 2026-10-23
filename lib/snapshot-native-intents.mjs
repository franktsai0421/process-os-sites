// Durable metadata only; no secret creation, schema execution or provider retry.
import {sha256} from './snapshot-contract.mjs';
import {writeBatchBounded} from './snapshot-write-pool.mjs';
const fail=(v,c)=>{if(!v)throw Error(c);},admissions=new WeakSet();
const noncePattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const nativeOperationLimits=Object.freeze({perRequest:512,inventoryPages:128,inventoryPageSize:100});
export const isNativeAdmission=v=>!!v&&admissions.has(v);
export function createNativeIntentLedger({db,authority,handle,pins,nonce,requestSha256,action,now=()=>Date.now()}){
 fail(noncePattern.test(nonce||'')&&/^[a-f0-9]{64}$/.test(requestSha256||'')&&['reconcile-existing','batch','verify','audit'].includes(action),'IMPORT_NATIVE_NONCE');
 let lease=null,policySha=null,generation=null,ordinal=0,account=null,inventoryPages=0;const pending=new Set();
 const prefix='process-import/v1/'+pins.transferId+'/';
 async function requestRow(){return db.prepare('SELECT * FROM process_import_native_requests WHERE capability_id=? AND nonce=?').bind(handle.id,nonce).first();}
 async function currentLease(){fail(lease,'IMPORT_NATIVE_NOT_ADMITTED');const [r,b]=await Promise.all([requestRow(),db.prepare('SELECT active_request,policy_sha,state FROM process_import_budget WHERE id=1').first()]);fail(r&&r.request_id===lease&&r.generation===generation&&r.state==='running'&&b?.active_request===lease&&b.policy_sha===policySha&&b.state==='open','IMPORT_NATIVE_REQUEST_FENCED');return r;}
 async function live(access='write'){const selected=await authority.inspect(handle,access);await currentLease();return selected;}
 async function finish(op,state,evidence){
  // Only this closure can finalize a server-admitted operation. No current
  // capability/expiry test: an accepted I/O may settle after expiry/revocation.
  fail(['succeeded','failed','unknown'].includes(state),'IMPORT_NATIVE_OPERATION_STATE');
  const r=await db.prepare("UPDATE process_import_native_operations SET state=?,finalized_at=?,evidence=? WHERE request_id=? AND ordinal=? AND generation=? AND state IN ('planned','pending')").bind(state,now(),evidence,lease,op.ordinal,generation).run();
  fail(r.success&&r.meta.changes===1,'IMPORT_NATIVE_SETTLEMENT_CONFLICT');
 }
 async function start(kind,key,bytes=null,hash=null,access='write'){
  const inventory=kind==='r2-inventory'&&action==='audit'&&key==='@inventory/'+pins.targetFingerprint;
  fail(inventory||key.startsWith(prefix)&&!key.includes('..')&&/^process-import\/v1\/[a-f0-9]{64}\/(manifest\.json|chunks\/c(?:0|[1-9][0-9]*))$/.test(key),'IMPORT_NATIVE_OBJECT_SCOPE');
  fail(++ordinal<=nativeOperationLimits.perRequest,'IMPORT_NATIVE_OPERATION_LIMIT');const op={ordinal,kind,key,bytes,hash};
  const {grant,owner}=await live(access),time=now();
  fail(account,'IMPORT_NATIVE_ACCOUNTING_REQUIRED');
  // Reserve all four bounded metadata mutations before provider I/O, including
  // terminal settlement. Unused reservations are retained on any failure.
  await account(new TextEncoder().encode(JSON.stringify([lease,kind,key,bytes,hash,generation])).length*4+256,4);
  const r=await db.batch([
   db.prepare('UPDATE process_import_capabilities SET reserved_operations=reserved_operations+1 WHERE id=? AND generation=? AND revoked_at IS NULL AND reserved_operations<operation_limit AND receipt_expires_at>?').bind(handle.id,generation,time),
   db.prepare("INSERT INTO process_import_native_operations(request_id,ordinal,kind,object_key,expected_bytes,expected_sha256,generation,state) SELECT ?,?,?,?,?,?,?,'planned' WHERE EXISTS(SELECT 1 FROM process_import_native_requests WHERE request_id=? AND state='running')").bind(lease,op.ordinal,kind,key,bytes,hash,generation,lease),
  ]);
  if(!r.every(v=>v.success)||r[0].meta.changes!==1||r[1].meta.changes!==1){if(r[1]?.meta.changes===1)await finish(op,'failed','not-invoked-operation-limit');throw Error('IMPORT_NATIVE_OPERATION_LIMIT');}
  try{
   // Re-read authority, eligibility, pins and request generation immediately
   // before admission. The conditional update also checks the durable fence.
   await live(access);
   const admitted=await db.prepare("UPDATE process_import_native_operations SET state='pending',admitted_at=? WHERE request_id=? AND ordinal=? AND state='planned' AND EXISTS(SELECT 1 FROM process_import_capabilities WHERE id=? AND generation=? AND revoked_at IS NULL AND "+(access==='write'?'write_expires_at':'receipt_expires_at')+">?) AND EXISTS(SELECT 1 FROM process_import_budget WHERE id=1 AND active_request=? AND policy_sha=? AND state='open') AND EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=? AND updated_at=?)").bind(now(),lease,op.ordinal,handle.id,grant.generation,now(),lease,policySha,owner.revision,owner.updatedAt).run();
   fail(admitted.success&&admitted.meta.changes===1,'IMPORT_NATIVE_REQUEST_FENCED');
   return op;
  }catch(error){await finish(op,'failed','not-invoked-fence');throw error;}
 }
 async function call(kind,key,fn,{bytes=null,hash=null,access='write',proof=()=> 'provider-read-response'}={}){
  const op=await start(kind,key,bytes,hash,access);let value;
  const work=(async()=>{let invoked=false;try{const {grant}=await live(access);fail(now()>=grant.issued_at&&now()<(access==='write'?grant.write_expires_at:grant.receipt_expires_at),'IMPORT_NATIVE_EXPIRED');invoked=true;value=await fn();await finish(op,'succeeded',proof());return value;}catch(error){await finish(op,invoked?'unknown':'failed',invoked?'provider-or-receipt-uncertain':'not-invoked-fence').catch(()=>{});throw error;}})();
  pending.add(work);try{return await work;}finally{pending.delete(work);}
 }
 const api={
  attachAccounting(charge){fail(!account&&typeof charge==='function','IMPORT_NATIVE_ACCOUNTING_REQUIRED');account=charge;},
  async accountRequestMetadata(){fail(account,'IMPORT_NATIVE_ACCOUNTING_REQUIRED');await account(new TextEncoder().encode(JSON.stringify([handle.id,nonce,requestSha256,lease,action,generation])).length*3+128,3);},
  async prior(){await authority.inspect(handle,'receipt');const r=await requestRow();if(r)fail(r.request_sha256===requestSha256&&r.action===action,'IMPORT_NATIVE_NONCE_CONFLICT');return r;},
  async prepareClaim({requestId,policyHash}){
   const {grant,owner}=await authority.inspect(handle);lease=requestId;policySha=policyHash;generation=grant.generation;
   const t=await db.prepare('SELECT project_id,target,manifest_sha,owner_id,phase FROM process_snapshot_transfers WHERE id=?').bind(pins.transferId).first();
   fail(t&&t.project_id===pins.projectId&&t.target===pins.targetFingerprint&&t.manifest_sha===pins.manifestSha256&&t.owner_id===pins.ownerId&&['receiving','integrity-verified'].includes(t.phase),'IMPORT_NATIVE_PINS');
   return{
    prefix:[db.prepare("INSERT INTO process_import_native_requests(capability_id,nonce,request_sha256,request_id,action,generation,state,created_at) SELECT ?,?,?,?,?,?,'pending',? FROM process_import_capabilities c WHERE c.id=? AND c.generation=? AND c.revoked_at IS NULL AND c.write_expires_at>? AND (SELECT COUNT(*) FROM process_import_native_requests WHERE capability_id=c.id)<c.request_limit AND EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=? AND updated_at=?) ON CONFLICT(capability_id,nonce) DO NOTHING").bind(handle.id,nonce,requestSha256,lease,action,generation,now(),handle.id,generation,now(),owner.revision,owner.updatedAt)],
    condition:"EXISTS(SELECT 1 FROM process_import_native_requests WHERE request_id=? AND state='pending')",bindings:[lease],
    suffix:[db.prepare("UPDATE process_import_native_requests SET state='running' WHERE request_id=? AND state='pending' AND EXISTS(SELECT 1 FROM process_import_budget WHERE id=1 AND active_request=?)").bind(lease,lease)],
   };
  },
  async claimFailed(){const r=await requestRow();if(r){fail(r.request_sha256===requestSha256&&r.action===action,'IMPORT_NATIVE_NONCE_CONFLICT');if(r.request_id!==lease)throw Error('IMPORT_NATIVE_NONCE_REPLAY');await db.prepare("UPDATE process_import_native_requests SET state='blocked',reason='request-not-admitted',finalized_at=? WHERE request_id=? AND state='pending'").bind(now(),lease).run();}else await authority.inspect(handle);throw Error('IMPORT_NATIVE_NOT_ADMITTED');},
  async beforeComplete(){await Promise.allSettled([...pending]);await currentLease();const rows=await db.prepare("SELECT state FROM process_import_native_operations WHERE request_id=? AND state!='succeeded'").bind(lease).all();fail(rows.success&&rows.results.length===0,'IMPORT_NATIVE_OPERATIONS_UNRESOLVED');},
  completionCondition(){return{sql:"EXISTS(SELECT 1 FROM process_import_native_requests WHERE request_id=? AND generation=? AND state='running')",bindings:[lease,generation]};},
  completionStatements(){return[db.prepare("UPDATE process_import_native_requests SET state='complete',finalized_at=? WHERE request_id=? AND generation=? AND state='running'").bind(now(),lease,generation)];},
  async failed(){await Promise.allSettled([...pending]);if(lease)await db.prepare("UPDATE process_import_native_requests SET state='unknown',reason='request-incomplete-or-provider-uncertain',finalized_at=? WHERE request_id=? AND generation=? AND state='running'").bind(now(),lease,generation).run();},
  async metadataBatch(list){for(const{sql,args}of list){const matched=/^\s*(INSERT INTO|UPDATE)\s+["`]?process_snapshot_(chunks|transfers|activations|resource_audits)\b/i.exec(sql),allowed={batch:['chunks'],verify:['transfers'],audit:['activations','resource_audits']},baseline=action==='reconcile-existing'&&/^UPDATE process_import_capabilities SET baseline_cursor=\?,baseline_checked=\?,baseline_verified=\? WHERE id=\?/.test(sql);fail((baseline||matched&&allowed[action]?.includes(matched[2].toLowerCase()))&&!/[;]|--|\/\*/.test(sql)&&Array.isArray(args)&&args.includes(pins.transferId),'IMPORT_NATIVE_BUSINESS_WRITE_REFUSED');}await currentLease();if(action==='batch'){const r=await db.prepare("SELECT COUNT(*) n FROM process_import_native_operations WHERE request_id=? AND kind='r2-put' AND state!='succeeded'").bind(lease).first();fail(r?.n===0,'IMPORT_NATIVE_OPERATIONS_UNRESOLVED');}},
  metadataFence(sql,args){return api.metadataBatch([{sql,args}]);},
  async runMetadata(list,invoke){
   // Exact snapshot receipt/verification/audit metadata is settlement of this
   // admitted request. It is not a new business operation after write expiry.
   await api.metadataBatch(list);fail(account,'IMPORT_NATIVE_ACCOUNTING_REQUIRED');
   fail(++ordinal<=nativeOperationLimits.perRequest,'IMPORT_NATIVE_OPERATION_LIMIT');const digest=await sha256(new TextEncoder().encode(JSON.stringify(list))),op={ordinal};
   await account(512,4);
   const charged=await db.prepare('UPDATE process_import_capabilities SET reserved_operations=reserved_operations+1 WHERE id=? AND reserved_operations<operation_limit AND EXISTS(SELECT 1 FROM process_import_native_requests WHERE request_id=? AND generation=? AND state=\'running\')').bind(handle.id,lease,generation).run();fail(charged.success&&charged.meta.changes===1,'IMPORT_NATIVE_OPERATION_LIMIT');
   const planned=await db.prepare("INSERT INTO process_import_native_operations(request_id,ordinal,kind,object_key,expected_sha256,generation,state,admitted_at) SELECT ?,?,'d1-metadata',?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM process_import_native_requests WHERE request_id=? AND generation=? AND state='running') AND EXISTS(SELECT 1 FROM process_import_budget WHERE id=1 AND active_request=? AND policy_sha=? AND state='open')").bind(lease,ordinal,'@metadata/'+digest,digest,generation,now(),lease,generation,lease,policySha).run();fail(planned.success&&planned.meta.changes===1,'IMPORT_NATIVE_REQUEST_FENCED');
   const work=(async()=>{let invoked=false;try{await currentLease();invoked=true;const result=await invoke();fail(Array.isArray(result)?result.every(r=>r.success):result?.success,'IMPORT_NATIVE_METADATA_UNCONFIRMED');await finish(op,'succeeded','d1-metadata-response');return result;}catch(error){await finish(op,invoked?'unknown':'failed',invoked?'metadata-or-receipt-uncertain':'not-invoked-fence').catch(()=>{});throw error;}})();
   pending.add(work);try{return await work;}finally{pending.delete(work);}
  },
  async reconcileExisting({db:metered,source}){
   fail(action==='reconcile-existing','IMPORT_NATIVE_SCOPE');const {grant}=await live();
   if(grant.baseline_verified===1)return{verified:true,cursor:grant.baseline_cursor,checked:grant.baseline_checked,expected:grant.baseline_receipts};
   const target=await metered.prepare('SELECT version,chunk_count FROM process_snapshot_transfers WHERE id=?').bind(pins.transferId).first(),count=await metered.prepare('SELECT COUNT(*) n FROM process_snapshot_chunks WHERE transfer_id=?').bind(pins.transferId).first();
   fail(target?.version===grant.baseline_version&&target.chunk_count===grant.baseline_chunks&&count?.n===grant.baseline_receipts,'IMPORT_NATIVE_BASELINE_CHANGED');
   const manifest=await source.manifest(),rows=await metered.prepare('SELECT chunk_id,sequence,bytes,sha256 FROM process_snapshot_chunks WHERE transfer_id=? AND sequence>=? ORDER BY sequence LIMIT 16').bind(pins.transferId,grant.baseline_cursor).all();fail(rows.success,'IMPORT_NATIVE_BASELINE_UNAVAILABLE');
   if(rows.results.length)await writeBatchBounded(rows.results,async row=>{const descriptor=manifest.chunks[row.sequence];fail(descriptor&&descriptor.id===row.chunk_id&&descriptor.bytes===row.bytes&&descriptor.sha256===row.sha256,'IMPORT_NATIVE_BASELINE_CONFLICT');const raw=await source.readChunk(row.chunk_id);fail(raw.length===row.bytes&&await sha256(raw)===row.sha256,'IMPORT_NATIVE_BASELINE_CONFLICT');});
   const checked=grant.baseline_checked+rows.results.length,cursor=rows.results.length===16?rows.results.at(-1).sequence+1:grant.baseline_chunks,verified=cursor===grant.baseline_chunks;
   fail(!verified||checked===grant.baseline_receipts,'IMPORT_NATIVE_BASELINE_CONFLICT');
   const result=await metered.prepare('UPDATE process_import_capabilities SET baseline_cursor=?,baseline_checked=?,baseline_verified=? WHERE id=? AND generation=? AND baseline_cursor=? AND baseline_checked=? AND baseline_verified=0 AND EXISTS(SELECT 1 FROM process_snapshot_transfers WHERE id=? AND version=? AND chunk_count=?) AND (SELECT COUNT(*) FROM process_snapshot_chunks WHERE transfer_id=?)=?').bind(cursor,checked,verified?1:0,handle.id,generation,grant.baseline_cursor,grant.baseline_checked,pins.transferId,grant.baseline_version,grant.baseline_chunks,pins.transferId,grant.baseline_receipts).run();fail(result.success&&result.meta.changes===1,'IMPORT_NATIVE_BASELINE_CHANGED');
   return{verified,cursor,checked,expected:grant.baseline_receipts};
  },
  wrapBucket(raw){return{
   get(key,options){return call('r2-get',key,()=>raw.get(key,options),{access:'receipt'});},
   head(key){return call('r2-head',key,()=>raw.head(key),{access:'receipt'});},
   async put(key,bytes,options){
    fail(/^chunks\/c(?:0|[1-9][0-9]*)$/.test(key.slice(prefix.length))&&bytes instanceof Uint8Array&&bytes.length<=1024*1024&&options?.onlyIf?.etagDoesNotMatch==='*','IMPORT_NATIVE_OBJECT_SCOPE');
    const hash=await sha256(bytes);let evidence='readback-sha256';
    return call('r2-put',key,async()=>{
     const result=await raw.put(key,bytes,{...options,sha256:hash}),checksum=result?.checksums?.sha256;
     if(checksum instanceof ArrayBuffer&&Array.from(new Uint8Array(checksum),b=>b.toString(16).padStart(2,'0')).join('')===hash){evidence='provider-sha256-ack';return result;}
     const object=await call('r2-get',key,()=>raw.get(key),{access:'receipt'});fail(object?.body&&object.size===bytes.length,'IMPORT_NATIVE_OBJECT_UNCONFIRMED');
     const reader=object.body.getReader(),parts=[];let size=0;try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;fail(size<=bytes.length,'IMPORT_NATIVE_OBJECT_UNCONFIRMED');parts.push(r.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
     const actual=new Uint8Array(size);let offset=0;for(const part of parts){actual.set(part,offset);offset+=part.length;}fail(size===bytes.length&&await sha256(actual)===hash,'IMPORT_NATIVE_OBJECT_UNCONFIRMED');return result;
    },{bytes:bytes.length,hash,proof:()=>evidence});
   },
   list(options){fail(action==='audit'&&options?.limit===nativeOperationLimits.inventoryPageSize&&Object.keys(options).every(k=>['limit','cursor'].includes(k))&&(options.cursor===undefined||typeof options.cursor==='string'&&options.cursor.length<=512),'IMPORT_NATIVE_OBJECT_SCOPE');fail(++inventoryPages<=nativeOperationLimits.inventoryPages,'IMPORT_NATIVE_INVENTORY_LIMIT');return call('r2-inventory','@inventory/'+pins.targetFingerprint,()=>raw.list(options),{access:'receipt'});},createMultipartUpload(){throw Error('IMPORT_NATIVE_OBJECT_SCOPE');},resumeMultipartUpload(){throw Error('IMPORT_NATIVE_OBJECT_SCOPE');},delete(){throw Error('IMPORT_NATIVE_OBJECT_SCOPE');},
  };},
  async receipt({cursor=0}={}){await authority.inspect(handle,'receipt');fail(Number.isSafeInteger(cursor)&&cursor>=0&&cursor<=512,'IMPORT_NATIVE_RECEIPT_CURSOR');const r=await requestRow();if(!r)return{found:false};fail(r.request_sha256===requestSha256,'IMPORT_NATIVE_NONCE_CONFLICT');const [ops,groups]=await Promise.all([db.prepare('SELECT ordinal,kind,expected_bytes,expected_sha256,state,admitted_at,finalized_at,evidence FROM process_import_native_operations WHERE request_id=? AND ordinal>? ORDER BY ordinal LIMIT 65').bind(r.request_id,cursor).all(),db.prepare('SELECT state,COUNT(*) n FROM process_import_native_operations WHERE request_id=? GROUP BY state').bind(r.request_id).all()]);fail(ops.success&&groups.success,'IMPORT_NATIVE_RECEIPT_LIMIT');const shown=ops.results.slice(0,64),counts={planned:0,pending:0,succeeded:0,failed:0,unknown:0};for(const item of groups.results){fail(Object.hasOwn(counts,item.state)&&Number.isSafeInteger(item.n)&&item.n>=0,'IMPORT_NATIVE_RECEIPT_LIMIT');counts[item.state]=item.n;}return{found:true,nonce,requestSha256:r.request_sha256,action:r.action,state:r.state,counts,operations:shown,nextCursor:ops.results.length>64?shown.at(-1).ordinal:null,automaticRetryAllowed:false};},
 };
 admissions.add(api);return api;
}
