/* Test-only exact source lineage. Never imported by application code; restored
 * bytes are compared with the predecessor and are never executed. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contracts=require('./master-page-runtime-source-contracts.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function restorePredecessor(bytes,file){
 assert(Buffer.isBuffer(bytes),'Page runtime proof requires raw source bytes');
 const contract=contracts.find(row=>row.file===file);assert(contract,'Page runtime proof wrong file');
 assert.equal(hash(bytes),contract.afterHash,'Page runtime proof differs from pinned bytes');let result=Buffer.from(bytes);
 for(const {offset,before,after} of [...contract.rules].reverse()){
  const span=Buffer.from(after);assert.deepEqual(result.subarray(offset,offset+span.length),span);
  result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+span.length)]);
 }
 assert.equal(hash(result),contract.beforeHash);return result;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'Page runtime proof requires raw source bytes');return contracts.some(row=>row.file===file&&row.afterHash===hash(bytes))?restorePredecessor(bytes,file):bytes;}
module.exports=Object.freeze({contracts,restorePredecessor,projectKnown});
