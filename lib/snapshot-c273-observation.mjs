// Exact operator observation, not a transfer retry, recovery or credential grant.
import {sha256} from './snapshot-contract.mjs';
import {consumeImportBody} from './snapshot-body.mjs';
export const c273Case=Object.freeze({projectId:'appgprj_6ad9abaff47c8191846eb9821034696b',origin:'https://process-os-test.franktsai0421.chatgpt.site',ownerId:'frank',targetFingerprint:'c5311ad0524330b7c913757fc2dc54796ecd569f0b0755f6a3b31396c8d58e80',manifestSha256:'326dc9372fab57554b96965c19815044d0cab6e6a28b6849f6d224c4906b7510',transferId:'35006091ac686b2d6288015904f45d74338752151975334b9c7da3b3c500853e',requestId:'787e1f35-5e06-4db9-a9f9-cc5fc61b8670',capabilityId:'ic_5de30c8b8ec5524a4ccbe71b4e405e17',nonce:'9517c2ec-3e4b-4590-97a7-2b4889fbbac9',requestSha256:'7545c9f10691d093183e35a3e6faaa077737db42251c3c5574cdd49520087257',policySha256:'4b8059c0e1fac3a6df065e31210d26b4681cbbf749c291b17959df0a9cb9b78e',chunkId:'c273',bytes:14234,sha256:'362d40c57b949ad0dfbd7f22cd406dc5c6d95a3c4cd3ecf8f29e3f3d0b286478'});
const C=c273Case,key='process-import/v1/'+C.transferId+'/chunks/c273';
const stages=new Set(['ready','disabled','claim','fetch','response','body-read','body-check','body-hash','complete','settlement','unavailable']);
const statuses=new Set(['ready','disabled','matched','mismatch','unknown','not-dispatched']);
const fail=(ok,code)=>{if(!ok)throw Error(code);};
const reply=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const result=(status,stage,size=null,hash=null,elapsedMs=0)=>({status,stage,size,sha256:hash,elapsedMs});
function safe(value){fail(value&&Object.keys(value).sort().join()==='elapsedMs,sha256,size,stage,status'&&statuses.has(value.status)&&stages.has(value.stage)&&(value.size===null||Number.isSafeInteger(value.size)&&value.size>=0&&value.size<=1048576)&&(value.sha256===null||typeof value.sha256==='string'&&/^[a-f0-9]{64}$/.test(value.sha256))&&Number.isSafeInteger(value.elapsedMs)&&value.elapsedMs>=0,'OBS_RECEIPT');return value;}
function cancelBody(object){try{void object?.body?.cancel().catch(()=>{});}catch{/* Never await unbounded provider cleanup. */}}
async function bounded(promise,ms,signal){
 let timer,abort;const stopped=new Promise((_,reject)=>{abort=()=>reject(Error('OBS_CANCELLED'));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();timer=setTimeout(()=>reject(Error('OBS_DEADLINE')),ms);});
 try{return await Promise.race([promise,stopped]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
// Pure bounded reader. The production factory below always supplies the fixed
// server-owned key/descriptor; expectations are not accepted from HTTP input.
export async function observeBoundedObject({bucket,key,expectedBytes,expectedSha256,signal,timeoutMs=15000,notAfter=Infinity,now=()=>Date.now()}){
 fail(typeof key==='string'&&Number.isSafeInteger(expectedBytes)&&expectedBytes>0&&expectedBytes<=1048576&&/^[a-f0-9]{64}$/.test(expectedSha256)&&Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=15000,'OBS_READ_CONFIGURATION');
 let stage='fetch',size=null,hash=null,object;const controller=new AbortController(),abort=()=>controller.abort(),start=performance.now();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 try{
  fail(!controller.signal.aborted&&now()<notAfter,'OBS_CANCELLED');
  const work=(async()=>{const pending=Promise.resolve(bucket.get(key));pending.then(o=>{if(controller.signal.aborted)cancelBody(o);},()=>{});object=await pending;fail(!controller.signal.aborted,'OBS_CANCELLED');stage='response';fail(object?.body&&Number.isSafeInteger(object.size),'OBS_RESPONSE');size=object.size;fail(size===expectedBytes,'OBS_SIZE');
   const body=await consumeImportBody(object.body,expectedBytes,{signal:controller.signal,timeoutMs:Math.min(timeoutMs,10000),expectedBytes,onPhase:p=>{stage=p;}});hash=body.sha256;fail(!controller.signal.aborted&&hash===expectedSha256,'OBS_HASH');stage='complete';return result('matched',stage,size,hash,Math.ceil(performance.now()-start));})();
  return await bounded(work,timeoutMs,controller.signal);
 }catch(e){return result(e?.message==='OBS_SIZE'||e?.message==='OBS_HASH'||e?.message==='IMPORT_BODY_INTEGRITY'?'mismatch':'unknown',stages.has(stage)?stage:'unavailable',Number.isSafeInteger(size)&&size>=0&&size<=1048576?size:null,hash,Math.ceil(performance.now()-start));}
 finally{controller.abort();signal?.removeEventListener('abort',abort);cancelBody(object);}
}
export async function createC273Observation({db,bucket,pins,programCommit,enabled=false,configuration,readOwnerEligibility,recoveryClosed=true,now=()=>Date.now(),readTimeoutMs=15000,controlTimeoutMs=5000,readObject=observeBoundedObject}){
 fail(Object.keys(pins||{}).length===6&&['projectId','origin','ownerId','targetFingerprint','manifestSha256','transferId'].every(k=>pins[k]===C[k])&&/^[a-f0-9]{40}$/.test(programCommit||'')&&!/^0+$/.test(programCommit)&&typeof readOwnerEligibility==='function','OBS_CONFIGURATION');
 fail(Number.isSafeInteger(readTimeoutMs)&&readTimeoutMs>0&&readTimeoutMs<=15000&&Number.isSafeInteger(controlTimeoutMs)&&controlTimeoutMs>0&&controlTimeoutMs<=5000,'OBS_CONFIGURATION');
 const caseSha=await sha256(new TextEncoder().encode(JSON.stringify(C)));
 const guard=[
  ["EXISTS(SELECT 1 FROM process_snapshot_transfers WHERE id=? AND project_id=? AND target=? AND manifest_sha=? AND owner_id=? AND phase='receiving' AND version=19 AND verify_cursor=272 AND chunk_count=1401 AND total_bytes=275566702)",[C.transferId,C.projectId,C.targetFingerprint,C.manifestSha256,C.ownerId]],
  ["EXISTS(SELECT 1 FROM process_import_budget WHERE id=1 AND policy_sha=? AND state='stopped' AND active_request=? AND reason='IMPORT_ATTEMPT_PROVIDER_OR_UNCERTAIN' AND write_bytes=276216440 AND write_calls=1402 AND requests=158 AND db_bytes=2271529 AND db_statements=9476)",[C.policySha256,C.requestId]],
  ["EXISTS(SELECT 1 FROM process_import_native_requests WHERE request_id=? AND capability_id=? AND nonce=? AND request_sha256=? AND action='verify' AND generation=1 AND state='unknown' AND created_at=1792807686316 AND finalized_at=1792807703351 AND reason='request-incomplete-or-provider-uncertain')",[C.requestId,C.capabilityId,C.nonce,C.requestSha256]],
  ["EXISTS(SELECT 1 FROM process_import_native_operations WHERE request_id=? AND ordinal=3 AND kind='r2-get' AND object_key=? AND expected_bytes IS NULL AND expected_sha256 IS NULL AND generation=1 AND state='unknown' AND admitted_at=1792807701395 AND finalized_at=1792807703103 AND evidence='provider-or-receipt-uncertain')",[C.requestId,key]],
  ["(SELECT COUNT(*) FROM process_import_native_operations WHERE request_id=?)=3",[C.requestId]],
  ["EXISTS(SELECT 1 FROM process_import_native_operations WHERE request_id=? AND ordinal=1 AND state='succeeded' AND evidence=?)",[C.requestId,'provider-body-sha256:'+C.manifestSha256]],
  ["EXISTS(SELECT 1 FROM process_import_native_operations WHERE request_id=? AND ordinal=2 AND state='succeeded' AND evidence='provider-body-sha256:36102900dbb1078dc5c6f8007b404bf3757a03a74e3b1dcb354f3dcb4fc8c94b')",[C.requestId]],
  ["EXISTS(SELECT 1 FROM process_snapshot_chunks WHERE transfer_id=? AND chunk_id='c273' AND sequence=273 AND bytes=? AND sha256=?)",[C.transferId,C.bytes,C.sha256]],
  ["EXISTS(SELECT 1 FROM process_snapshot_target WHERE id=1 AND target=? AND transfer_id=?)",[C.targetFingerprint,C.transferId]],
  ["NOT EXISTS(SELECT 1 FROM process_snapshot_activations WHERE transfer_id=?)",[C.transferId]],
 ];
 const guardSql=guard.map(x=>'('+x[0]+')').join(' AND '),guardArgs=guard.flatMap(x=>x[1]);
 const row=()=>bounded(db.prepare('SELECT * FROM process_import_c273_observation WHERE id=1').first(),controlTimeoutMs);
 function show(r){if(!r)return result('disabled','disabled');fail(r.case_sha===caseSha,'OBS_CASE');return r.state==='finished'?safe(JSON.parse(r.receipt)):result('unknown','claim');}
 async function owner(){const o=await bounded(readOwnerEligibility(),controlTimeoutMs);fail(o?.id==='frank'&&o.enabled===true&&o.role==='admin'&&o.exportAllowed===true&&o.authEpoch===0&&Number.isSafeInteger(o.revision)&&typeof o.updatedAt==='string','OBS_OWNER');return o;}
 function window(){const c=typeof configuration==='string'?JSON.parse(configuration):configuration;fail(recoveryClosed&&c&&Object.keys(c).sort().join()==='expiresAt,format,issuedAt,programCommit'&&c.format==='PROCESS_OS_C273_OBSERVATION_V1'&&c.programCommit===programCommit&&[c.issuedAt,c.expiresAt].every(Number.isSafeInteger)&&c.issuedAt>=0&&c.expiresAt>c.issuedAt&&c.expiresAt<=c.issuedAt+600000&&now()>=c.issuedAt&&now()<c.expiresAt,'OBS_WINDOW');return c;}
 return{async handle(request,principal){
  let admitted=false,claimNonce,observation=result('unknown','claim');
  try{
   const u=new URL(request.url);fail(u.origin===C.origin&&u.pathname==='/api/snapshots/import'&&!u.username&&!u.password&&!u.hash&&u.searchParams.toString()==='action=c273-observation'&&!request.headers.has('Authorization'),'OBS_DESTINATION');
   fail(principal?.id==='frank'&&principal.role==='admin'&&principal.sessionType==='platform'&&principal.exportAllowed===true,'OBS_OWNER');await owner();
   if(request.method==='GET'){const existing=await row();return reply(existing?show(existing):enabled?(window(),result('ready','ready')):result('disabled','disabled'));}
   fail(request.method==='POST'&&request.headers.get('Origin')===C.origin&&request.headers.get('Sec-Fetch-Site')!=='cross-site','OBS_METHOD_OR_ORIGIN');
   fail(enabled,'OBS_DISABLED');const c=window();if(request.body){const b=await consumeImportBody(request.body,2,{signal:request.signal,timeoutMs:1000});fail(b.bytes.length===0||new TextDecoder().decode(b.bytes)==='{}','OBS_BODY');}
   const existing=await row();if(existing)return reply(show(existing));
   const currentOwner=await owner(),at=now();fail(!request.signal.aborted&&at>=c.issuedAt&&at<c.expiresAt,'OBS_WINDOW');claimNonce=crypto.randomUUID();
   const claimed=await bounded(db.prepare("INSERT INTO process_import_c273_observation(id,case_sha,program_commit,claim_nonce,issued_at,expires_at,claimed_at,state,r2_get_reserved) SELECT 1,?,?,?,?,?,?,'claimed',1 WHERE "+guardSql+" AND EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=? AND updated_at=?) ON CONFLICT(id) DO NOTHING").bind(caseSha,programCommit,claimNonce,c.issuedAt,c.expiresAt,at,...guardArgs,currentOwner.revision,currentOwner.updatedAt).run(),controlTimeoutMs,request.signal);
   fail(claimed.success,'OBS_CLAIM_UNCONFIRMED');if(claimed.meta.changes!==1){const prior=await row();return reply(prior?show(prior):result('not-dispatched','claim'),409);}admitted=true;
   let readStarted=false;const controller=new AbortController(),abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
   try{
    const current=await owner(),still=await bounded(db.prepare('SELECT CASE WHEN '+guardSql+' AND EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=? AND updated_at=?) THEN 1 ELSE 0 END AS ok').bind(...guardArgs,current.revision,current.updatedAt).first(),controlTimeoutMs,controller.signal);window();fail(still?.ok===1&&!controller.signal.aborted&&now()<c.expiresAt,'OBS_INCIDENT_CHANGED');
    readStarted=true;observation=safe(await readObject({bucket,key,expectedBytes:C.bytes,expectedSha256:C.sha256,signal:controller.signal,timeoutMs:Math.max(1,Math.min(readTimeoutMs,c.expiresAt-now())),notAfter:c.expiresAt,now}));fail(observation.status!=='matched'||observation.size===C.bytes&&observation.sha256===C.sha256,'OBS_RESULT');
   }catch{observation=result(readStarted?'unknown':'not-dispatched',readStarted?'unavailable':'claim');}
   finally{controller.abort();request.signal.removeEventListener('abort',abort);}
   try{const saved=await bounded(db.prepare("UPDATE process_import_c273_observation SET state='finished',finished_at=?,receipt=? WHERE id=1 AND claim_nonce=? AND state='claimed'").bind(now(),JSON.stringify(safe(observation)),claimNonce).run(),controlTimeoutMs);fail(saved.success&&saved.meta.changes===1,'OBS_SETTLEMENT');}catch{try{console.error(JSON.stringify(safe(observation)));}catch{}return reply(result('unknown','settlement',observation.size,observation.sha256,observation.elapsedMs),409);}
   await owner();return reply(observation,observation.status==='matched'?200:409);
  }catch(e){return reply(result('unknown',admitted?'settlement':'unavailable'),e?.message==='OBS_OWNER'?403:e?.message==='OBS_DISABLED'?404:409);}
 }};
}
