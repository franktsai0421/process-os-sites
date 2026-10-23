// One durable request owner across Worker instances. Debit BEFORE every R2 or
// import D1 mutation. No refund, automatic lease expiry, cleanup or reset API.
import {sha256} from './snapshot-contract.mjs';
import {validateAttemptPolicy} from './snapshot-attempt-policy.mjs';
import {assertNewCampaignFresh} from './snapshot-retirement.mjs';
const fail=(v,c)=>{if(!v)throw Error(c);},encode=v=>new TextEncoder().encode(JSON.stringify(v));
export async function createAttemptBudget({db,bucket:originalBucket,policy,pins,now=()=>Date.now()}){
 const selected=policy?validateAttemptPolicy(policy,pins,now()):null;
 const text=selected?JSON.stringify(selected):null,hash=selected?await sha256(encode(selected)):null;
 async function row(){return db.prepare('SELECT * FROM process_import_budget WHERE id=1').first();}
 async function matching(required=false){const r=await row();if(r)fail(selected&&r.policy_sha===hash&&r.policy===text,'IMPORT_ATTEMPT_POLICY_CONFLICT');else fail(!required,'IMPORT_ATTEMPT_NOT_STARTED');return r;}
 async function status(){const r=await matching();return selected?{mode:'bounded-attempt',capacityKnown:false,state:r?.state||'not-started',inFlight:!!r?.active_request,reason:r?.reason||null,used:r?{writeBytes:r.write_bytes,writeCalls:r.write_calls,requests:r.requests,dbBytes:r.db_bytes,dbStatements:r.db_statements}:null,limits:selected}:null;}
 async function run(action,begin,execute){
  fail(['begin','chunk','batch','verify','audit','copy','restore','activate'].includes(action),'IMPORT_ACTION');
  if(!selected){await matching();return execute({db,bucket:b=>b,reserve:async(_cost,fn)=>fn()});}
  validateAttemptPolicy(selected,pins,now());
  if(begin){const old=await matching();if(!old||old.requests===0){
   fail(originalBucket,'IMPORT_ATTEMPT_STORAGE_REQUIRED');const nextId=await sha256(encode([pins.projectId,pins.targetFingerprint,pins.manifestSha256]));try{await assertNewCampaignFresh(db,originalBucket,nextId);}catch(error){if(error?.message==='IMPORT_TARGET_OCCUPIED')throw Error('IMPORT_ATTEMPT_TARGET_NOT_FRESH');throw error;}
   if(!old){
   const r=await db.prepare("INSERT INTO process_import_budget(id,policy_sha,policy,state) VALUES(1,?,?,'open') ON CONFLICT(id) DO NOTHING").bind(hash,text).run();fail(r.success,'IMPORT_ATTEMPT_LEDGER');}}
  }
  await matching(true);const id=crypto.randomUUID();
  const claimed=await db.batch([
   db.prepare("UPDATE process_import_budget SET active_request=?,requests=requests+1 WHERE id=1 AND policy_sha=? AND state='open' AND active_request IS NULL AND requests<?").bind(id,hash,selected.requests),
   db.prepare("INSERT INTO process_import_attempts(id,action,state,created_at) SELECT ?,?,'running',? WHERE EXISTS(SELECT 1 FROM process_import_budget WHERE id=1 AND active_request=?)").bind(id,action,now(),id),
  ]);
  fail(claimed.every(r=>r.success),'IMPORT_ATTEMPT_LEDGER');
  if(claimed[0].meta.changes!==1){const r=await matching(true);fail(r.state!=='complete','IMPORT_ATTEMPT_COMPLETE');fail(r.state==='open','IMPORT_ATTEMPT_STOPPED');fail(!r.active_request,'IMPORT_ATTEMPT_IN_FLIGHT');await db.prepare("UPDATE process_import_budget SET state='stopped',reason='IMPORT_ATTEMPT_REQUEST_LIMIT' WHERE id=1 AND state='open' AND active_request IS NULL AND requests>=?").bind(selected.requests).run();throw Error('IMPORT_ATTEMPT_REQUEST_LIMIT');}
  let reservation=null;
  async function live(){const r=await row();fail(r?.policy_sha===hash&&r.active_request===id&&r.state==='open','IMPORT_ATTEMPT_FENCED');}
  async function debit(writeBytes,writeCalls,dbBytes,dbStatements){
   validateAttemptPolicy(selected,pins,now());
   await live();
   for(const n of [writeBytes,writeCalls,dbBytes,dbStatements])fail(Number.isSafeInteger(n)&&n>=0,'IMPORT_ATTEMPT_COST');
   if(reservation){const costs=[writeBytes,writeCalls,dbBytes,dbStatements];fail(costs.every((n,i)=>n<=reservation[i]),'IMPORT_ATTEMPT_RESERVATION_EXHAUSTED');for(let i=0;i<4;i++)reservation[i]-=costs[i];return;}
   const result=await db.prepare("UPDATE process_import_budget SET write_bytes=write_bytes+?,write_calls=write_calls+?,db_bytes=db_bytes+?,db_statements=db_statements+? WHERE id=1 AND policy_sha=? AND state='open' AND active_request=? AND write_bytes+?<=? AND write_calls+?<=? AND db_bytes+?<=? AND db_statements+?<=?").bind(writeBytes,writeCalls,dbBytes,dbStatements,hash,id,writeBytes,selected.writeBytes,writeCalls,selected.writeCalls,dbBytes,selected.dbBytes,dbStatements,selected.dbStatements).run();
   fail(result.success&&result.meta.changes===1,'IMPORT_ATTEMPT_BUDGET_EXHAUSTED');
  }
  async function reserve(cost,fn){
   fail(action==='batch'&&!reservation&&typeof fn==='function'&&Object.keys(cost||{}).sort().join()==='dbBytes,dbStatements,writeBytes,writeCalls','IMPORT_ATTEMPT_RESERVATION');
   const amounts=[cost.writeBytes,cost.writeCalls,cost.dbBytes,cost.dbStatements];
   // One durable debit covers the server-computed batch quote. Wrapped storage
   // still consumes exact per-operation limits locally BEFORE every mutation.
   // Failures and unused reservation are never refunded; no lock is reset.
   await debit(...amounts);reservation=amounts.slice();try{return await fn();}finally{reservation=null;}
  }
  const statements=new WeakMap();
  function prepare(sql,args=[]){const statement=db.prepare(sql),raw=args.length?statement.bind(...args):statement,read=/^\s*SELECT\b/i.test(sql);const wrapped={bind(...values){return prepare(sql,values);},first(...a){fail(read,'IMPORT_ATTEMPT_SQL');return raw.first(...a);},all(...a){fail(read,'IMPORT_ATTEMPT_SQL');return raw.all(...a);},async run(){if(!read){fail(/^\s*(INSERT|UPDATE)\b/i.test(sql),'IMPORT_ATTEMPT_SQL');await debit(0,0,encode(args).length,1);}return raw.run();}};statements.set(wrapped,{raw,read,sql,bytes:encode(args).length});return wrapped;}
  const meteredDb={prepare,async batch(items){const list=items.map(s=>statements.get(s));fail(list.every(s=>s&&/^\s*(INSERT|UPDATE|SELECT)\b/i.test(s.sql)),'IMPORT_ATTEMPT_SQL');const writes=list.filter(s=>!s.read);await debit(0,0,writes.reduce((n,s)=>n+s.bytes,0),writes.length);return db.batch(list.map(s=>s.raw));}};
  function bucket(raw){
   async function charge(bytes){fail(bytes instanceof Uint8Array,'IMPORT_ATTEMPT_BODY');await debit(bytes.byteLength,1,0,0);}
   function upload(value){return{key:value.key,uploadId:value.uploadId,async uploadPart(number,bytes){await charge(bytes);return value.uploadPart(number,bytes);},async complete(parts){await debit(0,1,0,0);return value.complete(parts);},async abort(){throw Error('IMPORT_ATTEMPT_DELETE_REFUSED');}};}
   return{get:(...a)=>raw.get(...a),head:(...a)=>raw.head(...a),list:(...a)=>raw.list(...a),async put(key,bytes,options){await charge(bytes);return raw.put(key,bytes,options);},async createMultipartUpload(...a){await debit(0,1,0,0);return upload(await raw.createMultipartUpload(...a));},resumeMultipartUpload(...a){return upload(raw.resumeMultipartUpload(...a));},async delete(){throw Error('IMPORT_ATTEMPT_DELETE_REFUSED');}};
  }
  try{
   const result=await execute({db:meteredDb,bucket,reserve});
   validateAttemptPolicy(selected,pins,now());
   const completed=action==='activate'&&result?.phase==='active';
   const done=await db.batch([db.prepare("UPDATE process_import_attempts SET state='complete' WHERE id=? AND state='running'").bind(id),db.prepare("UPDATE process_import_budget SET active_request=NULL,state=? WHERE id=1 AND active_request=? AND state='open'").bind(completed?'complete':'open',id)]);
   fail(done.every(r=>r.success)&&done[1].meta.changes===1,'IMPORT_ATTEMPT_LEDGER');return result;
  }catch(error){
   // A quota/payment/permission exception or unknown write outcome freezes this
   // campaign. If D1 is unavailable the retained active_request also fails closed.
   const code=/^IMPORT_[A-Z_]+$/.test(error?.message)?error.message:'IMPORT_ATTEMPT_PROVIDER_OR_UNCERTAIN';
   // A failure from an older request must not overwrite a durable retirement
   // fence or another campaign. Historical attempts remain separate evidence.
   try{await db.batch([db.prepare("UPDATE process_import_budget SET state='stopped',reason=? WHERE id=1 AND active_request=? AND policy_sha=? AND state='open'").bind(code,id,hash),db.prepare("UPDATE process_import_attempts SET state='stopped' WHERE id=?").bind(id)]);}catch{/* Never unlock or refund an uncertain mutation. */}
   throw Error(code);
  }
 }
 return{run,status};
}
