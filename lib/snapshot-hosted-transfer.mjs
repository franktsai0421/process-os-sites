// Owner-authorized transport into an inactive namespace. No deployment, account
// creation, ambient credential access, public download or local-to-live sync.
import {maximumChunkBytes,sha256,validateSnapshot} from './snapshot-contract.mjs';
import {schemaFingerprint} from './snapshot-d1-r2.mjs';
import {validateChunkBatch} from './snapshot-batch.mjs';
export const importNamespace='process-import/v1/';
export const manifestLimit=16*1024*1024;
const hashPattern=/^[a-f0-9]{64}$/;
const ownerIdentity=value=>typeof value==='string'?value.trim().toLowerCase():'';
const encode=value=>new TextEncoder().encode(JSON.stringify(value));
const requireValue=(value,code)=>{if(!value)throw Error(code);};
async function bounded(body,limit){
 const reader=body.getReader(),parts=[];let length=0;
 try{for(;;){const next=await reader.read();if(next.done)break;requireValue(next.value instanceof Uint8Array,'IMPORT_BODY');length+=next.value.length;requireValue(length<=limit,'IMPORT_BODY_LIMIT');parts.push(next.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const out=new Uint8Array(length);let offset=0;for(const bytes of parts){out.set(bytes,offset);offset+=bytes.length;}return out;
}
export async function readImportBody(request,limit){
 const declared=request.headers.get('Content-Length');
 if(declared!==null)requireValue(/^\d+$/.test(declared)&&Number(declared)<=limit,'IMPORT_BODY_LIMIT');
 requireValue(request.body,'IMPORT_BODY');return bounded(request.body,limit);
}
export function authorizeImport(principal,config){
 requireValue(config?.enabled===true,'IMPORT_DISABLED');
 requireValue(typeof config.projectId==='string'&&/^appgprj_[a-zA-Z0-9_]+$/.test(config.projectId)&&hashPattern.test(config.targetFingerprint||'')&&hashPattern.test(config.manifestSha256||'')&&ownerIdentity(config.ownerId).length>0,'IMPORT_CONFIGURATION_REQUIRED');
 requireValue(ownerIdentity(principal?.id)===ownerIdentity(config.ownerId)&&principal.role==='admin'&&principal.sessionType==='platform'&&principal.exportAllowed===true,'IMPORT_OWNER_REQUIRED');
}
export function createHostedTransfer({store,bucket,config,now=()=>Date.now(),reserve=async(_cost,fn)=>fn()}){
 async function authorize(principal){authorizeImport(principal,config);}
 async function selected(principal,id){
  await authorize(principal);requireValue(hashPattern.test(id||''),'IMPORT_TRANSFER_ID');
  const row=await store.get(id);requireValue(row&&ownerIdentity(row.owner_id)===ownerIdentity(principal.id)&&row.target===config.targetFingerprint&&row.project_id===config.projectId&&row.manifest_sha===config.manifestSha256,'IMPORT_TARGET_MISMATCH');
  requireValue(row.expires_at>now(),'IMPORT_EXPIRED_RETAINED');return row;
 }
 async function manifest(row){
  const object=await bucket.get(row.manifest_key);requireValue(object?.body&&object.size<=manifestLimit,'IMPORT_MANIFEST_MISSING');
  const bytes=await bounded(object.body,manifestLimit);requireValue(await sha256(bytes)===row.manifest_sha,'IMPORT_MANIFEST_INTEGRITY');
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));validateSnapshot(value);return value;
 }
 async function immutable(key,bytes){
  const put=await bucket.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/octet-stream'}});
  if(put===null){const existing=await bucket.get(key);requireValue(existing?.body&&existing.size===bytes.length,'IMPORT_OBJECT_CONFLICT');requireValue(await sha256(await bounded(existing.body,bytes.length))===await sha256(bytes),'IMPORT_OBJECT_CONFLICT');}
 }
 async function chunk(row,descriptor){
  const receipt=await store.chunk(row.id,descriptor.id);requireValue(receipt&&receipt.sequence===Number(descriptor.id.slice(1))&&receipt.sha256===descriptor.sha256&&receipt.bytes===descriptor.bytes,'IMPORT_CHUNK_MISSING');
  const object=await bucket.get(importNamespace+row.id+'/chunks/'+descriptor.id);requireValue(object?.body&&object.size===descriptor.bytes,'IMPORT_CHUNK_MISSING');
  const bytes=await bounded(object.body,maximumChunkBytes);requireValue(bytes.length===descriptor.bytes&&await sha256(bytes)===descriptor.sha256,'IMPORT_CHUNK_INTEGRITY');return bytes;
 }
 return {
  async begin(principal,bytes){
   await authorize(principal);requireValue(bytes instanceof Uint8Array&&bytes.length<=manifestLimit,'IMPORT_MANIFEST_LIMIT');
   requireValue(await sha256(bytes)===config.manifestSha256,'IMPORT_MANIFEST_PIN');
   const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),summary=validateSnapshot(value);
   requireValue(value.schemaFingerprint===await schemaFingerprint(),'IMPORT_SCHEMA_MISMATCH');
   // cN is the source transport's stable sequence, not a caller-selected R2 key.
   requireValue(value.chunks.every((c,index)=>c.id==='c'+index),'IMPORT_CHUNK_SEQUENCE');
   const id=await sha256(encode([config.projectId,config.targetFingerprint,config.manifestSha256])),key=importNamespace+id+'/manifest.json';
   const existing=await store.get(id);
   if(existing){requireValue(ownerIdentity(existing.owner_id)===ownerIdentity(principal.id)&&existing.manifest_sha===config.manifestSha256,'IMPORT_OWNER_REQUIRED');requireValue(existing.expires_at>now(),'IMPORT_EXPIRED_RETAINED');return {id,phase:existing.phase,resumed:true,...summary};}
   await store.assertFresh(config.ownerId);
   await immutable(key,bytes);
   const timestamp=now();
   await store.reserve({id,project_id:config.projectId,target:config.targetFingerprint,manifest_sha:config.manifestSha256,manifest_key:key,owner_id:ownerIdentity(principal.id),chunk_count:value.chunks.length,total_bytes:summary.totalBytes,created_at:timestamp,expires_at:timestamp+7*24*60*60*1000});
   const row=await selected(principal,id);return {id,phase:row.phase,resumed:false,...summary};
  },
  async receive(principal,id,chunkId,bytes){
   const row=await selected(principal,id);requireValue(row.phase==='receiving','IMPORT_PHASE');
   requireValue(/^c(?:0|[1-9][0-9]*)$/.test(chunkId||'')&&bytes instanceof Uint8Array&&bytes.length<=maximumChunkBytes,'IMPORT_CHUNK');
   const value=await manifest(row),sequence=Number(chunkId.slice(1)),descriptor=value.chunks[sequence];
   requireValue(descriptor?.id===chunkId&&bytes.length===descriptor.bytes&&await sha256(bytes)===descriptor.sha256,'IMPORT_CHUNK_INTEGRITY');
   await immutable(importNamespace+id+'/chunks/'+chunkId,bytes);
   await store.acknowledge(id,{id:chunkId,sequence,bytes:bytes.length,sha256:descriptor.sha256});
   const receipt=await store.chunk(id,chunkId);requireValue(receipt?.sha256===descriptor.sha256&&receipt.bytes===bytes.length,'IMPORT_RECEIPT_CONFLICT');
   return {id,chunkId,acknowledged:true};
  },
  async receiveBatch(principal,id,bytes){
   const row=await selected(principal,id);requireValue(row.phase==='receiving','IMPORT_PHASE');const value=await manifest(row),parts=await validateChunkBatch(bytes,value);
   const descriptors=parts.map(p=>({id:p.descriptor.id,sequence:Number(p.descriptor.id.slice(1)),bytes:p.descriptor.bytes,sha256:p.descriptor.sha256}));
   const quote={writeBytes:parts.reduce((s,p)=>s+p.bytes.length,0),writeCalls:parts.length,dbBytes:descriptors.reduce((s,c)=>s+encode([id,c.id,c.sequence,c.bytes,c.sha256,id]).length,0),dbStatements:parts.length};
   return reserve(quote,async()=>{
    for(const p of parts)await immutable(importNamespace+id+'/chunks/'+p.descriptor.id,p.bytes);
    await store.acknowledgeMany(id,descriptors);const receipts=await store.chunkRange(id,descriptors[0].sequence,descriptors.at(-1).sequence+1),byId=new Map(receipts.map(r=>[r.chunk_id,r]));
    for(const c of descriptors){const r=byId.get(c.id);requireValue(r&&r.sequence===c.sequence&&r.bytes===c.bytes&&r.sha256===c.sha256,'IMPORT_RECEIPT_CONFLICT');}
    return{id,acknowledged:true,chunks:descriptors.map(c=>({chunkId:c.id,bytes:c.bytes,sha256:c.sha256})),confirmedBytes:quote.writeBytes};
   });
  },
  async status(principal,id,{cursor=0,limit=100}={}){
   const row=await selected(principal,id);requireValue(Number.isSafeInteger(cursor)&&cursor>=0&&cursor<=row.chunk_count&&Number.isSafeInteger(limit)&&limit>0&&limit<=100,'IMPORT_PAGE');
   const value=await manifest(row),end=Math.min(cursor+limit,row.chunk_count),receipts=await store.receipts(id,cursor,end),seen=new Set(receipts.map(r=>r.chunk_id));
   return {id,phase:row.phase,version:row.version,chunkCount:row.chunk_count,received:await store.receivedCount(id),verifiedCursor:row.verify_cursor,missing:value.chunks.slice(cursor,end).filter(c=>!seen.has(c.id)).map(c=>c.id),nextCursor:end<row.chunk_count?end:null,dataReady:false,authReady:false};
  },
  /** @param {{expectedVersion?: number, limit?: number}} [options] */
  async verify(principal,id,options={}){
   const {expectedVersion,limit=8}=options;
   const row=await selected(principal,id);requireValue(Number.isSafeInteger(limit)&&limit>0&&limit<=16,'IMPORT_VERIFY_LIMIT');
   if(row.phase==='integrity-verified')return {id,phase:row.phase,version:row.version,dataReady:false,authReady:false};
   requireValue(row.phase==='receiving'&&row.version===expectedVersion,'IMPORT_VERSION_CONFLICT');
   requireValue(await store.receivedCount(id)===row.chunk_count,'IMPORT_CHUNK_MISSING');
   const value=await manifest(row),end=Math.min(row.verify_cursor+limit,row.chunk_count);
   for(const descriptor of value.chunks.slice(row.verify_cursor,end))await chunk(row,descriptor);
   const phase=end===row.chunk_count?'integrity-verified':'receiving';
   requireValue(await store.advance(id,row.version,end,phase),'IMPORT_VERSION_CONFLICT');
   return {id,phase,version:row.version+1,verifiedCursor:end,dataReady:false,authReady:false};
  },
  async source(principal,id){
   const row=await selected(principal,id);requireValue(row.phase==='integrity-verified','IMPORT_NOT_VERIFIED');
   const value=await manifest(row),descriptors=new Map(value.chunks.map(c=>[c.id,c]));
   return {scope:'private-snapshot',async manifest(){return value;},async readChunk(chunkId){const descriptor=descriptors.get(chunkId);requireValue(descriptor,'IMPORT_CHUNK');return chunk(row,descriptor);}};
  },
 };
}
