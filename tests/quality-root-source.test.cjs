const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),proof=require('../scripts/quality-root-source-contract.cjs');
for(const [file,c]of Object.entries(proof.contract.files))void test('quality root exact merged #120 predecessor and unknown-byte rejection: '+file,()=>{
 const bytes=fs.readFileSync(file),before=execFileSync('git',['show',proof.contract.base+':'+file]);assert.deepEqual(proof.restore(bytes,file),before);assert.deepEqual(proof.restore(Buffer.from(bytes.toString().replaceAll('\r\n','\n').replaceAll('\n','\r\n')),file),before);
 assert.throws(()=>proof.restore(bytes,'wrong'),/wrong path/);assert.throws(()=>proof.restore(bytes.toString(),file),/raw Buffer/);assert.throws(()=>proof.restore(before,file),/pinned/);
 for(const offset of [0,bytes.length-1,...c.rules.map(r=>Math.min(r.offset,bytes.length-1))]){const mutated=Buffer.from(bytes);mutated[offset]^=1;assert.throws(()=>proof.restore(mutated,file),/pinned/);assert.deepEqual(proof.projectKnown(mutated,file),mutated);}assert.deepEqual(proof.projectKnown(before,file),before);
});
