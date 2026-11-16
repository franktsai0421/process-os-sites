const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const proof=require('../scripts/quality-operation-source-contract.cjs');
for(const file of Object.keys(proof.contract.files))void test('quality speed exact public parent and effective negatives: '+file,()=>{
 const bytes=fs.readFileSync(file),parent=execFileSync('git',['show',proof.contract.base+':'+file]);
 for(const source of [bytes,Buffer.from(bytes.toString().replaceAll('\r\n','\n')),Buffer.from(bytes.toString().replaceAll('\r\n','\n').replaceAll('\n','\r\n'))])assert(proof.restore(source,file).equals(parent));
 const changed=Buffer.from(bytes);changed[0]^=1;assert(!changed.equals(bytes));assert.throws(()=>proof.restore(changed,file),/source drift/);assert(proof.projectKnown(changed,file).equals(changed));
 assert.throws(()=>proof.restore(Buffer.concat([bytes,Buffer.from('\n')]),file),/source drift/);assert.throws(()=>proof.restore(bytes,file+'.wrong'),/wrong path/);
 for(const rule of proof.contract.files[file].rules){const normalized=Buffer.from(bytes.toString().replaceAll('\r\n','\n')),span=Buffer.from(rule.after),mutated=Buffer.concat([normalized.subarray(0,rule.offset),Buffer.from('/* changed guard */'),normalized.subarray(rule.offset+span.length)]);assert(!mutated.equals(normalized));assert.throws(()=>proof.restore(mutated,file),/source drift/);}
});
