// Exact integrated successor -> either real #110 or #111 source. Test only.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contract=require('./equipment-submit-source-contract.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
const normalized=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
function restore(bytes,file,target){
 assert(Buffer.isBuffer(bytes),'Joint equipment/Submit proof requires raw Buffer');bytes=require('./lines-flow-source-contract.cjs').projectKnown(bytes,file);bytes=require('./ipqc-save-recovery-source-contract.cjs').projectMain113(bytes,file);bytes=require('./password-outcome-source-contract.cjs').projectKnown(bytes,file);bytes=require('./abc-master-source-contract.cjs').projectKnown(bytes,file);bytes=require('./ipqc-save-recovery-source-contract.cjs').projectKnown(bytes,file);
 const c=Object.hasOwn(contract.files,file)?contract.files[file]:null,parent=c&&Object.hasOwn(c.parents,target)?c.parents[target]:null;assert(parent,'Joint equipment/Submit wrong file or target');
 const canonical=normalized(bytes);assert.equal(hash(canonical),c.afterNormalizedHash,'Joint equipment/Submit pinned source');
 const lines=canonical.toString().split('\n');for(const i of c.afterCRLF)lines[i]+='\r';let out=Buffer.from(lines.join('\n'));
 assert.equal(hash(out),c.afterHash,'Joint equipment/Submit pinned raw source');
 for(const rule of [...parent.rules].reverse()){
  const span=Buffer.from(rule.after);assert.deepEqual(out.subarray(rule.offset,rule.offset+span.length),span,'Joint equipment/Submit pinned span');
  out=Buffer.concat([out.subarray(0,rule.offset),Buffer.from(rule.before),out.subarray(rule.offset+span.length)]);
 }
 assert.equal(out.length,parent.length);assert.equal(hash(out),parent.hash,'Joint equipment/Submit parent bytes');return out;
}
function projectKnown(bytes,file,target){assert(Buffer.isBuffer(bytes),'Joint equipment/Submit proof requires raw Buffer');if(!Object.hasOwn(contract.parents,target))return bytes;bytes=require('./lines-flow-source-contract.cjs').projectKnown(bytes,file);bytes=require('./ipqc-save-recovery-source-contract.cjs').projectMain113(bytes,file);bytes=require('./password-outcome-source-contract.cjs').projectKnown(bytes,file);bytes=require('./abc-master-source-contract.cjs').projectKnown(bytes,file);bytes=require('./ipqc-save-recovery-source-contract.cjs').projectKnown(bytes,file);const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;return c&&Object.hasOwn(c.parents,target)&&hash(normalized(bytes))===c.afterNormalizedHash?restore(bytes,file,target):bytes;}
module.exports=Object.freeze({contract,hash,restore,projectKnown});
