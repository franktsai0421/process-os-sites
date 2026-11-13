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
void test('reviewed account/process runtime union retains every installed file with the three pinned quality helpers and exact read-only catalog audit',()=>{
 const files=git('ls-tree','-r','--name-only',manifest.sources.pr103.commit,'--','app','lib','public').toString().trim().split('\n');
 const additions=['lib/ipqc-ab-local-lineage.ts','lib/ipqc-c-access.ts','lib/iqc-local-save.ts'],catalogAddition='lib/master-catalog-handoff.ts';
 assert.equal(git('ls-tree',manifest.sources.pr103.commit,'--',catalogAddition).length,0);
 assert.equal(hash(git('show','HEAD:'+catalogAddition)),'4570e7ddc1ac0f281666ff5b58b0f768f2bdc1f92f2416c7a895cc4fd040d6f7');
 assert.deepEqual(git('ls-tree','-r','--name-only','HEAD','--','app','lib','public').toString().trim().split('\n'),[...files,...additions,catalogAddition].sort());
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
void test('joint contract rejects byte drift and keeps original native timeouts and safety assertions',()=>{
 for(const row of manifest.runtimeDecisions){const bytes=git('show','HEAD:'+row.path);assert.notEqual(hash(Buffer.concat([bytes,Buffer.from('\n// drift')])),row.sha256);}
 for(const file of ['tests/begin-recovery-browser.mjs','tests/process-draft-lifecycle-browser.mjs'])assert.deepEqual(published(git('show','HEAD:'+file),file),git('show',manifest.sources.pr104.commit+':'+file));
 assert.deepEqual(published(git('show','HEAD:.github/workflows/local-safety.yml'),'.github/workflows/local-safety.yml'),git('show',manifest.sources.main.commit+':.github/workflows/local-safety.yml'));
});
