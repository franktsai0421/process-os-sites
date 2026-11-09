// Exact current-to-8560869 source evidence; no restored code is executed.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const proof=require('../scripts/master-page-runtime-source-contract.cjs'),unified=require('../scripts/unified-draft-source-contract.cjs'),witness=require('../scripts/unified-draft-source-witness.cjs').createWitness(require('../scripts/unified-draft-source-witness.json'));
witness.attest(unified.manifest);
for(const contract of proof.contracts)void test(contract.file+' preserves exact predecessor and rejects drift/type/path changes',()=>{
 const current=unified.canonicalSource(fs.readFileSync(contract.file),execFileSync('git',['show','HEAD:'+contract.file])),bytes=unified.project(current,contract.file,'boundary_revision'),copy=Buffer.from(bytes),before=execFileSync('git',['show','85608697401175f987ac586fabd9613d2233e8b1:'+contract.file]);
 assert.deepEqual(proof.restorePredecessor(bytes,contract.file),before);assert.deepEqual(bytes,copy);
 for(const changed of [Buffer.concat([bytes,Buffer.from(' ')]),bytes.subarray(1),before])assert.throws(()=>proof.restorePredecessor(changed,contract.file),/pinned bytes/);
 for(const changed of [bytes.toString(),new Uint8Array(bytes),null])assert.throws(()=>proof.restorePredecessor(changed,contract.file),/raw source bytes/);
 assert.throws(()=>proof.restorePredecessor(bytes,'unknown'),/wrong file/);
 assert.equal(proof.projectKnown(Buffer.concat([bytes,Buffer.from(' ')]),contract.file).length,bytes.length+1);
});
