const unified=require('../scripts/unified-draft-source-contract.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process'),vm=require('node:vm');
const proof=require('../scripts/equipment-save-choice-source-contract.cjs'),repair=require('../scripts/equipment-ci-repair-source-contract.cjs'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=unified.project(unified.canonicalSource(fs.readFileSync(proof.file),execFileSync('git',['show','HEAD:'+proof.file])),proof.file,'equipment');
void test('Save-choice successor restores exact real b063 bytes and then unchanged #97 proof',()=>{
 assert.equal(proof.baseCommit,'b06394ce0065849733399423afd2d906761d69c1');assert.equal(proof.beforeHash,'6f57fc37463575cb1ee59790bad2869f44c7583a8005cbde1e805494f816597f');
 const prior=proof.restorePredecessor(bytes,proof.file);assert.deepEqual(prior,execFileSync('git',['show',proof.baseCommit+':'+proof.file]));assert.equal(hash(prior),proof.beforeHash);repair.assertCurrent(prior,proof.file);
 assert.equal(hash(unified.project(execFileSync('git',['show','HEAD:public/process/shared-draft-client.js']),'public/process/shared-draft-client.js','main')),'0a580dc462943f0acd76dcbee419a0abc5605e0b7d508700fd36cdd3e4ca28d4','shared transport stays exact #97');
 assert(Object.isFrozen(proof)&&Object.isFrozen(proof.rules)&&proof.rules.every(Object.isFrozen));
});
void test('Save-choice proof rejects whole rollback, partial/repeated inverse and arbitrary byte drift',()=>{
 const prior=proof.restorePredecessor(bytes,proof.file);assert.throws(()=>proof.restorePredecessor(prior,proof.file),/pinned/);assert.throws(()=>proof.assertCurrent(bytes,'public/process/shared-draft-client.js'),/wrong file/);
 for(const value of [bytes.toString(),new Uint8Array(bytes),null])assert.throws(()=>proof.assertCurrent(value,proof.file),/raw source bytes/);
 for(const offset of [0,1,bytes.length-1,...proof.rules.flatMap(rule=>[rule.offset,Math.max(0,rule.offset-1)]),...Array.from({length:80},(_,i)=>(i*3719)%bytes.length)]){const changed=Buffer.from(bytes);changed[offset]^=1;assert.throws(()=>proof.assertCurrent(changed,proof.file),/pinned/);}
 for(const rule of proof.rules){const start=bytes.subarray(0,rule.offset),end=bytes.subarray(rule.offset+Buffer.byteLength(rule.after)),span=Buffer.from(rule.after);for(const changed of [Buffer.concat([start,Buffer.from(rule.before),end]),Buffer.concat([start,span,span,end])]){if(changed.equals(bytes))continue;assert.throws(()=>proof.assertCurrent(changed,proof.file),/pinned/);}}
});
void test('Save-choice proof rejects corrupted offsets, spans, lengths and predecessor hash',()=>{
 const source=fs.readFileSync('scripts/equipment-save-choice-source-contract.cjs','utf8');
 for(const [from,to]of [['"offset": '+proof.rules[0].offset,'"offset": '+(proof.rules[0].offset+1)],['"beforeLength": '+proof.beforeLength,'"beforeLength": '+(proof.beforeLength+1)],[proof.beforeHash,'0'.repeat(64)]]){const proofModule={exports:{}};assert(source.includes(from));vm.runInNewContext(source.replace(from,to),{require,module:proofModule,Buffer});assert.throws(()=>proofModule.exports.restorePredecessor(bytes,proof.file));}
});
void test('Save-choice source and functional checks are real normal CI dependencies; current unified cache keeps exact unique entries',()=>{
 const local=fs.readFileSync('.github/workflows/local-safety.yml','utf8'),feedback=fs.readFileSync('.github/workflows/feedback-queues.yml','utf8'),currentIndex=unified.canonicalSource(fs.readFileSync('public/process/index.html'),execFileSync('git',['show','HEAD:public/process/index.html'])),index=unified.restore(currentIndex,'public/process/index.html','initial_unified').toString();
 for(const name of ['tests/equipment-save-choice.test.mjs','tests/equipment-save-choice-source.test.cjs']){assert(local.includes(' '+name));assert(feedback.includes(' '+name));assert(feedback.includes("      - '"+name+"'"));}
 for(const name of [proof.file,'public/process/index.html','scripts/equipment-save-choice-source-contract.cjs','scripts/equipment-save-choice-fixture.mjs'])assert(feedback.includes("      - '"+name+"'"));
 assert(index.includes('routine-equipment.js?v=20261109-unified-save-choice1'));assert(index.includes('shared-draft-client.js?v=20261109-unified-save-choice1'));
 for(const [stage,version]of [[index,'20261109-unified-save-choice1'],[unified.restore(currentIndex,'public/process/index.html','previous_followup').toString(),'20261109-unified-save-choice2'],[currentIndex.toString(),'20261109-conflict-continuation1']]){const references=[...stage.matchAll(/(?:data-process-src|src|href)="([^"]+)"/g)].map(match=>match[1]);for(const asset of ['routine-equipment.js','shared-draft-client.js'])assert.deepEqual(references.filter(value=>value.split('?')[0]===asset),[asset+'?v='+version]);}
 const mainBackgroundReferences=[...unified.restore(currentIndex,'public/process/index.html','main_background').toString().matchAll(/(?:data-process-src|src|href)="([^"]+)"/g)].map(match=>match[1]);
 for(const [asset,version]of Object.entries({'routine-equipment.js': '20261108-equipment-ci-recovery1', 'shared-draft-client.js': '20261109-explicit-checks3'}))assert.deepEqual(mainBackgroundReferences.filter(value=>value.split('?')[0]===asset),[asset+'?v='+version]);
});
