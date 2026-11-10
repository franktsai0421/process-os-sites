// Compose exact account cache source with unchanged historical background proof.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const proof=require('../scripts/account-cache-source-contract.cjs'),{contract}=proof;
const predecessor=execFileSync('git',['show',contract.base+':'+contract.index]);
for(const variant of contract.variants)void test(variant.name+' reconstructs genuine main and never mutates either source',()=>{
 const bytes=execFileSync('git',['cat-file','blob',variant.afterBlob]),copy=Buffer.from(bytes),before=Buffer.from(predecessor);
 assert.equal(proof.hash(bytes),variant.afterHash);assert.deepEqual(proof.projectIndex(bytes),predecessor);
 assert.deepEqual(proof.projectKnown(bytes,contract.index),predecessor);assert.deepEqual(bytes,copy);assert.deepEqual(predecessor,before);
 for(const changed of [predecessor,Buffer.concat([bytes,Buffer.from(' ')]),bytes.subarray(1),...variant.rules.map(r=>{const altered=Buffer.from(bytes);altered[r.offset]^=1;return altered;})]){
  assert.throws(()=>proof.projectIndex(changed),/pinned successor/);assert.deepEqual(proof.projectKnown(changed,contract.index),changed);
 }
 for(const file of ['other',contract.index.toUpperCase(),'./'+contract.index])assert.deepEqual(proof.projectKnown(bytes,file),bytes);
 for(const value of [bytes.toString(),new Uint8Array(bytes),null])assert.throws(()=>proof.projectIndex(value),/raw Buffer/);
});
void test('partial, duplicate, unrelated and non-EOL changes cannot pass an exact account cache layer',()=>{
 const bytes=fs.readFileSync(contract.index),variant=contract.variants.find(v=>proof.hash(bytes)===v.afterHash);assert(variant);
 for(const rule of variant.rules){
  const text=bytes.toString();
  for(const altered of [text.replace(rule.after,rule.before),text.replace(rule.after,rule.after+rule.after),text.replace(rule.after,rule.after+'-wrong')])assert.throws(()=>proof.projectIndex(Buffer.from(altered)),/pinned successor/);
 }
 const altered=Buffer.from(bytes);altered[0]^=1;assert.throws(()=>proof.projectIndex(altered),/pinned successor/);
});
void test('committed account cache plus retained original source objects attest against genuine main',()=>{
 assert.equal(proof.verifyRepository().status,'PASS_ACCOUNT_CACHE_EXACT_INVERSE');
});
