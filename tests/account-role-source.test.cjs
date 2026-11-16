const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),proof=require('../scripts/account-outcome-source-contract.cjs');
for(const [file,c]of Object.entries(proof.contract.files))void test('account outcome exact true-main predecessor '+file+' and effective negatives',()=>{
 const bytes=fs.readFileSync(file),prior=execFileSync('git',['show',proof.contract.base+':'+file]);assert.equal(proof.hash(prior),c.beforeHash);assert.deepEqual(proof.restore(bytes,file),prior);assert.deepEqual(proof.restore(Buffer.from(bytes.toString().replaceAll('\r\n','\n').replaceAll('\n','\r\n')),file),prior);
 for(const candidate of [bytes.subarray(1),Buffer.concat([bytes,Buffer.from(' ')]),Buffer.from(bytes.toString().replace(/./,'!'))]){assert.throws(()=>proof.restore(candidate,file),/successor/);assert.deepEqual(proof.projectKnown(candidate,file),candidate);}
 assert.deepEqual(proof.projectKnown(bytes,'__proto__'),bytes);
});
for(const [file,sha256]of Object.entries(proof.contract.runtime))void test('account outcome new runtime pin '+file,()=>{const bytes=fs.readFileSync(file);assert.equal(proof.hash(bytes),sha256);assert.equal(execFileSync('git',['ls-tree',proof.contract.base,'--',file]).length,0);assert.notEqual(proof.hash(Buffer.concat([bytes,Buffer.from(' ')])),sha256);});
