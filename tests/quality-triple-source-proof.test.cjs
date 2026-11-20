// The common tree must retain both real PR parent lineages. No runtime substitute.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const proof=require('../scripts/quality-triple-source-contract.cjs');
for(const c of proof.contracts)void test('joint source retains exact '+c.target+' parent and rejects drift: '+c.file,()=>{
 const committed=execFileSync('git',['show','HEAD:'+c.file]);
 const working=fs.readFileSync(c.file);
 assert.equal(working.toString().replaceAll('\r\n','\n'),committed.toString().replaceAll('\r\n','\n'),'checkout differs from real committed candidate');
 execFileSync('git',['merge-base','--is-ancestor',c.sourceCommit,'HEAD']);
 const original=Buffer.from(committed),parent=execFileSync('git',['show',c.sourceCommit+':'+c.file]);
 assert.equal(execFileSync('git',['rev-parse',c.sourceCommit+':'+c.file]).toString().trim(),c.beforeBlob);
 assert.deepEqual(proof.restoreParent(committed,c.file,c.target),parent);
 assert.deepEqual(proof.projectKnown(committed,c.file,c.target),parent);
 assert.deepEqual(committed,original,'projection must not mutate source');
 for(const bad of [null,committed.toString(),new Uint8Array(committed)])assert.throws(()=>proof.restoreParent(bad,c.file,c.target),/raw Buffer/);
 for(const [file,target]of [[c.file,'other'],['unknown',c.target],['./'+c.file,c.target]])assert.throws(()=>proof.restoreParent(committed,file,target),/wrong file or target/);
 for(const bad of [committed.subarray(1),Buffer.concat([committed,Buffer.from(' ')]),parent]){
  assert.throws(()=>proof.restoreParent(bad,c.file,c.target),/pinned/);
  assert.deepEqual(proof.projectKnown(bad,c.file,c.target),bad,'unrecognized source must not be repaired');
 }
 const offsets=new Set([0,committed.length-1,...c.rules.flatMap(r=>[r.offset,Math.min(committed.length-1,r.offset+Buffer.byteLength(r.after))])]);
 for(const at of offsets){const bad=Buffer.from(committed);bad[at]^=1;assert.throws(()=>proof.restoreParent(bad,c.file,c.target),/pinned/);assert.deepEqual(proof.projectKnown(bad,c.file,c.target),bad);}
 for(const rule of c.rules){
  const span=Buffer.from(rule.after),prefix=committed.subarray(0,rule.offset),suffix=committed.subarray(rule.offset+span.length);
  for(const bad of [Buffer.concat([prefix,suffix]),Buffer.concat([prefix,span,span,suffix]),Buffer.concat([prefix,suffix,span])])if(!bad.equals(committed))assert.throws(()=>proof.restoreParent(bad,c.file,c.target),/pinned/);
 }
});

void test('proof memoization isolates bytes, file, target, verifier and each top-level operation',()=>{
 const {memoizeSourceProof}=require('../scripts/source-proof-context.cjs');
 let revision=1,calls=0,fail=false;
 const first=memoizeSourceProof((source,file,target)=>{
  calls++;
  assert(!fail,'changed authority must be checked in the next proof');
  return Buffer.from([source[0],file.length,target.length,revision]);
 });
 const second=memoizeSourceProof(()=>Buffer.from('another verifier'));
 const untouched=memoizeSourceProof(source=>source);
 const check=memoizeSourceProof(source=>{
  const result=first(source,'file','target');
  assert.equal(first(Buffer.from(source),'file','target')[0],source[0]);
  assert.equal(calls,1);
  result.fill(0);
  assert.equal(first(source,'file','target')[0],source[0],'caller cannot poison cached bytes');
  assert.equal(first(source,'file','other')[2],5);
  assert.equal(first(source,'file2','target')[1],5);
  assert.equal(second(source,'file','target').toString(),'another verifier');
  const alias=source.subarray();alias[0]=9;
  assert.equal(first(source,'file','target')[0],9);
  assert.equal(calls,4);
  const copy=Buffer.from(source);
  assert.strictEqual(untouched(source,'file'),source);
  assert.strictEqual(untouched(copy,'file'),copy,'a pass-through hit retains its own input');
  return first(source,'file','target');
 });
 const source=Buffer.from([3]);assert.equal(check(source)[3],1);
 revision++;assert.equal(first(source,'file','target')[3],2);assert.equal(calls,5);
 fail=true;assert.throws(()=>first(source,'file','target'),/changed authority/);
 fail=false;revision++;assert.equal(first(source,'file','target')[3],3);
});

void test('proof memoization rejects reuse after an error and for shared memory',()=>{
 const {memoizeSourceProof}=require('../scripts/source-proof-context.cjs');
 const source=Buffer.from([3]),shared=Buffer.from(new SharedArrayBuffer(1));
 let attempts=0;
 const verify=memoizeSourceProof(bytes=>{
  attempts++;
  if(attempts===1)throw Error('verification failed');
  return Buffer.from(bytes);
 });
 const parent=memoizeSourceProof(bytes=>{
  assert.throws(()=>verify(bytes,'file'),/verification failed/);
  assert.deepEqual(verify(bytes,'file'),bytes);
  assert.deepEqual(verify(bytes,'file'),bytes);
  assert.equal(attempts,2);
  verify(shared,'file');verify(shared,'file');
  assert.equal(attempts,4);
  return bytes;
 });
 assert.strictEqual(parent(source),source);
});
