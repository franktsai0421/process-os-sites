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
 const badEquipment=await build([edit('equipmentId','missing','')]);await send(badEquipment,'editor',422);
 const submitted=await h.command('ipqc-c','submit',{savedId:flow.saved.id,reason:'fixture'},'editor');
 await send(await build([]),'editor',409);assert.equal(h.flow(await h.read('ipqc-c')).pendingId,submitted.receipt.caseId);
 console.log('PASS atomic create/save, receipts, independent fields, conflict rollback, allocation rollback, edit-only save, submit separation, create gate, photo/equipment validation, pending lock');
 }finally{h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
