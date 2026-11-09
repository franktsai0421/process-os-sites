/* Test-only standalone BOM successor proof. No application source is rewritten.
 * Static complete-source pins and exact inverse spans recover verified main;
 * existing metadata/Begin inverses retain their original historical pins.
 * Current-source attestation is separate so rollback/helper-only edits fail.
 */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const raw=bytes=>assert(Buffer.isBuffer(bytes),'BOM successor proof requires raw source bytes');
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
const manifest=freeze(require('./bom-successor-source-contracts.json'));
const unsent=require('./bom-unsent-source-contract.cjs');
const {contracts,currentDependencies}=manifest;
const successorPaths=Object.freeze(contracts.map(c=>c.file));
const attestedPaths=Object.freeze([...successorPaths,...currentDependencies.map(c=>c.file)]);
// Kept public only for corruption probes. Normal dispatch always uses the
// frozen static ledger, never a caller-provided replacement contract.
function invertContract(bytes,contract){
 raw(bytes);
 assert.equal(hash(bytes),contract.afterHash,'BOM successor differs from pinned bytes');
 assert.equal(bytes.length,contract.afterBytes,'BOM successor byte length differs');
 assert(Array.isArray(contract.rules)&&contract.rules.length>0,'BOM inverse requires exact spans');
 let previousAfterEnd=0,previousBeforeEnd=0,delta=0;
 const rules=contract.rules.map(rule=>{
  assert.equal(typeof rule.after,'string','BOM after span must be a UTF-8 string');
  assert.equal(typeof rule.before,'string','BOM before span must be a UTF-8 string');
  const after=Buffer.from(rule.after),before=Buffer.from(rule.before),{afterOffset,beforeOffset}=rule;
  assert(Number.isSafeInteger(afterOffset)&&afterOffset>=previousAfterEnd&&afterOffset+after.length<=bytes.length,'BOM source span offsets overlap, are unordered or out of bounds');
  assert(Number.isSafeInteger(beforeOffset)&&beforeOffset>=previousBeforeEnd&&beforeOffset+before.length<=contract.beforeBytes&&beforeOffset===afterOffset-delta,'BOM predecessor span offsets are inconsistent');
  assert.deepEqual(bytes.subarray(afterOffset,afterOffset+after.length),after,'Exact BOM source span differs');
  previousAfterEnd=afterOffset+after.length;previousBeforeEnd=beforeOffset+before.length;delta+=after.length-before.length;
  return {afterOffset,after,before};
 });
 assert.equal(bytes.length-delta,contract.beforeBytes,'BOM inverse predecessor byte length differs');
 let result=Buffer.from(bytes);
 for(const {afterOffset,after,before}of rules.reverse())result=Buffer.concat([result.subarray(0,afterOffset),before,result.subarray(afterOffset+after.length)]);
 assert.equal(hash(result),contract.beforeHash,'BOM inverse changed complete predecessor bytes');
 return result;
}
// Strict API refuses unknown paths, predecessor bytes and unknown source edits.
function withoutBomSuccessor(bytes,file){raw(bytes);const contract=contracts.find(c=>c.file===file);assert(contract,'Unknown BOM successor source contract');return invertContract(bytes,contract);}
// Existing historical tests intentionally pass mutated/predecessor sources.
// Leave unknown bytes untouched so their original mismatch checks still fire.
function projectBomSuccessor(bytes,file){raw(bytes);return contracts.some(c=>c.file===file&&c.afterHash===hash(bytes))?withoutBomSuccessor(bytes,file):bytes;}
// Only verified checkout CRLF/LF differences may select raw committed bytes.
// This never learns an accepted hash: strict static attestation still follows.
function canonicalSource(working,committed){raw(working);raw(committed);assert.equal(working.toString('utf8').replace(/\r\n/g,'\n'),committed.toString('utf8').replace(/\r\n/g,'\n'),'BOM source worktree differs from HEAD beyond checkout EOL');return committed;}
function attestBomSources(readSource){
 assert.equal(typeof readSource,'function','BOM attestation requires a source reader');
 for(const contract of contracts){const bytes=readSource(contract.file);raw(bytes);assert.equal(hash(bytes),contract.afterHash,'Current BOM successor differs: '+contract.file);assert.equal(bytes.length,contract.afterBytes,'Current BOM successor length differs: '+contract.file);}
 for(const dependency of currentDependencies){let bytes=readSource(dependency.file);raw(bytes);if(dependency.file===unsent.contract.file){unsent.attestCurrent(bytes,dependency.file);bytes=unsent.withoutUnsent(bytes,dependency.file);}assert.equal(hash(bytes),dependency.sha256,'Current BOM authority dependency differs: '+dependency.file);assert.equal(bytes.length,dependency.bytes,'Current BOM authority dependency length differs: '+dependency.file);}
 return true;
}
module.exports={withoutBomSuccessor,projectBomSuccessor,attestBomSources,canonicalSource,invertContract,successorPaths,attestedPaths,contracts,currentDependencies,manifest};
