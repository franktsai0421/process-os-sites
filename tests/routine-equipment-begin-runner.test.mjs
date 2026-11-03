// Exercise the actual runner in child processes with synthetic fixture faults.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
for(const fault of ['assertion','unsettled'])await test('equipment Begin runner fails closed for '+fault,()=>{
 const probe=`
 const path=require('node:path'),root=process.argv[1],fault=process.argv[2];
 process.chdir(root);
 const fixture=require(path.join(root,'scripts/test-routine-equipment-transfer-intent.cjs'));
 const original=fixture.fixture;
 fixture.fixture=async(...args)=>{
  if(fault==='unsettled')return new Promise(()=>{});
  const result=await original(...args);
  result.test.writeShared=async()=>null;
  return result;
 };
 require(path.join(root,'scripts/test-routine-equipment-begin-recovery.cjs'));
 `;
 const result=spawnSync(process.execPath,['-e',probe,root,fault],{encoding:'utf8',timeout:15000,env:{...process.env,PROCESS_TEST_SOURCE:root}});
 assert.equal(result.error,undefined,'child must finish itself without parent termination');
 assert.equal(result.status,1,'failed or incomplete suite must never exit successfully');
 assert.match(result.stdout,/"status":"FAIL"/);
 assert.doesNotMatch(result.stdout,/PASS_BOUNDED_BEGIN_RECOVERY/);
 assert.match(result.stderr,fault==='unsettled'?/CASE_TIMEOUT/:/AssertionError/);
});
