const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const proof=require('../scripts/routine-fqc-source-contract.cjs'),{contract}=proof;
const before=execFileSync('git',['show',contract.base+':'+contract.file]);
const beforeIndex=execFileSync('git',['show',contract.base+':'+contract.index]);
// First prove checkout EOL equivalence to actual HEAD, then test its untouched
// raw blob bytes. Neither Windows checkout nor unit setup relaxes pinned hashes.
// Before the candidate is committed, this deliberately refuses working-only code.
const after=proof.canonicalCheckout(fs.readFileSync(contract.file),execFileSync('git',['show','HEAD:'+contract.file]));
const followup=require('../scripts/account-process-followup-source-contract.cjs');
const rawIndex=proof.canonicalCheckout(fs.readFileSync(contract.index),execFileSync('git',['show','HEAD:'+contract.index]));
const afterIndex=followup.projectKnown(rawIndex,contract.index);
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
 const result=proof.verifyRepository();assert.equal(result.status,'PASS_ROUTINE_FQC_SOURCE');assert.equal(result.sourceHash,require('../scripts/routine-integration-source-contract.cjs').currentSourcePin(contract.file).current);assert.equal(result.attestedSourceHash,contract.afterHash);assert.equal(result.base,contract.base);
});

void test('exact joint cache successor preserves the reviewed account index and original Routine closure',()=>{assert.deepEqual(followup.restore(rawIndex,contract.index),afterIndex);proof.assertIndexSuccessor(rawIndex,beforeIndex,contract.index);});

void test('routine integration projects only committed public changes for historical proofs',()=>{
 const project=require('../scripts/routine-integration-source-contract.cjs').projectKnown;
 const published='f173bd2474d6070c6411736f91a5707e1e49be4b';
 for(const file of ['public/process/index.html','public/process/fqc-master.js','AI_CONTEXT/CHANGELOG.md']){
  const current=execFileSync('git',['show','HEAD:'+file]);
  const prior=execFileSync('git',['show',published+':'+file]);
  const lf=current.toString('utf8').replaceAll('\r\n','\n');
  for(const raw of [current,Buffer.from(lf),Buffer.from(lf.replaceAll('\n','\r\n'))])
   assert.deepEqual(project(raw,file),prior);
  // Mutating a returned buffer cannot affect the next pinned projection.
  const result=project(current,file);result[0]^=1;
  assert.deepEqual(project(current,file),prior);
  const changed=Buffer.from(current);
  changed[0]^=1;
  for(const raw of [changed,current.subarray(1),Buffer.concat([current,Buffer.from(' ')])])
   assert.strictEqual(project(raw,file),raw,'source drift is never projected');
  for(const unknown of ['./'+file,'constructor','__proto__'])assert.strictEqual(project(current,unknown),current);
  assert.throws(()=>project(lf,file),/raw Buffer/);
 }
});

for (const file of [contract.index, contract.file]) {
 void test('routine startup successor binds raw HEAD and preserves the historical projection for '+file,()=>{
  const gate=require('../scripts/routine-integration-source-contract.cjs');
  const gitBytes=revision=>execFileSync('git',['show',revision+':'+file]);
  const main='0149cf21fd2e46e83f8eab99a8426bc8c9df6b47';
  const historical='f173bd2474d6070c6411736f91a5707e1e49be4b';
  execFileSync('git',['merge-base','--is-ancestor',historical,main]);
  execFileSync('git',['merge-base','--is-ancestor',main,'HEAD']);
  const current=gitBytes('HEAD'),prior=gitBytes(main),old=gitBytes(historical);
  assert(!current.equals(prior));assert(!prior.equals(old));
  assert.deepEqual(gate.projectKnown(prior,file),old);
  gate.assertRoutineHeadBlob(current,file);
  const lf=current.toString('utf8').replaceAll('\r\n','\n');
  const windows=Buffer.from(lf.replaceAll('\n','\r\n'));
  assert(!windows.equals(current),'the substituted raw Git object must be different');
  const mixed=Buffer.from(lf.replace('\n','\r\n'));
  assert(!mixed.equals(current)&&!mixed.equals(windows));
  // Only a checkout may change LF to CRLF; independently authenticate the object first.
  const checked=proof.canonicalCheckout(windows,current);
  assert.deepEqual(checked,current);
  assert.deepEqual(gate.projectKnown(checked,file),old);
  assert.deepEqual(gate.projectKnown(windows,file),old);
  for(const candidate of [windows,mixed])assert.throws(
   ()=>gate.assertRawRoutineEncoding(candidate,file,'substituted raw Git object'),{code:'ERR_ASSERTION'});
  gate.assertRawRoutineEncoding(current,file,'exact raw object');
  const swapped=Buffer.from(current);
  const pos=swapped.findIndex((byte,i)=>i+1<swapped.length&&byte!==swapped[i+1]);
  assert(pos>=0);[swapped[pos],swapped[pos+1]]=[swapped[pos+1],swapped[pos]];
  for(const mutation of [windows,mixed,Buffer.concat([current,Buffer.from(' ')]),current.subarray(0,-1),swapped,prior]){
   assert.throws(()=>gate.assertRoutineHeadBlob(mutation,file),{code:'ERR_ASSERTION'});
  }
  for(const mutation of [mixed,current.subarray(0,-1),swapped]){
   assert.strictEqual(gate.projectKnown(mutation,file),mutation);
  }
  const other=file===contract.index?contract.file:contract.index;
  assert.throws(()=>gate.assertRoutineHeadBlob(current,other),{code:'ERR_ASSERTION'});
  assert.strictEqual(gate.projectKnown(current,'./'+file),current);
 });
}
