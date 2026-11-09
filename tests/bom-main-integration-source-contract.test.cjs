const historical=require('../scripts/unified-draft-historical-source.cjs').read;
const unified=require('../scripts/unified-draft-source-contract.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const proof=require('../scripts/bom-main-integration-source-contract.cjs'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>unified.project(proof.canonicalSource(fs.readFileSync(file),execFileSync('git',['show','HEAD:'+file])),file,'bom_integration');
void test('integrated current source is attested separately from both branch projections',()=>{assert.equal(proof.attest(read),true);assert(Object.isFrozen(proof.manifest.current[0]));assert.deepEqual(Object.keys(proof.manifest.provenance),['bom','main']);assert.throws(()=>proof.attest(null));});
for(const entry of proof.manifest.current)void test('actual current source refuses rollback or any helper-only byte change: '+entry.file,()=>{
 const bytes=read(entry.file);assert.equal(hash(bytes),entry.sha256);assert.throws(()=>proof.attest(file=>file===entry.file?Buffer.concat([bytes,Buffer.from(' ')]):read(file)),/Current integration source differs/);
 for(const ref of Object.values(proof.manifest.provenance)){let prior;try{prior=historical(ref,entry.file);}catch{continue;}if(!prior.equals(bytes))assert.throws(()=>proof.attest(file=>file===entry.file?prior:read(file)),/Current integration source differs/);}
});
for(const contract of proof.manifest.projections){const {file,target}=contract;
 void test('strict '+target+' projection matches actual immutable parent Git bytes: '+file,()=>{
  const bytes=read(file),prior=proof.restore(bytes,file,target),committed=historical(proof.manifest.provenance[target],file);
  assert.deepEqual(prior,committed);assert.equal(hash(prior),contract.beforeHash);assert.deepEqual(proof.project(bytes,file,target),prior);assert.deepEqual(proof.project(prior,file,target),prior);assert.throws(()=>proof.restore(prior,file,target),/pinned/);assert.deepEqual(read(file),bytes);
  for(const changed of [Buffer.concat([bytes,Buffer.from(' ')]),bytes.subarray(1),Buffer.concat([bytes,bytes])]){assert.throws(()=>proof.restore(changed,file,target),/pinned/);assert.deepEqual(proof.project(changed,file,target),changed);}
  for(const value of [bytes.toString(),new Uint8Array(bytes),null])assert.throws(()=>proof.restore(value,file,target),/raw source bytes/);
  assert.throws(()=>proof.restore(bytes,'./'+file,target),/Unknown integration/);assert.throws(()=>proof.project(bytes,file,'invalid'),/Unknown integration/);
 });
 for(const [index,rule]of contract.rules.entries())void test('fixed '+target+' inverse span '+index+' refuses partial or repeated source and corrupt offsets: '+file,()=>{
  const bytes=read(file),span=Buffer.from(rule.after),start=bytes.subarray(0,rule.afterOffset),end=bytes.subarray(rule.afterOffset+span.length);
  for(const changed of [Buffer.concat([start,Buffer.from(rule.before),end]),Buffer.concat([start,span,span,Buffer.from('!'),end])]){assert.notDeepEqual(changed,bytes);assert.throws(()=>proof.restore(changed,file,target),/pinned/);}
  for(const [key,value]of [['afterOffset',rule.afterOffset+1],['beforeOffset',-1],['after',rule.after+'!'],['before',rule.before+'!']]){const corrupt=structuredClone(contract);corrupt.rules[index][key]=value;assert.throws(()=>proof.invert(bytes,corrupt));}
 });
 void test('complete '+target+' inverse metadata corruption fails: '+file,()=>{const bytes=read(file);for(const [key,value]of [['afterHash','0'.repeat(64)],['beforeHash','0'.repeat(64)],['afterBytes',bytes.length+1],['beforeBytes',contract.beforeBytes+1],['rules',[]]])assert.throws(()=>proof.invert(bytes,{...contract,[key]:value}));});
}
void test('checkout equivalence is byte-based and cannot hide invalid UTF8 or ordinary drift',()=>{
 const bytes=read('public/process/shared-draft-client.js');assert.deepEqual(proof.canonicalSource(Buffer.from(bytes.toString().replace(/\n/g,'\r\n')),bytes),bytes);
 assert.throws(()=>proof.canonicalSource(Buffer.concat([bytes,Buffer.from([255])]),Buffer.concat([bytes,Buffer.from([254])])),/beyond EOL/);assert.throws(()=>proof.canonicalSource(Buffer.concat([bytes,Buffer.from(' ')]),bytes),/beyond EOL/);
});
void test('integrated shared client includes both bounded features and unique coherent cache',()=>{
 const source=read('public/process/shared-draft-client.js').toString(),currentIndex=unified.canonicalSource(fs.readFileSync('public/process/index.html'),execFileSync('git',['show','HEAD:public/process/index.html'])),html=unified.restore(currentIndex,'public/process/index.html','initial_unified').toString();
 assert(source.includes("beginPath==='/api/bom/workflow'?{approvedHistory:"));assert(source.includes('recheckEquipmentDelivery'));assert(source.includes('confirmEquipmentDelivery'));
 assert.equal((html.match(/shared-draft-client\.js\?v=20261109-unified-save-choice1/g)||[]).length,1);assert(html.includes('routine-equipment.js?v=20261109-unified-save-choice1'));assert(html.includes('bom-workspace.js?v=20261109-unified-save-choice1'));
 for(const [stage,version]of [[html,'20261109-unified-save-choice1'],[currentIndex.toString(),'20261109-unified-save-choice2']]){const references=[...stage.matchAll(/(?:data-process-src|src|href)="([^"]+)"/g)].map(match=>match[1]);for(const asset of ['shared-draft-client.js','routine-equipment.js','bom-workspace.js'])assert.deepEqual(references.filter(value=>value.split('?')[0]===asset),[asset+'?v='+(stage===html||asset==='bom-workspace.js'?version:asset==='routine-equipment.js'?'20261109-master-approved-history4':'20261109-approved-history-integrated3')]);}
});
void test('both CI jobs execute integrated attestation and retain their original gates',()=>{
 const files=['scripts/bom-main-integration-source-contract.cjs','scripts/bom-main-integration-source-contract.json','tests/bom-main-integration-source-contract.test.cjs'];
 const feedback=fs.readFileSync('.github/workflows/feedback-queues.yml','utf8').replace(/\r\n/g,'\n'),local=fs.readFileSync('.github/workflows/local-safety.yml','utf8').replace(/\r\n/g,'\n');
 assert.match(feedback,/uses: actions\/checkout@[a-f0-9]{40}\n        with:\n          fetch-depth: 0\n/,'immutable parent Git assertions require complete checkout ancestry');
 for(const file of files)assert(feedback.includes("      - '"+file+"'\n"));const command='node --test tests/bom-main-integration-source-contract.test.cjs';assert(feedback.includes('      - run: '+command+'\n'));assert(local.includes('          '+command+'\n          if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }'));
 assert(local.includes('tests/equipment-sent-batch-insert-ack.test.mjs'));assert(local.includes('tests/bom-approved-history-real-common.test.mjs'));
});
