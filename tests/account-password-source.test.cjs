const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),proof=require('../scripts/password-outcome-source-contract.cjs');
for(const [file,c]of Object.entries(proof.contract.files))void test(file+' restores exact main; partial, extra, path and guard drift remain rejected',()=>{
 const bytes=fs.readFileSync(file),before=execFileSync('git',['show',proof.contract.base+':'+file]);assert.equal(proof.hash(bytes),c.afterHash);assert.deepEqual(proof.restore(bytes,file),before);assert.deepEqual(proof.projectKnown(bytes,file),before);
 for(const changed of [bytes.subarray(1),Buffer.concat([bytes,Buffer.from(' ')]),...c.rules.map(r=>{const b=Buffer.from(bytes);b[Math.min(r.offset,b.length-1)]^=1;return b;})]){assert.throws(()=>proof.restore(changed,file),/successor/);assert.deepEqual(proof.projectKnown(changed,file),changed);}
 for(const path of ['other','__proto__','./'+file])assert.deepEqual(proof.projectKnown(bytes,path),bytes);
});
