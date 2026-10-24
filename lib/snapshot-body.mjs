// Bounded bytes, elapsed time and cancellation. A provider cancel promise is
// not allowed to keep the request open. No retry or authority extension.
import {sha256} from './snapshot-contract.mjs';
export const importBodyTimeoutMs=10_000;
export async function consumeImportBody(body,limit,{signal,timeoutMs=importBodyTimeoutMs,expectedBytes,expectedSha256}={}){
 if(!body?.getReader||!Number.isSafeInteger(limit)||limit<0||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>90_000)throw Error('IMPORT_BODY');
 const reader=body.getReader(),parts=[];let length=0,stopped=false,timer,abort;
 const stop=new Promise((_,reject)=>{
  abort=()=>{stopped=true;reject(Error('IMPORT_BODY_CANCELLED'));};
  timer=setTimeout(()=>{stopped=true;reject(Error('IMPORT_BODY_TIMEOUT'));},timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 });
 try{
  return await Promise.race([stop,(async()=>{
   for(;;){
    if(stopped)throw Error('IMPORT_BODY_CANCELLED');
    const next=await reader.read();if(stopped)throw Error('IMPORT_BODY_CANCELLED');if(next.done)break;
    if(!(next.value instanceof Uint8Array))throw Error('IMPORT_BODY');
    length+=next.value.length;if(length>limit)throw Error('IMPORT_BODY_LIMIT');parts.push(next.value);
   }
   if(expectedBytes!==undefined&&length!==expectedBytes)throw Error('IMPORT_BODY_INTEGRITY');
   const bytes=new Uint8Array(length);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
   const digest=await sha256(bytes);if(stopped)throw Error('IMPORT_BODY_CANCELLED');
   if(expectedSha256!==undefined&&digest!==expectedSha256)throw Error('IMPORT_BODY_INTEGRITY');
   return{bytes,sha256:digest};
  })()]);
 }finally{
  stopped=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
  // cancel closes the stream, but the source may return a never-settling
  // promise. Observe rejection without awaiting provider cleanup indefinitely.
  try{void reader.cancel().catch(()=>{});}catch{/* best effort */}
  try{reader.releaseLock();}catch{/* preserve the original failure */}
 }
}
