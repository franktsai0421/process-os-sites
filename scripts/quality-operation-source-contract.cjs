// Exact candidate -> genuine main bytes. Test-only; unknown source never opts in.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contract=require('./quality-operation-source-contract.json'),hash=b=>createHash('sha256').update(b).digest('hex'),norm=b=>Buffer.from(b.toString().replaceAll('\r\n','\n'));
function restore(bytes,file){bytes=require('./quality-account-integration-source.cjs').projectKnown(bytes,file,'quality');
 assert(Buffer.isBuffer(bytes));const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;assert(c,'quality operation wrong path');let out=norm(bytes);assert.equal(hash(out),c.afterNormalizedHash,'quality operation source drift');
 for(const r of [...c.rules].reverse()){const span=Buffer.from(r.after);assert(out.subarray(r.offset,r.offset+span.length).equals(span),'quality operation positioned span');out=Buffer.concat([out.subarray(0,r.offset),Buffer.from(r.before),out.subarray(r.offset+span.length)]);}
 assert.equal(hash(out),c.beforeNormalizedHash);const lines=out.toString().split('\n');for(const i of c.beforeCRLF)lines[i]+='\r';out=Buffer.from(lines.join('\n'));assert.equal(hash(out),c.beforeHash);return out;
}
function projectKnown(bytes,file){bytes=require('./quality-account-integration-source.cjs').projectKnown(bytes,file,'quality');assert(Buffer.isBuffer(bytes));const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;return c&&hash(norm(bytes))===c.afterNormalizedHash?restore(bytes,file):bytes;}
module.exports=Object.freeze({contract,restore,projectKnown});
