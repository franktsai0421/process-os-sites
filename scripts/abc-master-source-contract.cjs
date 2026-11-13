// Exact test-only successor -> merged main ba31514 inverse. Unknown bytes are
// never certified or patched. No application runtime imports this helper.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {contracts}=require('./abc-master-source-contract.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const normalized=bytes=>Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'));
function restore(bytes,file){
 assert(Buffer.isBuffer(bytes));const c=contracts.find(c=>c.file===file);assert(c,'ABC proof wrong path');
 let result=normalized(bytes);assert.equal(hash(result),c.afterHash,'ABC successor differs');
 for(const r of [...c.rules].reverse()){const span=Buffer.from(r.after);assert.deepEqual(result.subarray(r.offset,r.offset+span.length),span,'ABC positioned span differs');result=Buffer.concat([result.subarray(0,r.offset),Buffer.from(r.before),result.subarray(r.offset+span.length)]);}
 assert.equal(hash(result),c.beforeNormalizedHash,'ABC normalized predecessor differs');const lines=result.toString().split('\n');for(const i of c.beforeCRLF)lines[i]+='\r';result=Buffer.from(lines.join('\n'));assert.equal(hash(result),c.beforeHash,'ABC original predecessor differs');return result;
}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes));return contracts.some(c=>c.file===file&&hash(normalized(bytes))===c.afterHash)?restore(bytes,file):bytes;}
module.exports={contracts,hash,restore,projectKnown};
