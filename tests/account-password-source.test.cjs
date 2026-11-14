const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),proof=require('../scripts/password-outcome-source-contract.cjs');
for(const [file,c]of Object.entries(proof.contract.files))void test(file+' restores exact main; partial, extra, path and guard drift remain rejected',()=>{
 const bytes=require('../scripts/ipqc-save-recovery-source-contract.cjs').projectMain113(fs.readFileSync(file),file),before=execFileSync('git',['show',proof.contract.base+':'+file]);assert.equal(proof.hash(bytes),c.afterHash);assert.deepEqual(proof.restore(bytes,file),before);assert.deepEqual(proof.projectKnown(bytes,file),before);
 for(const changed of [bytes.subarray(1),Buffer.concat([bytes,Buffer.from(' ')]),...c.rules.map(r=>{const b=Buffer.from(bytes);b[Math.min(r.offset,b.length-1)]^=1;return b;})]){assert.throws(()=>proof.restore(changed,file),/successor/);assert.deepEqual(proof.projectKnown(changed,file),changed);}
 for(const path of ['other','__proto__','./'+file])assert.deepEqual(proof.projectKnown(bytes,path),bytes);
});

void test('new password helper is absent on genuine main and rejects byte/path/type drift',()=>{
 const file=proof.contract.runtime.file,bytes=fs.readFileSync(file);proof.assertRuntime(bytes,file);proof.assertRuntime(Buffer.from(bytes.toString().replaceAll('\n','\r\n')),file);assert.equal(execFileSync('git',['ls-tree',proof.contract.base,'--',file]).length,0);
 for(const candidate of [bytes.subarray(1),Buffer.concat([bytes,Buffer.from(' ')]),Buffer.from(bytes.toString().replace('Invalid password state overlay','Changed password state overlay'))])assert.throws(()=>proof.assertRuntime(candidate,file),/differs/);
 for(const wrong of ['other','__proto__','./'+file])assert.throws(()=>proof.assertRuntime(bytes,wrong),/wrong path/);assert.throws(()=>proof.assertRuntime(bytes.toString(),file),/raw Buffer/);
});
