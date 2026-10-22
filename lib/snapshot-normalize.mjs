// Deterministic private Snapshot V1 view. It opens no DB, network or output path.
// Payloads remain in the pinned source; recipes and chunk hashes are sufficient
// to reproduce normalized bytes with bounded readers after a process restart.
import {createHash} from 'node:crypto';
import {validateSnapshot,sha256,maximumChunkBytes} from './snapshot-contract.mjs';
import {hostedAuditContext} from './snapshot-hosted-audit.mjs';
import {cleanJson,scrubJsonBytes,readBoundedBody,maximumJsonBytes} from './snapshot-redaction.mjs';
import {jsonTransformStream} from './snapshot-json-stream.mjs';
import {prepareFeedbackArchive,applyFeedbackPlans} from './snapshot-format-plan.mjs';
const encoder=new TextEncoder(),encode=value=>encoder.encode(JSON.stringify(value));
const requireValue=(v,c)=>{if(!v)throw Error(c);};
const nameHash=key=>key.match(/(?:^|\/)([a-f0-9]{64})(?:\.json)?$/)?.[1];
const rekey=(key,digest)=>key.replace(/([a-f0-9]{64})(\.json)?$/,(whole,old,suffix)=>digest+(suffix||''));
function normalizedRows(ctx,table,rewrite,zipPlans){const column=table==='web_feedback_store'?'payload':'values';const rows=ctx.tables[table].map(row=>({...row,[column]:JSON.stringify(cleanJson(JSON.parse(row[column]),{rewrite,knownKeys:ctx.knownKeys}))}));if(table==='web_feedback_store')applyFeedbackPlans({web_feedback_store:rows},zipPlans);return rows;}
const streamOf=bytes=>new ReadableStream({start(c){c.enqueue(bytes);c.close();}});
function partsBody(parts){const iterator=parts[Symbol.asyncIterator]();return new ReadableStream({async pull(c){try{const result=await iterator.next();if(result.done)c.close();else c.enqueue(result.value);}catch(error){c.error(error);}},async cancel(){await iterator.return?.();}});}
async function scan(body){
 const reader=body.getReader(),whole=createHash('sha256'),chunks=[];let bytes=0,pending=new Uint8Array(maximumChunkBytes),used=0;
 async function flush(){if(used){const raw=pending.subarray(0,used);chunks.push({bytes:used,sha256:await sha256(raw)});pending=new Uint8Array(maximumChunkBytes);used=0;}}
 try{for(;;){const next=await reader.read();if(next.done)break;whole.update(next.value);bytes+=next.value.length;requireValue(bytes<=64*1024**3,'NORMALIZE_CAPACITY');let offset=0;while(offset<next.value.length){const length=Math.min(maximumChunkBytes-used,next.value.length-offset);pending.set(next.value.subarray(offset,offset+length),used);used+=length;offset+=length;if(used===maximumChunkBytes)await flush();}}await flush();}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 requireValue(bytes>0,'NORMALIZE_EMPTY_RESOURCE');return {bytes,sha256:whole.digest('hex'),chunks};
}
function verifiedSource(source,manifest,onProgress){
 const byId=new Map(manifest.chunks.map(c=>[c.id,c])),verified=new Set();let bytes=0;
 return {scope:'private-snapshot',async manifest(){return manifest;},async readChunk(id){const pin=byId.get(id);requireValue(pin,'NORMALIZE_INPUT_CHUNK');const data=await source.readChunk(id);requireValue(data instanceof Uint8Array&&data.length===pin.bytes&&await sha256(data)===pin.sha256,'NORMALIZE_INPUT_INTEGRITY');if(!verified.has(id)){verified.add(id);bytes+=data.length;if(verified.size%128===0)await onProgress({stage:'input-integrity',verifiedChunks:verified.size,verifiedBytes:bytes});}return data;}};
}
export async function createNormalizationPlan(source,{programCommit,sourceManifestSha256,onRecipe=async()=>{},onProgress=async()=>{},resumeRecipes=[]}={}){
 requireValue(source?.scope==='private-snapshot'&&/^[a-f0-9]{40}$/.test(programCommit||''),'NORMALIZE_SOURCE_OR_PROGRAM');
 const input=await source.manifest();validateSnapshot(input);
 const canonicalInputSha=await sha256(encode(input));sourceManifestSha256??=canonicalInputSha;requireValue(/^[a-f0-9]{64}$/.test(sourceManifestSha256),'NORMALIZE_SOURCE_PIN');
 const pinned=verifiedSource(source,input,onProgress),ctx=await hostedAuditContext(pinned),rewrite=new Map(),recipes=new Map(),visiting=new Set(),zipPlans=new Map();
 const hashes=new Map(),extendedKnown=new Set(ctx.knownKeys);
 for(const key of ctx.knownKeys){const digest=nameHash(key);if(digest){extendedKnown.add(digest);const names=hashes.get(digest)||[];names.push(key);hashes.set(digest,names);}}
 const loaded=new Map(resumeRecipes.map(r=>[r.sourceResource,r]));requireValue(loaded.size===resumeRecipes.length,'NORMALIZE_RESUME_DUPLICATE');
 function mapping(from,to){if(rewrite.has(from))requireValue(rewrite.get(from)===to,'NORMALIZE_HASH_ALIAS_CONFLICT');rewrite.set(from,to);}
 function remember(recipe){recipes.set(recipe.sourceResource,recipe);if(recipe.sourceResource.startsWith('r2/')){const old=recipe.sourceResource.slice(3),next=recipe.targetResource.slice(3);mapping(old,next);const oldHash=nameHash(old);if(oldHash)mapping(oldHash,nameHash(next)||recipe.sha256);if(recipe.kind==='feedback-zip')zipPlans.set(old,{bytes:recipe.bytes,sha256:recipe.sha256});}}
 function dependencies(refs){const result=new Set();for(const ref of refs){if(ctx.knownKeys.has(ref))result.add(ref);else if(hashes.has(ref))for(const key of hashes.get(ref))result.add(key);else throw Error('NORMALIZE_REFERENCE_MISSING');}return [...result].sort();}
 async function emit(recipe){requireValue(recipe.chunks.length>0&&recipe.chunks.every(c=>c.bytes>0&&c.bytes<=maximumChunkBytes),'NORMALIZE_CHUNKS');remember(recipe);await onRecipe(recipe);await onProgress({stage:'reference-plan',completedObjects:recipes.size,totalObjects:ctx.knownKeys.size});}
 async function visit(key){
  const resource='r2/'+key;if(recipes.has(resource))return;requireValue(!visiting.has(key)&&visiting.size<32,'NORMALIZE_REFERENCE_CYCLE_OR_DEPTH');requireValue(ctx.knownKeys.has(key),'NORMALIZE_REFERENCE_MISSING');visiting.add(key);
  if(loaded.has(resource)){
   const recipe=loaded.get(resource);requireValue(recipe.sourceResource===resource&&recipe.sourceBytes===ctx.resources.get(resource).bytes,'NORMALIZE_RESUME_SOURCE');
   for(const dep of recipe.dependencies)await visit(dep);remember(recipe);visiting.delete(key);return;
  }
  const item=ctx.resources.get(resource),object=ctx.objects.find(o=>o.key===key),refs=new Set();cleanJson(item.metadata,{knownKeys:extendedKnown,references:refs});
  let first,stats,rawSha,kind=object.encoding;
  if(kind==='binary')first=await scan(ctx.body(resource));
  else if(kind==='json'){
   const raw=await ctx.bytes(resource);rawSha=await sha256(raw);const bytes=scrubJsonBytes(raw,{knownKeys:extendedKnown,references:refs});first=await scan(streamOf(bytes));
  }else if(kind==='json-stream')first=await scan(jsonTransformStream(ctx.body(resource),{knownKeys:extendedKnown,references:refs}));
  else if(kind==='feedback-zip'){
   const plan=await prepareFeedbackArchive({object,tables:ctx.tables,readRange:ctx.range,knownKeys:ctx.knownKeys});for(const ref of plan.references)refs.add(ref);first=await scan(partsBody(plan.parts()));
  }else throw Error('NORMALIZE_CONTAINER_PROFILE');
  const deps=dependencies(refs);for(const dep of deps){requireValue(dep!==key,'NORMALIZE_SELF_REFERENCE');await visit(dep);}
  const needed=new Set(refs);for(const dep of deps){const digest=nameHash(dep);if(digest)needed.add(digest);}
  const pairs=[...rewrite].filter(([from,to])=>from!==to&&needed.has(from));const applied=new Map(pairs);
  if(kind==='binary'||!pairs.length)stats=first;
  else if(kind==='json')stats=await scan(streamOf(scrubJsonBytes(await ctx.bytes(resource),{rewrite:applied,knownKeys:ctx.knownKeys})));
  else if(kind==='json-stream')stats=await scan(jsonTransformStream(ctx.body(resource),{rewrite:applied,knownKeys:ctx.knownKeys}));
  else{const plan=await prepareFeedbackArchive({object,tables:ctx.tables,readRange:ctx.range,knownKeys:ctx.knownKeys,rewrite:applied});stats=await scan(partsBody(plan.parts()));}
  const target=kind==='binary'?key:kind==='feedback-zip'?key:rekey(key,stats.sha256);
  if(kind==='binary'&&nameHash(key))requireValue(nameHash(key)===stats.sha256,'NORMALIZE_BINARY_KEY_INTEGRITY');
  // Alias unchanged resources directly to their original chunks. A changed key
  // does not itself require copying its payload.
  let alias=kind==='binary'||(kind==='json'&&rawSha===stats.sha256);
  if(!alias&&kind==='json-stream'&&!pairs.length){const raw=await scan(ctx.body(resource));alias=raw.sha256===stats.sha256&&raw.bytes===stats.bytes;}
  const metadata=cleanJson(item.metadata,{rewrite});if(kind==='json'||kind==='json-stream')metadata.encoding=stats.bytes>maximumJsonBytes?'json-stream':'json';
  await emit({sourceResource:resource,sourceBytes:item.bytes,targetResource:'r2/'+target,kind:alias?'alias':kind,bytes:stats.bytes,sha256:stats.sha256,chunks:stats.chunks,metadata,dependencies:deps,rewritePairs:pairs});visiting.delete(key);
 }
 for(const key of [...ctx.knownKeys].sort())await visit(key);
 const tableRecipes=[];
 for(const table of Object.keys(ctx.tables)){
  const raw=await ctx.bytes('db/'+table),refs=new Set();scrubJsonBytes(raw,{knownKeys:extendedKnown,references:refs});for(const key of dependencies(refs))requireValue(recipes.has('r2/'+key),'NORMALIZE_REFERENCE_MISSING');
  const rows=normalizedRows(ctx,table,rewrite,zipPlans);
  const stats=await scan(streamOf(encode(rows)));tableRecipes.push({sourceResource:'db/'+table,sourceBytes:ctx.resources.get('db/'+table).bytes,targetResource:'db/'+table,kind:'table',bytes:stats.bytes,sha256:stats.sha256,chunks:stats.chunks,metadata:ctx.resources.get('db/'+table).metadata,dependencies:[],rewritePairs:[]});
 }
 const unique=new Map(),aliases=[];
 const targetMetadata=metadata=>{const {sourceEtag,...target}=metadata;return target;};
 for(const recipe of [...recipes.values()].sort((a,b)=>a.targetResource.localeCompare(b.targetResource,'en'))){const other=unique.get(recipe.targetResource);if(other){requireValue(other.sha256===recipe.sha256&&other.bytes===recipe.bytes&&JSON.stringify(targetMetadata(other.metadata))===JSON.stringify(targetMetadata(recipe.metadata)),'NORMALIZE_TARGET_COLLISION');aliases.push({sourceResource:recipe.sourceResource,targetResource:recipe.targetResource});}else unique.set(recipe.targetResource,recipe);}
 const all=[...tableRecipes,...unique.values()],chunks=[];
 for(const recipe of all){let offset=0;for(const c of recipe.chunks){chunks.push({id:'c'+chunks.length,resource:recipe.targetResource,offset,totalBytes:recipe.bytes,bytes:c.bytes,sha256:c.sha256,metadata:recipe.metadata});offset+=c.bytes;}requireValue(offset===recipe.bytes,'NORMALIZE_RESOURCE_COVERAGE');}
 const planCore={format:'PROCESS_OS_NORMALIZATION_PLAN_V1',programCommit,sourceManifestSha256,sourceManifestCanonicalSha256:canonicalInputSha,recipes:all,sourceMappings:[...recipes.values()].map(r=>({sourceResource:r.sourceResource,targetResource:r.targetResource,sourceMetadata:ctx.resources.get(r.sourceResource).metadata})),rewrites:[...rewrite],zipPlans:[...zipPlans],aliases};
 const planSha256=await sha256(encode(planCore)),manifest={...input,chunks,normalization:{format:'PROCESS_OS_CONTENT_ADDRESS_VIEW_V1',programCommit,sourceManifestSha256,planSha256}};validateSnapshot(manifest);
 await onProgress({stage:'plan-complete',sourceObjects:ctx.knownKeys.size,normalizedObjects:unique.size,aliases:aliases.length,logicalBytes:chunks.reduce((n,c)=>n+c.bytes,0)});
 return {...planCore,planSha256,manifest};
}
export async function openNormalizationView(source,plan){
 requireValue(plan?.format==='PROCESS_OS_NORMALIZATION_PLAN_V1','NORMALIZE_PLAN_FORMAT');
 const {planSha256,manifest,...core}=plan;requireValue(await sha256(encode(core))===planSha256&&manifest.normalization?.planSha256===planSha256,'NORMALIZE_PLAN_INTEGRITY');
 const input=await source.manifest();requireValue(await sha256(encode(input))===plan.sourceManifestCanonicalSha256,'NORMALIZE_SOURCE_CHANGED');validateSnapshot(manifest);
 const expectedChunks=[];for(const recipe of plan.recipes){let offset=0;for(const c of recipe.chunks){expectedChunks.push({id:'c'+expectedChunks.length,resource:recipe.targetResource,offset,totalBytes:recipe.bytes,bytes:c.bytes,sha256:c.sha256,metadata:recipe.metadata});offset+=c.bytes;}requireValue(offset===recipe.bytes,'NORMALIZE_RESOURCE_COVERAGE');}
 const expectedManifest={...input,chunks:expectedChunks,normalization:{format:'PROCESS_OS_CONTENT_ADDRESS_VIEW_V1',programCommit:plan.programCommit,sourceManifestSha256:plan.sourceManifestSha256,planSha256}};
 requireValue(JSON.stringify(expectedManifest)===JSON.stringify(manifest),'NORMALIZE_MANIFEST_PLAN_MISMATCH');
 const pinned=verifiedSource(source,input,async()=>{}),ctx=await hostedAuditContext(pinned),byName=new Map(plan.recipes.map(r=>[r.targetResource,r])),byChunk=new Map(manifest.chunks.map(c=>[c.id,c])),rewrite=new Map(plan.rewrites),zipPlans=new Map(plan.zipPlans);
 let current=null;
 async function body(recipe){
  if(recipe.kind==='alias')return ctx.body(recipe.sourceResource);
  const applied=new Map(recipe.rewritePairs);
  if(recipe.kind==='json')return streamOf(scrubJsonBytes(await ctx.bytes(recipe.sourceResource),{rewrite:applied,knownKeys:ctx.knownKeys}));
  if(recipe.kind==='json-stream')return jsonTransformStream(ctx.body(recipe.sourceResource),{rewrite:applied,knownKeys:ctx.knownKeys});
  if(recipe.kind==='feedback-zip'){const object=ctx.objects.find(o=>'r2/'+o.key===recipe.sourceResource),zip=await prepareFeedbackArchive({object,tables:ctx.tables,readRange:ctx.range,knownKeys:ctx.knownKeys,rewrite:applied});requireValue(zip.bytes===recipe.bytes&&zip.sha256===recipe.sha256,'NORMALIZE_RECIPE_CHANGED');return partsBody(zip.parts());}
  if(recipe.kind==='table')return streamOf(encode(normalizedRows(ctx,recipe.sourceResource.slice(3),rewrite,zipPlans)));
  throw Error('NORMALIZE_RECIPE_FORMAT');
 }
 async function close(){if(current){await current.reader.cancel().catch(()=>{});current.reader.releaseLock();current=null;}}
 return {scope:'private-snapshot',async manifest(){return manifest;},async close(){await close();},async readChunk(id){
  const descriptor=byChunk.get(id),recipe=descriptor&&byName.get(descriptor.resource);requireValue(recipe,'NORMALIZE_OUTPUT_CHUNK');
  if(recipe.kind==='alias'){
   const item=ctx.resources.get(recipe.sourceResource),sourceChunk=item.descriptors.find(c=>c.offset===descriptor.offset&&c.bytes===descriptor.bytes);
   if(sourceChunk){const bytes=await pinned.readChunk(sourceChunk.id);requireValue(await sha256(bytes)===descriptor.sha256,'NORMALIZE_OUTPUT_INTEGRITY');return bytes;}
  }
  if(!current||current.resource!==descriptor.resource||current.offset>descriptor.offset){await close();current={resource:descriptor.resource,reader:(await body(recipe)).getReader(),offset:0,pending:new Uint8Array(0)};}
  const output=new Uint8Array(descriptor.bytes);let copied=0;
  while(copied<output.length){if(!current.pending.length){const next=await current.reader.read();requireValue(!next.done,'NORMALIZE_OUTPUT_TRUNCATED');current.pending=next.value;}
   if(current.offset<descriptor.offset){const skip=Math.min(current.pending.length,descriptor.offset-current.offset);current.pending=current.pending.subarray(skip);current.offset+=skip;continue;}
   const count=Math.min(current.pending.length,output.length-copied);output.set(current.pending.subarray(0,count),copied);current.pending=current.pending.subarray(count);current.offset+=count;copied+=count;
  }
  requireValue(await sha256(output)===descriptor.sha256,'NORMALIZE_OUTPUT_INTEGRITY');
  if(descriptor.offset+descriptor.bytes===recipe.bytes){requireValue(current.pending.length===0,'NORMALIZE_OUTPUT_EXTRA');const end=await current.reader.read();requireValue(end.done,'NORMALIZE_OUTPUT_EXTRA');current.reader.releaseLock();current=null;}
  return output;
 }};
}
