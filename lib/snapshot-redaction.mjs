// Bounded structural scrubber. It does not claim arbitrary binary archives are
// credential-free. Unsupported containers stop export rather than being skipped.
import {rewritePhotoValue} from './snapshot-photo-references.mjs';
export const maximumJsonBytes=8*1024*1024;
const secretField=/^(password|passwordhash|session|sessionsecret|sessiontoken|token|tokendigest|accesstoken|refreshtoken|authorization|cookie|apikey|privatekey|signingkey|secret|clientsecret|authtoken|processsessionsecret|processreleasetoken)$/;
export const isSecretField=key=>secretField.test(key.replace(/[_-]/g,'').toLowerCase());
export function cleanChunkReference(ref,{chunkRewrites,references}={}) {
  if(!chunkRewrites)throw Error('SNAPSHOT_CHUNKED_FORMAT_REQUIRES_REDACTION_ADAPTER');
  if(ref?.version!==1||!/^[a-f0-9]{64}$/.test(ref.sha256||'')||ref.key!==`state-chunks/v1/manifests/${ref.sha256}.json`||Object.keys(ref).sort().join()!=='key,sha256,version')throw Error('SNAPSHOT_CHUNK_MANIFEST_REF');
  const mapped=chunkRewrites.get(ref.key);if(!mapped)throw Error('SNAPSHOT_REFERENCE_MISSING');
  references?.add(ref.key);return {...mapped};
}
export function cleanJson(value,{rewrite=new Map(),references=null,knownKeys=new Set(),chunkRewrites=null,depth=0,photoReferences=null}={}) {
  if(photoReferences)value=rewritePhotoValue(value,photoReferences,depth);
  if(depth>48)throw Error('SNAPSHOT_JSON_DEPTH');
  if(value instanceof Date)return value.toISOString();
  const next={rewrite,references,knownKeys,chunkRewrites,depth:depth+1};
  if(Array.isArray(value))return value.map(item=>cleanJson(item,next));
  if(value&&typeof value==='object'){
    const output=Object.create(null);
    for(const [key,child] of Object.entries(value)){
      if(isSecretField(key))continue;
      if(['__proto__','constructor','prototype'].includes(key))throw Error('SNAPSHOT_JSON_KEY');
      if(key==='__processChunks'){output[key]=cleanChunkReference(child,next);continue;}
      output[key]=cleanJson(child,next);
    }
    return output;
  }
  if(typeof value!=='string')return value;
  if(knownKeys.has(value))references?.add(value);
  // References with these canonical namespaces must not silently be missing.
  if(/^(snapshots\/[a-f0-9]{64}\.json|state-records\/v1\/[a-f0-9]{64}\.json|delivery\/media\/[a-f0-9]{64}|company-assets\/objects\/[a-f0-9]{64})$/.test(value))references?.add(value);
  const photo=value.match(/^\/api\/(iqc|ipqc-ab|ipqc-c|routine-equipment|routine-fqc|tooling)\/photo\?id=([a-f0-9]{64})$/);
  if(photo)references?.add(`${photo[1]}/photos/${photo[2]}`);
  const media=value.match(/^\/api\/state-media\?id=([a-f0-9]{64})$/);
  if(media)references?.add('delivery/media/'+media[1]);
  if(/^state-chunks\//.test(value))throw Error('SNAPSHOT_CHUNK_BARE_REFERENCE');
  if(rewrite.has(value))return rewrite.get(value);
  if(/^\s*[\[{]/.test(value)){
    if(new TextEncoder().encode(value).length>maximumJsonBytes)throw Error('SNAPSHOT_JSON_LIMIT');
    let parsed;
    try{parsed=JSON.parse(value);}catch{return value;}
    return JSON.stringify(cleanJson(parsed,next));
  }
  return value;
}
export async function readBoundedBody(body,limit=maximumJsonBytes) {
  const reader=body.getReader(),chunks=[];let length=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw Error('SNAPSHOT_JSON_LIMIT');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export function scrubJsonBytes(bytes,options) {
  if(bytes.byteLength>maximumJsonBytes)throw Error('SNAPSHOT_JSON_LIMIT');
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  return new TextEncoder().encode(JSON.stringify(cleanJson(value,options)));
}
export function objectEncoding(object) {
  const type=(object.httpMetadata?.contentType||'').split(';')[0].trim().toLowerCase();
  if(object.key.startsWith('state-chunks/')){
    if(type!=='application/json')throw Error('SNAPSHOT_CHUNK_OBJECT_PROFILE');
    if(/^state-chunks\/v1\/manifests\/[a-f0-9]{64}\.json$/.test(object.key))return 'chunk-manifest';
    if(/^state-chunks\/v1\/packs\/[a-f0-9]{64}$/.test(object.key))return 'chunk-pack';
    throw Error('SNAPSHOT_CHUNK_OBJECT_PROFILE');
  }
  if(type==='application/zip'&&/^web-feedback\/v1\/H-[a-zA-Z0-9_-]{10,100}\.zip$/.test(object.key))return 'feedback-zip';
  if(type==='application/json'||object.key.endsWith('.json'))return 'json';
  if(/^image\/(jpeg|png|webp|gif|avif)$/.test(type)||/^video\/(mp4|webm|ogg|quicktime)$/.test(type))return 'binary';
  throw Error('SNAPSHOT_UNSUPPORTED_CONTAINER');
}
