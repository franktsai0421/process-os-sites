// Codec for the exact v1 manifest/pack/UTF-16-char contract in state-chunks.ts.
// writeObject must be a private export spool or isolated stage, never live R2.
import {createHash} from 'node:crypto';
import {readBoundedBody,isSecretField} from './snapshot-redaction.mjs';
import {jsonTransformStream} from './snapshot-json-stream.mjs';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true}),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const jsonKeys=new Set(['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','processMasterData','masterDataControl','bomOverrides','bomMasterControl','processAuthoringControl','qualityMasterControl','iqcMasterControl','ipqcABMasterControl','ipqcCMasterControl','routineEquipmentControl','routineFqcControl','toolingMasterControl','publishedProcess','approvalVersions','dispatchBoard','canonicalQuality','backupSettings','versionSampleSeed4']);
const rawKeys=new Set(['maintenanceMode','routineFqcEnabled']);
function digest(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
export async function rewriteChunkedManifest({reference,readObject,writeObject,rewrite=new Map(),knownKeys=new Set()}){
  if(reference?.version!==1||!digest(reference.sha256)||reference.key!==`state-chunks/v1/manifests/${reference.sha256}.json`)throw Error('SNAPSHOT_CHUNK_MANIFEST_REF');
  async function read(key,maximum){const object=await readObject(key);if(!object?.body||object.size>maximum)throw Error('SNAPSHOT_CHUNK_OBJECT_MISSING_OR_LIMIT');const bytes=await readBoundedBody(object.body,maximum);if(bytes.length!==object.size)throw Error('SNAPSHOT_CHUNK_OBJECT_SIZE');return bytes;}
  const raw=await read(reference.key,8*1024*1024);if(hash(raw)!==reference.sha256)throw Error('SNAPSHOT_CHUNK_MANIFEST_HASH');
  const manifest=JSON.parse(decoder.decode(raw));
  if(manifest.version!==1||!manifest.values||Array.isArray(manifest.values)||!manifest.blocks||Array.isArray(manifest.blocks)||Object.keys(manifest.blocks).length>50000)throw Error('SNAPSHOT_CHUNK_MANIFEST');
  const cache=new Map(),coverage=new Map(),usedBlocks=new Set(),references=new Set(),metrics={maxCachedPacks:0,maxPackBytes:0,maxTextBufferChars:0,logicalBytes:0};
  async function pack(id){
    if(cache.has(id)){const value=cache.get(id);cache.delete(id);cache.set(id,value);return value;}
    const bytes=await read('state-chunks/v1/packs/'+id,256*1024);if(hash(bytes)!==id)throw Error('SNAPSHOT_CHUNK_PACK_HASH');
    const parts=JSON.parse(decoder.decode(bytes));if(!Array.isArray(parts)||parts.some(part=>typeof part!=='string'||part.length>16385))throw Error('SNAPSHOT_CHUNK_PACK');
    cache.set(id,parts);if(cache.size>4)cache.delete(cache.keys().next().value);
    metrics.maxCachedPacks=Math.max(metrics.maxCachedPacks,cache.size);metrics.maxPackBytes=Math.max(metrics.maxPackBytes,bytes.length);return parts;
  }
  async function* valueParts(entry){
    if(!entry||!Array.isArray(entry.chunks)||!entry.chunks.length||entry.chunks.some(id=>!digest(id))||!digest(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0)throw Error('SNAPSHOT_CHUNK_ENTRY');
    const valueHash=createHash('sha256');let bytes=0;
    for(const id of entry.chunks){usedBlocks.add(id);const location=manifest.blocks[id];if(!location||!digest(location.pack)||!Number.isSafeInteger(location.index)||location.index<0||!Number.isSafeInteger(location.chars)||location.chars<0||location.chars>16385)throw Error('SNAPSHOT_CHUNK_LOCATION');const parts=await pack(location.pack),part=parts[location.index];if(typeof part!=='string'||part.length!==location.chars)throw Error('SNAPSHOT_CHUNK_CHAR_LENGTH');const data=encoder.encode(part);if(hash(data)!==id)throw Error('SNAPSHOT_CHUNK_BLOCK_HASH');const slots=coverage.get(location.pack)||new Set();slots.add(location.index);coverage.set(location.pack,slots);bytes+=data.length;valueHash.update(data);yield data;}
    if(bytes!==entry.bytes||valueHash.digest('hex')!==entry.sha256)throw Error('SNAPSHOT_CHUNK_VALUE_HASH');metrics.logicalBytes+=bytes;
  }
  function valueBody(entry){const iterator=valueParts(entry);return new ReadableStream({async pull(controller){const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(next.value);},async cancel(){await iterator.return();}});}
  const values=Object.create(null),blocks=Object.create(null),pending=[],pendingIds=[],pendingSet=new Set();let pendingBytes=0,blockCount=0;
  async function flush(){if(!pending.length)return;const bytes=encoder.encode(JSON.stringify(pending)),id=hash(bytes);if(bytes.length>256*1024)throw Error('SNAPSHOT_CHUNK_OUTPUT_PACK_LIMIT');await writeObject('state-chunks/v1/packs/'+id,bytes);for(let i=0;i<pending.length;i++)blocks[pendingIds[i]]={pack:id,index:i,chars:pending[i].length};blockCount+=pending.length;pending.length=0;pendingIds.length=0;pendingSet.clear();pendingBytes=0;}
  async function append(part){const id=hash(encoder.encode(part));if(blocks[id]||pendingSet.has(id))return id;const length=encoder.encode(JSON.stringify(part)).length;if(pendingBytes+length+pending.length+2>128*1024)await flush();if(blockCount+pending.length>=50000)throw Error('SNAPSHOT_CHUNK_OUTPUT_INDEX_LIMIT');pending.push(part);pendingIds.push(id);pendingSet.add(id);pendingBytes+=length;return id;}
  for(const [key,entry] of Object.entries(manifest.values)){
    if(isSecretField(key)){for await(const ignored of valueParts(entry)){}continue;}
    if(!jsonKeys.has(key)&&!key.startsWith('processEditor:')&&!rawKeys.has(key))throw Error('SNAPSHOT_CHUNK_VALUE_FORMAT_UNSUPPORTED');
    if(rawKeys.has(key)&&entry.bytes>128)throw Error('SNAPSHOT_CHUNK_FLAG_LIMIT');
    const stream=jsonKeys.has(key)||key.startsWith('processEditor:')?jsonTransformStream(valueBody(entry),{rewrite,knownKeys,references}):valueBody(entry);
    const reader=stream.getReader(),textDecoder=new TextDecoder('utf-8',{fatal:true}),valueHash=createHash('sha256'),chunks=[];let bytes=0,text='';
    async function emit(final=false){while(text.length>=16384||final&&text.length){let end=Math.min(16384,text.length);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1])&&/[\uDC00-\uDFFF]/.test(text[end]))end--;const part=text.slice(0,end);text=text.slice(end);chunks.push(await append(part));}}
    try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;valueHash.update(part.value);text+=textDecoder.decode(part.value,{stream:true});metrics.maxTextBufferChars=Math.max(metrics.maxTextBufferChars,text.length);await emit();}text+=textDecoder.decode();await emit(true);if(!chunks.length)chunks.push(await append(''));}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    values[key]={chunks,bytes,sha256:valueHash.digest('hex')};
  }
  if(Object.keys(manifest.blocks).some(id=>!usedBlocks.has(id)))throw Error('SNAPSHOT_CHUNK_UNCOVERED_MANIFEST_BLOCK');
  await flush();for(const key of references)if(!knownKeys.has(key))throw Error('SNAPSHOT_REFERENCE_MISSING');
  const output=encoder.encode(JSON.stringify({version:1,values,blocks}));if(output.length>8*1024*1024)throw Error('SNAPSHOT_CHUNK_MANIFEST_LIMIT');const outputHash=hash(output),key=`state-chunks/v1/manifests/${outputHash}.json`;await writeObject(key,output);
  return {reference:{version:1,key,sha256:outputHash},references,metrics,sourceCoverage:{manifest:reference.key,packs:[...coverage].map(([pack,slots])=>({key:'state-chunks/v1/packs/'+pack,slots:[...slots].sort((a,b)=>a-b)}))}};
}
