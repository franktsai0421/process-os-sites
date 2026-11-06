/* Actual handlers with isolated SQLite/R2 and synthetic normal logins only. */
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./ipqc-c-operation-fixture.cjs');
const initial={schemaVersion:1,activeVersionId:null,source:null,issues:[],reservedErrorCodes:[],reservedItemCodes:[],versions:[{id:'initial',number:1,status:'draft',snapshot:{errors:[],items:[]},baseVersionId:null,revision:1,creatorId:'fixture',creatorName:'fixture',createdAt:'fixture',updatedAt:'fixture',history:[]}]};
const master={active:{C:{products:[{code:'C100',stages:['C-CUT']}],lines:[{stages:[{code:'C-CUT'}]}]}}};
(async()=>{
 const h=await fixture({ipqcCMasterControl:JSON.stringify(initial),masterDataControl:JSON.stringify(master)});
 try{
 await h.begin('ipqc-c');let sequence=0;
 const build=async(localChanges,who='editor')=>({action:'save',operationId:randomUUID(),clientId:'batch-'+who,sequence:++sequence,generation:h.flow(await h.read('ipqc-c')).generation,localChanges});
 const send=(command,who='editor',status=200)=>h.call('ipqc-c/workflow','POST',{command},who,status,'?caseMetadata=1');
 const malformed=[null,{},[null],[3],[{moduleAction:3}],[{input:null}],[{input:{item:[]}}],[{patches:[null]}],[{patches:[{op:'set',path:3,value:''}]}],[{guards:[null]}],[{guards:[{path:{},value:''}]}],[{guards:[{path:[null],value:''}]}]];
 for(const changes of malformed){const beforeInvalid=h.snapshot();const rejected=await send(await build(changes),'editor',422);assert.equal(rejected.error,'INVALID_LOCAL_SAVE');assert.match(rejected.requestId,/^[a-f0-9-]{36}$/i);assert.deepEqual(h.snapshot(),beforeInvalid,'malformed batch never writes DB/R2');}
 const create=[{moduleAction:'create-error',localId:'local-error-000001',input:{productCode:'C100',stageCode:'C-CUT',name:'尺寸',note:''}},{moduleAction:'create-item',localId:'local-item-000001',input:{errorId:'local-error-000001',item:{standard:'10',description:'Measure carefully',cpkEnabled:true,rule:{cadence:'batch',batchKind:'fixed_count',fixedCount:'3'}}}}];
 const command=await build(create),before=h.snapshot();const saved=await send(command);let flow=h.flow(saved);
 assert.equal(saved.revision,before.row.revision+1,'one CAS for creation + save');
 assert.equal(flow.working.items[0].errorId,flow.working.errors[0].id);assert.deepEqual(flow.working,flow.saved.content);assert.equal(flow.working.items[0].cpkEnabled,true);
 const after=h.snapshot();await send(command);assert.deepEqual(h.snapshot(),after,'exact retry is receipt-only');
 const item=flow.working.items[0];
 const edit=(field,value,old=item[field])=>({patches:[{op:'set',path:['items',{id:item.id},field],value}],guards:[{path:['items',{id:item.id},field],value:old}]});
 const a=await build([edit('note','A')]),b=await build([edit('description','B')],'edit-only');const savedA=h.flow(await send(a)).saved;flow=h.flow(await send(b,'edit-only'));assert.equal(savedA.actor.id,'preview-editor');assert.equal(flow.saved.actor.id,'preview-edit-only');assert.equal(savedA.content.items[0].description,item.description,'prior saved snapshot stays immutable');assert.equal(flow.saved.content.items[0].note,'A');assert.equal(flow.saved.content.items[0].description,'B');
 const clash=await build([edit('note','C')]),prior=h.snapshot();await send(clash,'editor',409);assert.deepEqual(h.snapshot(),prior,'conflicting batch leaves DB and R2 untouched');
 const mixed=await build([{...create[0],localId:'local-error-000002'},edit('note','bad')]);await send(mixed,'editor',409);assert.deepEqual(h.snapshot(),prior,'later failure rolls back allocation and all edits');
 const editOnly=await build([edit('note','edit-only','A')],'edit-only');flow=h.flow(await send(editOnly,'edit-only'));assert.equal(flow.saved.content.items[0].note,'edit-only');
 await h.command('ipqc-c','submit',{savedId:flow.saved.id},'edit-only',403);
 await send(await build([],'save-only'),'save-only',403);await send(await build(create,'edit-only'),'edit-only',403);
 const absentPhoto=await build([edit('mediaItems',[{id:'a'.repeat(64),name:'absent.png',note:'',afterParagraph:0}],[])]),priorPhoto=h.snapshot();await send(absentPhoto,'editor',422);assert.deepEqual(h.snapshot(),priorPhoto);
 const forgedSnapshot=await build([edit('equipmentSnapshot',{id:'forged',assetCode:'FORGED'},item.equipmentSnapshot)]),beforeForged=h.snapshot();const forbidden=await send(forgedSnapshot,'editor',422);assert.equal(forbidden.error,'UNSUPPORTED_ITEM_PATCH');assert.deepEqual(h.snapshot(),beforeForged,'client snapshot patches cannot write authority');
 const badEquipment=await build([edit('equipmentId','missing','')]);await send(badEquipment,'editor',422);
 // Real API: allocating a local item must not invalidate a later full child-set guard.
 for(const order of ['create-first','delete-first','peer-change','local-field-tamper','optional-field-tamper']){
  flow=h.flow(await send(await build([{...create[0],localId:'local-other-'+order}])));
  const other=flow.working.errors.at(-1),parent=flow.working.errors[0],baseItems=structuredClone(flow.working.items);
  const localId='local-newitem-'+order,template={...baseItems[0],id:localId,code:'尚未存取',errorId:parent.id,notApplicableReason:order==='delete-first'?'Retained creation note':''};
  const addition={moduleAction:'create-item',localId,input:{errorId:parent.id,item:template}};
  const removal={moduleAction:'delete-error',input:{id:other.id,cascade:true},guards:[{path:['errors',{id:other.id}],value:structuredClone(other)},{path:['items'],value:order==='delete-first'?baseItems:[...baseItems,structuredClone(template)]}]};
  const batch=await build(order==='delete-first'?[removal,addition]:[addition,removal]);
  if(order==='local-field-tamper')removal.guards[1].value.at(-1).standard='Changed guarded user field';
  if(order==='optional-field-tamper')removal.guards[1].value.at(-1).notApplicableReason='Changed guarded optional field';
  if(['peer-change','local-field-tamper','optional-field-tamper'].includes(order)){
   if(order==='peer-change')await send(await build([edit('note','peer changed child',baseItems[0].note)],'edit-only'),'edit-only');
   const beforeConflict=h.snapshot(),inputBefore=structuredClone(batch);
   const rejected=await send(batch,'editor',409);assert.equal(rejected.error,'DEPENDENCY_CHANGED_RECONFIRM');
   assert.deepEqual(h.snapshot(),beforeConflict,order+' rolls back allocation and delete');assert.deepEqual(batch,inputBefore,'rejection preserves original submitted input');
  }else{
   const priorBatch=h.snapshot(),result=await send(batch);flow=h.flow(result);
   assert.equal(result.revision,priorBatch.row.revision+1);assert.equal(flow.working.errors.find(row=>row.id===other.id).deleted,true);
   const added=flow.working.items.at(-1);assert.equal(added.errorId,parent.id);assert.notEqual(added.code,template.code);assert.equal(added.deleted,false);assert.equal(added.notApplicableReason,template.notApplicableReason);assert.deepEqual(flow.saved.content,flow.working);
   const committed=h.snapshot();await send(batch);assert.deepEqual(h.snapshot(),committed,'mixed create/delete retry preserves allocation and receipt');
  }
 }
 flow=h.flow(await h.read('ipqc-c'));
 const submitted=await h.command('ipqc-c','submit',{savedId:flow.saved.id,reason:'fixture'},'editor');
 await send(await build([]),'editor',409);assert.equal(h.flow(await h.read('ipqc-c')).pendingId,submitted.receipt.caseId);
 const fixed=JSON.parse((await h.core.readState()).values.ipqcCMasterControl).workflow.saved.content,fixedId=flow.saved.id,firstCase=submitted.receipt.caseId;
 await h.command('ipqc-c','approve',{caseId:firstCase},'editor',403);
 await h.command('ipqc-c','withdraw',{caseId:firstCase,reason:'isolated withdraw'},'editor');
 let resubmitted=await h.command('ipqc-c','submit',{savedId:fixedId,reason:'same fixed snapshot'},'editor');
 assert.notEqual(resubmitted.receipt.caseId,firstCase);
 const checked=JSON.parse((await h.core.readState()).values.ipqcCMasterControl).workflow;assert.deepEqual(checked.cases.at(-1).content,fixed);assert.equal(checked.cases.find(row=>row.id===firstCase).status,'withdrawn');
 await h.command('ipqc-c','return',{caseId:resubmitted.receipt.caseId,reason:'isolated return'},'reviewer');
 resubmitted=await h.command('ipqc-c','submit',{savedId:fixedId,reason:'same returned snapshot'},'editor');
 await h.command('ipqc-c','approve',{caseId:resubmitted.receipt.caseId},'reviewer');
 const approved=JSON.parse((await h.core.readState()).values.ipqcCMasterControl);
 assert.equal(approved.activeVersionId,resubmitted.receipt.caseId);assert.deepEqual(approved.versions.find(v=>v.id===approved.activeVersionId).snapshot,fixed);
 assert.equal(approved.workflow.cases.filter(row=>row.status==='approved').length,1);
 console.log('PASS atomic create/save, receipts, independent fields, conflict rollback, allocation rollback, edit-only save, submit separation, create gate, photo/equipment validation, both create/delete orders, peer child-set and local user-field conflict, pending lock, fixed snapshot withdraw/resubmit/return/approve');
 }finally{h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
