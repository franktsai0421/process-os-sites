import {decodeRecordValues,isImmutableRecordBody,readImmutableRecord} from './state-records';
type Ref=Parameters<typeof readImmutableRecord>[1];
type Bucket=Parameters<typeof readImmutableRecord>[0];
const valid=(ref:Ref)=>ref&&/^[a-f0-9]{64}$/.test(ref.sha256)&&ref.key==='state-records/v1/'+ref.sha256+'.json';
// Validate every reachable immutable body before publishing a backup pointer.
// Closed snapshots are checked serially, never assembled as one history JSON.
// Original legacySources are archival strings, not live data: verify their
// bytes by streaming SHA without buffering the pre-conversion aggregate.
export async function verifiedRecordRestore(bucket:Bucket,envelope:Parameters<typeof decodeRecordValues>[1]){
 const refs=new Map<string,Ref>(),verified=new Set<string>();
 const add=(ref:Ref)=>{if(!valid(ref))throw Error('Invalid backup record reference');refs.set(ref.sha256,ref);};
 const visit=(value:unknown):void=>{if(isImmutableRecordBody(value)){add(value.__immutableBody);return;}if(value&&typeof value==='object')for(const child of Object.values(value))visit(child);};
 for(const ref of Object.values(envelope.__processRecords.values))add(ref);
 for(const ref of Object.values(envelope.__processRecords.allocations||{}))add(ref);
 for(const [sha,ref]of refs){visit(JSON.parse(await readImmutableRecord(bucket,ref)));verified.add(sha);}
 for(const ref of Object.values(envelope.__processRecords.legacySources||{})){
  if(!valid(ref))throw Error('Invalid backup source reference');if(verified.has(ref.sha256))continue;
  const object=await bucket.get(ref.key);if(!object)throw Error('Backup source missing');
  const digestCrypto=crypto as Crypto&{DigestStream?:new(algorithm:string)=>WritableStream<Uint8Array>&{digest:Promise<ArrayBuffer>}};
  let digest:string;
  if('body'in object&&object.body instanceof ReadableStream&&digestCrypto.DigestStream){
   const stream=new digestCrypto.DigestStream('SHA-256');await object.body.pipeTo(stream);digest=Array.from(new Uint8Array(await stream.digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  }else{await readImmutableRecord(bucket,ref);digest=ref.sha256;}
  if(digest!==ref.sha256)throw Error('Backup source corrupt');verified.add(ref.sha256);
 }
 return decodeRecordValues(bucket,envelope,{deferHistory:true,deferDependencyHistory:true});
}
