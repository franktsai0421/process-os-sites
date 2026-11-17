// Test-only exact successor -> verified merged #123 main. Unknown source never opts in.
// Runtime never imports this inverse; original source manifests remain unchanged.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contract=require('./quality-office-source-contract.json'),hash=b=>createHash('sha256').update(b).digest('hex'),normalized=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
function restore(bytes,file){
 assert(Buffer.isBuffer(bytes),'Quality office proof requires raw Buffer');bytes=require('./quality-office-joint-source-contract.cjs').projectKnown(bytes,file,'office');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;assert(c,'Quality office proof wrong path');let out=normalized(bytes);assert.equal(hash(out),c.afterNormalizedHash,'Quality office pinned source');
 for(const r of [...c.rules].reverse()){const span=Buffer.from(r.after);assert(out.subarray(r.offset,r.offset+span.length).equals(span),'Quality office positioned span');out=Buffer.concat([out.subarray(0,r.offset),Buffer.from(r.before),out.subarray(r.offset+span.length)]);}
 assert.equal(hash(out),c.beforeNormalizedHash,'Quality office normalized main');const lines=out.toString().split('\n');for(const [start,end]of c.beforeCRLFRanges)for(let i=start;i<end;i++)lines[i]+='\r';out=Buffer.from(lines.join('\n'));assert.equal(hash(out),c.beforeHash,'Quality office exact main');return out;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'Quality office proof requires raw Buffer');bytes=require('./quality-office-joint-source-contract.cjs').projectKnown(bytes,file,'office');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;return c&&hash(normalized(bytes))===c.afterNormalizedHash?restore(bytes,file):bytes;}
module.exports=Object.freeze({contract,hash,restore,projectKnown});
