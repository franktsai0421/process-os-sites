// Test-only exact successor -> actual main. No fuzzy matches or runtime use.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contract=require('./process-review-source-contract.json'),hash=b=>createHash('sha256').update(b).digest('hex');
const normalized=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
function restore(bytes,file){
 assert(Buffer.isBuffer(bytes),'Review proof requires raw Buffer');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;assert(c,'Review proof wrong path');const raw=normalized(bytes);assert.equal(hash(raw),c.afterHash,'Review successor drift');let out=Buffer.from(raw);
 for(const rule of [...c.rules].reverse()){const span=Buffer.from(rule.after);assert.deepEqual(out.subarray(rule.offset,rule.offset+span.length),span,'Review positioned bytes');out=Buffer.concat([out.subarray(0,rule.offset),Buffer.from(rule.before),out.subarray(rule.offset+span.length)]);}
 assert.equal(hash(out),c.beforeNormalizedHash,'Review normalized predecessor');const lines=out.toString().split('\n');for(const index of c.beforeCRLF)lines[index]+='\r';out=Buffer.from(lines.join('\n'));assert.equal(hash(out),c.beforeHash,'Review actual main bytes');return out;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'Review proof requires raw Buffer');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;return c&&hash(normalized(bytes))===c.afterHash?restore(bytes,file):bytes;}
module.exports=Object.freeze({contract,hash,restore,projectKnown});
