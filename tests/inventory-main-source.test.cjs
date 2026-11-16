const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),p=require('../scripts/inventory-main-source-contract.cjs');
for(const file of Object.keys(p.contract.files))for(const [target,commit]of Object.entries(p.contract.parents))void test('inventory/main retains exact '+target+' source, EOL and drift rejection: '+file,()=>{
 const bytes=fs.readFileSync(file),prior=execFileSync('git',['show',commit+':'+file]);assert.deepEqual(p.restore(bytes,file,target),prior);assert.deepEqual(p.projectKnown(bytes,file,target),prior);
 for(const eol of ['\n','\r\n'])assert.deepEqual(p.restore(Buffer.from(bytes.toString().replaceAll('\r\n','\n').replaceAll('\n',eol)),file,target),prior);
 for(const offset of [0,Math.floor(bytes.length/2),bytes.length-1]){const bad=Buffer.from(bytes);bad[offset]^=1;assert.throws(()=>p.restore(bad,file,target));assert.deepEqual(p.projectKnown(bad,file,target),bad);}
 for(const bad of [bytes.subarray(1),Buffer.concat([bytes,Buffer.from(' ')])]){assert.throws(()=>p.restore(bad,file,target));assert.deepEqual(p.projectKnown(bad,file,target),bad);}
 assert.throws(()=>p.restore(bytes,'wrong',target));assert.throws(()=>p.restore(bytes,file,'wrong'));assert.throws(()=>p.restore(bytes.toString(),file,target));assert.deepEqual(p.projectKnown(bytes,file,'wrong'),bytes);
});
void test('the joint runtime retains both full independent parent scopes and all original manifests',()=>{
 const git=(...args)=>execFileSync('git',args),scope=['app','lib','public'],base='e040a7e838133c0c9870850a49955cf045dbc02b';
 const speed=['app/api/routine-equipment/route.ts','app/api/tooling/iqc/route.ts','lib/inventory-read-ahead.mjs','lib/versioned-shared-workflow.ts'],adopt=['public/process/index.html','public/process/process-authoring-v3.js','public/process/process-ipqc.js'];
 for(const [target,files]of Object.entries({inventory:speed,main120:adopt})){const parent=p.contract.parents[target];assert.deepEqual(git('diff','--name-only',base,parent,'--',...scope).toString().trim().split('\n').sort(),[...files].sort());for(const file of files)assert.deepEqual(require('../scripts/inventory-round2-source-contract.cjs').projectKnown(fs.readFileSync(file),file,'inventory121'),git('show',parent+':'+file),'complete retained runtime through exact round-two inverse '+file);}
 for(const [target,file]of [['inventory','scripts/inventory-speed-source-contract.json'],['main120','scripts/process-platform-adopt-source-contract.json'],['inventory','scripts/ipqc-speed-assignment-source-contract.json']])assert.deepEqual(fs.readFileSync(file),git('show',p.contract.parents[target]+':'+file),'original manifest stays fixed '+file);
});
