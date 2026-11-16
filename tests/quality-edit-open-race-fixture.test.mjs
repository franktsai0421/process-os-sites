import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runAsyncEditRequestRegression as run} from '../scripts/test-routine-equipment-edit-open-race.mjs';
const source=fs.readFileSync('public/process/routine-equipment.js','utf8');
void test('actual immediate editor and deferred section fixture retains every safety group',async()=>{
 const result=await run(source);assert.equal(result.failed,0);assert.ok(result.cases>=44);
});
const mutants={
 'await-before-editor':source.replace('const request = ++equipmentEditRequest, actor = identity()?.id',"await loadEquipmentReferences(id,{renderAfter:false}); const request = ++equipmentEditRequest, actor = identity()?.id"),
 'full-form repaint on reference completion':source.replace('if (renderAfter) updateEquipmentReferenceSections(id);','if (renderAfter) render();'),
 'missing late owner/request fence':source.replace('if (entry.invalidated || !transferOwnerCurrent(owner) || request !== equipmentEditRequest) return;','if (entry.invalidated) return;'),
};
for(const [name,mutated]of Object.entries(mutants))void test('fixture rejects regression: '+name,async()=>{
 assert.notEqual(mutated,source,'negative control must actually change exact runtime source');
 if(name==='await-before-editor'){
  // The fixture asserts immediate painting before resolving any deferred query.
  await assert.rejects(run(mutated,{groups:['baseline']}),error=>error instanceof assert.AssertionError);
 }else await assert.rejects(run(mutated,{groups:['baseline']}),error=>error instanceof assert.AssertionError);
});
