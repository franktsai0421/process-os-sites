import {sha256,maximumChunkBytes} from './snapshot-contract.mjs';
import {cleanJson,readBoundedBody,scrubJsonBytes,objectEncoding,maximumJsonBytes} from './snapshot-redaction.mjs';
import {createHash} from 'node:crypto';
import {jsonTransformStream,analyzeJsonStream} from './snapshot-json-stream.mjs';
import {rewriteChunkedManifest} from './snapshot-chunked.mjs';
import {planChunkInventory,producedObjects,chunkReference,prepareFeedbackArchive,applyFeedbackPlans,validateFeedbackCoverage,validateFeedbackAttachments} from './snapshot-format-plan.mjs';
export const snapshotTables=Object.freeze({
  shared_state:['id','revision','values','updated_at'],
  state_backups:['id','revision','values','reason','actor','created_at'],
  web_feedback_store:['id','revision','payload'],
});
const encoder=new TextEncoder(),maximumRows=1024,maximumObjects=10000;
const jsonBytes=value=>encoder.encode(JSON.stringify(value));
export const schemaFingerprint=()=>sha256(jsonBytes(snapshotTables));
async function captureDatabase(db) {
  const names=Object.keys(snapshotTables),statements=[];
  for(const table of names){
    const columns=snapshotTables[table];
    const size=columns.map(column=>`COALESCE(length(CAST("${column}" AS BLOB)),0)`).join('+');
    statements.push(db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(${size}),0) AS bytes FROM "${table}"`));
    statements.push(db.prepare(`SELECT ${columns.map(column=>`"${column}"`).join(',')} FROM "${table}" WHERE (SELECT COUNT(*) FROM "${table}")<=${maximumRows} AND (SELECT COALESCE(SUM(${size}),0) FROM "${table}")<=${maximumJsonBytes/2} ORDER BY id LIMIT ${maximumRows+1}`));
  }
  const result=await db.batch(statements),tables={};
  if(result.length!==statements.length||result.some(item=>!item.success))throw Error('SNAPSHOT_D1_READ');
  let total=0;
  for(let index=0;index<names.length;index++){
    const metadata=result[index*2].results[0],rows=result[index*2+1].results;
    if(!metadata||metadata.count>maximumRows||metadata.bytes>maximumJsonBytes/2||rows.length!==metadata.count)throw Error('SNAPSHOT_D1_LIMIT_OR_CHANGE');
    total+=metadata.bytes;if(total>maximumJsonBytes/2)throw Error('SNAPSHOT_D1_LIMIT');
    if(rows.some(row=>Object.keys(row).sort().join()!==snapshotTables[names[index]].slice().sort().join()))throw Error('SNAPSHOT_D1_COLUMNS');
    tables[names[index]]=rows;
  }
  if(tables.shared_state.length!==1||tables.shared_state[0].id!==1||!Number.isSafeInteger(tables.shared_state[0].revision)||tables.web_feedback_store.length!==1)throw Error('SNAPSHOT_D1_SINGLETON');
  return tables;
}
export async function listSnapshotObjects(bucket) {
  const objects=[],seen=new Set(),cursors=new Set();let cursor;
  do {
    const page=await bucket.list({limit:100,cursor,include:['httpMetadata','customMetadata']});
    if(!Array.isArray(page.objects))throw Error('SNAPSHOT_R2_LIST');
    for(const object of page.objects){
      if(typeof object.key!=='string'||object.key.includes('..')||!/^[-a-zA-Z0-9_./]+$/.test(object.key)||seen.has(object.key)||!Number.isSafeInteger(object.size)||object.size<0||!object.etag)throw Error('SNAPSHOT_R2_INVENTORY');
      let encoding=objectEncoding(object);
      if(encoding==='json'&&object.size>maximumJsonBytes){if(!/^(snapshots|state-records\/v1|delivery\/v1)\//.test(object.key))throw Error('SNAPSHOT_JSON_LIMIT');encoding='json-stream';}
      seen.add(object.key);objects.push({key:object.key,size:object.size,etag:object.etag,httpMetadata:object.httpMetadata||{},customMetadata:object.customMetadata||{},encoding});
      if(objects.length>maximumObjects)throw Error('SNAPSHOT_R2_INVENTORY_LIMIT');
    }
    if(!page.truncated)break;
    if(!page.cursor||cursors.has(page.cursor))throw Error('SNAPSHOT_R2_CURSOR');
    cursor=page.cursor;cursors.add(cursor);
  }while(true);
  return objects.sort((a,b)=>a.key.localeCompare(b.key,'en'));
}
async function pinnedGet(bucket,pin,range) {
  const object=await bucket.get(pin.key,{onlyIf:{etagMatches:pin.etag},...(range?{range}:{})});
  if(!object||!object.body||object.etag!==pin.etag||object.size!==pin.size)throw Error('SNAPSHOT_R2_CHANGED_OR_MISSING');
  return object;
}
export async function createD1R2Source({db,bucket,programCommit}) {
  if(!/^[a-f0-9]{40}$/.test(programCommit||''))throw Error('SNAPSHOT_PROGRAM_COMMIT_REQUIRED');
  if(!db?.prepare||!db?.batch||!bucket?.list||!bucket?.get)throw Error('SNAPSHOT_BINDINGS');
  const tables=await captureDatabase(db),objects=await listSnapshotObjects(bucket);
  const pins=new Map(objects.map(object=>[object.key,object]));
  const readObject=async key=>{const pin=pins.get(key);if(!pin)throw Error('SNAPSHOT_REFERENCE_MISSING');return pinnedGet(bucket,pin);};
  const readRange=async(key,offset,length)=>{const pin=pins.get(key);if(!pin)throw Error('SNAPSHOT_REFERENCE_MISSING');return readBoundedBody((await pinnedGet(bucket,pin,{offset,length})).body,length);};
  return createLogicalSnapshotSource({tables,objects,readObject,readRange,programCommit,checkpointCapture:async()=>({tables:await captureDatabase(db),objects:await listSnapshotObjects(bucket)})});
}
// Shared transform engine. Logical-member conversion supplies read-only byte
// readers here; it does not emulate SQL or open database/platform bindings.
export async function createLogicalSnapshotSource({tables,objects,readObject,readRange,programCommit,checkpointCapture,origin}){
  if(!/^[a-f0-9]{40}$/.test(programCommit||''))throw Error('SNAPSHOT_PROGRAM_COMMIT_REQUIRED');
  const rawDigest=await sha256(jsonBytes({tables,objects}));
  const knownKeys=new Set(objects.map(object=>object.key));
  const chunkPlan=await planChunkInventory({objects,readObject,knownKeys}),chunkRewrites=chunkPlan.chunkRewrites;
  if(chunkPlan.outputs.size+objects.filter(o=>!o.encoding.startsWith('chunk-')).length>maximumObjects)throw Error('SNAPSHOT_R2_INVENTORY_LIMIT');
  validateFeedbackCoverage(tables,objects);await validateFeedbackAttachments({tables,objects,readRange});
  const zipPlans=new Map();
  for(const object of objects.filter(o=>o.encoding==='feedback-zip')){const plan=await prepareFeedbackArchive({object,tables,readRange,knownKeys,chunkRewrites});zipPlans.set(object.key,{bytes:plan.bytes,sha256:plan.sha256});}
  const databaseReferences=new Set();
  const cleaned=applyFeedbackPlans(cleanJson(tables,{references:databaseReferences,knownKeys,chunkRewrites}),zipPlans);
  for(const key of databaseReferences)if(!knownKeys.has(key))throw Error('SNAPSHOT_REFERENCE_MISSING');
  const checkpoint={revision:tables.shared_state[0].revision,digest:rawDigest};
  let firstCheckpoint=true;
  return {
    scope:origin?'r1-logical-export':'site-export',origin,credentialPolicy:'excluded',programCommit,schemaFingerprint:await schemaFingerprint(),
    async checkpoint(){if(firstCheckpoint){firstCheckpoint=false;return checkpoint;}const latest=await checkpointCapture();return {revision:latest.tables.shared_state[0].revision,digest:await sha256(jsonBytes(latest))};},
    async *chunks(){
      for(const [table,rows] of Object.entries(cleaned)){
        const bytes=jsonBytes(rows);if(bytes.length>maximumJsonBytes)throw Error('SNAPSHOT_D1_LIMIT');
        for(let offset=0;offset<bytes.length;offset+=maximumChunkBytes)yield {resource:'db/'+table,offset,totalBytes:bytes.length,data:bytes.slice(offset,offset+maximumChunkBytes),metadata:{encoding:'json',columns:snapshotTables[table]}};
      }
      const emitted=new Set();
      for(const [key,plan] of chunkPlan.plans){
        for await(const output of producedObjects(async writeObject=>{
          const result=await rewriteChunkedManifest({reference:chunkReference(key),readObject,writeObject,knownKeys});
          if(result.reference.key!==plan.reference.key)throw Error('SNAPSHOT_SOURCE_TRANSFORM_CHANGED');
        })){
          const expected=chunkPlan.outputs.get(output.key);if(!expected||expected.size!==output.bytes.length||await sha256(output.bytes)!==expected.sha256)throw Error('SNAPSHOT_SOURCE_TRANSFORM_CHANGED');
          if(emitted.has(output.key))continue;emitted.add(output.key);
          const metadata={encoding:expected.encoding,httpMetadata:{contentType:'application/json'},customMetadata:{}};
          for(let offset=0;offset<output.bytes.length;offset+=maximumChunkBytes)yield {resource:'r2/'+output.key,offset,totalBytes:output.bytes.length,data:output.bytes.slice(offset,offset+maximumChunkBytes),metadata};
        }
      }
      for(const pin of objects){
        if(pin.encoding.startsWith('chunk-'))continue;
        const metadata={encoding:pin.encoding,httpMetadata:cleanJson(pin.httpMetadata),customMetadata:cleanJson(pin.customMetadata),sourceEtag:pin.etag};
        if(pin.encoding==='feedback-zip'){
          const plan=await prepareFeedbackArchive({object:pin,tables,readRange,knownKeys,chunkRewrites}),expected=zipPlans.get(pin.key);
          if(plan.bytes!==expected.bytes||plan.sha256!==expected.sha256)throw Error('SNAPSHOT_SOURCE_TRANSFORM_CHANGED');
          let pending=new Uint8Array(maximumChunkBytes),used=0,offset=0;const hash=createHash('sha256');
          for await(const part of plan.parts()){hash.update(part);let cursor=0;while(cursor<part.length){const count=Math.min(maximumChunkBytes-used,part.length-cursor);pending.set(part.subarray(cursor,cursor+count),used);used+=count;cursor+=count;if(used===maximumChunkBytes){yield {resource:'r2/'+pin.key,offset,totalBytes:plan.bytes,data:pending,metadata};offset+=used;pending=new Uint8Array(maximumChunkBytes);used=0;}}}
          if(used){yield {resource:'r2/'+pin.key,offset,totalBytes:plan.bytes,data:pending.slice(0,used),metadata};offset+=used;}
          if(offset!==plan.bytes||hash.digest('hex')!==plan.sha256)throw Error('SNAPSHOT_SOURCE_TRANSFORM_CHANGED');
        }else if(pin.encoding==='json-stream'){
          const rawHash=createHash('sha256');
          const stats=await analyzeJsonStream(async()=>{
            const object=await readObject(pin.key),reader=object.body.getReader();
            return new ReadableStream({async pull(controller){try{const part=await reader.read();if(part.done){controller.close();reader.releaseLock();}else{rawHash.update(part.value);controller.enqueue(part.value);}}catch(error){controller.error(error);}},async cancel(){await reader.cancel();}});
          },{knownKeys,chunkRewrites});
          const contentAddress=pin.key.match(/^(?:snapshots\/|state-records\/v1\/)([a-f0-9]{64})\.json$/)?.[1];
          if(contentAddress&&rawHash.digest('hex')!==contentAddress)throw Error('SNAPSHOT_SOURCE_OBJECT_CORRUPT');
          const object=await readObject(pin.key),stream=jsonTransformStream(object.body,{knownKeys,chunkRewrites}),reader=stream.getReader(),hash=createHash('sha256');
          let pending=new Uint8Array(maximumChunkBytes),used=0,offset=0;
          try{while(true){const part=await reader.read();if(part.done)break;hash.update(part.value);let cursor=0;while(cursor<part.value.length){const count=Math.min(maximumChunkBytes-used,part.value.length-cursor);pending.set(part.value.subarray(cursor,cursor+count),used);used+=count;cursor+=count;if(used===maximumChunkBytes){yield {resource:'r2/'+pin.key,offset,totalBytes:stats.bytes,data:pending,metadata};offset+=used;pending=new Uint8Array(maximumChunkBytes);used=0;}}}if(used){yield {resource:'r2/'+pin.key,offset,totalBytes:stats.bytes,data:pending.slice(0,used),metadata};offset+=used;}if(offset!==stats.bytes||hash.digest('hex')!==stats.sha256)throw Error('SNAPSHOT_SOURCE_TRANSFORM_CHANGED');}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
        }else if(pin.encoding==='json'){
          const refs=new Set(),object=await readObject(pin.key);
          const raw=await readBoundedBody(object.body);
          const contentAddress=pin.key.match(/^(?:snapshots\/|state-records\/v1\/)([a-f0-9]{64})\.json$/)?.[1];
          if(contentAddress&&await sha256(raw)!==contentAddress)throw Error('SNAPSHOT_SOURCE_OBJECT_CORRUPT');
          const bytes=scrubJsonBytes(raw,{references:refs,knownKeys,chunkRewrites});
          for(const key of refs)if(!knownKeys.has(key))throw Error('SNAPSHOT_REFERENCE_MISSING');
          for(let offset=0;offset<bytes.length;offset+=maximumChunkBytes)yield {resource:'r2/'+pin.key,offset,totalBytes:bytes.length,data:bytes.slice(offset,offset+maximumChunkBytes),metadata};
        }else{
          // Range reads bound memory independently of object size. No R2 write.
          if(!pin.size)throw Error('SNAPSHOT_EMPTY_BINARY');
          for(let offset=0;offset<pin.size;offset+=maximumChunkBytes){
            const length=Math.min(maximumChunkBytes,pin.size-offset),bytes=await readRange(pin.key,offset,length);
            if(bytes.length!==length)throw Error('SNAPSHOT_R2_SHORT_READ');
            yield {resource:'r2/'+pin.key,offset,totalBytes:pin.size,data:bytes,metadata};
          }
        }
      }
    },
  };
}
