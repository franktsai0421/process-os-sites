// Test-only exact successor -> main2434507 inverse. No runtime imports.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contracts=require('./equipment-integration-source-contracts.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
const normalized=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
function restore(bytes,file){
 assert(Buffer.isBuffer(bytes),'Equipment integration proof requires raw Buffer');bytes=require('./equipment-submit-source-contract.cjs').projectKnown(bytes,file,'equipment');
 const c=contracts.find(c=>c.file===file);assert(c,'Equipment integration wrong file');
 let result=normalized(bytes);assert.equal(hash(result),c.afterHash,'Equipment integration pinned source');
 for(const r of [...c.rules].reverse()){const span=Buffer.from(r.after);assert.deepEqual(result.subarray(r.offset,r.offset+span.length),span,'Equipment integration pinned span');result=Buffer.concat([result.subarray(0,r.offset),Buffer.from(r.before),result.subarray(r.offset+span.length)]);}
 assert.equal(hash(result),c.beforeNormalizedHash,'Equipment integration pinned normalized predecessor');const lines=result.toString().split('\n');for(const [start,end]of c.beforeCRLF)for(let i=start;i<=end;i++)lines[i]+='\r';result=Buffer.from(lines.join('\n'));assert.equal(hash(result),c.beforeHash,'Equipment integration pinned predecessor');return result;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'Equipment integration proof requires raw Buffer');bytes=require('./equipment-submit-source-contract.cjs').projectKnown(bytes,file,'equipment');return contracts.some(c=>c.file===file&&c.afterHash===hash(normalized(bytes)))?restore(bytes,file):bytes;}
module.exports={contracts,restore,projectKnown};
