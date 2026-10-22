import {exportSnapshot,validateSnapshot,maximumChunkBytes} from './snapshot-contract.mjs';
import {Buffer} from 'node:buffer';
const encoder=new TextEncoder();
export function snapshotResponseBody(source) {
  // Writer backpressure prevents an 8 GB export being queued in isolate memory.
  const stream=new TransformStream();
  const writer=stream.writable.getWriter();
  const write=record=>writer.write(encoder.encode(JSON.stringify(record)+'\n'));
  const sink={scope:'private-snapshot',async writeChunk(id,data){await write({type:'chunk',id,data:Buffer.from(data).toString('base64')});},async complete(manifest){const text=JSON.stringify(manifest);if(encoder.encode(text).length>16*1024*1024)throw Error('SNAPSHOT_MANIFEST_LIMIT');validateSnapshot(manifest);await write({type:'complete',manifest});await writer.close();},async abort(error){const code=/^SNAPSHOT_[A-Z0-9_]+$/.test(error?.message||'')?error.message:'SNAPSHOT_EXPORT_INCOMPLETE';try{await write({type:'error',code});await writer.close();}catch{await writer.abort(Error('SNAPSHOT_EXPORT_INCOMPLETE')).catch(()=>{});}}};
  // This promise is owned by the response stream; cancellation rejects writes.
  const completion=exportSnapshot(source,sink).catch(()=>{});
  return {body:stream.readable,completion};
}
export async function receiveSnapshotStream(body,sink) {
  const reader=body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
  let pending='',complete=false,ordinal=0;
  async function line(text){
    if(complete)throw Error('SNAPSHOT_TRAILING_DATA');
    const record=JSON.parse(text);
    if(record.type==='chunk'){
      if(record.id!==`c${ordinal++}`||typeof record.data!=='string'||record.data.length>Math.ceil(maximumChunkBytes/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.data))throw Error('SNAPSHOT_STREAM_CHUNK');
      const bytes=new Uint8Array(Buffer.from(record.data,'base64'));
      if(!bytes.length||bytes.length>maximumChunkBytes)throw Error('SNAPSHOT_STREAM_CHUNK');
      await sink.writeChunk(record.id,bytes);
    }else if(record.type==='complete'){
      validateSnapshot(record.manifest);
      if(record.manifest.chunks.length!==ordinal)throw Error('SNAPSHOT_STREAM_COVERAGE');
      // Do not publish the completion marker until EOF; a trailing record fails.
      complete=record.manifest;
    }else if(record.type==='error')throw Error(/^SNAPSHOT_[A-Z0-9_]+$/.test(record.code||'')?record.code:'SNAPSHOT_EXPORT_INCOMPLETE');
    else throw Error('SNAPSHOT_STREAM_RECORD');
  }
  try{
    while(true){const part=await reader.read();if(part.done)break;pending+=decoder.decode(part.value,{stream:true});let newline;while((newline=pending.indexOf('\n'))>=0){const text=pending.slice(0,newline);pending=pending.slice(newline+1);if(!text||text.length>17*1024*1024)throw Error('SNAPSHOT_STREAM_LINE');await line(text);}if(pending.length>17*1024*1024)throw Error('SNAPSHOT_STREAM_LINE');}
    pending+=decoder.decode();
    if(pending||!complete)throw Error('SNAPSHOT_STREAM_INCOMPLETE');
    await sink.complete(complete);return complete;
  }catch(error){await reader.cancel().catch(()=>{});await sink.abort();throw error;}
  finally{reader.releaseLock();}
}
