const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),p=require('../scripts/process-platform-adopt-source-contract.cjs');
for(const file of Object.keys(p.contract.files))void test('exact adoption successor, LF/CRLF and independent real main: '+file,()=>{
 const bytes=fs.readFileSync(file),before=execFileSync('git',['show',p.contract.base+':'+file]);assert(p.restore(bytes,file).equals(before));assert(p.restore(Buffer.from(p.normalized(bytes).toString().replaceAll('\n','\r\n')),file).equals(before));assert.equal(p.hash(p.projectKnown(before,file)),p.hash(before));
 const lf=p.normalized(bytes); // Mutate semantic LF bytes: dropping only CR from CRLF is not drift.
 for(const altered of [lf.subarray(1),Buffer.concat([lf,Buffer.from(' ')]),Buffer.from(lf.map((v,i)=>i===Math.floor(lf.length/2)?v^1:v))]){assert.notEqual(p.hash(p.normalized(altered)),p.hash(lf),'negative must change normalized content');assert.throws(()=>p.restore(altered,file));assert(p.projectKnown(altered,file).equals(altered));}assert.throws(()=>p.restore(bytes,'wrong/path'));
});
