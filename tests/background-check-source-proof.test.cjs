// Exact source lineage, independent of runtime no-background behavior.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const proof=require('../scripts/background-check-source-contract.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const contract of proof.contracts)void test(contract.file+' restores exact main predecessor, refuses drift and nonraw inputs',()=>{
 const raw=require('../scripts/routine-fqc-source-contract.cjs').canonicalCheckout(fs.readFileSync(contract.file),execFileSync('git',['show','HEAD:'+contract.file])),bytes=require('../scripts/ipqc-c-integration-source-contract.cjs').projectKnown(raw,contract.file),before=execFileSync('git',['show','d4ac309fe05c89288af226b52c18161865ccdcb8:'+contract.file]);
 assert.equal(hash(bytes),contract.afterHash);assert.deepEqual(proof.restorePredecessor(bytes,contract.file),before);
 for(const changed of [Buffer.concat([bytes,Buffer.from(' ')]),bytes.subarray(1),before])assert.throws(()=>proof.restorePredecessor(changed,contract.file),/pinned bytes/);
 for(const changed of [bytes.toString(),new Uint8Array(bytes)])assert.throws(()=>proof.restorePredecessor(changed,contract.file),/raw source bytes/);
 assert.throws(()=>proof.restorePredecessor(bytes,'unknown'),/wrong file/);
 assert.equal(proof.projectKnown(Buffer.concat([bytes,Buffer.from(' ')]),contract.file).length,bytes.length+1);
});
