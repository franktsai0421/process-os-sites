const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),proof=require('../scripts/quality-inventory-integration-source.cjs');
for(const [target,p]of Object.entries(proof.contract.targets))for(const [file,c]of Object.entries(p.files))void test('exact integration parent '+target+': '+file,()=>{
 const raw=fs.readFileSync(file),parent=execFileSync('git',['show',p.commit+':'+file]);
 for(const bytes of [raw,Buffer.from(raw.toString().replaceAll('\r\n','\n')),Buffer.from(raw.toString().replaceAll('\r\n','\n').replaceAll('\n','\r\n'))])assert.deepEqual(proof.restore(bytes,file,target),parent);
 for(const r of c.rules){const n=Buffer.from(raw.toString().replaceAll('\r\n','\n')),span=Buffer.from(r.after);for(const replacement of [Buffer.from('/* drift */'),Buffer.alloc(0),Buffer.concat([span,span])]){const bad=Buffer.concat([n.subarray(0,r.offset),replacement,n.subarray(r.offset+span.length)]);if(bad.equals(n))continue;assert.throws(()=>proof.restore(bad,file,target),/source drift/);assert.deepEqual(proof.projectKnown(bad,file,target),bad);}}
 const bad=Buffer.concat([raw,Buffer.from('\n')]);assert.throws(()=>proof.restore(bad,file,target),/source drift/);assert.deepEqual(proof.projectKnown(bad,file,target),bad);
});
