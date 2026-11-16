const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),p=require('../scripts/inventory-round2-source-contract.cjs');
for(const file of Object.keys(p.contract.files))for(const [target,commit]of Object.entries(p.contract.parents))void test('inventory round two retains exact '+target+' source, EOL and drift rejection: '+file,()=>{
 const bytes=fs.readFileSync(file),prior=execFileSync('git',['show',commit+':'+file]);assert.deepEqual(p.restore(bytes,file,target),prior);assert.deepEqual(p.projectKnown(bytes,file,target),prior);
 for(const eol of ['\n','\r\n'])assert.deepEqual(p.restore(Buffer.from(bytes.toString().replaceAll('\r\n','\n').replaceAll('\n',eol)),file,target),prior);
 for(const offset of [0,Math.floor(bytes.length/2),bytes.length-1]){const bad=Buffer.from(bytes);bad[offset]^=1;assert.throws(()=>p.restore(bad,file,target));assert.deepEqual(p.projectKnown(bad,file,target),bad);}
 for(const bad of [bytes.subarray(1),Buffer.concat([bytes,Buffer.from(' ')])]){assert.throws(()=>p.restore(bad,file,target));assert.deepEqual(p.projectKnown(bad,file,target),bad);}
 assert.throws(()=>p.restore(bytes,'wrong',target));assert.throws(()=>p.restore(bytes,file,'wrong'));assert.throws(()=>p.restore(bytes.toString(),file,target));assert.deepEqual(p.projectKnown(bytes,file,'wrong'),bytes);
});
void test('round two retains AQL main runtime and existing inventory runtime without importing quality repair',()=>{
 const git=(...args)=>execFileSync('git',args);
 for(const file of ['public/process/index.html','public/process/process-ipqc.js'])assert.deepEqual(fs.readFileSync(file),git('show',p.contract.parents.main122+':'+file));
 for(const file of ['app/api/routine-equipment/route.ts','app/api/tooling/iqc/route.ts','lib/inventory-read-ahead.mjs','lib/versioned-shared-workflow.ts'])assert.deepEqual(fs.readFileSync(file),git('show',p.contract.parents.inventory121+':'+file));
 for(const file of ['scripts/inventory-main-source-contract.json','scripts/process-ipqc-frequency-source-contract.json'])assert.deepEqual(fs.readFileSync(file),git('show',p.contract.parents[file.includes('frequency')?'main122':'inventory121']+':'+file));
});
