// Test-only source normalization. No product/runtime imports or proof admission.
// Every hit compares a private raw snapshot; mutable Buffers cannot reuse stale
// digests. Returned normalized bytes are copies. At most four <=1MiB inputs.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
module.exports=function createSourceNormalizationCache(){
 const entries=[],limit=1024*1024;
 // Small Buffer.from copies can share an exposed slab with callers. Private
 // snapshots, normalized state and returned copies must own their backing store.
 const own=raw=>{const copy=Buffer.allocUnsafeSlow(raw.length);raw.copy(copy);return copy;};
 const normalize=raw=>own(Buffer.from(raw.toString('utf8').replaceAll('\r\n','\n')));
 function get(raw){
  assert(Buffer.isBuffer(raw),'Source normalization requires raw Buffer');
  const cacheable=raw.length<=limit&&!(typeof SharedArrayBuffer==='function'&&raw.buffer instanceof SharedArrayBuffer);
  const index=cacheable?entries.findIndex(entry=>entry.raw.equals(raw)):-1;
  if(index!==-1){const [entry]=entries.splice(index,1);entries.unshift(entry);return entry;}
  const bytes=normalize(raw),entry={bytes,hash:createHash('sha256').update(bytes).digest('hex')};
  if(cacheable){entry.raw=own(raw);entries.unshift(entry);if(entries.length>4)entries.pop();}
  return entry;
 }
 return Object.freeze({hash(raw){return get(raw).hash;},bytes(raw){return own(get(raw).bytes);}});
};
