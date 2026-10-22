// Opt-in immutable storage format. Conversion is explicit; normal legacy writes
// never adopt it. Chunks contain exact string slices, not lossy JSON projections.
type Bucket = {get(key:string):Promise<{text():Promise<string>}|null>;put(key:string,value:string,options?:{httpMetadata:{contentType:string}}):Promise<unknown>};
type Entry = {chunks:string[];bytes:number;sha256:string};
type Manifest = {version:1;values:Record<string,Entry>;blocks:Record<string,{pack:string;index:number;chars:number}>};
export type ChunkStorage = {manifest:Manifest;verified:Set<string>;originalValues:Record<string,string>};
const prefix='state-chunks/v1/',encoder=new TextEncoder();
const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const validHash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

// Content-defined boundaries recover after an insertion instead of shifting
// every later block. Never split a UTF-16 surrogate pair (UTF-8 round trips).
export function splitStateString(value:string):string[]{
  // Reset at large JSON subtree edges so identical snapshots share boundaries
  // regardless of their position within cases/saves/legacy-version arrays.
  const boundaries=new Set<number>(),stack:number[]=[];let quoted=false,escaped=false;
  for(let i=0;i<value.length;i++){
    const c=value[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"'){quoted=true;continue;}if(c==='{'||c==='[')stack.push(i);
    else if(c==='}'||c===']'){const start=stack.pop();if(start!==undefined&&i-start>=16384){boundaries.add(start);boundaries.add(i+1);}}
  }
  const parts:string[]=[];let start=0,rolling=0;
  for(let i=0;i<value.length;i++){
    if(boundaries.has(i)&&i>start){parts.push(value.slice(start,i));start=i;rolling=0;}
    const code=value.charCodeAt(i);rolling=((rolling<<1)+(code*2654435761))>>>0;
    if(i-start+1>=4096&&((rolling&255)===0||i-start+1>=16384)&&!(code>=0xd800&&code<=0xdbff)){
      parts.push(value.slice(start,i+1));start=i+1;rolling=0;
    }
  }
  if(start<value.length||!parts.length)parts.push(value.slice(start));return parts;
}
async function checkedObject(bucket:Bucket,key:string,sha256:string){
  const object=await bucket.get(key);if(!object)throw Error('State chunk unavailable; database was not modified');
  const text=await object.text();if(await hash(text)!==sha256)throw Error('State chunk integrity check failed');return text;
}
export async function encodeChunkedValues(bucket:Bucket,values:Record<string,string>,previous?:ChunkStorage){
  const entries:Record<string,Entry>=Object.create(null),written=new Set(previous?.verified||[]),locations:Manifest['blocks']=Object.create(null),hashes=new Map<string,string>();
  let pending:{id:string;part:string}[]=[],pendingBytes=0;
  async function flush(){if(!pending.length)return;const raw=JSON.stringify(pending.map(p=>p.part)),pack=await hash(raw);
    await bucket.put(prefix+'packs/'+pack,raw,{httpMetadata:{contentType:'application/json'}});
    pending.forEach((p,index)=>locations[p.id]={pack,index,chars:p.part.length});pending=[];pendingBytes=0;}
  for(const [key,value] of Object.entries(values)){
    if(typeof value!=='string')throw Error('Invalid shared-state value');
    const sha256=await hash(value),old=previous?.manifest.values[key];
    if(old?.sha256===sha256){entries[key]=old;old.chunks.forEach(id=>locations[id]=previous!.manifest.blocks[id]);continue;}
    const chunks:string[]=[];
    async function append(fragment:string){for(const part of splitStateString(fragment)){
      let digest=hashes.get(part);if(!digest){digest=await hash(part);hashes.set(part,digest);}chunks.push(digest);
      if(previous?.verified.has(digest))locations[digest]=previous.manifest.blocks[digest];
      if(!written.has(digest)){
        const bytes=encoder.encode(JSON.stringify(part)).length;if(pendingBytes+bytes>128*1024)await flush();
        pending.push({id:digest,part});pendingBytes+=bytes;
        written.add(digest);
      }
    }}
    // Walk verified old blocks with bounded look-ahead. This preserves unchanged
    // history between several edits (working + version projection + receipt),
    // not just a common prefix/suffix around one enormous changed interval.
    const prior=previous?.originalValues[key];let cursor=0,offset=0;
    if(old&&prior!==undefined)for(const id of old.chunks){const location=previous!.manifest.blocks[id],part=prior.slice(offset,offset+location.chars);offset+=location.chars;
      if(!part.length)continue;
      const relative=value.startsWith(part,cursor)?0:part.length>=1024?value.slice(cursor,cursor+65536+part.length).indexOf(part):-1;
      if(relative<0||relative>65536)continue;
      if(relative)await append(value.slice(cursor,cursor+relative));
      chunks.push(id);locations[id]=location;cursor+=relative+part.length;
    }
    if(cursor<value.length||!chunks.length)await append(value.slice(cursor));
    entries[key]={chunks,bytes:encoder.encode(value).length,sha256};
  }
  await flush();
  const manifest:Manifest={version:1,values:entries,blocks:locations},raw=JSON.stringify(manifest),sha256=await hash(raw),key=prefix+'manifests/'+sha256+'.json';
  await bucket.put(key,raw,{httpMetadata:{contentType:'application/json'}});
  return JSON.stringify({__processChunks:{version:1,key,sha256},platformUsers:values.platformUsers,
    ...(values.maintenanceMode!==undefined?{maintenanceMode:values.maintenanceMode}:{})});
}
export async function decodeChunkedValues(bucket:Bucket,stored:{__processChunks:{version:number;key:string;sha256:string};maintenanceMode?:string}){
  const ref=stored.__processChunks;
  if(ref.version!==1||!validHash(ref.sha256)||ref.key!==prefix+'manifests/'+ref.sha256+'.json')throw Error('Invalid chunk manifest reference');
  const manifest=JSON.parse(await checkedObject(bucket,ref.key,ref.sha256)) as Manifest;
  if(manifest.version!==1||!manifest.values||typeof manifest.values!=='object'||Array.isArray(manifest.values)||!manifest.blocks)throw Error('Invalid chunk manifest');
  const unique=new Set<string>();
  for(const entry of Object.values(manifest.values)){
    if(!entry||!Array.isArray(entry.chunks)||!entry.chunks.length||!entry.chunks.every(validHash)||!validHash(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0)throw Error('Invalid chunk entry');
    entry.chunks.forEach(id=>unique.add(id));
  }
  // Bounded parallel reads; repeated historical chunks are fetched only once
  // per request. Never keep bucket handles or verified content across requests.
  const packs=new Map<string,string[]>();for(const id of unique){const loc=manifest.blocks[id];if(!loc||!validHash(loc.pack)||!Number.isSafeInteger(loc.index)||loc.index<0||!Number.isSafeInteger(loc.chars)||loc.chars<0)throw Error('Invalid chunk location');
    const ids=packs.get(loc.pack)||[];ids.push(id);packs.set(loc.pack,ids);}
  const queue=[...packs.keys()],blocks=new Map<string,string>();let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{
    while(cursor<queue.length){const pack=queue[cursor++],parts=JSON.parse(await checkedObject(bucket,prefix+'packs/'+pack,pack));
      if(!Array.isArray(parts))throw Error('Invalid state pack');
      for(const id of packs.get(pack)!){const part=parts[manifest.blocks[id].index];if(typeof part!=='string'||part.length!==manifest.blocks[id].chars||await hash(part)!==id)throw Error('State block integrity check failed');blocks.set(id,part);}}
  }));
  const values:Record<string,string>=Object.create(null);
  for(const [key,entry] of Object.entries(manifest.values)){
    const value=entry.chunks.map(id=>blocks.get(id)!).join('');
    if(encoder.encode(value).length!==entry.bytes||await hash(value)!==entry.sha256)throw Error('State value integrity check failed');values[key]=value;
  }
  const originalValues={...values};
  if(stored.maintenanceMode!==undefined)values.maintenanceMode=stored.maintenanceMode;
  return {values,storage:{manifest,verified:unique,originalValues} satisfies ChunkStorage};
}
