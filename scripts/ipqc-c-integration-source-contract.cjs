/* Reviewed IPQC C successor only. Exact raw-byte inverse to fixed main; no
 * historical pins, negative cases, budgets or other-module inputs are changed. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {base,contracts}=require('./ipqc-c-integration-source-contract.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function withoutCIntegration(bytes,file){
 assert(Buffer.isBuffer(bytes),'C integration requires raw source bytes');
 bytes=require('./quality-triple-source-contract.cjs').projectKnown(bytes,file,'pair'); bytes=require('./quality-c-joint-source-contract.cjs').projectKnown(bytes,file,'c');
 const contract=contracts[file];assert(contract,'Unknown C integration source');
 if(hash(bytes)===contract.beforeHash)return bytes;
 assert.equal(hash(bytes),contract.afterHash,'C integration source differs from pinned bytes');
 let result=Buffer.from(bytes);
 for(const {offset,before,after}of [...contract.rules].reverse()){
  const expected=Buffer.from(after);assert.deepEqual(result.subarray(offset,offset+expected.length),expected,'C integration source span differs');
  result=Buffer.concat([result.subarray(0,offset),Buffer.from(before),result.subarray(offset+expected.length)]);
 }
 assert.equal(hash(result),contract.beforeHash,'C integration inverse changed main bytes');return result;
}
function projectKnown(bytes,file){
 assert(Buffer.isBuffer(bytes),'C integration requires raw source bytes');
 bytes=require('./quality-triple-source-contract.cjs').projectKnown(bytes,file,'pair'); bytes=require('./quality-c-joint-source-contract.cjs').projectKnown(bytes,file,'c');
 return contracts[file]?.afterHash===hash(bytes)?withoutCIntegration(bytes,file):bytes;
}
module.exports={base,contracts,withoutCIntegration,projectKnown};
