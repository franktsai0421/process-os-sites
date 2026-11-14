const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),proof=require('../scripts/process-ipqc-assignment-source-contract.cjs');
for(const file of Object.keys(proof.contract.files))void test('assignment successor restores genuine main bytes and rejects drift: '+file,()=>{
 const bytes=fs.readFileSync(file),before=execFileSync('git',['show',proof.contract.base+':'+file]);assert.deepEqual(proof.restore(bytes,file),before);assert.equal(execFileSync('git',['rev-parse',proof.contract.base+':'+file]).toString().trim(),proof.contract.files[file].beforeBlob);
 for(const ending of ['\n','\r\n'])assert.deepEqual(proof.restore(Buffer.from(bytes.toString().replaceAll('\r\n','\n').replaceAll('\n',ending)),file),before);
 for(const offset of [0,Math.floor(bytes.length/2),bytes.length-1]){const changed=Buffer.from(bytes);changed[offset]^=1;assert.throws(()=>proof.restore(changed,file));assert.deepEqual(proof.projectKnown(changed,file),changed);}
 assert.throws(()=>proof.restore(bytes,'wrong-path'));assert.throws(()=>proof.restore(bytes.toString(),file));assert.deepEqual(proof.projectKnown(before,file),before);
});
