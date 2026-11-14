const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const proof=require('../scripts/ipqc-speed-source-contract.cjs');
for(const file of Object.keys(proof.contract.files))void test('exact IPQC speed inverse, EOL and effective drift rejection '+file,()=>{
 const current=fs.readFileSync(file),prior=execFileSync('git',['show',proof.contract.base+':'+file]);assert.deepEqual(proof.restore(current,file),prior);assert.deepEqual(proof.projectKnown(current,file),prior);assert.deepEqual(proof.restore(Buffer.from(current.toString().replace(/\r?\n/g,'\r\n')),file),prior);assert.deepEqual(proof.projectKnown(prior,file),prior);assert.deepEqual(proof.projectKnown(current,'unrelated'),current);
 const normalized=Buffer.from(current.toString().replaceAll('\r\n','\n'));
 for(const rule of proof.contract.files[file].rules){const span=Buffer.from(rule.after),left=normalized.subarray(0,rule.offset),right=normalized.subarray(rule.offset+span.length);for(const changed of [Buffer.concat([left,right]),Buffer.concat([left,span,span,right]),Buffer.concat([left,Buffer.from(rule.before),right])])if(!changed.equals(normalized))assert.throws(()=>proof.restore(changed,file),/differs from pinned bytes/);}
 for(const bad of [Buffer.concat([current,Buffer.from(' ')]),current.subarray(1),prior])assert.throws(()=>proof.restore(bad,file));assert.throws(()=>proof.restore(current.toString(),file),/raw Buffer/);
});
