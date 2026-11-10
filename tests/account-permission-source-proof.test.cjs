const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),proof=require('../scripts/account-permission-source-contract.cjs');
for(const [file,current]of Object.entries(proof.contract.files))for(const c of [current,...(current.historical||[])])void test(file+' '+c.afterHash.slice(0,8)+' exact inverse retains genuine main; rejects outside guards, spans and path drift',()=>{
 const original=execFileSync('git',['show',proof.contract.base+':'+file]),bytes=execFileSync('git',['cat-file','blob',c.afterBlob]),copy=Buffer.from(bytes);
 assert.deepEqual(proof.projectFile(bytes,file),original);assert.deepEqual(proof.projectKnown(bytes,file),original);assert.deepEqual(bytes,copy);assert.deepEqual(proof.projectKnown(original,file),original);
 for(const bad of [Buffer.concat([bytes,Buffer.from(' ')]),bytes.subarray(1),...c.rules.map(r=>{const b=Buffer.from(bytes);b[r.offset]^=1;return b;}),Buffer.from(bytes.toString().replace('isPrimary','isPrimarY'))]){assert.throws(()=>proof.projectFile(bad,file),/successor differs/);assert.deepEqual(proof.projectKnown(bad,file),bad);}
 for(const badFile of ['other','__proto__','./'+file,file.toUpperCase()]){assert.throws(()=>proof.projectFile(bytes,badFile),/Unknown account permission path/);assert.deepEqual(proof.projectKnown(bytes,badFile),bytes);}
 for(const bad of [bytes.toString(),new Uint8Array(bytes),null])assert.throws(()=>proof.projectFile(bad,file),/raw Buffer/);
});
void test('account permission committed source, historical objects and checkout preserve exact lineage',()=>{assert.equal(proof.verifyRepository().status,'PASS_ACCOUNT_PERMISSION_EXACT_SOURCE');});
