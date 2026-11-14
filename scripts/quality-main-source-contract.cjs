// Test-only exact inverse for the reviewed #109 triple + merged #108 main common source.
// Each projection returns one genuine pinned parent. Never used by runtime.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contracts=require('./quality-main-source-contracts.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function restoreParent(bytes,file,target){
 assert(Buffer.isBuffer(bytes),'Joint proof requires raw Buffer bytes');
 bytes=require('./lines-flow-source-contract.cjs').projectKnown(bytes,file);
 bytes=require('./password-outcome-source-contract.cjs').projectKnown(bytes,file);
 bytes=require('./process-submit-outcome-source-contract.cjs').projectKnown(bytes,file);
 bytes=require('./equipment-integration-source-contract.cjs').projectKnown(bytes,file);
 const c=contracts.find(c=>c.file===file&&c.target===target);assert(c,'Joint proof wrong file or target');
 assert.equal(bytes.length,c.afterLength,'Joint proof pinned length');assert.equal(hash(bytes),c.afterHash,'Joint proof differs from pinned bytes');
 let result=Buffer.from(bytes);
 for(const rule of [...c.rules].reverse()){
  const span=Buffer.from(rule.after);assert.deepEqual(result.subarray(rule.offset,rule.offset+span.length),span,'Joint proof pinned span');
  result=Buffer.concat([result.subarray(0,rule.offset),Buffer.from(rule.before),result.subarray(rule.offset+span.length)]);
 }
 assert.equal(result.length,c.beforeLength,'Joint proof parent length');assert.equal(hash(result),c.beforeHash,'Joint proof parent bytes');return result;
}
function projectKnown(bytes,file,target){
 assert(Buffer.isBuffer(bytes),'Joint proof requires raw Buffer bytes');
 bytes=require('./lines-flow-source-contract.cjs').projectKnown(bytes,file);
 bytes=require('./password-outcome-source-contract.cjs').projectKnown(bytes,file);
 bytes=require('./process-submit-outcome-source-contract.cjs').projectKnown(bytes,file);
 bytes=require('./equipment-integration-source-contract.cjs').projectKnown(bytes,file);
 return contracts.some(c=>c.file===file&&c.target===target&&c.afterHash===hash(bytes))?restoreParent(bytes,file,target):bytes;
}
module.exports={contracts,hash,restoreParent,projectKnown};
