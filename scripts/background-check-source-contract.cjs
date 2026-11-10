// Test-only exact inverse to main d4ac309. Never imported by runtime or executed.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contracts=require('./background-check-source-contracts.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function restorePredecessor(bytes,file){
 assert(Buffer.isBuffer(bytes),'Background proof requires raw source bytes');
 const contract=contracts.find(c=>c.file===file);assert(contract,'Background proof wrong file');
 assert.equal(hash(bytes),contract.afterHash,'Background proof differs from pinned bytes');
 let result=Buffer.from(bytes);
 for(const {offset,before,after}of [...contract.rules].reverse()){
  const span=Buffer.from(after);assert.deepEqual(result.subarray(offset,offset+span.length),span);
  result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+span.length)]);
 }
 assert.equal(hash(result),contract.beforeHash);return result;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'Background proof requires raw source bytes');bytes=require('./process-platform-count-contract.cjs').projectKnown(bytes,file);return contracts.some(c=>c.file===file&&hash(bytes)===c.afterHash)?restorePredecessor(bytes,file):bytes;}
module.exports={contracts,restorePredecessor,projectKnown};
