const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const proof=require('../scripts/equipment-integration-source-contract.cjs');
for(const c of proof.contracts)void test('exact main predecessor and drift rejection: '+c.file,()=>{
 const bytes=fs.readFileSync(c.file),prior=Buffer.from(execFileSync('git',['show','2434507ca8ef460b0c727d6d0c2b23345b86310b:'+c.file]));
 assert.deepEqual(proof.restore(bytes,c.file),prior);assert.deepEqual(proof.restore(Buffer.from(bytes.toString().replaceAll('\r\n','\n').replaceAll('\n','\r\n')),c.file),prior);
 assert.throws(()=>proof.restore(bytes,'unknown'),/wrong file/);assert.throws(()=>proof.restore(bytes.toString(),c.file),/raw Buffer/);assert.throws(()=>proof.restore(prior,c.file),/pinned/);
 for(const offset of [0,bytes.length-1,...c.rules.map(r=>Math.min(r.offset,bytes.length-1))]){const changed=Buffer.from(bytes);changed[offset]^=1;assert.throws(()=>proof.restore(changed,c.file),/pinned/);assert.deepEqual(proof.projectKnown(changed,c.file),changed);}
 assert.deepEqual(proof.projectKnown(prior,c.file),prior);
});
