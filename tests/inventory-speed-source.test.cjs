const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),proof=require('../scripts/inventory-speed-source-contract.cjs');
for(const file of Object.keys(proof.contract.files))void test('inventory scheduler restores complete genuine main bytes; drift/EOL/position negatives remain effective',()=>{
 const bytes=fs.readFileSync(file),prior=execFileSync('git',['show',proof.contract.base+':'+file]);
 for(const ending of ['\n','\r\n'])assert.deepEqual(proof.restore(Buffer.from(bytes.toString().replaceAll('\r\n','\n').replaceAll('\n',ending)),file),prior);
 assert.deepEqual(proof.projectKnown(bytes,file),prior);
 for(const offset of [0,bytes.length-1,...proof.contract.files[file].rules.map(r=>r.offset)]){const bad=Buffer.from(bytes);bad[offset]^=1;assert.throws(()=>proof.restore(bad,file));assert.deepEqual(proof.projectKnown(bad,file),bad);}
 for(const bad of [Buffer.concat([bytes,Buffer.from(' ')]),bytes.subarray(1)]){assert.throws(()=>proof.restore(bad,file));assert.deepEqual(proof.projectKnown(bad,file),bad);}
 assert.throws(()=>proof.restore(bytes,'wrong'));assert.throws(()=>proof.restore(bytes.toString(),file));assert.deepEqual(proof.projectKnown(bytes,'wrong'),bytes);
});
