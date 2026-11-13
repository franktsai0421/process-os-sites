const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const proof=require('../scripts/ipqc-save-recovery-source-contract.cjs');
for(const file of Object.keys(proof.contract.files))void test('IPQC recovery exact inverse, LF/CRLF and drift rejection '+file,()=>{
 const current=fs.readFileSync(file),prior=execFileSync('git',['show',proof.contract.base+':'+file]);
 assert.deepEqual(proof.restore(current,file),prior);assert.deepEqual(proof.projectKnown(current,file),prior);
 assert.deepEqual(proof.restore(Buffer.from(current.toString().replace(/\r?\n/g,'\r\n')),file),prior);
 for(const bad of [Buffer.concat([current,Buffer.from(' ')]),current.subarray(1),prior])assert.throws(()=>proof.restore(bad,file));
 assert.deepEqual(proof.projectKnown(prior,file),prior);assert.deepEqual(proof.projectKnown(current,'unrelated'),current);
 assert.throws(()=>proof.restore(current.toString(),file),/raw Buffer/);
});
