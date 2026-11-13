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
