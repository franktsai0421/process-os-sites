// Strict composed source evidence. Original raw preimages remain independent;
// no restored source executes here or substitutes for runtime verification.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),proof=require('../scripts/account-page-source-contract.cjs');
for(const [file,c]of Object.entries(proof.contract.files))void test(file+' exact composed source rejects rollback, path drift and authority/receipt mutation',()=>{
 const bytes=fs.readFileSync(file),copy=Buffer.from(bytes);proof.assertCurrent(bytes,file);assert.deepEqual(bytes,copy);
 if(!c.newFile){const before=execFileSync('git',['show',proof.contract.baseTree+':'+file]);assert.deepEqual(proof.projectFile(bytes,file),before);assert.deepEqual(proof.projectKnown(bytes,file),before);assert.throws(()=>proof.assertCurrent(before,file),/successor/);assert.deepEqual(proof.projectKnown(before,file),before);}else assert.throws(()=>proof.projectFile(bytes,file),/no predecessor/);
 const altered=[Buffer.concat([bytes,Buffer.from(' ')]),bytes.subarray(1),...c.rules?.map(rule=>{const value=Buffer.from(bytes);value[Math.min(rule.offset,value.length-1)]^=1;return value;})||[]];
 for(const guard of ['isPrimary','allowed','permissions','actor','UNKNOWN','generation'])if(bytes.includes(Buffer.from(guard)))altered.push(Buffer.from(bytes.toString().replace(guard,guard+'Changed')));
 for(const candidate of altered){assert.notDeepEqual(candidate,bytes);assert.throws(()=>proof.assertCurrent(candidate,file),/successor/);assert.deepEqual(proof.projectKnown(candidate,file),candidate);}
 for(const bad of ['other','__proto__','./'+file,file.toUpperCase()]){assert.throws(()=>proof.assertCurrent(bytes,bad),/Unknown/);assert.deepEqual(proof.projectKnown(bytes,bad),bytes);}
 for(const bad of [bytes.toString(),new Uint8Array(bytes),null])assert.throws(()=>proof.assertCurrent(bad,file),/raw Buffer/);
});
void test('committed page tree and public predecessor blobs agree with checkout; no candidate rollback can replace current source',()=>{assert.equal(proof.verifyRepository().status,'PASS_ACCOUNT_PAGE_EXACT_SOURCE');});
