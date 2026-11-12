/* Final-source proof composes with unchanged historical pins. Runtime suites
 * execute current controllers/handlers; this suite verifies only provenance. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const {base,contracts,withoutCIntegration,projectKnown}=require('../scripts/ipqc-c-integration-source-contract.cjs');
for(const [file,contract]of Object.entries(contracts))void test('exact C integration inverse and negative source cases: '+file,()=>{
 const current=execFileSync('git',['show','HEAD:'+file]),prior=execFileSync('git',['show',base+':'+file]);
 assert.equal(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'),current.toString().replaceAll('\r\n','\n'),'working source matches exact committed candidate except checkout EOL');
 assert.deepEqual(withoutCIntegration(current,file),prior);assert.deepEqual(projectKnown(current,file),prior);assert.deepEqual(projectKnown(prior,file),prior);
 for(const rule of contract.rules){
  const at=rule.offset,span=Buffer.from(rule.after),prefix=current.subarray(0,at),suffix=current.subarray(at+span.length);
  const changed=[Buffer.concat([prefix,suffix]),Buffer.concat([prefix,span,span,suffix]),Buffer.concat([prefix,suffix,span]),Buffer.concat([prefix,Buffer.from(' '),suffix])];
  for(const bytes of changed)if(!bytes.equals(current)&&!bytes.equals(prior))assert.throws(()=>withoutCIntegration(bytes,file),/differs from pinned bytes/);
 }
 for(const bytes of [Buffer.concat([current,Buffer.from('\n// unreviewed')]),Buffer.concat([Buffer.from(' '),current])])assert.throws(()=>withoutCIntegration(bytes,file),/differs from pinned bytes/);
 for(const value of [current.toString(),new Uint8Array(current)])assert.throws(()=>withoutCIntegration(value,file),/raw source bytes/);
 assert.throws(()=>withoutCIntegration(current,'unrelated.ts'),/Unknown C integration source/);
 assert.deepEqual(projectKnown(current,'unrelated.ts'),current);
});
