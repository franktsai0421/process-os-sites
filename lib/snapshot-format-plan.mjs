// Process OS's two explicit container profiles. Bounded metadata/pack caches;
// output callbacks are private transport or isolated writes, never live source.
import {createHash} from 'node:crypto';
import {cleanJson,readBoundedBody,maximumJsonBytes} from './snapshot-redaction.mjs';
import {rewriteChunkedManifest} from './snapshot-chunked.mjs';
import {prepareFeedbackZip} from './snapshot-feedback-zip.mjs';
const encode=value=>new TextEncoder().encode(JSON.stringify(value));
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function chunkReference(key){const sha256=key.match(/^state-chunks\/v1\/manifests\/([a-f0-9]{64})\.json$/)?.[1];if(!sha256)throw Error('SNAPSHOT_CHUNK_MANIFEST_REF');return {version:1,key,sha256};}
export async function planChunkInventory({objects,readObject,knownKeys}){
  const manifests=objects.filter(o=>o.encoding==='chunk-manifest'),packs=objects.filter(o=>o.encoding==='chunk-pack'),coverage=new Map(),plans=new Map(),outputs=new Map(),chunkRewrites=new Map();let referenceCount=0;
  for(const object of [...manifests,...packs]){
    if(Object.keys(object.customMetadata||{}).length||Object.keys(object.httpMetadata||{}).some(key=>key!=='contentType'))throw Error('SNAPSHOT_CHUNK_OBJECT_PROFILE');
  }
  for(const object of manifests){
    const result=await rewriteChunkedManifest({reference:chunkReference(object.key),readObject,knownKeys,writeObject:async(key,bytes)=>{
      const digest=hash(bytes),previous=outputs.get(key);
      if(!key.includes(digest)||previous&&previous.sha256!==digest)throw Error('SNAPSHOT_CHUNK_OUTPUT_COLLISION');
      const descriptor={key,size:bytes.length,sha256:digest,encoding:key.includes('/manifests/')?'chunk-manifest':'chunk-pack'};
      outputs.set(key,descriptor);if(outputs.size>10000)throw Error('SNAPSHOT_R2_INVENTORY_LIMIT');
    }});
    referenceCount+=result.references.size;if(referenceCount>100000)throw Error('SNAPSHOT_CHUNK_REFERENCE_INDEX_LIMIT');
    plans.set(object.key,{reference:result.reference,references:result.references});chunkRewrites.set(object.key,result.reference);
    for(const item of result.sourceCoverage.packs){
      const slots=coverage.get(item.key)||{bits:new Uint8Array(0),count:0};
      for(const index of item.slots){if(!Number.isSafeInteger(index)||index<0||index>=131072)throw Error('SNAPSHOT_CHUNK_LOCATION');const byte=index>>>3,mask=1<<(index&7);if(byte>=slots.bits.length){const bits=new Uint8Array(byte+1);bits.set(slots.bits);slots.bits=bits;}if(!(slots.bits[byte]&mask)){slots.bits[byte]|=mask;slots.count++;}}
      coverage.set(item.key,slots);
    }
  }
  // A partially used source pack can be shared across historical manifests.
  // Qualify their union; orphan slots/objects are never silently discarded.
  for(const object of packs){
    if(object.size>256*1024)throw Error('SNAPSHOT_CHUNK_OBJECT_MISSING_OR_LIMIT');
    const entry=await readObject(object.key);if(!entry?.body)throw Error('SNAPSHOT_CHUNK_OBJECT_MISSING_OR_LIMIT');
    const bytes=await readBoundedBody(entry.body,256*1024),id=object.key.slice(object.key.lastIndexOf('/')+1);
    if(bytes.length!==object.size||hash(bytes)!==id)throw Error('SNAPSHOT_CHUNK_PACK_HASH');
    const parts=JSON.parse(decode(bytes)),slots=coverage.get(object.key);
    if(!Array.isArray(parts)||!parts.length||!slots||slots.count!==parts.length||parts.some((part,index)=>typeof part!=='string'||!(slots.bits[index>>>3]&(1<<(index&7)))))throw Error('SNAPSHOT_CHUNK_UNCOVERED_PACK_CONTENT');
  }
  const listed=new Set(packs.map(object=>object.key));for(const key of coverage.keys())if(!listed.has(key))throw Error('SNAPSHOT_REFERENCE_MISSING');
  for(const ref of chunkRewrites.values())if(!chunkRewrites.has(ref.key))chunkRewrites.set(ref.key,ref);
  return {plans,outputs,chunkRewrites};
}
export async function* producedObjects(produce){
  const stream=new TransformStream(undefined,{highWaterMark:1},{highWaterMark:1}),writer=stream.writable.getWriter(),reader=stream.readable.getReader();
  const completion=(async()=>{try{await produce((key,bytes)=>writer.write({key,bytes}));await writer.close();}catch(error){await writer.abort(error).catch(()=>{});throw error;}})();
  completion.catch(()=>{});
  try{while(true){const next=await reader.read();if(next.done)break;yield next.value;}await completion;}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();await completion.catch(()=>{});}
}
export function feedbackStore(tables){
  if(tables.web_feedback_store?.length!==1)throw Error('SNAPSHOT_FEEDBACK_STORE');
  const value=JSON.parse(tables.web_feedback_store[0].payload);
  if(!value||!Array.isArray(value.handoffs)||!Array.isArray(value.attachments)||!Array.isArray(value.issues)||!Array.isArray(value.batches))throw Error('SNAPSHOT_FEEDBACK_STORE');
  return value;
}
export function applyFeedbackPlans(tables,plans){
  const store=feedbackStore(tables);
  for(const record of store.handoffs){const plan=plans.get('web-feedback/v1/'+record.id+'.zip');if(!plan)throw Error('SNAPSHOT_FEEDBACK_ARCHIVE_MISSING');record.size=plan.bytes;record.sha256=plan.sha256;}
  tables.web_feedback_store[0].payload=JSON.stringify(store);return tables;
}
export async function prepareFeedbackArchive({object,tables,readRange,knownKeys,rewrite=new Map(),chunkRewrites=null}){
  const store=feedbackStore(tables),id=object.key.match(/^web-feedback\/v1\/(H-[A-Za-z0-9_-]{10,100})\.zip$/)?.[1],records=store.handoffs.filter(record=>record.id===id);
  if(!id||records.length!==1)throw Error('SNAPSHOT_FEEDBACK_ARCHIVE_UNREFERENCED');
  const record=records[0],rawHash=createHash('sha256');
  if(!Number.isSafeInteger(object.size)||object.size<22||object.size>64*1024*1024)throw Error('SNAPSHOT_ZIP_LIMIT');
  if(record.size!==object.size||!/^[a-f0-9]{64}$/.test(record.sha256||''))throw Error('SNAPSHOT_FEEDBACK_ARCHIVE_METADATA');
  for(let offset=0;offset<object.size;offset+=65536){const length=Math.min(65536,object.size-offset),bytes=await readRange(object.key,offset,length);if(bytes.length!==length)throw Error('SNAPSHOT_R2_SHORT_READ');rawHash.update(bytes);}
  if(rawHash.digest('hex')!==record.sha256)throw Error('SNAPSHOT_FEEDBACK_ARCHIVE_HASH');
  const source={size:object.size,readRange:(offset,length)=>readRange(object.key,offset,length)},references=new Set();
  const plan=await prepareFeedbackZip(source,{handoffId:id,knownKeys,rewrite,chunkRewrites,references});
  const expected=cleanJson(record.issues,{knownKeys,rewrite,chunkRewrites,references});
  if(JSON.stringify(expected)!==JSON.stringify(plan.issues))throw Error('SNAPSHOT_FEEDBACK_ISSUE_MISMATCH');
  const ids=plan.issues.map(issue=>issue.id);
  if(hash(encode(ids))!==record.digest)throw Error('SNAPSHOT_FEEDBACK_ISSUE_DIGEST');
  for(const attachment of plan.attachments){const source=store.attachments.filter(a=>a.id===attachment.id);if(source.length!==1||source[0].size!==attachment.size||source[0].sha256!==attachment.sha256)throw Error('SNAPSHOT_FEEDBACK_ATTACHMENT_MISMATCH');}
  for(const key of references)if(!knownKeys.has(key))throw Error('SNAPSHOT_REFERENCE_MISSING');
  return plan;
}
export function validateFeedbackCoverage(tables,objects){
  const store=feedbackStore(tables),keys=new Set(objects.map(o=>o.key)),ids=new Set();
  for(const record of store.handoffs){if(typeof record.id!=='string'||ids.has(record.id)||!keys.has('web-feedback/v1/'+record.id+'.zip'))throw Error('SNAPSHOT_FEEDBACK_ARCHIVE_MISSING');ids.add(record.id);}
  const attachments=new Set();for(const attachment of store.attachments){if(typeof attachment.id!=='string'||attachments.has(attachment.id)||!keys.has('web-feedback/v1/'+attachment.id))throw Error('SNAPSHOT_FEEDBACK_ATTACHMENT_MISSING');attachments.add(attachment.id);}
}
export async function validateFeedbackAttachments({tables,objects,readRange}){
  const pins=new Map(objects.map(object=>[object.key,object]));
  for(const attachment of feedbackStore(tables).attachments){
    const key='web-feedback/v1/'+attachment.id,pin=pins.get(key),hashValue=createHash('sha256');
    if(!pin||pin.encoding!=='binary'||pin.size!==attachment.size||!Number.isSafeInteger(pin.size)||pin.size<1||pin.size>5_000_000||!/^[a-f0-9]{64}$/.test(attachment.sha256||''))throw Error('SNAPSHOT_FEEDBACK_ATTACHMENT_MISMATCH');
    for(let offset=0;offset<pin.size;offset+=65536){const length=Math.min(65536,pin.size-offset),bytes=await readRange(key,offset,length);if(bytes.length!==length)throw Error('SNAPSHOT_R2_SHORT_READ');hashValue.update(bytes);}
    if(hashValue.digest('hex')!==attachment.sha256)throw Error('SNAPSHOT_FEEDBACK_ATTACHMENT_HASH');
  }
}
