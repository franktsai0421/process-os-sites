// Test-only exact successor inverse. No runtime use or arbitrary source waiver.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contract=require('./ipqc-save-recovery-source-contract.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const normalized=bytes=>Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'));
function restore(bytes,file){
 assert(Buffer.isBuffer(bytes),'IPQC recovery requires raw Buffer');
 const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;assert(c,'IPQC recovery wrong file');
 assert.equal(hash(normalized(bytes)),c.afterNormalizedHash,'IPQC recovery differs from pinned bytes');
 const lines=normalized(bytes).toString().split('\n');for(const i of c.afterCRLF)lines[i]+='\r';let prior=Buffer.from(lines.join('\n'));
 assert.equal(hash(prior),c.afterHash,'IPQC recovery raw bytes');
 for(const rule of [...c.rules].reverse()){
  const span=Buffer.from(rule.after);assert.deepEqual(prior.subarray(rule.offset,rule.offset+span.length),span,'IPQC recovery pinned span');
  prior=Buffer.concat([prior.subarray(0,rule.offset),Buffer.from(rule.before),prior.subarray(rule.offset+span.length)]);
 }
 assert.equal(prior.length,c.beforeLength);assert.equal(hash(prior),c.beforeHash,'IPQC recovery predecessor');return prior;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'IPQC recovery requires raw Buffer');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;return c&&hash(normalized(bytes))===c.afterNormalizedHash?restore(bytes,file):bytes;}
module.exports=Object.freeze({contract,hash,restore,projectKnown});
