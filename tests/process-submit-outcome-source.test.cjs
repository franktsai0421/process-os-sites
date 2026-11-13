const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const proof=require('../scripts/process-submit-outcome-source-contract.cjs');
const git=(...args)=>execFileSync('git',args);
for(const [file,c]of Object.entries(proof.contract.files))void test('exact outcome follow-up, cache and drift fence: '+file,()=>{
 const bytes=git('show','HEAD:'+file),before=git('show',proof.contract.base+':'+file),canonical=b=>b.toString().replace(/\r\n/g,'\n');
 assert.equal(canonical(fs.readFileSync(file)),canonical(bytes),'checkout equals commit beyond EOL');
 assert.equal(git('rev-parse',proof.contract.base+'^{tree}').toString().trim(),proof.contract.baseTree);
 git('merge-base','--is-ancestor',proof.contract.base,'HEAD');
 assert.equal(proof.hash(bytes),c.afterHash);assert.equal(proof.hash(before),c.beforeHash);
 assert.equal(git('rev-parse',proof.contract.base+':'+file).toString().trim(),c.beforeBlob);
 assert.deepEqual(proof.restore(bytes,file),before);assert.deepEqual(proof.projectKnown(bytes,file),before);
 for(const drift of [Buffer.concat([bytes,Buffer.from(' ')]),Buffer.from(bytes.toString().replace('process','altered'))]){
  assert.throws(()=>proof.restore(drift,file));assert.deepEqual(proof.projectKnown(drift,file),drift);
 }
 assert.throws(()=>proof.restore(before,file));assert.throws(()=>proof.restore(bytes.toString(),file));assert.throws(()=>proof.restore(bytes,'wrong-path'));
});
