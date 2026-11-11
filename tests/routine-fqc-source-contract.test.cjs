const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const proof=require('../scripts/routine-fqc-source-contract.cjs'),{contract}=proof;
const before=execFileSync('git',['show',contract.base+':'+contract.file]);
const beforeIndex=execFileSync('git',['show',contract.base+':'+contract.index]);
// First prove checkout EOL equivalence to actual HEAD, then test its untouched
// raw blob bytes. Neither Windows checkout nor unit setup relaxes pinned hashes.
// Before the candidate is committed, this deliberately refuses working-only code.
const after=proof.canonicalCheckout(fs.readFileSync(contract.file),execFileSync('git',['show','HEAD:'+contract.file]));
const afterIndex=proof.canonicalCheckout(fs.readFileSync(contract.index),execFileSync('git',['show','HEAD:'+contract.index]));
void test('Routine preimage and successor are exact raw bytes; verification never rewrites either',()=>{
 const prior=Buffer.from(before),current=Buffer.from(after);
 proof.assertPredecessor(before,contract.file);proof.assertSource(after,contract.file);
 assert.deepEqual(before,prior);assert.deepEqual(after,current);assert.notEqual(proof.hash(before),proof.hash(after));
 assert(Object.isFrozen(contract)&&Object.isFrozen(proof));
});
void test('Routine source rejects wrong path/type, rollback, truncation, appended data and byte drift',()=>{
 for(const file of [contract.index,'./'+contract.file,contract.file.toUpperCase(),undefined])assert.throws(()=>proof.assertSource(after,file),/wrong file/);
 for(const bytes of [after.toString(),new Uint8Array(after),null])assert.throws(()=>proof.assertSource(bytes,contract.file),/raw Buffer/);
 for(const bytes of [before,after.subarray(0,-1),Buffer.concat([after,Buffer.from(' ')])])assert.throws(()=>proof.assertSource(bytes,contract.file),/pinned/);
 for(const offset of [0,1,125,4096,Math.floor(after.length/2),after.length-2,after.length-1]){
  const bytes=Buffer.from(after);bytes[offset]^=1;assert.throws(()=>proof.assertSource(bytes,contract.file),/pinned/);
 }
});
void test('Routine source rejects drift in authority, UNKNOWN and generation intent guards',()=>{
 for(const [from,to]of [
  ['receiptCurrent(pin)','true'],['data.permissions.edit === true','true'],
  ['!unknownAtStart','true'],['!receiptInvalid','true'],
  ["await post({ action: 'generate' }, current)","await post({ action: 'generate' })"],
  ["throw Error('DELIVERY_SUPERSEDED')",'return'],
 ]){
  const current=after.toString();assert(current.includes(from),from);
  const mutated=Buffer.from(current.replace(from,to));assert.throws(()=>proof.assertSource(mutated,contract.file),/pinned/);
 }
});
void test('Routine cache gate accepts only its one changed tag; rejects rollback, wrong path and unrelated changes',()=>{
 const untouched=Buffer.from(beforeIndex);proof.assertIndexSuccessor(afterIndex,beforeIndex,contract.index);assert.deepEqual(beforeIndex,untouched);
 for(const current of [beforeIndex,Buffer.concat([afterIndex,Buffer.from(' ')]),Buffer.from(afterIndex.toString().replace('routine-fqc.js?v=20261110-account-pages1','routine-fqc.js?v=wrong'))])assert.throws(()=>proof.assertIndexSuccessor(current,beforeIndex,contract.index),/own exact tag/);
 const other=Buffer.from(afterIndex);other[0]^=1;assert.throws(()=>proof.assertIndexSuccessor(other,beforeIndex,contract.index),/own exact tag/);
 const badBase=Buffer.from(beforeIndex);badBase[0]^=1;assert.throws(()=>proof.assertIndexSuccessor(afterIndex,badBase,contract.index),/predecessor/);
 assert.throws(()=>proof.assertIndexSuccessor(afterIndex,beforeIndex,contract.file),/wrong file/);
 for(const bytes of [afterIndex.toString(),new Uint8Array(afterIndex),null])assert.throws(()=>proof.assertIndexSuccessor(bytes,beforeIndex,contract.index),/raw Buffer/);
});
void test('reviewed account cache composition refuses partial, duplicate and unrelated changes',()=>{
 const tags=['data-safety-ui.js?v=20261110-account-priority-candidate','user-access.css?v=20261110-account-progress2','user-access.js?v=20261110-account-pages1'];
 for(const tag of tags){
  assert(afterIndex.includes(Buffer.from(tag)),tag);
  for(const changed of [afterIndex.toString().replace(tag,tag+'-wrong'),afterIndex.toString().replace(tag,tag+' '+tag),afterIndex.toString().replace(tag,tag.replace(/\?v=.*/,'?v=old'))]){
   assert.notEqual(changed,afterIndex.toString(),'negative fixture must actually mutate its tag');
   assert.throws(()=>proof.assertIndexSuccessor(Buffer.from(changed),beforeIndex,contract.index),/own exact tag/);
  }
 }
 const changed=Buffer.from(afterIndex);changed[0]^=1;
 assert.throws(()=>proof.assertIndexSuccessor(changed,beforeIndex,contract.index),/own exact tag/);
});
void test('Windows checkout EOL is separate from exact committed raw source; non-EOL differences still reject',()=>{
 const lf=Buffer.from(after.toString().replace(/\r\n/g,'\n')),crlf=Buffer.from(lf.toString().replace(/\n/g,'\r\n'));
 for(const checkout of [lf,crlf])assert.deepEqual(proof.canonicalCheckout(checkout,after),after);
 const output=proof.canonicalCheckout(lf,after);output[0]^=1;assert.notDeepEqual(output,after,'returned committed bytes are isolated');
 for(const bytes of [Buffer.concat([lf,Buffer.from(' ')]),Buffer.from(lf.toString().replace('receiptCurrent(pin)','true')),Buffer.from(lf.toString().replace(/\n/,'\r'))])assert.throws(()=>proof.canonicalCheckout(bytes,after),/beyond checkout EOL/);
 if(!crlf.equals(after))assert.throws(()=>proof.assertSource(crlf,contract.file),/pinned/);
 assert.throws(()=>proof.canonicalCheckout(lf.toString(),after),/raw Buffer/);
});
void test('actual committed Routine successor and checkout attest against genuine merged-main ancestry',()=>{
 const result=proof.verifyRepository();assert.equal(result.status,'PASS_ROUTINE_FQC_SOURCE');assert.equal(result.sourceHash,require('../scripts/account-page-source-contract.cjs').contract.files[contract.file].afterHash);assert.equal(result.attestedSourceHash,contract.afterHash);assert.equal(result.base,contract.base);
});
