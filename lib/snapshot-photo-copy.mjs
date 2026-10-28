// Offline, bounded PNG-only copy. No DB/network/login or original-file writes.
import {Buffer} from 'node:buffer';import {createHash} from 'node:crypto';
import {sha256,validateSnapshot,maximumChunkBytes} from './snapshot-contract.mjs';
import {hostedAuditContext} from './snapshot-hosted-audit.mjs';
import {cleanJson,scrubJsonBytes,maximumJsonBytes} from './snapshot-redaction.mjs';
import {photoJsonTransformStream,analyzeJsonStream} from './snapshot-json-stream.mjs';
import {assertBinaryAddress} from './snapshot-binary-address.mjs';
import {prepareFeedbackArchive,applyFeedbackPlans} from './snapshot-format-plan.mjs';
import {validateAssetIndex} from './site-security.mjs';import {optimizePhoto,photoPolicy} from './photo-upload.mjs';
const enc=v=>new TextEncoder().encode(JSON.stringify(v)),fail=(v,c)=>{if(!v)throw Error(c);},body=b=>new Blob([b]).stream();
const named=k=>k.match(/(?:^|\/)([a-f0-9]{64})$/)?.[1];
const canRekey=k=>/^(?:(?:iqc|ipqc-ab|ipqc-c|routine-equipment|routine-fqc|tooling)\/photos|company-assets\/objects|delivery\/media)\/[a-f0-9]{64}$/.test(k);
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const sameMetadata=(a,b)=>{const {sourceEtag:_a,...left}=a,{sourceEtag:_b,...right}=b;return canonical(left)===canonical(right);};
function partsBody(parts){const it=parts[Symbol.asyncIterator]();return new ReadableStream({async pull(c){try{const n=await it.next();if(n.done)c.close();else c.enqueue(n.value);}catch(e){c.error(e);}},async cancel(){await it.return?.();}});}
export async function copyPhotoSnapshot({source,sink,programCommit,expectedManifestSha256,verifyPixels,onProgress=async()=>{}}){
 fail(source?.scope==='private-snapshot'&&sink?.scope==='private-snapshot'&&/^[a-f0-9]{40}$/.test(programCommit||''),'PHOTO_COPY_ADAPTER');
 const input=await source.manifest();validateSnapshot(input);fail(await sha256(enc(input))===expectedManifestSha256,'PHOTO_COPY_SOURCE_PIN');
 const byId=new Map(input.chunks.map(c=>[c.id,c]));
 const pinned={scope:'private-snapshot',async manifest(){return input;},async readChunk(id){const c=byId.get(id),b=await source.readChunk(id);fail(c&&b instanceof Uint8Array&&b.length===c.bytes&&await sha256(b)===c.sha256,'PHOTO_COPY_INPUT_INTEGRITY');return b;}};
 const ctx=await hostedAuditContext(pinned),rewrites=new Map(),photos=[],photoByKey=new Map(),chunks=[],seen=new Map(),zipPlans=new Map(),confirmedTargets=new Set(),bindings=new Map();
 const report={format:'PROCESS_OS_PHOTO_COPY_V1',programCommit,parentManifestSha256:expectedManifestSha256,codec:'png-deflate-adaptive-v1',resize:false,changed:0,pngObjects:0,originalPngBytes:0,chosenPngBytes:0,objects:ctx.objects.length,aliases:0,allSourceResourcesRetained:true,sourceFilesChanged:false,verifiedPixels:0,photos};
 function mapping(from,to){if(from===to)return;fail(!rewrites.has(from)||rewrites.get(from)===to,'PHOTO_COPY_MAPPING_CONFLICT');rewrites.set(from,to);}
 function metadata(item,plan){const {sourceEtag,...rest}=item.metadata,out=cleanJson(rest,{rewrite:rewrites});if(plan&&Object.hasOwn(out.customMetadata||{},'sha256')){fail(out.customMetadata.sha256===plan.oldSha256,'PHOTO_COPY_METADATA_CHECKSUM');out.customMetadata.sha256=plan.sha256;}if(sourceEtag!==undefined)out.sourceEtag=sourceEtag;return out;}
 async function emit(name,meta,stream){
  fail(!seen.has(name),'PHOTO_COPY_RESOURCE_COLLISION');const entries=[],reader=stream.getReader(),digest=createHash('sha256');let pending=new Uint8Array(maximumChunkBytes),used=0,total=0;
  async function flush(){if(!used)return;const bytes=pending.subarray(0,used),id='c'+chunks.length;await sink.writeChunk(id,bytes);const c={id,resource:name,offset:total-used,totalBytes:0,bytes:used,sha256:await sha256(bytes),metadata:meta};chunks.push(c);entries.push(c);pending=new Uint8Array(maximumChunkBytes);used=0;}
  try{for(;;){const n=await reader.read();if(n.done)break;fail(n.value instanceof Uint8Array,'PHOTO_COPY_STREAM');digest.update(n.value);let at=0;while(at<n.value.length){const count=Math.min(pending.length-used,n.value.length-at);pending.set(n.value.subarray(at,at+count),used);used+=count;at+=count;total+=count;fail(total<=64*1024**3,'PHOTO_COPY_RESOURCE_LIMIT');if(used===pending.length)await flush();}}await flush();}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  fail(total>0,'PHOTO_COPY_EMPTY');for(const c of entries)c.totalBytes=total;const result={bytes:total,sha256:digest.digest('hex'),metadata:meta};seen.set(name,result);return result;
 }
 try{
  // Emit photos first, one at a time; no cache of whole image sets.
  for(const object of ctx.objects){const item=ctx.resources.get('r2/'+object.key);if(object.encoding!=='binary'||item.metadata.httpMetadata?.contentType!=='image/png')continue;
   report.pngObjects++;report.originalPngBytes+=item.bytes;
   if(!canRekey(object.key)||item.bytes>photoPolicy.maximumPngBytes){report.chosenPngBytes+=item.bytes;continue;}
   const raw=await ctx.bytes('r2/'+object.key),oldSha=await sha256(raw);await assertBinaryAddress({key:object.key,bytes:raw.length,sha256:oldSha,httpMetadata:item.metadata.httpMetadata},()=>body(raw));
   const optimized=await optimizePhoto(raw,'image/png');report.chosenPngBytes+=optimized.bytes.length;
   if(!optimized.changed)continue;
   fail(typeof verifyPixels==='function','PHOTO_COPY_DECODER_REQUIRED');fail(await verifyPixels(raw,optimized.bytes),'PHOTO_COPY_PIXELS_CHANGED');report.verifiedPixels++;
   const digest=await sha256(optimized.bytes),nextId=object.key.startsWith('delivery/media/')?await sha256(new TextEncoder().encode('data:image/png;base64,'+Buffer.from(optimized.bytes).toString('base64'))):digest,nextKey=object.key.slice(0,-64)+nextId;
   mapping(object.key,nextKey);
   const photoModule=object.key.match(/^([^/]+)\/photos\//)?.[1];if(photoModule)mapping('/api/'+photoModule+'/photo?id='+named(object.key),'/api/'+photoModule+'/photo?id='+nextId);if(object.key.startsWith('delivery/media/'))mapping('/api/state-media?id='+named(object.key),'/api/state-media?id='+nextId);
   const p={oldKey:object.key,newKey:nextKey,oldSha256:oldSha,sha256:digest,oldBytes:raw.length,bytes:optimized.bytes.length,contentType:'image/png',sourceMetadata:structuredClone(item.metadata)};photos.push(p);photoByKey.set(object.key,p);report.changed++;
   const meta=metadata(item,p),name='r2/'+nextKey,existing=ctx.resources.get(name);
   // Check the original target even if it appeared earlier and was not emitted.
   // Its provenance is retained in the report; differing business metadata fails.
   if(existing){fail(existing.metadata.encoding==='binary'&&existing.bytes===optimized.bytes.length&&sameMetadata(metadata(existing),meta),'PHOTO_COPY_RESOURCE_COLLISION');fail(await sha256(await ctx.bytes(name))===digest,'PHOTO_COPY_RESOURCE_COLLISION');confirmedTargets.add(name);p.existingTargetMetadata=structuredClone(existing.metadata);}
   if(seen.has(name)){const old=seen.get(name);fail(old.sha256===digest&&old.bytes===optimized.bytes.length&&sameMetadata(old.metadata,meta),'PHOTO_COPY_RESOURCE_COLLISION');}
   else await emit(name,meta,body(optimized.bytes));
   await onProgress({stage:'lossless-images',checked:report.pngObjects,changed:report.changed,originalBytes:report.originalPngBytes,chosenBytes:report.chosenPngBytes});
  }
  // A content-addressed JSON record may contain id-only photos. Discover its
  // module through explicit state fields, never through a bare digest match.
  const pending=[],visited=new Set(),onBinding=(module,key)=>{const name='r2/'+key,item=ctx.resources.get(name);if(!item||!['json','json-stream'].includes(item.metadata.encoding))return;for(const m of Array.isArray(module)?module:[module]){let set=bindings.get(name);if(!set)bindings.set(name,set=new Set());if(!set.has(m)){set.add(m);pending.push([name,m]);}}};
  const inspect=async(name,module)=>{const photoReferences={plans:new Map(),module,onBinding};if(name.startsWith('db/'))cleanJson(ctx.tables[name.slice(3)],{photoReferences});else if(ctx.resources.get(name).metadata.encoding==='json')scrubJsonBytes(await ctx.bytes(name),{photoReferences});else await analyzeJsonStream(()=>ctx.body(name),{photoReferences});};
  for(const [name,item]of ctx.resources)if(name.startsWith('db/')||['json','json-stream'].includes(item.metadata.encoding))await inspect(name,null);
  for(let cursor=0;cursor<pending.length;cursor++){fail(pending.length<=ctx.resources.size*6,'PHOTO_COPY_BINDING_LIMIT');const [name,module]=pending[cursor],id=name+'\n'+module;if(visited.has(id))continue;visited.add(id);await inspect(name,module);}
  const photoContext=name=>({plans:photoByKey,module:[...(bindings.get(name)||[])]});
  // Rebuild known feedback STORE ZIP references and their outer record pins.
  for(const object of ctx.objects.filter(o=>o.encoding==='feedback-zip')){const zip=await prepareFeedbackArchive({object,tables:ctx.tables,readRange:ctx.range,knownKeys:ctx.knownKeys,rewrite:rewrites}),stats=await emit('r2/'+object.key,metadata(ctx.resources.get('r2/'+object.key)),partsBody(zip.parts()));fail(stats.bytes===zip.bytes&&stats.sha256===zip.sha256,'PHOTO_COPY_ZIP_PIN');zipPlans.set(object.key,stats);}
  for(const [name,item]of ctx.resources){if(name.startsWith('r2/')&&photoByKey.has(name.slice(3)))continue;if(seen.has(name)){fail(item.metadata.encoding==='feedback-zip'||confirmedTargets.has(name),'PHOTO_COPY_RESOURCE_COLLISION');continue;}
   const meta=metadata(item);let stream;
   if(name.startsWith('db/')){const table=name.slice(3),rows=cleanJson(ctx.tables[table],{rewrite:rewrites,photoReferences:photoContext(name)});if(table==='web_feedback_store')applyFeedbackPlans({web_feedback_store:rows},zipPlans);stream=body(enc(rows));}
   else if(name==='r2/company-assets/index.json'){const value=JSON.parse(new TextDecoder().decode(await ctx.bytes(name)));validateAssetIndex(value);for(const a of value.assets){const p=photoByKey.get(a.key);if(p){fail(a.sha256===p.oldSha256&&a.bytes===p.oldBytes,'PHOTO_COPY_ASSET_SOURCE_PIN');a.bytes=p.bytes;a.sha256=p.sha256;a.key=p.newKey;}}const clean=cleanJson(value,{rewrite:rewrites});validateAssetIndex(clean);stream=body(enc(clean));}
   else if(meta.encoding==='json')stream=body(scrubJsonBytes(await ctx.bytes(name),{rewrite:rewrites,photoReferences:photoContext(name)}));
   else if(meta.encoding==='json-stream')stream=await photoJsonTransformStream(()=>ctx.body(name),{rewrite:rewrites,photoReferences:photoContext(name)});
   else if(meta.encoding==='binary')stream=ctx.body(name);
   else throw Error('PHOTO_COPY_UNKNOWN_FORMAT');
   const stats=await emit(name,meta,stream);if(['json','json-stream'].includes(meta.encoding))meta.encoding=stats.bytes>maximumJsonBytes?'json-stream':'json';
  }
  report.rewrites=[...rewrites];report.moduleBindings=[...bindings].map(([name,set])=>[name,[...set].sort()]);report.aliases=ctx.resources.size-seen.size;report.feedbackPlans=[...zipPlans].map(([key,s])=>[key,{bytes:s.bytes,sha256:s.sha256}]);report.pngBytesSaved=report.originalPngBytes-report.chosenPngBytes;report.totalBytes=chunks.reduce((s,c)=>s+c.bytes,0);
  fail(await sha256(enc(await source.manifest()))===expectedManifestSha256,'PHOTO_COPY_SOURCE_CHANGED');const planSha256=await sha256(enc(report)),manifest={...input,chunks,normalization:{format:'PROCESS_OS_CONTENT_ADDRESS_VIEW_V1',programCommit,sourceManifestSha256:expectedManifestSha256,planSha256}};validateSnapshot(manifest);await sink.complete(manifest);
  return{report,manifest,manifestSha256:await sha256(enc(manifest)),planSha256};
 }catch(e){await sink.abort(e);throw e;}
}
