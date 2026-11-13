// Test-only exact inverse of the bounded outcome UI follow-up to its real main.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contract=require('./process-submit-outcome-source-contract.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function restore(bytes,file){
 assert(Buffer.isBuffer(bytes),'Outcome proof requires raw Buffer bytes');bytes=require('./equipment-submit-source-contract.cjs').projectKnown(bytes,file,'submit');
 const c=contract.files[file];assert(c,'Outcome proof wrong file');
 assert.equal(bytes.length,c.afterLength,'Outcome successor length');assert.equal(hash(bytes),c.afterHash,'Outcome successor bytes');
 let prior=Buffer.from(bytes);
 for(const rule of [...c.rules].reverse()){
  const span=Buffer.from(rule.after);assert.deepEqual(prior.subarray(rule.offset,rule.offset+span.length),span,'Outcome pinned span');
  prior=Buffer.concat([prior.subarray(0,rule.offset),Buffer.from(rule.before),prior.subarray(rule.offset+span.length)]);
 }
 assert.equal(prior.length,c.beforeLength);assert.equal(hash(prior),c.beforeHash,'Outcome predecessor bytes');return prior;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'Outcome proof requires raw Buffer bytes');bytes=require('./equipment-submit-source-contract.cjs').projectKnown(bytes,file,'submit');const c=contract.files[file];return c&&hash(bytes)===c.afterHash?restore(bytes,file):bytes;}
module.exports=Object.freeze({contract,hash,restore,projectKnown});
