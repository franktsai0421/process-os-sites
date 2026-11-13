const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const proof=require('../scripts/quality-integration-source-contract.cjs');
for(const c of proof.contracts){
 void test('quality exact successor retains genuine main preimage: '+c.file,()=>{
  const bytes=fs.readFileSync(c.file),committed=execFileSync('git',['show','HEAD:'+c.file]);
  assert.equal(bytes.toString().replace(/\r\n/g,'\n'),committed.toString().replace(/\r\n/g,'\n'));
  const prior=execFileSync('git',['show',c.base+':'+c.file]),unchanged=Buffer.from(committed);
  assert.equal(execFileSync('git',['rev-parse',c.base+':'+c.file]).toString().trim(),c.beforeBlob);
  assert.deepEqual(proof.restorePredecessor(committed,c.file),prior);assert.deepEqual(committed,unchanged);
  assert.throws(()=>proof.restorePredecessor(prior,c.file),/pinned/);
  for(const path of ['./'+c.file,c.file.toUpperCase(),undefined])assert.throws(()=>proof.restorePredecessor(committed,path),/wrong file/);
  for(const bad of [null,committed.toString(),new Uint8Array(committed)])assert.throws(()=>proof.restorePredecessor(bad,c.file),/raw Buffer/);
  for(const bad of [committed.subarray(0,-1),Buffer.concat([committed,Buffer.from(' ')]),Buffer.concat([committed,committed])])assert.throws(()=>proof.restorePredecessor(bad,c.file),/pinned/);
  for(const offset of new Set([0,committed.length-1,...c.rules.flatMap(r=>[r.offset,Math.min(committed.length-1,r.offset+Buffer.byteLength(r.after))])])){
   const changed=Buffer.from(committed);changed[offset]^=1;assert.throws(()=>proof.restorePredecessor(changed,c.file),/pinned/);
  }
 });
}
