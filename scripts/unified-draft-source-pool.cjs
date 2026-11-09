/* Test-only readable pool separation; every original byte/hash/span is retained. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
function joinSourcePool(manifest,read){
 assert(manifest?.spanPool&&Object.keys(manifest.spanPool).sort().join(',')==='bytes,file,sha256','Source span pool metadata required');
 assert(manifest.spans===undefined&&manifest.spanPool.file==='unified-draft-source-spans.json','Source span pool path/mixed encoding invalid');
 const raw=read(manifest.spanPool.file);assert(Buffer.isBuffer(raw)&&raw.length===manifest.spanPool.bytes&&raw.length<=5*1024*1024,'Source span pool bytes invalid');
 assert.equal(createHash('sha256').update(raw).digest('hex'),manifest.spanPool.sha256,'Source span pool hash mismatch');
 const rest={...manifest};delete rest.spanPool;return {...rest,spans:JSON.parse(raw.toString('utf8'))};
}
module.exports=Object.freeze({joinSourcePool});
