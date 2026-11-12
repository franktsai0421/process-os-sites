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
 const bytes=require('../scripts/account-process-followup-source-contract.cjs').projectKnown(fs.readFileSync(contract.index),contract.index),variant=contract.variants.find(v=>proof.hash(bytes)===v.afterHash);assert(variant);
 for(const rule of variant.rules){
  const span=Buffer.from(rule.after),head=bytes.subarray(0,rule.offset),tail=bytes.subarray(rule.offset+span.length),duplicate=span.length?span:Buffer.from(rule.before);
  for(const altered of [Buffer.concat([head,Buffer.from(rule.before),tail]),Buffer.concat([head,span,duplicate,tail]),Buffer.concat([head,span,Buffer.from('-wrong'),tail])]){assert.notDeepEqual(altered,bytes);assert.throws(()=>proof.projectIndex(altered,variant.afterHash),/pinned successor/);}
 }
 const altered=Buffer.from(bytes);altered[0]^=1;assert.throws(()=>proof.projectIndex(altered),/pinned successor/);
});
void test('committed account cache plus retained original source objects attest against genuine main',()=>{
 assert.equal(proof.verifyRepository().status,'PASS_ACCOUNT_CACHE_EXACT_INVERSE');
});

void test('a genuine prior cache layer remains historical evidence but cannot satisfy the current-layer pin',()=>{
 const bytes=fs.readFileSync(contract.index),current=proof.hash(bytes);
 for(const variant of contract.variants.filter(v=>v.afterHash!==current)){const historical=execFileSync('git',['cat-file','blob',variant.afterBlob]);assert.deepEqual(proof.projectIndex(historical),predecessor);assert.throws(()=>proof.projectIndex(historical,current),/pinned successor/);}
});
