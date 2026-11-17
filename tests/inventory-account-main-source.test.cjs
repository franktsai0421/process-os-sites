// Joint #121/#124 retains exact published runtime and account main files.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const main='64e44b2f72642bf3186afea89e7d786c9bcbcc91',prior='174fb8adce92c2e4d38aee868666e5be881acea5',git=(...args)=>execFileSync('git',args);
void test('joint candidate preserves every main124 change outside enumerated composition-only files',()=>{
 const composition=new Set(['AI_CONTEXT/CHANGELOG.md','HANDOFF.md','scripts/account-outcome-source-contract.cjs','scripts/process-ipqc-frequency-source-contract.cjs','scripts/process-platform-adopt-source-contract.cjs','scripts/quality-root-source-contract.cjs','tests/accounts-process-integration-source.test.mjs']);
 const files=git('diff','--name-only','a1775a8a342d58335edf96d199a9c42844227dc6',main).toString().trim().split('\n');assert.equal(files.length,43);
 for(const file of files)if(!composition.has(file))assert.deepEqual(fs.readFileSync(file),git('show',main+':'+file),file);
 for(const file of ['lib/state-records.ts','lib/versioned-shared-workflow.ts','lib/inventory-read-ahead.mjs','app/api/tooling/checks/route.ts','app/api/tooling/iqc/route.ts','app/api/routine-equipment/route.ts'])assert.deepEqual(fs.readFileSync(file),git('show',prior+':'+file),file);
 assert.equal(fs.existsSync('lib/iqc-body-read-ahead.mjs'),false,'separate unpublished IQC candidate excluded');
});

void test('joint quality adapter restores genuine account main with EOL and effective drift negatives',()=>{
 const proof=require('../scripts/inventory-account-adapter-source-contract.cjs'),file='scripts/quality-root-source-contract.cjs',bytes=fs.readFileSync(file),before=git('show',main+':'+file);
 for(const eol of ['\n','\r\n'])assert.deepEqual(proof.restore(Buffer.from(bytes.toString().replaceAll('\r\n','\n').replaceAll('\n',eol)),file,'accountMain'),before);
 for(const position of [0,Math.floor(bytes.length/2),bytes.length-1]){const bad=Buffer.from(bytes);bad[position]^=1;assert.throws(()=>proof.restore(bad,file,'accountMain'));assert.deepEqual(proof.projectKnown(bad,file,'accountMain'),bad);}
 for(const bad of [bytes.subarray(1),Buffer.concat([bytes,Buffer.from(' ')])]){assert.throws(()=>proof.restore(bad,file,'accountMain'));assert.deepEqual(proof.projectKnown(bad,file,'accountMain'),bad);}
 assert.throws(()=>proof.restore(bytes,'wrong','accountMain'));assert.throws(()=>proof.restore(bytes,file,'wrong'));assert.throws(()=>proof.restore(bytes.toString(),file,'accountMain'));assert.deepEqual(proof.projectKnown(bytes,file,'wrong'),bytes);
});
