const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),proof=require('../scripts/process-review-source-contract.cjs');
const git=(...args)=>execFileSync('git',args);
for(const [file,c]of Object.entries(proof.contract.files))void test('review exact actual main inverse and effective drift rejection: '+file,()=>{
 const bytes=fs.readFileSync(file),before=git('show',proof.contract.base+':'+file);git('merge-base','--is-ancestor',proof.contract.base,'HEAD');assert.equal(git('rev-parse',proof.contract.base+'^{tree}').toString().trim(),proof.contract.baseTree);assert.equal(proof.hash(before),c.beforeHash);assert.deepEqual(proof.restore(bytes,file),before);
 for(const altered of [Buffer.concat([bytes,Buffer.from(' ')]),Buffer.from(bytes.toString().replace('process','tampered'))]){assert.throws(()=>proof.restore(altered,file));assert.deepEqual(proof.projectKnown(altered,file),altered);}
 assert.throws(()=>proof.restore(bytes,'wrong'));assert.throws(()=>proof.restore(bytes.toString(),file));assert.throws(()=>proof.restore(before,file));
 assert.deepEqual(proof.restore(Buffer.from(bytes.toString().replace(/\r?\n/g,'\r\n')),file),before);
});
