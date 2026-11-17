const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),p=require('../scripts/inventory-quality-source-contract.cjs');
for(const file of Object.keys(p.contract.files))for(const [target,commit]of Object.entries(p.contract.parents))void test('inventory quality retains exact '+target+' source, EOL and drift rejection: '+file,()=>{
 const bytes=fs.readFileSync(file),prior=execFileSync('git',['show',commit+':'+file]);assert.deepEqual(p.restore(bytes,file,target),prior);assert.deepEqual(p.projectKnown(bytes,file,target),prior);
 for(const eol of ['\n','\r\n'])assert.deepEqual(p.restore(Buffer.from(bytes.toString().replaceAll('\r\n','\n').replaceAll('\n',eol)),file,target),prior);
 for(const offset of [0,Math.floor(bytes.length/2),bytes.length-1]){const bad=Buffer.from(bytes);bad[offset]^=1;assert.throws(()=>p.restore(bad,file,target));assert.deepEqual(p.projectKnown(bad,file,target),bad);}
 for(const bad of [bytes.subarray(1),Buffer.concat([bytes,Buffer.from(' ')])]){assert.throws(()=>p.restore(bad,file,target));assert.deepEqual(p.projectKnown(bad,file,target),bad);}
 assert.throws(()=>p.restore(bytes,'wrong',target));assert.throws(()=>p.restore(bytes,file,'wrong'));assert.throws(()=>p.restore(bytes.toString(),file,target));assert.deepEqual(p.projectKnown(bytes,file,'wrong'),bytes);
});
void test('quality and speed runtime scopes retain both complete genuine parents',()=>{
 const git=(...args)=>execFileSync('git',args),base='346c5eefcca7621c481802502cbae61f2821e91d';
 const files=git('diff','--name-only',base,p.contract.parents.qualityMain,'--','app','lib','public').toString().trim().split('\n');
 for(const file of files)assert.deepEqual(p.projectKnown(fs.readFileSync(file),file,'qualityMain'),git('show',p.contract.parents.qualityMain+':'+file));
 for(const file of ['app/api/routine-equipment/route.ts','app/api/tooling/iqc/route.ts','app/api/tooling/checks/route.ts','lib/inventory-read-ahead.mjs','lib/versioned-shared-workflow.ts'])assert.deepEqual(p.projectKnown(fs.readFileSync(file),file,'speedRound2'),git('show',p.contract.parents.speedRound2+':'+file));
});
