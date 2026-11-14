// Test evidence only: exact candidate -> genuine main bytes, never application code.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contract=require('./password-outcome-source-contract.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
const normalized=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
function restore(bytes,file){
 assert(Buffer.isBuffer(bytes),'Password proof requires raw Buffer');bytes=require('./ipqc-save-recovery-source-contract.cjs').projectMain113(bytes,file);const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;assert(c,'Password proof wrong path');bytes=normalized(bytes);assert.equal(hash(bytes),c.afterNormalizedHash,'Password successor differs');assert.equal(bytes.length,c.afterNormalizedLength);
 let out=Buffer.from(bytes);for(const r of [...c.rules].reverse()){const span=Buffer.from(r.after);assert.deepEqual(out.subarray(r.offset,r.offset+span.length),span);out=Buffer.concat([out.subarray(0,r.offset),Buffer.from(r.before),out.subarray(r.offset+span.length)]);}assert.equal(out.length,c.beforeNormalizedLength);assert.equal(hash(out),c.beforeNormalizedHash);const lines=out.toString().split('\n');for(const [start,end]of c.beforeCRLF)for(let index=start;index<end;index++)lines[index]+='\r';out=Buffer.from(lines.join('\n'));assert.equal(out.length,c.beforeLength);assert.equal(hash(out),c.beforeHash);return out;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'Password proof requires raw Buffer');bytes=require('./ipqc-save-recovery-source-contract.cjs').projectMain113(bytes,file);const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;return c&&hash(normalized(bytes))===c.afterNormalizedHash?restore(bytes,file):bytes;}
function assertRuntime(bytes,file){assert(Buffer.isBuffer(bytes),'Password runtime requires raw Buffer');assert.equal(file,contract.runtime.file,'Password runtime wrong path');assert.equal(hash(normalized(bytes)),contract.runtime.sha256,'Password runtime differs');}
module.exports=Object.freeze({contract,hash,restore,projectKnown,assertRuntime});
