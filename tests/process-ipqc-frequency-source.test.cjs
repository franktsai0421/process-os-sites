const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),p=require('../scripts/process-ipqc-frequency-source-contract.cjs');
for(const file of Object.keys(p.contract.files))void test('frequency exact public main, EOL and effective drift rejection: '+file,()=>{
 const bytes=fs.readFileSync(file),before=execFileSync('git',['show',p.contract.base+':'+file]);assert(p.restore(bytes,file).equals(before));assert(p.restore(Buffer.from(p.normalized(bytes).toString().replaceAll('\n','\r\n')),file).equals(before));
 for(const bad of [bytes.subarray(1),Buffer.concat([bytes,Buffer.from(' ')]),Buffer.from(bytes.map((v,i)=>i===Math.floor(bytes.length/2)?v^1:v))]){assert.throws(()=>p.restore(bad,file));assert(p.projectKnown(bad,file).equals(bad));}assert.throws(()=>p.restore(bytes,'wrong/path'));assert(p.projectKnown(bytes,'wrong/path').equals(bytes));
});
