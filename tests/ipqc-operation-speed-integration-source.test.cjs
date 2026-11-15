const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),proof=require('../scripts/ipqc-speed-assignment-source-contract.cjs');
const git=(...args)=>execFileSync('git',args),normalized=b=>Buffer.from(b.toString().replaceAll('\r\n','\n'));
for(const file of Object.keys(proof.contract.files))for(const [target,commit]of Object.entries(proof.contract.parents))void test('reviewed assignment/speed composition restores exact '+target+': '+file,()=>{
 const bytes=fs.readFileSync(file),prior=git('show',commit+':'+file);assert.deepEqual(proof.restore(bytes,file,target),prior);assert.deepEqual(proof.projectKnown(bytes,file,target),prior);
 for(const ending of ['\n','\r\n'])assert.deepEqual(proof.restore(Buffer.from(normalized(bytes).toString().replaceAll('\n',ending)),file,target),prior);
 for(const offset of [0,Math.floor(bytes.length/2),bytes.length-1]){const bad=Buffer.from(bytes);bad[offset]^=1;assert.throws(()=>proof.restore(bad,file,target));assert.deepEqual(proof.projectKnown(bad,file,target),bad);}
 for(const bad of [Buffer.concat([bytes,Buffer.from(' ')]),bytes.subarray(1)]){assert.throws(()=>proof.restore(bad,file,target));assert.deepEqual(proof.projectKnown(bad,file,target),bad);}
 assert.throws(()=>proof.restore(bytes,'wrong',target));assert.throws(()=>proof.restore(bytes,file,'wrong'));assert.throws(()=>proof.restore(bytes.toString(),file,target));assert.deepEqual(proof.projectKnown(bytes,'wrong',target),bytes);assert.deepEqual(proof.projectKnown(bytes,file,'wrong'),bytes);assert.equal(proof.hash(prior),proof.contract.files[file].parents[target].hash);
});
const preserved={
 assignment118:['public/process/index.html','public/process/process-ipqc.css','public/process/process-ipqc.js'],
 speed119:['app/api/ipqc-ab/route.ts','app/api/ipqc-c/route.ts','app/api/ipqc-c/workflow/route.ts','lib/process-state.ts','lib/versioned-shared-workflow.ts'],
};
for(const [target,files]of Object.entries(preserved))void test('complete changed runtime from '+target+' remains intact',()=>{
 const commit=proof.contract.parents[target],base='8bfc03679b0e53889c604e110ad843a2fc7b3ae5';
 assert.deepEqual(git('diff','--name-only',base,commit,'--','lib','app','public').toString().trim().split('\n').sort(),[...files].sort(),'independently enumerated parent runtime scope');
 for(const file of files)assert.deepEqual(normalized(require('../scripts/inventory-speed-source-contract.cjs').projectKnown(fs.readFileSync(file),file)),normalized(git('show',commit+':'+file)),file+' retains full parent runtime; exact inventory scheduling inverse then checkout LF/CRLF normalization allowed');
});
