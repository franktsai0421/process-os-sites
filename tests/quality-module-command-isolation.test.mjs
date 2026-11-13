// Actual separate FQC/IQC routes, in-memory SQLite/Map R2 and synthetic actors.
// No HTTP, live records, account changes, automatic Submit or migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createTransferFixture}=require('../scripts/equipment-transfer-fixture.cjs');
const keys={fqc:'qualityMasterControl',iqc:'iqcMasterControl'};
for(const order of [['fqc','iqc'],['iqc','fqc']])void test(`actual separate drafts Save/Submit/withdraw without crossing modules: ${order.join(' then ')}`,async t=>{
 const h=await createTransferFixture();t.after(()=>h.close());
 const values=async()=>({...((await h.core.readState()).values)});
 async function isolated(moduleId,invoke){const before=await values(),out=await invoke(),after=await values();for(const key of Object.keys(before))if(key!==keys[moduleId])assert.equal(after[key],before[key],'other module/value remains byte-exact: '+key);return out;}
 const original={};for(const moduleId of order){original[moduleId]=h.flow(await h.read(moduleId)).active;await isolated(moduleId,()=>h.begin(moduleId));}
 for(const moduleId of order){const flow=h.flow(await h.read(moduleId)),row=flow.working.items[0],field=moduleId==='fqc'?'description':'nameVi',path=['items',{id:row.id},field];assert.equal(flow.scope,moduleId);await isolated(moduleId,()=>h.command(moduleId,'apply',{patches:[{op:'set',path,value:'ONLY_'+moduleId.toUpperCase()}],guards:[{path,value:row[field]}]}));}
 const pending={},saved={};
 for(const moduleId of order){const peer=moduleId==='fqc'?'iqc':'fqc',peerBefore=h.flow(await h.read(peer));const result=await isolated(moduleId,()=>h.command(moduleId,'save'));saved[moduleId]=h.flow(result).saved;assert(saved[moduleId]);assert.equal(saved[moduleId].content.items[0][moduleId==='fqc'?'description':'nameVi'],'ONLY_'+moduleId.toUpperCase());assert.deepEqual(h.flow(await h.read(peer)),peerBefore);
  const submitted=await isolated(moduleId,()=>h.command(moduleId,'submit',{savedId:saved[moduleId].id,reason:'Synthetic separate module confirmation'}));pending[moduleId]=submitted.receipt.caseId;assert.equal(h.flow(submitted).pendingId,pending[moduleId]);assert.deepEqual(h.flow(await h.read(peer)),peerBefore);
 }
 assert.notEqual(pending.fqc,pending.iqc);assert.notEqual(saved.fqc.id,saved.iqc.id);
 for(const moduleId of order){const before=h.snapshot();const denied=await h.command(moduleId,'save',{},'editor',409);assert.equal(denied.error,'PENDING_LOCKED');assert.deepEqual(h.snapshot(),before,'own pending draft still refuses Save');}
 for(const moduleId of order){const peer=moduleId==='fqc'?'iqc':'fqc',before=h.snapshot();const denied=await h.command(moduleId,'withdraw',{caseId:pending[peer],reason:'Synthetic wrong module case'},'editor',409);assert.equal(denied.error,'CASE_NOT_PENDING');assert.deepEqual(h.snapshot(),before,'wrong module case publishes neither data nor receipt');}
 for(const moduleId of order){const result=await isolated(moduleId,()=>h.command(moduleId,'withdraw',{caseId:pending[moduleId],reason:'Synthetic own module withdrawal'})),flow=h.flow(result);assert.equal(flow.pendingId,null);assert.equal(flow.cases.find(row=>row.id===pending[moduleId]).status,'withdrawn');assert.deepEqual(flow.saved,saved[moduleId]);assert.deepEqual(flow.active,original[moduleId]);}
 for(const moduleId of order){const flow=h.flow(await h.read(moduleId)),row=flow.working.items[0],field=moduleId==='fqc'?'description':'nameVi',path=['items',{id:row.id},field];
  await isolated(moduleId,()=>h.command(moduleId,'apply',{patches:[{op:'set',path,value:'AFTER_WITHDRAW_'+moduleId}],guards:[{path,value:row[field]}]}));
  const nextSaved=h.flow(await isolated(moduleId,()=>h.command(moduleId,'save'))).saved;assert.notEqual(nextSaved.id,saved[moduleId].id);
  const submitted=await isolated(moduleId,()=>h.command(moduleId,'submit',{savedId:nextSaved.id,reason:'Synthetic edited resubmission'}));assert.notEqual(submitted.receipt.caseId,pending[moduleId]);
  const approved=h.flow(await isolated(moduleId,()=>h.command(moduleId,'approve',{caseId:submitted.receipt.caseId},'reviewer')));assert.equal(approved.pendingId,null);assert.equal(approved.active.id,submitted.receipt.caseId);assert.equal(approved.active.content.items[0][field],'AFTER_WITHDRAW_'+moduleId);assert.equal(approved.cases.find(row=>row.id===pending[moduleId]).status,'withdrawn');assert.equal(approved.cases.find(row=>row.id===approved.active.id).status,'approved');
 }
});
