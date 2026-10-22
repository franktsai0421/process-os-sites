import {sha256,importSnapshot} from './snapshot-contract.mjs';
import {cleanJson,scrubJsonBytes,readBoundedBody,maximumJsonBytes,objectEncoding} from './snapshot-redaction.mjs';
import {snapshotTables,schemaFingerprint} from './snapshot-d1-r2.mjs';
import {createHash} from 'node:crypto';
import {jsonTransformStream,analyzeJsonStream} from './snapshot-json-stream.mjs';
import {rewriteChunkedManifest} from './snapshot-chunked.mjs';
import {planChunkInventory,chunkReference,prepareFeedbackArchive,applyFeedbackPlans,validateFeedbackCoverage,validateFeedbackAttachments} from './snapshot-format-plan.mjs';
const encode=value=>new TextEncoder().encode(JSON.stringify(value));
function contentHash(key){return key.match(/(?:^|\/)([a-f0-9]{64})(?:\.json)?$/)?.[1];}
function rekey(key,hash){return key.replace(/([a-f0-9]{64})(\.json)?$/,(whole,old,suffix)=>hash+(suffix||''));}

// Bindings are supplied only by the Node local-runtime entry point. This module
// has no remote opener and is never imported by a hosted write API.
export async function createLocalBindingTarget({db,bucket,staging,proof}) {
  if(proof?.kind!=='local-platform-proxy'||proof.remoteBindings!==false||proof.emptyTarget!==true)throw Error('SNAPSHOT_LOCAL_BINDING_PROOF');
  const expectedSchema=await schemaFingerprint();
  return {
    scope:'isolated-local',schemaFingerprint:expectedSchema,
    async isEmpty(){for(const table of Object.keys(snapshotTables)){const rows=await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();if(rows?.count!==0)return false;}return true;},
    async begin(manifest){
      const resources=new Map(),rewrite=new Map(),knownKeys=new Set();
      for(const descriptor of manifest.chunks){if(!resources.has(descriptor.resource))resources.set(descriptor.resource,{descriptors:[],metadata:descriptor.metadata,totalBytes:descriptor.totalBytes});resources.get(descriptor.resource).descriptors.push(descriptor);}
      for(const resource of resources.keys())if(resource.startsWith('r2/'))knownKeys.add(resource.slice(3));
      let committed=false,chunkPlan,rawTables,objects;const chunkRewrites=new Map(),zipPlans=new Map();
      async function bytesFor(resource){const item=resources.get(resource);if(!item||item.totalBytes>maximumJsonBytes)throw Error('SNAPSHOT_JSON_LIMIT');const bytes=new Uint8Array(item.totalBytes);for(const descriptor of item.descriptors)bytes.set(await staging.read(descriptor.id),descriptor.offset);return bytes;}
      async function writeObject(key,resource,bytes){
        const item=resources.get(resource),metadata=cleanJson(item.metadata,{rewrite});
        if(metadata.httpMetadata?.expires)metadata.httpMetadata.expires=new Date(metadata.httpMetadata.expires);
        if(bytes){await bucket.put(key,bytes,{httpMetadata:metadata.httpMetadata,customMetadata:metadata.customMetadata});}
        else {
          const upload=await bucket.createMultipartUpload(key,{httpMetadata:metadata.httpMetadata,customMetadata:metadata.customMetadata});
          const parts=[];let pending=[],length=0,number=1;
          try{
            for(const descriptor of item.descriptors){const chunk=await staging.read(descriptor.id);pending.push(chunk);length+=chunk.length;if(length>=5*1024*1024){const part=new Uint8Array(length);let offset=0;for(const entry of pending){part.set(entry,offset);offset+=entry.length;}parts.push(await upload.uploadPart(number++,part));pending=[];length=0;}}
            if(length){const part=new Uint8Array(length);let offset=0;for(const entry of pending){part.set(entry,offset);offset+=entry.length;}parts.push(await upload.uploadPart(number,part));}
            await upload.complete(parts);
          }catch(error){await upload.abort().catch(()=>{});throw error;}
        }
        const head=await bucket.head(key);if(!head||head.size!==(bytes?bytes.length:item.totalBytes))throw Error('SNAPSHOT_LOCAL_OBJECT_VERIFY');
        if(bytes){const object=await bucket.get(key,{onlyIf:{etagMatches:head.etag}});if(!object?.body||await sha256(await readBoundedBody(object.body))!==await sha256(bytes))throw Error('SNAPSHOT_LOCAL_OBJECT_VERIFY');}
        else for(const descriptor of item.descriptors){const object=await bucket.get(key,{range:{offset:descriptor.offset,length:descriptor.bytes},onlyIf:{etagMatches:head.etag}});if(!object?.body||await sha256(await readBoundedBody(object.body,descriptor.bytes))!==descriptor.sha256)throw Error('SNAPSHOT_LOCAL_OBJECT_VERIFY');}
      }
      const visiting=new Set(),done=new Set();
      function resourceBody(resource){const descriptors=resources.get(resource).descriptors;let index=0;return new ReadableStream({async pull(controller){if(index===descriptors.length){controller.close();return;}const descriptor=descriptors[index++],data=await staging.read(descriptor.id);if(data.length!==descriptor.bytes||await sha256(data)!==descriptor.sha256)throw Error('SNAPSHOT_INTEGRITY');controller.enqueue(data);}});}
      async function writeGeneratedStream(key,resource,stats,body){
        const metadata=cleanJson(resources.get(resource).metadata,{rewrite});
        if(metadata.httpMetadata?.expires)metadata.httpMetadata.expires=new Date(metadata.httpMetadata.expires);
        const upload=await bucket.createMultipartUpload(key,{httpMetadata:metadata.httpMetadata,customMetadata:metadata.customMetadata});
        const reader=body.getReader(),hash=createHash('sha256'),parts=[];
        let pending=[],length=0,total=0,number=1;
        async function flush(){if(!length)return;const bytes=new Uint8Array(length);let offset=0;for(const part of pending){bytes.set(part,offset);offset+=part.length;}parts.push(await upload.uploadPart(number++,bytes));pending=[];length=0;}
        try{while(true){const part=await reader.read();if(part.done)break;hash.update(part.value);total+=part.value.length;pending.push(part.value);length+=part.value.length;if(length>=5*1024*1024)await flush();}await flush();if(total!==stats.bytes||hash.digest('hex')!==stats.sha256)throw Error('SNAPSHOT_LOCAL_TRANSFORM_CHANGED');await upload.complete(parts);}catch(error){await upload.abort().catch(()=>{});throw error;}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
        const object=await bucket.get(key);if(!object?.body||object.size!==stats.bytes)throw Error('SNAPSHOT_LOCAL_OBJECT_VERIFY');
        const verify=createHash('sha256'),readback=object.body.getReader();let bytes=0;
        try{while(true){const part=await readback.read();if(part.done)break;bytes+=part.value.length;verify.update(part.value);}}finally{readback.releaseLock();}
        if(bytes!==stats.bytes||verify.digest('hex')!==stats.sha256)throw Error('SNAPSHOT_LOCAL_OBJECT_VERIFY');
      }
      function writeJsonStream(key,resource,stats){return writeGeneratedStream(key,resource,stats,jsonTransformStream(resourceBody(resource),{rewrite,knownKeys,chunkRewrites}));}
      function partsBody(parts){const iterator=parts[Symbol.asyncIterator]();return new ReadableStream({async pull(controller){const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(next.value);},async cancel(){await iterator.return?.();}});}
      async function stagedRange(key,offset,length){
        const item=resources.get('r2/'+key);if(!item||offset<0||length<0||offset+length>item.totalBytes||length>1024*1024)throw Error('SNAPSHOT_LOCAL_RANGE');
        const output=new Uint8Array(length);let copied=0;
        for(const descriptor of item.descriptors){const start=Math.max(offset,descriptor.offset),end=Math.min(offset+length,descriptor.offset+descriptor.bytes);if(end<=start)continue;const data=await staging.read(descriptor.id);if(data.length!==descriptor.bytes||await sha256(data)!==descriptor.sha256)throw Error('SNAPSHOT_INTEGRITY');output.set(data.subarray(start-descriptor.offset,end-descriptor.offset),start-offset);copied+=end-start;}
        if(copied!==length)throw Error('SNAPSHOT_LOCAL_RANGE');return output;
      }
      const stagedObject=async key=>{const item=resources.get('r2/'+key);return item?{size:item.totalBytes,body:resourceBody('r2/'+key)}:null;};
      async function writeChunkObject(key,bytes){
        const digest=await sha256(bytes);if(contentHash(key)!==digest)throw Error('SNAPSHOT_CHUNK_OUTPUT_COLLISION');
        const existing=await bucket.head(key);if(existing){const current=await bucket.get(key);if(!current?.body||await sha256(await readBoundedBody(current.body))!==digest)throw Error('SNAPSHOT_LOCAL_OBJECT_VERIFY');return;}
        await bucket.put(key,bytes,{httpMetadata:{contentType:'application/json'}});
        const current=await bucket.get(key);if(!current?.body||current.size!==bytes.length||await sha256(await readBoundedBody(current.body))!==digest)throw Error('SNAPSHOT_LOCAL_OBJECT_VERIFY');
      }
      async function restoreObject(key){
        if(done.has(key))return;if(visiting.has(key))throw Error('SNAPSHOT_REFERENCE_CYCLE');
        if(visiting.size>=32)throw Error('SNAPSHOT_REFERENCE_DEPTH');
        if(!knownKeys.has(key))throw Error('SNAPSHOT_REFERENCE_MISSING');
        visiting.add(key);
        const resource='r2/'+key,item=resources.get(resource);
        if(item.metadata.encoding==='chunk-manifest'){
          const plan=chunkPlan.plans.get(key);if(!plan)throw Error('SNAPSHOT_REFERENCE_MISSING');
          for(const reference of plan.references)await restoreObject(reference);
          const result=await rewriteChunkedManifest({reference:chunkReference(key),readObject:stagedObject,writeObject:writeChunkObject,rewrite,knownKeys});
          chunkRewrites.set(key,result.reference);rewrite.set(key,result.reference.key);rewrite.set(chunkReference(key).sha256,result.reference.sha256);
        }else if(item.metadata.encoding==='chunk-pack')throw Error('SNAPSHOT_CHUNK_BARE_REFERENCE');
        else if(item.metadata.encoding==='feedback-zip'){
          const object=objects.find(object=>object.key===key);
          const analysis=await prepareFeedbackArchive({object,tables:rawTables,readRange:stagedRange,knownKeys,chunkRewrites});
          for(const reference of analysis.references)await restoreObject(reference);
          const plan=await prepareFeedbackArchive({object,tables:rawTables,readRange:stagedRange,knownKeys,rewrite,chunkRewrites});
          await writeGeneratedStream(key,resource,plan,partsBody(plan.parts()));zipPlans.set(key,{bytes:plan.bytes,sha256:plan.sha256});
        }else if(item.metadata.encoding==='json-stream'){
          const analysis=await analyzeJsonStream(()=>resourceBody(resource),{knownKeys,chunkRewrites});
          for(const reference of analysis.references)await restoreObject(reference);
          const stats=await analyzeJsonStream(()=>resourceBody(resource),{rewrite,knownKeys,chunkRewrites}),newKey=rekey(key,stats.sha256);
          const oldHash=contentHash(key);rewrite.set(key,newKey);if(oldHash)rewrite.set(oldHash,stats.sha256);
          await writeJsonStream(newKey,resource,stats);
        }else if(item.metadata.encoding==='json'){
          const bytes=await bytesFor(resource),references=new Set();
          // Credentials are scrubbed again before any database or R2 publication.
          scrubJsonBytes(bytes,{references,knownKeys,chunkRewrites});
          for(const reference of references)await restoreObject(reference);
          const rewritten=scrubJsonBytes(bytes,{rewrite,knownKeys,chunkRewrites}),hash=await sha256(rewritten),newKey=rekey(key,hash);
          const oldHash=contentHash(key);rewrite.set(key,newKey);if(oldHash)rewrite.set(oldHash,hash);
          await writeObject(newKey,resource,rewritten);
        }else if(item.metadata.encoding==='binary')await writeObject(key,resource,null);
        else throw Error('SNAPSHOT_OBJECT_ENCODING');
        visiting.delete(key);done.add(key);
      }
      return {
        async writeChunk(descriptor,data){await staging.write(descriptor.id,data);},
        async commit(){
          rawTables={};for(const table of Object.keys(snapshotTables))rawTables[table]=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytesFor('db/'+table)));
          objects=[...knownKeys].map(key=>{const item=resources.get('r2/'+key),encoding=objectEncoding({key,httpMetadata:item.metadata.httpMetadata});const expected=encoding==='json'&&item.totalBytes>maximumJsonBytes&&/^(snapshots|state-records\/v1|delivery\/v1)\//.test(key)?'json-stream':encoding;if(expected!==item.metadata.encoding)throw Error('SNAPSHOT_OBJECT_ENCODING');return {key,size:item.totalBytes,encoding:expected,httpMetadata:item.metadata.httpMetadata||{},customMetadata:item.metadata.customMetadata||{}};});
          chunkPlan=await planChunkInventory({objects,readObject:stagedObject,knownKeys});
          for(const key of chunkPlan.plans.keys())chunkRewrites.set(key,chunkReference(key));
          validateFeedbackCoverage(rawTables,objects);await validateFeedbackAttachments({tables:rawTables,objects,readRange:stagedRange});
          for(const object of objects)if(object.encoding!=='chunk-pack')await restoreObject(object.key);
          const statements=[],desired={};
          for(const table of Object.keys(snapshotTables)){
            const raw=await bytesFor('db/'+table),references=new Set();scrubJsonBytes(raw,{references,knownKeys,chunkRewrites});for(const reference of references)if(!done.has(reference))throw Error('SNAPSHOT_REFERENCE_MISSING');
            const rows=JSON.parse(new TextDecoder().decode(scrubJsonBytes(raw,{rewrite,knownKeys,chunkRewrites})));
            if(table==='web_feedback_store')applyFeedbackPlans({web_feedback_store:rows},zipPlans);
            if(!Array.isArray(rows)||rows.length>1024)throw Error('SNAPSHOT_TABLE_ROWS');
            const columns=snapshotTables[table];
            desired[table]=rows;
            for(const row of rows){if(Object.keys(row).sort().join()!==columns.slice().sort().join())throw Error('SNAPSHOT_TABLE_COLUMNS');statements.push(db.prepare(`INSERT INTO "${table}" (${columns.map(column=>`"${column}"`).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).bind(...columns.map(column=>row[column])));}
          }
          if(statements.length>1024)throw Error('SNAPSHOT_TABLE_ROWS');
          const result=await db.batch(statements);if(result.length!==statements.length||result.some(item=>!item.success))throw Error('SNAPSHOT_LOCAL_DATABASE_WRITE');
          committed=true;
          for(const [table,columns] of Object.entries(snapshotTables)){const result=await db.prepare(`SELECT ${columns.map(column=>`"${column}"`).join(',')} FROM "${table}" ORDER BY id`).all();const ordered=rows=>rows.map(row=>columns.map(column=>row[column]));if(!result.success||JSON.stringify(ordered(result.results))!==JSON.stringify(ordered(desired[table])))throw Error('SNAPSHOT_LOCAL_DATABASE_VERIFY');}
          await staging.complete({format:'PROCESS_OS_LOCAL_SNAPSHOT_RECEIPT_V1',source:manifest.source,schemaFingerprint:manifest.schemaFingerprint,credentialPolicy:'excluded',dataReady:true,authReady:false,objects:done.size});
        },
        async abort(){await staging.abort({databaseCommitted:committed});},
      };
    },
  };
}
export async function restoreLocalSnapshot(source,options){const target=await createLocalBindingTarget(options);return importSnapshot(source,target);}
