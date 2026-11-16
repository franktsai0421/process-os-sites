const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),p=require('../scripts/process-ipqc-frequency-source-contract.cjs');
for(const file of Object.keys(p.contract.files))void test('frequency exact public main, EOL and effective drift rejection: '+file,()=>{
 const bytes=fs.readFileSync(file),before=execFileSync('git',['show',p.contract.base+':'+file]);assert(p.restore(bytes,file).equals(before));assert(p.restore(Buffer.from(p.normalized(bytes).toString().replaceAll('\n','\r\n')),file).equals(before));
 const lf=p.normalized(bytes); // Mutate semantic LF bytes: dropping only CR from CRLF is not drift.
 for(const bad of [lf.subarray(1),Buffer.concat([lf,Buffer.from(' ')]),Buffer.from(lf.map((v,i)=>i===Math.floor(lf.length/2)?v^1:v))]){assert.notEqual(p.hash(p.normalized(bad)),p.hash(lf),'negative must change normalized content');assert.throws(()=>p.restore(bad,file));assert(p.projectKnown(bad,file).equals(bad));}assert.throws(()=>p.restore(bytes,'wrong/path'));assert(p.projectKnown(bytes,'wrong/path').equals(bytes));
});
