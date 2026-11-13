// Test evidence only: exact candidate -> genuine main bytes, never application code.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contract=require('./password-outcome-source-contract.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
const normalized=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
function restore(bytes,file){
 assert(Buffer.isBuffer(bytes),'Password proof requires raw Buffer');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;assert(c,'Password proof wrong path');bytes=normalized(bytes);assert.equal(hash(bytes),c.afterHash,'Password successor differs');assert.equal(bytes.length,c.afterLength);
 let out=Buffer.from(bytes);for(const r of [...c.rules].reverse()){const span=Buffer.from(r.after);assert.deepEqual(out.subarray(r.offset,r.offset+span.length),span);out=Buffer.concat([out.subarray(0,r.offset),Buffer.from(r.before),out.subarray(r.offset+span.length)]);}assert.equal(out.length,c.beforeLength);assert.equal(hash(out),c.beforeHash);return out;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'Password proof requires raw Buffer');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;return c&&hash(normalized(bytes))===c.afterHash?restore(bytes,file):bytes;}
module.exports=Object.freeze({contract,hash,restore,projectKnown});
