// Local import staging references the verified snapshot; no payload files copied.
import {validateSnapshot,sha256,maximumChunkBytes} from './snapshot-contract.mjs';
export async function createReadOnlySnapshotStage({source,onComplete=async()=>{},onAbort=async()=>{}}){
 if(source?.scope!=='private-snapshot'||typeof source.manifest!=='function'||typeof source.readChunk!=='function')throw Error('SNAPSHOT_READONLY_STAGE_SOURCE');
 const manifest=await source.manifest();validateSnapshot(manifest);const pins=new Map(manifest.chunks.map(chunk=>[chunk.id,{bytes:chunk.bytes,sha256:chunk.sha256}])),seen=new Set();
 const metrics={receivedChunks:0,validatedBytes:0,sourceReadCalls:0,storedTransferBytes:0};
 async function check(id,data){const pin=pins.get(id);if(!pin||!(data instanceof Uint8Array)||data.length>maximumChunkBytes||data.length!==pin.bytes||await sha256(data)!==pin.sha256)throw Error('SNAPSHOT_READONLY_STAGE_INTEGRITY');return pin;}
 return {metrics,
  async write(id,data){if(seen.has(id))throw Error('SNAPSHOT_READONLY_STAGE_DUPLICATE');await check(id,data);seen.add(id);metrics.receivedChunks++;metrics.validatedBytes+=data.length;},
  async read(id){if(!seen.has(id))throw Error('SNAPSHOT_READONLY_STAGE_NOT_RECEIVED');metrics.sourceReadCalls++;const data=await source.readChunk(id,maximumChunkBytes);await check(id,data);return data;},
  async complete(value){if(seen.size!==pins.size)throw Error('SNAPSHOT_READONLY_STAGE_INCOMPLETE');await onComplete({...value,readOnlySnapshotStaging:true,storedTransferBytes:0});},
  async abort(value){await onAbort(value);},
 };
}
