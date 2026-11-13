// Actual FQC/IQC/C routes on one synthetic in-memory DB. No live credentials or data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createTransferFixture}=require('../scripts/equipment-transfer-fixture.cjs');
const keys={fqc:'qualityMasterControl',iqc:'iqcMasterControl','ipqc-c':'ipqcCMasterControl'};
for(const order of [['fqc','iqc','ipqc-c'],['ipqc-c','iqc','fqc']])void test('joint quality drafts preserve peer state through Save/Submit/withdraw: '+order.join(' → '),async t=>{
 const h=await createTransferFixture();t.after(()=>h.close());
 const values=async()=>({...((await h.core.readState()).values)});
 const readFlow=async moduleId=>moduleId==='ipqc-c'?JSON.parse((await values()).ipqcCMasterControl).workflow:h.flow(await h.read(moduleId));
 async function isolated(moduleId,invoke){const before=await values(),result=await invoke(),after=await values();for(const key of Object.keys(before))if(key!==keys[moduleId])assert.equal(after[key],before[key],'unrelated state stays byte-exact: '+key);return result;}
 const saved={},pending={};
 for(const moduleId of order)await isolated(moduleId,()=>h.begin(moduleId));
 for(const moduleId of order){
  const flow=await readFlow(moduleId),row=flow.working.items[0],field=moduleId==='iqc'?'nameVi':'description',path=['items',{id:row.id},field];
  await isolated(moduleId,()=>h.command(moduleId,'apply',{patches:[{op:'set',path,value:'JOINT_'+moduleId}],guards:[{path,value:row[field]}]}));
  const result=await isolated(moduleId,()=>h.command(moduleId,'save'));saved[moduleId]=h.flow(result).saved;
  assert(saved[moduleId]);assert.equal(saved[moduleId].content.items[0][field],'JOINT_'+moduleId);
 }
 assert.equal(new Set(Object.values(saved).map(row=>row.id)).size,3,'each module owns its immutable saved snapshot');
 for(const moduleId of order){const result=await isolated(moduleId,()=>h.command(moduleId,'submit',{savedId:saved[moduleId].id,reason:'Synthetic joint isolation'}));pending[moduleId]=result.receipt.caseId;}
 assert.equal(new Set(Object.values(pending)).size,3);
 for(let i=0;i<order.length;i++){
  const moduleId=order[i],peer=order[(i+1)%order.length],before=h.snapshot();
  const denied=await h.command(moduleId,'withdraw',{caseId:pending[peer],reason:'Synthetic wrong-module case'},'editor',409);
  assert.equal(denied.error,'CASE_NOT_PENDING');assert.deepEqual(h.snapshot(),before,'wrong module cannot change data or publish receipt');
  const locked=await h.command(moduleId,'save',{},'editor',409);assert.equal(locked.error,'PENDING_LOCKED');assert.deepEqual(h.snapshot(),before);
 }
 for(const moduleId of order){
  await isolated(moduleId,()=>h.command(moduleId,'withdraw',{caseId:pending[moduleId],reason:'Synthetic own withdrawal'}));
  const flow=await readFlow(moduleId);assert.equal(flow.pendingId,null);assert.deepEqual(flow.saved,saved[moduleId]);
 }
});
