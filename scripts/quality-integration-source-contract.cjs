// Test-only exact inverse to main 9fbba823. Never imported by product runtime.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contracts=require('./quality-integration-source-contracts.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function restorePredecessor(bytes,file){
 assert(Buffer.isBuffer(bytes),'Quality proof requires raw Buffer bytes');
 bytes=require('./quality-c-joint-source-contract.cjs').projectKnown(bytes,file,'quality');
 const c=contracts.find(c=>c.file===file);assert(c,'Quality proof wrong file');
 assert.equal(bytes.length,c.afterLength,'Quality proof pinned length');assert.equal(hash(bytes),c.afterHash,'Quality proof pinned bytes');
 let result=Buffer.from(bytes);
 for(const rule of [...c.rules].reverse()){
  const span=Buffer.from(rule.after);assert.deepEqual(result.subarray(rule.offset,rule.offset+span.length),span,'Quality proof pinned span');
  result=Buffer.concat([result.subarray(0,rule.offset),Buffer.from(rule.before),result.subarray(rule.offset+span.length)]);
 }
 assert.equal(result.length,c.beforeLength);assert.equal(hash(result),c.beforeHash);return result;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'Quality proof requires raw Buffer bytes');bytes=require('./quality-c-joint-source-contract.cjs').projectKnown(bytes,file,'quality');return contracts.some(c=>c.file===file&&hash(bytes)===c.afterHash)?restorePredecessor(bytes,file):bytes;}
module.exports={contracts,hash,restorePredecessor,projectKnown};
