// Transport-neutral client. The caller must supply an explicitly authorized
// same-origin request function; this module never discovers credentials, reads
// cookies, logs in, installs a relay, or falls back to ambient fetch.
import {sha256,validateSnapshot,maximumChunkBytes} from './snapshot-contract.mjs';
import {assertAttemptPlan} from './snapshot-attempt-policy.mjs';
const hex=/^[a-f0-9]{64}$/,encode=v=>new TextEncoder().encode(JSON.stringify(v));
const fail=(v,c)=>{if(!v)throw Error(c);};
export const d1RowLimitBytes=2_000_000;
export function measureD1Rows(rows){
 fail(Array.isArray(rows)&&rows.every(r=>r&&typeof r==='object'&&!Array.isArray(r)),'UPLOAD_D1_ROWS');let maxCellBytes=0,maxSerializedRowBytes=0;
 for(const row of rows){const bytes=encode(row).length;maxSerializedRowBytes=Math.max(maxSerializedRowBytes,bytes);for(const value of Object.values(row))if(typeof value==='string')maxCellBytes=Math.max(maxCellBytes,new TextEncoder().encode(value).length);}
 // JSON row bytes conservatively include field names/escaping. Leave room for
 // the target-owner verifier/authEpoch overlay; this is not physical DB size.
 fail(maxCellBytes<=d1RowLimitBytes&&maxSerializedRowBytes+4096<=d1RowLimitBytes,'UPLOAD_D1_ROW_LIMIT');return{rows:rows.length,maxCellBytes,maxSerializedRowBytes,ownerOverlayReserveBytes:4096,limitBytes:d1RowLimitBytes};
}
export async function inspectRecipeD1Rows(source,manifest){
 const tables={};for(const table of ['shared_state','state_backups','web_feedback_store']){
  const chunks=manifest.chunks.filter(c=>c.resource==='db/'+table);fail(chunks.length&&chunks[0].totalBytes<=8*1024**2,'UPLOAD_D1_TABLE_LIMIT');const bytes=new Uint8Array(chunks[0].totalBytes);
  for(const c of chunks){const raw=await source.readChunk(c.id);fail(raw.length===c.bytes&&await sha256(raw)===c.sha256,'UPLOAD_CHUNK_INTEGRITY');bytes.set(raw,c.offset);}
  let rows;try{rows=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('UPLOAD_D1_ROWS');}tables[table]=measureD1Rows(rows);
 }return{tables,rowValuesReturned:false,physicalDatabaseSizeMeasured:false};
}
export async function prepareRecipeUpload(source,pins){
 let origin;try{origin=new URL(pins.origin);}catch{throw Error('UPLOAD_TARGET');}
 fail(origin.protocol==='https:'&&origin.origin===pins.origin&&!origin.username&&!origin.password&&/^appgprj_[A-Za-z0-9_]+$/.test(pins.projectId||'')&&hex.test(pins.targetFingerprint||'')&&hex.test(pins.manifestSha256||'')&&typeof pins.ownerId==='string'&&pins.ownerId.length>0,'UPLOAD_TARGET');
 const manifest=await source.manifest(),summary=validateSnapshot(manifest),bytes=encode(manifest);
 fail(manifest.normalization?.format==='PROCESS_OS_CONTENT_ADDRESS_VIEW_V1','UPLOAD_NORMALIZED_VIEW_REQUIRED');
 fail(bytes.length<=16*1024*1024&&await sha256(bytes)===pins.manifestSha256,'UPLOAD_MANIFEST_PIN');
 fail(manifest.chunks.every((c,i)=>c.id==='c'+i&&c.bytes<=maximumChunkBytes),'UPLOAD_CHUNK_SEQUENCE');
 const resources=new Map(manifest.chunks.map(c=>[c.resource,c.totalBytes]));
 const r2Bytes=[...resources].filter(([n])=>n.startsWith('r2/')).reduce((n,[,b])=>n+b,0),dbSerializedBytes=[...resources].filter(([n])=>n.startsWith('db/')).reduce((n,[,b])=>n+b,0);
 const transportBytes=summary.totalBytes+bytes.length,r2PeakLowerBoundBytes=transportBytes+r2Bytes;
 // Headroom is an explicit planning estimate, not a claim about platform quota
 // or the final SQLite file size. It includes owner overlay/multipart overhead.
 const r2PlanningBytes=r2PeakLowerBoundBytes+Math.max(1024**3,Math.ceil(r2PeakLowerBoundBytes*.1));
 const d1PlanningBytes=dbSerializedBytes*4+manifest.chunks.length*4096+1024**2;
 return{manifest,manifestBytes:bytes,pins:{projectId:pins.projectId,origin:pins.origin,ownerId:pins.ownerId,targetFingerprint:pins.targetFingerprint,manifestSha256:pins.manifestSha256},target:{projectId:pins.projectId,targetFingerprint:pins.targetFingerprint},id:await sha256(encode([pins.projectId,pins.targetFingerprint,pins.manifestSha256])),summary:{chunks:manifest.chunks.length,resources:resources.size,dbSerializedBytes,r2Bytes,transportBytes,r2PeakLowerBoundBytes,r2PlanningBytes,d1PlanningBytes,capacityMeasured:false,authenticatedTransportReady:false}};
}
export function assertUploadCapacity(plan,capacity,now=Date.now()){
 fail(capacity&&capacity.projectId===plan.target.projectId&&capacity.targetFingerprint===plan.target.targetFingerprint&&typeof capacity.reference==='string'&&capacity.reference.length>0&&Number.isFinite(Date.parse(capacity.checkedAt))&&Date.parse(capacity.checkedAt)<=now&&now-Date.parse(capacity.checkedAt)<=24*3600_000,'UPLOAD_CAPACITY_EVIDENCE_REQUIRED');
 fail(Number.isSafeInteger(capacity.r2AvailableBytes)&&capacity.r2AvailableBytes>=plan.summary.r2PlanningBytes&&Number.isSafeInteger(capacity.d1AvailableBytes)&&capacity.d1AvailableBytes>=plan.summary.d1PlanningBytes,'UPLOAD_CAPACITY_INSUFFICIENT');
}
async function readReply(response){
 fail(response&&Number.isInteger(response.status)&&response.status>=200&&(response.status<300||response.status>=400)&&response.redirected!==true,'UPLOAD_REDIRECT_REFUSED');
 if(response.status===401||response.status===403)throw Error('UPLOAD_AUTH_REQUIRED');
 fail(response.headers.get('Content-Type')?.split(';')[0]==='application/json','UPLOAD_RESPONSE_FORMAT');
 const reader=response.body?.getReader();fail(reader,'UPLOAD_RESPONSE_FORMAT');const parts=[];let size=0;
 try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;fail(size<=65536,'UPLOAD_RESPONSE_LIMIT');parts.push(r.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('UPLOAD_RESPONSE_FORMAT');}
 if(!response.ok)throw Error(typeof value?.error==='string'&&/^IMPORT_[A-Z0-9_]+$/.test(value.error)?value.error:'UPLOAD_HTTP_REFUSED');
 fail(value&&typeof value==='object'&&!Array.isArray(value),'UPLOAD_RESPONSE_FORMAT');return value;
}
export async function createRecipeUploader({source,pins,request,signal,onProgress=async(_progress)=>{}}){
 const plan=await prepareRecipeUpload(source,pins);fail(typeof request==='function','UPLOAD_AUTHENTICATED_TRANSPORT_REQUIRED');
 const check=()=>fail(!signal?.aborted,'UPLOAD_CANCELLED');
 async function send(method,params={},body){
  check();const url=new URL('/api/snapshots/import',pins.origin);for(const [k,v]of Object.entries(params))if(v!==undefined)url.searchParams.set(k,String(v));
  let response;try{response=await request(url.href,{method,redirect:'error',headers:{Origin:pins.origin,...(body?{'Content-Type':method==='PUT'?'application/octet-stream':'application/json'}:{})},...(body?{body}:{}),signal});}catch{throw Error(method==='GET'?'UPLOAD_TRANSPORT_UNAVAILABLE':'UPLOAD_WRITE_OUTCOME_UNCERTAIN');}
  const value=await readReply(response);if(value.id!==undefined)fail(value.id===plan.id,'UPLOAD_TRANSFER_MISMATCH');return value;
 }
 async function status(cursor=0){const value=await send('GET',{id:plan.id,cursor});fail(value.id===plan.id&&value.chunkCount===plan.manifest.chunks.length&&Number.isSafeInteger(value.version)&&value.version>=0&&Number.isSafeInteger(value.verifiedCursor)&&value.verifiedCursor>=0&&value.verifiedCursor<=value.chunkCount&&['receiving','integrity-verified'].includes(value.phase),'UPLOAD_STATUS_MISMATCH');return value;}
 async function missing(){
  const ids=[];let cursor=0;
  do{const page=await status(cursor);fail(Array.isArray(page.missing),'UPLOAD_STATUS_MISMATCH');const end=Math.min(cursor+100,page.chunkCount);fail(page.nextCursor===(end<page.chunkCount?end:null)&&page.missing.every(id=>{if(typeof id!=='string')return false;const d=plan.manifest.chunks[Number(id.slice(1))];return d?.id===id&&Number(id.slice(1))>=cursor&&Number(id.slice(1))<end;}),'UPLOAD_PAGE_MISMATCH');ids.push(...page.missing);cursor=page.nextCursor;}while(cursor!==null);
  fail(new Set(ids).size===ids.length,'UPLOAD_PAGE_MISMATCH');return ids;
 }
 function allow(options){fail(options?.allowDataWrite===true,'UPLOAD_DATA_WRITE_NOT_AUTHORIZED');fail(!(options.capacity&&options.attempt),'IMPORT_ATTEMPT_AMBIGUOUS');if(options.attempt)assertAttemptPlan(plan,options.attempt);else assertUploadCapacity(plan,options.capacity);}
 return{summary:plan.summary,transferId:plan.id,
  async upload(options){
   allow(options);check();
   await inspectRecipeD1Rows(source,plan.manifest);check();
   if(!options.resume)await send('POST',{action:'begin'},plan.manifestBytes);
   let row=await status();
   if(row.phase==='receiving')for(const id of await missing()){
    check();const descriptor=plan.manifest.chunks[Number(id.slice(1))],bytes=await source.readChunk(id);check();fail(bytes instanceof Uint8Array&&bytes.length===descriptor.bytes&&await sha256(bytes)===descriptor.sha256,'UPLOAD_CHUNK_INTEGRITY');
    try{const ack=await send('PUT',{id:plan.id,chunk:id},bytes);fail(ack.acknowledged===true&&ack.chunkId===id,'UPLOAD_ACK_MISMATCH');}
    catch(error){if(error.message!=='UPLOAD_WRITE_OUTCOME_UNCERTAIN')throw error;const page=await status(Number(id.slice(1)));fail(Array.isArray(page.missing)&&!page.missing.includes(id),'UPLOAD_WRITE_OUTCOME_UNCERTAIN');}
    await onProgress({stage:'chunk-acknowledged',sequence:Number(id.slice(1)),totalChunks:plan.manifest.chunks.length});
   }
   row=await status();while(row.phase==='receiving'){const before=row;const next=await send('POST',{id:plan.id,action:'verify',version:row.version});fail(Number.isSafeInteger(next.version)&&next.version>before.version&&next.verifiedCursor>before.verifiedCursor,'UPLOAD_VERIFY_NO_PROGRESS');row=await status();}
   fail(row.phase==='integrity-verified','UPLOAD_PHASE');return{id:plan.id,phase:row.phase,dataReady:false,businessTrafficEnabled:false};
  },
  async restore(options){
   allow(options);check();let row=await send('GET',{id:plan.id,action:'activation-status'});
   while(!['data-ready','active'].includes(row.phase)){
    const action=({ 'not-audited':'audit',auditing:'audit',sealed:'copy',copying:'copy',restoring:'restore'})[row.phase];fail(action,'UPLOAD_ACTIVATION_PHASE');
    const next=await send('POST',{id:plan.id,action,version:row.version});fail(next.phase!==row.phase||Number.isSafeInteger(next.version)&&next.version>row.version,'UPLOAD_ACTIVATION_NO_PROGRESS');row=next;await onProgress({stage:row.phase});
   }
   if(row.phase==='data-ready'&&options.allowActivation===true){
    do{const old=row;row=await send('POST',{id:plan.id,action:'activate',version:row.version});fail(row.phase==='active'||Number.isSafeInteger(row.version)&&row.version>old.version,'UPLOAD_ACTIVATION_NO_PROGRESS');}while(row.phase!=='active');
   }
   return{id:plan.id,phase:row.phase,dataReady:true,businessTrafficEnabled:row.phase==='active'&&row.businessTrafficEnabled===true,employeeCredentialsMigrated:false};
  },
 };
}
