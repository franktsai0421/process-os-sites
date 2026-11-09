// Exact source lineage, independent of runtime no-background behavior.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const proof=require('../scripts/background-check-source-contract.cjs'),unified=require('../scripts/unified-draft-source-contract.cjs');
unified.attest(file=>unified.canonicalSource(fs.readFileSync(file),execFileSync('git',['show','HEAD:'+file])));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const contract of proof.contracts)void test(contract.file+' restores exact main predecessor, refuses drift and nonraw inputs',()=>{
 const actual=unified.canonicalSource(fs.readFileSync(contract.file),execFileSync('git',['show','HEAD:'+contract.file])),bytes=unified.project(actual,contract.file,'background100'),before=execFileSync('git',['show','d4ac309fe05c89288af226b52c18161865ccdcb8:'+contract.file]);
 const witness=require('../scripts/unified-draft-source-witness.cjs').createWitness(require('../scripts/unified-draft-source-witness.json'));witness.attest(unified.manifest);assert.equal(createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),witness.resolve(unified.manifest.targets.background100.commit,contract.file));assert.equal(hash(bytes),contract.afterHash);assert.deepEqual(proof.restorePredecessor(bytes,contract.file),before);
 for(const changed of [Buffer.concat([bytes,Buffer.from(' ')]),bytes.subarray(1),before])assert.throws(()=>proof.restorePredecessor(changed,contract.file),/pinned bytes/);
 for(const changed of [bytes.toString(),new Uint8Array(bytes)])assert.throws(()=>proof.restorePredecessor(changed,contract.file),/raw source bytes/);
 assert.throws(()=>proof.restorePredecessor(bytes,'unknown'),/wrong file/);
 assert.equal(proof.projectKnown(Buffer.concat([bytes,Buffer.from(' ')]),contract.file).length,bytes.length+1);
 const drift=Buffer.concat([current,Buffer.from(' ')]),unprojected=unified.project(drift,contract.file,'main_background');assert.deepEqual(unprojected,drift);assert.throws(()=>proof.restorePredecessor(unprojected,contract.file),/pinned bytes/);
});

void test('background helper and all original contract pins stay exact main #100 committed bytes',()=>{
 assert.equal(unified.manifest.targets.main_background.commit,'9fbba823090f03da8385c8d92f5e59293d19d2f1');
 for(const file of ['scripts/background-check-source-contract.cjs','scripts/background-check-source-contracts.json']){const current=unified.canonicalSource(fs.readFileSync(file),execFileSync('git',['show','HEAD:'+file]));assert.deepEqual(current,execFileSync('git',['show','9fbba823090f03da8385c8d92f5e59293d19d2f1:'+file]));}
});
