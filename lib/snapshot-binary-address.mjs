import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
const fail=(v,c)=>{if(!v)throw Error(c);};
// state-media.ts hashes the original UTF-8 data URL, then stores decoded bytes.
// Keep this explicit namespace separate from byte-addressed image objects.
export async function assertBinaryAddress({key,bytes,sha256,httpMetadata},openBody){
 const named=key.match(/(?:^|\/)([a-f0-9]{64})(?:\.json)?$/)?.[1];if(!named)return;
 if(!/^delivery\/media\/[a-f0-9]{64}$/.test(key)){fail(named===sha256,'NORMALIZE_BINARY_KEY_INTEGRITY');return;}
 const type=httpMetadata?.contentType;fail(typeof type==='string'&&/^(?:image\/(?:png|jpeg|webp|gif|avif)|video\/(?:mp4|webm|ogg|quicktime))$/.test(type),'SNAPSHOT_MEDIA_ADDRESS_TYPE');
 const digest=createHash('sha256').update('data:'+type+';base64,'),reader=(await openBody()).getReader();let carry=Buffer.alloc(0),length=0;
 try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.length;fail(length<=bytes,'SNAPSHOT_MEDIA_ADDRESS_SIZE');const value=Buffer.concat([carry,next.value]),end=value.length-value.length%3;digest.update(value.subarray(0,end).toString('base64'));carry=value.subarray(end);}if(carry.length)digest.update(carry.toString('base64'));fail(length===bytes,'SNAPSHOT_MEDIA_ADDRESS_SIZE');fail(digest.digest('hex')===named,'SNAPSHOT_MEDIA_ADDRESS_INTEGRITY');}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
