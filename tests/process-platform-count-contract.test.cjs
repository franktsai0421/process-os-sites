/* oxlint-disable typescript/no-require-imports -- exact source proof uses immutable Git preimages. */
const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),proof=require('../scripts/process-platform-count-contract.cjs');
const {contract}=proof,git=(...args)=>execFileSync('git',args),index=git('show','HEAD:'+contract.index),prior=git('show',contract.base+':'+contract.index);
void test('integrated count is the original #101 source and its one cache tag preserves current main',()=>{assert.equal(proof.verifyRepository().status,'PASS_PROCESS_PLATFORM_COUNT');assert.deepEqual(proof.projectIndex(index),prior);assert(Object.isFrozen(contract)&&Object.isFrozen(proof));});
void test('count layer rejects rollback, partial layers, unrelated drift and nonraw inputs',()=>{
 for(const bytes of [prior,index.subarray(1),Buffer.concat([index,Buffer.from(' ')]),index.toString(),new Uint8Array(index)])assert.throws(()=>proof.projectIndex(bytes));
 for(const offset of [0,Math.floor(index.length/2),index.length-1]){const bytes=Buffer.from(index);bytes[offset]^=1;assert.throws(()=>proof.projectIndex(bytes));assert.deepEqual(proof.projectKnown(bytes,contract.index),bytes);}
 assert.deepEqual(proof.projectKnown(index,'other-file'),index);
});
void test('exact count + no-poll + Routine composition retains original gates and drift rejection',()=>{
 const background=require('../scripts/background-check-source-contract.cjs'),routine=require('../scripts/routine-fqc-source-contract.cjs');
 const projected=background.projectKnown(index,contract.index),expected=git('show','d4ac309fe05c89288af226b52c18161865ccdcb8:'+contract.index);
 assert.deepEqual(projected,expected);
 const before=git('show',routine.contract.base+':'+contract.index);routine.assertIndexSuccessor(index,before,contract.index);
 const changed=Buffer.from(index);changed[0]^=1;assert.throws(()=>routine.assertIndexSuccessor(changed,before,contract.index));
 assert.equal(routine.verifyRepository().status,'PASS_ROUTINE_FQC_SOURCE');
});
