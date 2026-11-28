const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {createTransferFixture}=require('./equipment-transfer-fixture.cjs');
(async()=>{
 const h=await createTransferFixture({paired:true,secondABGroup:true});const result=[];
 try{
 for(const m of ['fqc','iqc','ipqc-ab','ipqc-c']){
  const ab=m==='ipqc-ab',group=ab?'&scope=A%3AG-A':'',other=ab?'&scope=A%3AG-OTHER':'',q=ab?'&module=1':'';
  await h.begin(m,'editor',200,group);if(ab){await h.begin(m,'editor',200,other);await h.begin(m,'editor',200,q);}
  const get=async()=>{const v=(await h.core.readState()).values,c=JSON.parse(v[{fqc:'qualityMasterControl',iqc:'iqcMasterControl','ipqc-ab':'ipqcABMasterControl','ipqc-c':'ipqcCMasterControl'}[m]]);
   const ctl=m==='fqc'?c.libraries.fqc:ab?c.moduleDraft:c;return{module:ctl.workflow,group:ab?c.scopes['A:G-A'].workflow:ctl.workflow,other:ab?c.scopes['A:G-OTHER'].workflow:ctl.workflow,formal:ab?c.scopes['A:G-A'].activeVersionId:ctl.activeVersionId};};
  await h.command(m,'save',{},'editor',200,q);
  const base=await get(),revision=(await h.core.readState()).revision,one=base.group.working.items[0];const id=randomUUID();
  const catalog=JSON.parse((await h.core.readState()).values.routineEquipmentControl);const target=catalog.versions.find(v=>v.id===catalog.activeVersionId).equipment.find(e=>e.id==='target');
  const attrs={equipmentId:'target',...(m==='fqc'?{tool:target.pieceMark||target.assetCode}:['iqc','ipqc-ab'].includes(m)?{inspectionMode:'equipment'}:{})};
  const patches=Object.entries(attrs).map(([k,value])=>({op:'set',path:['items',{id:one.id},k],value}));
  const guards=patches.map(p=>({path:p.path,value:one[p.path[2]]}));const pair={patches,guards};
  const command={operationId:id,generation:base.module.generation,clientId:'synthetic-race-operator',sequence:1,action:'save',expectedRevision:base.module.revision,equipmentTransferRevision:revision,
    ...(ab?{moduleAction:'save-local-v1',input:{scopes:[{scope:'A:G-A',generation:base.group.generation,baseId:base.group.active.id,changes:[pair]}],stateRevision:revision}}:m==='ipqc-c'?{localChanges:[pair]}:{...pair,moduleAction:'save-local-v1',input:m==='fqc'?{matrixCells:[]}:{}})};
  let fired=false,won,peerRow,whenEncoded=0;const originalPrepare=Object.getOwnPropertyDescriptor(h.env.DB,'prepare');const prepare=h.env.DB.prepare.bind(h.env.DB);const beforeObjects=h.objects.size;
  h.env.DB.prepare=function(sql){const stmt=prepare(sql);
   if(/^UPDATE shared_state SET revision=/i.test(sql)){const run=stmt.run.bind(stmt);stmt.run=async function(){
    if(!fired){fired=true;whenEncoded=h.objects.size-beforeObjects;
     const row=base.other.working.items[1],field={fqc:'description',iqc:'nameVi','ipqc-ab':'standard','ipqc-c':'description'}[m],pp=['items',{id:row.id},field];
     await h.command(m,'apply',{patches:[{op:'set',path:pp,value:'concurrent business edit wins'}],guards:[{path:pp,value:row[field]}]},'editor',200,other);
     won=await get();peerRow=h.snapshot().row;
    }return run();
   };}return stmt;
  };
  let answer;try{answer=await h.call(m+'/workflow','POST',{command},'editor',409,'?caseMetadata=1'+q);}finally{Object.defineProperty(h.env.DB,'prepare',originalPrepare);}
  assert(fired);assert.equal(answer.error,'DRAFT_REVISION_CHANGED_RECONFIRM');assert.deepEqual(h.snapshot().row,peerRow);assert.deepEqual(await get(),won);
  assert.equal(won.group.working.items[0].equipmentId,'source');assert.equal(won.module.saved.id,base.module.saved.id);
  assert.equal(won.module.receipts[id],undefined);assert.deepEqual(won.module.cases,base.module.cases);
  const unsaved=h.snapshot();
  const deniedSubmit=await h.command(m,'submit',{savedId:base.module.saved.id,reason:'Confirm previous saved version'},'editor',409,q);
  assert.equal(deniedSubmit.error,'UNSAVED_CHANGES_SAVE_REQUIRED',m);
  assert.deepEqual(h.snapshot(),unsaved,'ordinary Submit must not persist any working edit');

  await h.command(m,'save',{},'editor',200,q);
  const verified=await get(),currentRevision=(await h.core.readState()).revision;
  const fresh={...command,operationId:randomUUID(),expectedRevision:verified.module.revision,equipmentTransferRevision:currentRevision};
  if(ab)fresh.input={...command.input,stateRevision:currentRevision};
  const endpoint=m+'/workflow',query='?caseMetadata=1'+q;
  const add=structuredClone(fresh),changes=ab?add.input.scopes[0].changes[0]:m==='ipqc-c'?add.localChanges[0]:add;
  const note=['items',{id:one.id},m==='iqc'?'nameVi':ab?'standard':'description'];
  changes.patches.push({op:'set',path:note,value:'out-of-scope'});changes.guards.push({path:note,value:one[note[2]]});
  const beforeBad=h.snapshot().row;
  const malformed=await h.call(endpoint,'POST',{command:add},'editor',422,query);
  assert.equal(malformed.error,'INVALID_LOCAL_SAVE');assert.deepEqual(h.snapshot().row,beforeBad);
  const unavailable=structuredClone(fresh),pick=ab?unavailable.input.scopes[0].changes[0]:m==='ipqc-c'?unavailable.localChanges[0]:unavailable;
  pick.patches.find(p=>p.path[2]==='equipmentId').value='missing-target';
  const unavailableResult=await h.call(endpoint,'POST',{command:unavailable},'editor',422,query);
  assert.equal(unavailableResult.error,'EQUIPMENT_UNAVAILABLE');assert.deepEqual(h.snapshot().row,beforeBad);
  await h.call(endpoint,'POST',{command:fresh},'no-edit',403,query);assert.deepEqual(h.snapshot().row,beforeBad);
  const accepted=await h.call(endpoint,'POST',{command:fresh},'editor',200,query);assert(accepted.receipt.savedId);
  const once=h.snapshot().row;const replay=await h.call(endpoint,'POST',{command:fresh},'editor',200,query);
  assert.deepEqual(replay.receipt,accepted.receipt);assert.deepEqual(once,h.snapshot().row);
  result.push({module:m,ordinarySubmitRejectedDirty:true,ordinarySubmitZeroWrites:true,unauthorizedRejected:true,unavailableTargetRejected:true,unrelatedPatchRejected:true,replayZeroMutations:true,peerCommitImmediatelyBeforeCAS:true,guardedReceiptAbsent:true,candidateSavedIdUnchanged:true,winningSharedRowByteIdentical:true,newImmutableObjectsBeforeLostCAS:whenEncoded});
  console.log('CAS',m,whenEncoded);
 }
 const hidden=await createTransferFixture({paired:true,offRoute:true,secondABGroup:true});
 try{
  const scope='&scope=A%3AG-A',moduleQuery='&module=1';
  await hidden.begin('ipqc-ab','editor',200,scope);await hidden.begin('ipqc-ab','editor',200,moduleQuery);
  const base=await hidden.read('ipqc-ab','editor',moduleQuery),group=await hidden.read('ipqc-ab','editor',scope),moduleFlow=hidden.flow(base),flow=hidden.flow(group);
  const item=flow.working.items[0],before=structuredClone(flow.active);const patches=['equipmentId','inspectionMode'].map(k=>({op:'set',path:['items',{id:item.id},k],value:k==='equipmentId'?'target':'equipment'})),guards=patches.map(p=>({path:p.path,value:item[p.path[2]]}));
  const command={operationId:randomUUID(),generation:moduleFlow.generation,clientId:'hidden-standard',sequence:1,action:'save',expectedRevision:moduleFlow.revision,equipmentTransferRevision:base.revision,
   moduleAction:'save-local-v1',input:{scopes:[{scope:'A:G-A',generation:flow.generation,baseId:flow.active.id,changes:[{patches,guards}]}],stateRevision:base.revision}};
  const saved=await hidden.call('ipqc-ab/workflow','POST',{command},'editor',200,'?caseMetadata=1'+moduleQuery);
  assert.deepEqual(hidden.flow(await hidden.read('ipqc-ab','editor',scope)).active,before);
  const req=await hidden.command('ipqc-ab','submit',{savedId:saved.receipt.savedId,reason:'Scoped synthetic hidden-stage equipment change'},'editor',200,moduleQuery);
  await hidden.command('ipqc-ab','approve',{caseId:req.receipt.caseId},'reviewer',200,moduleQuery);
  const active=hidden.flow(await hidden.read('ipqc-ab','editor',scope)).active;
  assert.equal(active.content.items.find(r=>r.id===item.id).equipmentId,'target');assert.equal(active.content.items[1].equipmentId,'source');
  const master=JSON.parse((await hidden.core.readState()).values.masterDataControl);assert(!master.active.AB.categoryGroups.find(g=>g.id==='group-G-A').defaultStages.includes('A-CUT'));
  result.push({module:'ipqc-ab',hiddenStage:true,guardedSingleSave:true,separateApproval:true,otherRowUnchanged:true});console.log('HIDDEN PASS');
 }finally{hidden.close();}
 if(process.env.EQUIPMENT_TEST_REPORT)fs.writeFileSync(process.env.EQUIPMENT_TEST_REPORT,JSON.stringify(result,null,2));
 }finally{h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
