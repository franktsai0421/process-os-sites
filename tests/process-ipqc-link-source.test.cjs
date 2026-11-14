const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),proof=require('../scripts/process-ipqc-link-source-contract.cjs');
const git=(...args)=>execFileSync('git',args);
for(const [file,c]of Object.entries(proof.contract.files))void test('exact IPQC-rule successor reconstructs genuine main and rejects drift: '+file,()=>{
 const bytes=fs.readFileSync(file),before=git('show',proof.contract.base+':'+file);assert.deepEqual(proof.restore(bytes,file),before);assert.equal(proof.hash(before),c.beforeHash);assert.equal(git('rev-parse',proof.contract.base+':'+file).toString().trim(),c.beforeBlob);
 for(const ending of ['\n','\r\n']){const candidate=Buffer.from(bytes.toString().replaceAll('\r\n','\n').replaceAll('\n',ending));assert.deepEqual(proof.restore(candidate,file),before);}
 for(const input of [bytes.subarray(1),Buffer.concat([bytes,Buffer.from(' ')]),bytes.toString(),new Uint8Array(bytes)])assert.throws(()=>proof.restore(input,file));
 for(const offset of [0,Math.floor(bytes.length/2),bytes.length-1]){const changed=Buffer.from(bytes);changed[offset]^=1;assert.throws(()=>proof.restore(changed,file));assert.deepEqual(proof.projectKnown(changed,file),changed);}
 assert.throws(()=>proof.restore(bytes,'wrong-path'));assert.deepEqual(proof.projectKnown(before,file),before);
});
