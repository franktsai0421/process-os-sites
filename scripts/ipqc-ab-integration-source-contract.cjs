// Test-only exact inverse of the isolated A/B integration to main 9fbba82.
// Runtime never imports this file. Unknown bytes never gain a historical proof.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contracts=require('./ipqc-ab-integration-source-contracts.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function restorePredecessor(bytes,file){
 assert(Buffer.isBuffer(bytes),'A/B integration proof requires raw source bytes');
 const c=contracts.find(c=>c.file===file);assert(c,'A/B integration proof wrong file');
 assert.equal(hash(bytes),c.afterHash,'A/B integration proof differs from pinned bytes');let result=Buffer.from(bytes);
 for(const r of [...c.rules].reverse()){const after=Buffer.from(r.after);assert.deepEqual(result.subarray(r.offset,r.offset+after.length),after);result=Buffer.concat([result.subarray(0,r.offset),Buffer.from(r.before),result.subarray(r.offset+after.length)]);}
 assert.equal(hash(result),c.beforeHash);return result;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'A/B integration proof requires raw source bytes');return contracts.some(c=>c.file===file&&c.afterHash===hash(bytes))?restorePredecessor(bytes,file):bytes;}
module.exports={contracts,restorePredecessor,projectKnown};
