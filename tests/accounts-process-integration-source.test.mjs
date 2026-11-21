import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const followup=createRequire(import.meta.url)('../scripts/account-process-followup-source-contract.cjs');
const published=(bytes,file)=>followup.projectKnown(bytes,file);
const manifest=JSON.parse(fs.readFileSync('docs/acceptance/accounts-process-joint-20261112/sources.json','utf8'));
const git=(...args)=>execFileSync('git',args),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
void test('fixed latest public origins and main are preserved in joint ancestry',()=>{
 assert.equal(manifest.sources.main.commit,'9fbba823090f03da8385c8d92f5e59293d19d2f1');
 assert.equal(manifest.sources.pr103.commit,'fb62c25929fd6b6c117aa66a3fd8f2e4dd72cc37');
 assert.equal(manifest.sources.pr104.commit,'15a5acb404edb1d4f1826b13430f61376e3accb4');
 for(const origin of Object.values(manifest.sources)){
  assert.equal(git('rev-parse',origin.commit+'^{tree}').toString().trim(),origin.tree);
  git('merge-base','--is-ancestor',origin.commit,'HEAD');
 }
});
void test('every shared identical change and the three latest process-only regressions are retained exactly',()=>{
 assert.equal(manifest.overlap.length,127);assert.equal(manifest.overlap.filter(row=>row.same).length,90);
 for(const row of manifest.overlap.filter(row=>row.same))assert.deepEqual(published(git('show','HEAD:'+row.path),row.path),git('show',manifest.sources.pr104.commit+':'+row.path),row.path);
 const unique=manifest.files.pr104.filter(file=>!manifest.files.pr103.includes(file));
 assert.deepEqual(unique,['tests/equipment-transfer-compiled.test.mjs','tests/equipment-transfer-setup-cleanup.test.mjs','tests/shared-draft-tab-attribution.test.mjs']);
 for(const file of unique)assert.deepEqual(published(git('show','HEAD:'+file),file),git('show',manifest.sources.pr104.commit+':'+file),file);
});
void test('reviewed account/process runtime union retains every installed file with the three pinned quality helpers and exact catalog/password/account helpers',()=>{
 const files=git('ls-tree','-r','--name-only',manifest.sources.pr103.commit,'--','app','lib','public').toString().trim().split('\n');
 const additions=['lib/ipqc-ab-local-lineage.ts','lib/ipqc-c-access.ts','lib/iqc-local-save.ts'],catalogAddition='lib/master-catalog-handoff.ts';
 assert.equal(git('ls-tree',manifest.sources.pr103.commit,'--',catalogAddition).length,0);
 assert.equal(hash(git('show','HEAD:'+catalogAddition)),'4570e7ddc1ac0f281666ff5b58b0f768f2bdc1f92f2416c7a895cc4fd040d6f7');
 const password=createRequire(import.meta.url)('../scripts/password-outcome-source-contract.cjs'),helper='lib/password-state.ts';
 assert.equal(password.contract.runtime.file,helper);
 assert.equal(git('ls-tree',password.contract.base,'--',helper).length,0,'Password helper is absent from genuine main');
 assert.equal(git('rev-parse','HEAD:'+helper).toString().trim(),password.contract.runtime.blob);
 password.assertRuntime(git('show','HEAD:'+helper),helper);password.assertRuntime(fs.readFileSync(helper),helper);
 const inventoryHelper='lib/inventory-read-ahead.mjs';
 assert.equal(git('ls-tree',manifest.sources.pr103.commit,'--',inventoryHelper).length,0);
 assert.equal(hash(git('show','HEAD:'+inventoryHelper)),'edec4965f468106bc29c14a81f79c256d251f03a1ebe636f6fb16792c7a27413');
 const account=createRequire(import.meta.url)('../scripts/account-outcome-source-contract.cjs'),accountHelpers=['lib/account-state.ts','public/process/account-write-receipt.js'];
 assert.deepEqual(Object.keys(account.contract.runtime).sort(),accountHelpers);
 for(const file of accountHelpers){assert.equal(git('ls-tree',account.contract.base,'--',file).length,0);account.assertRuntime(git('show','HEAD:'+file),file);account.assertRuntime(fs.readFileSync(file),file);}
 const routineAdditions=[
  'app/api/routine-iqc/photo/route.ts','app/api/routine-iqc/route.ts',
  'lib/routine-fqc-calendar.ts','lib/routine-iqc-access.ts','lib/routine-iqc-workflow.ts',
  'lib/routine-iqc.ts','lib/time-frequency-policy.ts',
  'public/process/routine-iqc.css','public/process/routine-iqc.js',
 ];
 const base='0149cf21fd2e46e83f8eab99a8426bc8c9df6b47';
 const inventory=rev=>git('ls-tree','-r','--name-only',rev,'--','app','lib','public').toString().trim().split('\n');
 const historical=[...files,...additions,catalogAddition,helper,inventoryHelper,...accountHelpers,...routineAdditions].sort();
 assert.deepEqual(inventory(base),historical);
 const routineProof=createRequire(import.meta.url)('../scripts/routine-integration-source-contract.cjs');
 assert.equal(git('rev-parse',routineProof.followup.uploaded+'^{tree}').toString().trim(),routineProof.followup.tree);
 for(const file of routineAdditions){
  const supplied=git('show','HEAD:'+file);
  routineProof.assertUploadedOrFollowup(supplied,file);
  assert.throws(()=>routineProof.assertUploadedOrFollowup(Buffer.concat([supplied,Buffer.from(' ')]),file));
 }
 for(const file of additions)assert.deepEqual(createRequire(import.meta.url)('../scripts/quality-main-source-contract.cjs').projectKnown(git('show','HEAD:'+file),file,'quality'),git('show','0850a46732ce4d468a2238450d83c3f2f8fb3d07:'+file),file);
 // Preserve exact quality-parent bytes; C return semantics have an independently tested narrow inverse.
 for(const file of files)assert.deepEqual(published(git('show','HEAD:'+file),file),git('show',manifest.sources.pr103.commit+':'+file),file);
 for(const row of manifest.runtimeDecisions){
  assert(manifest.semanticDecisions[row.path],row.path+' needs explicit semantic decision');
  assert.equal(hash(published(git('show','HEAD:'+row.path),row.path)),row.sha256);
  assert.equal(hash(git('show',manifest.sources.pr104.commit+':'+row.path)),row.processSha256);
  assert.notEqual(row.sha256,row.processSha256);
 }
});
void test('routine startup adds exactly three fixed runtime blobs to the historical inventory',()=>{
 const inventory=rev=>git('ls-tree','-r','--name-only',rev,'--','app','lib','public').toString().trim().split('\n');
 const historical=inventory('0149cf21fd2e46e83f8eab99a8426bc8c9df6b47');
 const resetRuntime=[
  ['app/api/routine-reset/route.ts','41de8a0b4044dd863d8e1f803d00c14927c05c40',7456],
  ['lib/routine-schedule-owner.ts','19f741ca55a186ef203453bfce1bbe50fa8d8748',297],
  ['public/process/routine-reset.js','a460dc3966f71d9d7c829c1d64f7a3a3245391d0',7366],
 ];
 const expected=[...historical,...resetRuntime.map(([file])=>file)].sort();
 const actual=inventory('HEAD');
 assert.deepEqual(actual,expected);
 assert.throws(()=>assert.deepEqual([...actual,'public/process/unexpected.js'],expected),{code:'ERR_ASSERTION'});
 for(const [file,blob,length] of resetRuntime){
  assert.equal(git('ls-tree','HEAD','--',file).toString().trimEnd(),`100644 blob ${blob}\t${file}`);
  const pinned=git('cat-file','blob',blob);
  assert.equal(pinned.length,length,file);
  const verify=bytes=>assert.deepEqual(bytes,pinned,file);
  const raw=git('show','HEAD:'+file);
  verify(raw);
  const changed=Buffer.from(raw);
  changed[0]^=1;
  assert.throws(()=>verify(changed),{code:'ERR_ASSERTION'});
 }
});
void test('startup path projections reject substituted raw objects and preserve exact predecessor behavior',()=>{
 const proof=createRequire(import.meta.url)('../scripts/routine-integration-source-contract.cjs');
 for(const file of ['app/api/routine-fqc/page/route.ts','app/api/routine-fqc/route.ts','public/process/routine-fqc-page.js',
                    'app/api/routine-iqc/route.ts','lib/routine-iqc-access.ts','public/process/routine-iqc.js']){
  const head=git('show','HEAD:'+file);
  const base=git('show','0149cf21fd2e46e83f8eab99a8426bc8c9df6b47:'+file);
  assert.notDeepEqual(head,base,file);
  proof.assertRoutineHeadBlob(head,file);
  assert.deepEqual(proof.projectKnown(head,file),proof.projectKnown(base,file),file);
  const mutation=Buffer.from(head);
  mutation[0]^=1;
  for(const other of [base,mutation,head.subarray(1)])assert.throws(()=>proof.assertRoutineHeadBlob(other,file),{code:'ERR_ASSERTION'});
  assert.strictEqual(proof.projectKnown(mutation,file),mutation,file);
 }
});
void test('joint contract rejects byte drift and keeps original native timeouts and safety assertions',()=>{
 for(const row of manifest.runtimeDecisions){const bytes=git('show','HEAD:'+row.path);assert.notEqual(hash(Buffer.concat([bytes,Buffer.from('\n// drift')])),row.sha256);}
 for(const file of ['tests/begin-recovery-browser.mjs','tests/process-draft-lifecycle-browser.mjs'])assert.deepEqual(published(git('show','HEAD:'+file),file),git('show',manifest.sources.pr104.commit+':'+file));
 assert.deepEqual(published(git('show','HEAD:.github/workflows/local-safety.yml'),'.github/workflows/local-safety.yml'),git('show',manifest.sources.main.commit+':.github/workflows/local-safety.yml'));
});
