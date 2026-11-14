// Exact test-only IPQC successor and merged-main projections. No runtime caller.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const contract=require('./ipqc-save-recovery-source-contract.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const normalized=bytes=>Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'));
const entry=(files,file)=>files&&Object.hasOwn(files,file)?files[file]:null;
function inverse(bytes,c){
 assert.equal(hash(normalized(bytes)),c.afterNormalizedHash,'IPQC recovery differs from pinned bytes');
 const lines=normalized(bytes).toString().split('\n');for(const i of c.afterCRLF)lines[i]+='\r';for(const [start,end]of c.afterCRLFRanges||[])for(let i=start;i<end;i++)lines[i]+='\r';let prior=Buffer.from(lines.join('\n'));
 assert.equal(hash(prior),c.afterHash,'IPQC recovery raw bytes');
 for(const rule of [...c.rules].reverse()){
  const span=Buffer.from(rule.after);assert.deepEqual(prior.subarray(rule.offset,rule.offset+span.length),span,'IPQC recovery pinned span');
  prior=Buffer.concat([prior.subarray(0,rule.offset),Buffer.from(rule.before),prior.subarray(rule.offset+span.length)]);
 }
 assert.equal(prior.length,c.beforeLength);assert.equal(hash(prior),c.beforeHash,'IPQC recovery predecessor');return prior;
}
function restore(bytes,file){assert(Buffer.isBuffer(bytes),'IPQC recovery requires raw Buffer');bytes=require('./process-ipqc-link-source-contract.cjs').projectKnown(bytes,file);const c=entry(contract.files,file);assert(c,'IPQC recovery wrong file');return inverse(bytes,c);}
function projectKnown(bytes,file){assert(Buffer.isBuffer(bytes),'IPQC recovery requires raw Buffer');bytes=require('./process-ipqc-link-source-contract.cjs').projectKnown(bytes,file);const c=entry(contract.files,file);return c&&hash(normalized(bytes))===c.afterNormalizedHash?inverse(bytes,c):bytes;}
function restoreMain112(bytes,file){assert(Buffer.isBuffer(bytes),'IPQC recovery requires raw Buffer');bytes=require('./process-ipqc-link-source-contract.cjs').projectKnown(bytes,file);const c=entry(contract.main112?.files,file);assert(c,'IPQC recovery wrong main112 file');return inverse(bytes,c);}
function projectMain112(bytes,file){assert(Buffer.isBuffer(bytes),'IPQC recovery requires raw Buffer');bytes=require('./process-ipqc-link-source-contract.cjs').projectKnown(bytes,file);const c=entry(contract.main112?.files,file);return c&&hash(normalized(bytes))===c.afterNormalizedHash?inverse(bytes,c):bytes;}
function restoreMain113(bytes,file){assert(Buffer.isBuffer(bytes),'IPQC recovery requires raw Buffer');bytes=require('./process-ipqc-link-source-contract.cjs').projectKnown(bytes,file);const c=entry(contract.main113?.files,file);assert(c,'IPQC recovery wrong main113 file');return inverse(bytes,c);}
function projectMain113(bytes,file){assert(Buffer.isBuffer(bytes),'IPQC recovery requires raw Buffer');bytes=require('./process-ipqc-link-source-contract.cjs').projectKnown(bytes,file);const c=entry(contract.main113?.files,file);return c&&hash(normalized(bytes))===c.afterNormalizedHash?inverse(bytes,c):bytes;}
module.exports=Object.freeze({contract,hash,restore,projectKnown,restoreMain112,projectMain112,restoreMain113,projectMain113});
