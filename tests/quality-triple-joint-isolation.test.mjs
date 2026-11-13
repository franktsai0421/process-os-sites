// Actual FQC/IQC/C/AB routes on one synthetic in-memory DB. No live credentials or data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createTransferFixture}=require('../scripts/equipment-transfer-fixture.cjs');
const keys={fqc:'qualityMasterControl',iqc:'iqcMasterControl','ipqc-c':'ipqcCMasterControl','ipqc-ab':'ipqcABMasterControl'};
for(const order of [['fqc','iqc','ipqc-c','ipqc-ab'],['ipqc-ab','ipqc-c','iqc','fqc']])void test('joint quality drafts preserve peer state through Save/Submit/withdraw: '+order.join(' → '),async t=>{
 const h=await createTransferFixture();t.after(()=>h.close());
 const values=async()=>({...((await h.core.readState()).values)});
 const readFlow=async moduleId=>moduleId==='ipqc-c'?JSON.parse((await values()).ipqcCMasterControl).workflow:h.flow(await h.read(moduleId,'editor',moduleId==='ipqc-ab'?'&module=1':''));
 async function isolated(moduleId,invoke){const before=await values(),result=await invoke(),after=await values();for(const key of Object.keys(before))if(key!==keys[moduleId])assert.equal(after[key],before[key],'unrelated state stays byte-exact: '+key);return result;}
 const query=id=>id==='ipqc-ab'?'&module=1':'';
 const command=(id,action,details={},who='editor',expected=200)=>h.command(id,action,details,who,expected,query(id));
 const saved={},pending={};
 for(const moduleId of order)await isolated(moduleId,()=>h.begin(moduleId,'editor',200,query(moduleId)));
 for(const moduleId of order){
  const flow=await readFlow(moduleId),row=(moduleId==='ipqc-ab'?flow.working.scopes['A:G-A']:flow.working).items[0],field=moduleId==='iqc'?'nameVi':moduleId==='ipqc-ab'?'methodText':'description',path=[...(moduleId==='ipqc-ab'?['scopes','A:G-A']:[]),'items',{id:row.id},field];
  let result;
  if(moduleId==='ipqc-ab'){
   const group=await h.read(moduleId,'editor','&scope=A%3AG-A'),scopePath=['items',{id:row.id},field];
   result=await isolated(moduleId,()=>command(moduleId,'save',{moduleAction:'save-local-v1',input:{scopes:[{scope:'A:G-A',generation:h.flow(group).generation,baseId:group.control.activeVersionId,changes:[{patches:[{op:'set',path:scopePath,value:'JOINT_'+moduleId}],guards:[{path:scopePath,value:row[field]}]}]}]}}));
  }else{
   await isolated(moduleId,()=>command(moduleId,'apply',{patches:[{op:'set',path,value:'JOINT_'+moduleId}],guards:[{path,value:row[field]}]}));
   result=await isolated(moduleId,()=>command(moduleId,'save'));
  }
  saved[moduleId]=h.flow(result).saved;
  assert(saved[moduleId]);assert.equal((moduleId==='ipqc-ab'?saved[moduleId].content.scopes['A:G-A']:saved[moduleId].content).items[0][field],'JOINT_'+moduleId);
 }
 assert.equal(new Set(Object.values(saved).map(row=>row.id)).size,4,'each module owns its immutable saved snapshot');
 for(const moduleId of order){const result=await isolated(moduleId,()=>command(moduleId,'submit',{savedId:saved[moduleId].id,reason:'Synthetic joint isolation'}));pending[moduleId]=result.receipt.caseId;}
 assert.equal(new Set(Object.values(pending)).size,4);
 for(let i=0;i<order.length;i++){
  const moduleId=order[i],peer=order[(i+1)%order.length],before=h.snapshot();
  const denied=await command(moduleId,'withdraw',{caseId:pending[peer],reason:'Synthetic wrong-module case'},'editor',409);
  assert.equal(denied.error,'CASE_NOT_PENDING');assert.deepEqual(h.snapshot(),before,'wrong module cannot change data or publish receipt');
  const locked=await command(moduleId,'save',{},'editor',409);assert.equal(locked.error,'PENDING_LOCKED');assert.deepEqual(h.snapshot(),before);
 }
 for(const moduleId of order){
  await isolated(moduleId,()=>command(moduleId,'withdraw',{caseId:pending[moduleId],reason:'Synthetic own withdrawal'}));
  const flow=await readFlow(moduleId);assert.equal(flow.pendingId,null);assert.deepEqual(flow.saved,saved[moduleId]);
 }
});
