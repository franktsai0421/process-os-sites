const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const proof=require('../scripts/ipqc-ab-integration-source-contract.cjs');
for(const c of proof.contracts)test('A/B exact integration source and negative controls: '+c.file,()=>{
 const raw=fs.readFileSync(c.file),committed=execFileSync('git',['show','HEAD:'+c.file]);
 const lf=b=>b.toString().replace(/\r\n/g,'\n');assert.equal(lf(raw),lf(committed));
 const base=execFileSync('git',['show','9fbba823090f03da8385c8d92f5e59293d19d2f1:'+c.file]);assert.deepEqual(proof.restorePredecessor(committed,c.file),base);
 for(const bad of [Buffer.concat([committed,Buffer.from(' ')]),committed.subarray(1),base])assert.throws(()=>proof.restorePredecessor(bad,c.file));
 assert.throws(()=>proof.restorePredecessor(committed.toString(),c.file),/raw source bytes/);assert.throws(()=>proof.restorePredecessor(committed,'unknown'),/wrong file/);
});
