// Test-only exact successor -> pinned main; never imported by application code.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contract=require('./process-platform-adopt-source-contract.json'),hash=b=>createHash('sha256').update(b).digest('hex');
const normalized=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
function restore(bytes,file){
 assert(Buffer.isBuffer(bytes),'Platform adoption proof requires raw bytes');bytes=require('./inventory-main-source-contract.cjs').projectKnown(bytes,file,'main120');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;assert(c,'Platform adoption wrong path');let out=normalized(bytes);assert.equal(hash(out),c.afterHash,'Platform adoption successor drift');
 for(const r of [...c.rules].reverse()){const span=Buffer.from(r.after);assert(out.subarray(r.offset,r.offset+span.length).equals(span),'Platform adoption positioned span');out=Buffer.concat([out.subarray(0,r.offset),Buffer.from(r.before),out.subarray(r.offset+span.length)]);}
 assert.equal(hash(out),c.beforeNormalizedHash);const lines=out.toString().split('\n');for(const i of c.beforeCRLF)lines[i]+='\r';out=Buffer.from(lines.join('\n'));assert.equal(hash(out),c.beforeHash,'Platform adoption real main');return out;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'Platform adoption proof requires raw bytes');bytes=require('./inventory-main-source-contract.cjs').projectKnown(bytes,file,'main120');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;return c&&hash(normalized(bytes))===c.afterHash?restore(bytes,file):bytes;}
module.exports=Object.freeze({contract,hash,normalized,restore,projectKnown});
