// Test-only exact candidate -> genuine main inverse. No runtime imports or fuzzy admission.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contract=require('./ipqc-speed-source-contract.json'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const normalized=bytes=>Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'));
function restore(bytes,file){
 assert(Buffer.isBuffer(bytes),'IPQC speed proof requires raw Buffer');bytes=require('./ipqc-speed-joint-source-contract.cjs').projectKnown(bytes,file,'speed');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;assert(c,'IPQC speed proof wrong path');let out=normalized(bytes);assert.equal(hash(out),c.afterNormalizedHash,'IPQC speed source differs from pinned bytes');
 for(const rule of [...c.rules].reverse()){const span=Buffer.from(rule.after);assert.equal(out.subarray(rule.offset,rule.offset+span.length).equals(span),true,'IPQC speed positioned span');out=Buffer.concat([out.subarray(0,rule.offset),Buffer.from(rule.before),out.subarray(rule.offset+span.length)]);}
 assert.equal(hash(out),c.beforeNormalizedHash,'IPQC speed normalized main');const lines=out.toString().split('\n');for(const [start,end]of c.beforeCRLFRanges)for(let index=start;index<end;index++)lines[index]+='\r';out=Buffer.from(lines.join('\n'));assert.equal(hash(out),c.beforeHash,'IPQC speed actual main');return out;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'IPQC speed proof requires raw Buffer');bytes=require('./ipqc-speed-joint-source-contract.cjs').projectKnown(bytes,file,'speed');const c=Object.hasOwn(contract.files,file)?contract.files[file]:null;return c&&hash(normalized(bytes))===c.afterNormalizedHash?restore(bytes,file):bytes;}
module.exports=Object.freeze({contract,hash,restore,projectKnown});
