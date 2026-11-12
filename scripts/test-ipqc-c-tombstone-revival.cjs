/* Actual C handlers, synthetic normal accounts, private SQLite/R2; no network. */
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./ipqc-c-operation-fixture.cjs');
const error=(id,deleted=false)=>({id,code:'C100-C-CUT-'+id,productCode:'C100',stageCode:'C-CUT',name:id,note:'retained',reason:'',sourceRow:17,deleted});
const item=(id,errorId,flags={})=>({id,code:'C100-C-CUT-'+id,errorId,productCode:'C100',stageCode:'C-CUT',standard:'10',description:'retained',tool:'tool',method:'method',frequency:'each',note:'note',reason:'reason',standardEnabled:false,cpkEnabled:true,notApplicable:false,deleted:true,equipmentSnapshot:null,mediaItems:[],sourceRow:42,...flags});
const items=Array.from({length:8},(_,i)=>item('item'+i,'parent',{standardEnabled:!!(i&1),cpkEnabled:!!(i&2),notApplicable:!!(i&4),notApplicableReason:'Retain '+i,rule:{cadence:'batch',batchKind:'fixed_count',fixedCount:'3'},equipmentId:'retired-equipment',equipmentGroupId:'retired-group',equipmentSnapshot:{id:'retired-equipment',assetCode:'EQ1',pieceMark:'P',name:'old',spec:'retained'},mediaItems:[{id:'a'.repeat(64),name:'retained.png',note:'caption',afterParagraph:2}]}));
const snapshot={errors:[error('parent'),error('deleted-parent',true)],items:[...items,item('selected','deleted-parent'),item('predeleted','deleted-parent'),item('peer-added','deleted-parent')]};
const initial={schemaVersion:1,activeVersionId:null,source:null,issues:[],reservedErrorCodes:snapshot.errors.map(r=>r.code),reservedItemCodes:snapshot.items.map(r=>r.code),versions:[{id:'initial',number:1,status:'draft',snapshot,baseVersionId:null,revision:1,creatorId:'fixture',creatorName:'fixture',createdAt:'fixture',updatedAt:'fixture',history:[]}]};
const master={active:{C:{products:[{code:'C100',stages:['C-CUT']}],lines:[{stages:[{code:'C-CUT'}]}]}}};
const guard=(kind,row)=>({path:[kind,{id:row.id}],value:structuredClone(row)});
const revive=(working,id,kind='items')=>{const row=working[kind].find(r=>r.id===id);return {moduleAction:kind==='items'?'revive-item':'revive-error',input:{id},guards:[guard(kind,row),kind==='items'?guard('errors',working.errors.find(r=>r.id===row.errorId)):{path:['items'],value:structuredClone(working.items)}]};};
(async()=>{
 const h=await fixture({ipqcCMasterControl:JSON.stringify(initial),masterDataControl:JSON.stringify(master),referenceSentinel:JSON.stringify({process:{itemId:'selected',sourceVersionId:'fixed-version'},replacement:{itemId:'selected',versionId:'fixed-version'}})});
 try{
 await h.begin('ipqc-c');let seq=0;
 const read=async()=>h.flow(await h.read('ipqc-c'));
 const build=async changes=>{const f=await read();return {action:'save',operationId:randomUUID(),clientId:'revival-test',sequence:++seq,generation:f.generation,expectedRevision:f.revision,localChanges:changes};};
 const send=(c,who='editor',status=200)=>h.call('ipqc-c/workflow','POST',{command:c},who,status,'?caseMetadata=1');
 const reject=async(c,who='editor',status=409,code)=>{const before=h.snapshot();const result=await send(c,who,status);if(code)assert.equal(result.error,code);assert.deepEqual(h.snapshot(),before,'rejection is atomic');};
 let f=await read(),base=structuredClone(f.working);const change=revive(base,'item0');
 for(const who of ['viewer','edit-only','save-only','delete-only','edit-delete','no-view','create-only'])await reject(await build([change]),who,403);
 for(const [_label,alter,status,code]of [
 ['history selector',c=>c.restoreSaveId='old-history',422,'INVALID_LOCAL_SAVE'],
 ['revision omitted',c=>delete c.expectedRevision,409,'DRAFT_REVISION_REQUIRED'],['revision stale',c=>c.expectedRevision--,409,'DRAFT_REVISION_REQUIRED'],
 ['generation stale',c=>c.generation='stale',409,'STALE_GENERATION'],['row stale',c=>c.localChanges[0].guards[0].value.note='stale',409,'DEPENDENCY_CHANGED_RECONFIRM'],
 ['parent stale',c=>c.localChanges[0].guards[1].value.note='stale',409,'DEPENDENCY_CHANGED_RECONFIRM'],['no parent guard',c=>c.localChanges[0].guards.pop(),422,'DEPENDENCY_GUARD_REQUIRED'],
 ['missing row',c=>c.localChanges[0].input.id='absent',409,'ENTITY_REMOVED_OR_AMBIGUOUS'],['immutable code',c=>c.localChanges[0].input.code='forged',422,'INVALID_LOCAL_SAVE'],
 ['replacement',c=>c.localChanges[0].input.item={},422,'INVALID_LOCAL_SAVE'],['local id',c=>c.localChanges[0].localId='local-forged-0001',422,'INVALID_LOCAL_ID'],
 ['patch smuggling',c=>c.localChanges[0].patches=[],422,'INVALID_LOCAL_SAVE'],['unsupported',c=>c.localChanges[0].moduleAction='revive-all',422,'INVALID_LOCAL_SAVE'],
 ['missing guard',c=>c.localChanges[0].guards.shift(),422,'DEPENDENCY_GUARD_REQUIRED']]){const c=await build([structuredClone(change)]);alter(c);await reject(c,'editor',status,code);}
 await reject(await build(Array.from({length:257},()=>change)),'editor',422,'INVALID_LOCAL_SAVE');
 await reject({...await build([change]),reason:'x'.repeat(2_000_000)},'editor',413,'COMMAND_TOO_LARGE');
 const direct=await build([]);delete direct.localChanges;Object.assign(direct,change,{action:'apply'});await reject(direct,'editor',422,'INVALID_MODULE_ACTION');
 const failure=await build([change,{patches:[{op:'set',path:['items',{id:'item0'},'note'],value:'wrong'}],guards:[{path:['items',{id:'item0'},'note'],value:'stale'}]}]);await reject(failure);
 const boundedSave=h.load('lib/ipqc-c-save-record-mutation.ts'),boundedCreate=h.load('lib/ipqc-c-create-record-mutation.ts');
 const command=await build(items.map(i=>revive(base,i.id)));assert.equal(boundedSave.ipqcCSaveCommand(command),false);assert.equal(boundedCreate.ipqcCCreateCommand(command),false);
 const saved=await send(command,'edit-create');f=h.flow(saved);
 for(const old of items)assert.deepEqual(f.working.items.find(i=>i.id===old.id),{...old,deleted:false});
 const after=h.snapshot();const retry=await send(command,'edit-create');assert.deepEqual(retry.receipt,saved.receipt);assert.deepEqual(h.snapshot(),after);
 const lookup=await h.call('ipqc-c/workflow','GET',undefined,'edit-create',200,'?operationId='+command.operationId);assert.deepEqual(lookup.receipt,saved.receipt,'lost ACK original receipt');
 await reject({...command,reason:'different fingerprint'},'edit-create',409,'OPERATION_ID_REUSED');await reject(command,'editor',409,'OPERATION_ID_REUSED');
 await reject(await build([revive(base,'item0')]),'editor',409,'ENTITY_REMOVED_OR_AMBIGUOUS');
 const originalControl=JSON.parse((await h.core.readState()).values.ipqcCMasterControl),priorSaved=structuredClone(originalControl.workflow.saved),refs=(await h.core.readState()).values.referenceSentinel;
 base=structuredClone(f.working);const parentChange=revive(base,'deleted-parent','errors');
 await reject(await build([revive(base,'selected')]),'editor',409,'ENTITY_REMOVED_OR_AMBIGUOUS');
 const badChildSet=structuredClone(parentChange);badChildSet.guards[1].value.pop();await reject(await build([badChildSet]),'editor',409,'DEPENDENCY_CHANGED_RECONFIRM');
 const simulated=structuredClone(base);simulated.errors.find(e=>e.id==='deleted-parent').deleted=false;
 const groupCommand=await build([parentChange,revive(simulated,'selected'),{patches:[{op:'set',path:['items',{id:'selected'},'notApplicableReason'],value:'retained local optional'}],guards:[guard('items',{...simulated.items.find(i=>i.id==='selected'),deleted:false})]},{patches:[{op:'set',path:['items',{id:'selected'},'standardEnabled'],value:true}],guards:[{path:['items',{id:'selected'},'standardEnabled'],value:false}]}]);
 f=h.flow(await send(groupCommand,'edit-create'));assert.equal(f.working.items.find(i=>i.id==='selected').standardEnabled,true);
 for(const id of ['predeleted','peer-added'])assert.equal(f.working.items.find(i=>i.id===id).deleted,true);
 const control=JSON.parse((await h.core.readState()).values.ipqcCMasterControl);
 assert.deepEqual(control.reservedErrorCodes,initial.reservedErrorCodes);assert.deepEqual(control.reservedItemCodes,initial.reservedItemCodes);
 assert.deepEqual(control.workflow.saves.find(s=>s.id===priorSaved.id),priorSaved);assert.deepEqual(control.versions.find(v=>v.id==='initial').snapshot,initial.versions[0].snapshot);
 assert.equal((await h.core.readState()).values.referenceSentinel,refs);
 assert.equal(Object.keys(control.workflow.receipts).some(id=>id.includes('-local-')),false);
 // Deletion remains independent, even when the same account may revive.
 const row=f.working.items.find(i=>i.id==='selected');await reject(await build([{moduleAction:'delete-item',input:{id:row.id},guards:[guard('items',row)]}]),'edit-create',403);
 console.log('PASS C same-ID revival actual handlers: checkbox matrix, retained fields/media/equipment/sourceRow, strict guards, ACL, ordinary reader, atomic rollback, receipt retry, selected children, immutable history/references, allocation identity');
 }finally{h.close();}
 for(const mode of ['duplicate-id','duplicate-code','missing-parent','malformed-id','pending','photo','equipment','stale-sequence','cas-revision','cas-acl','session-revoked']){
  const content={errors:[error('parent')],items:[item('target','parent')]};
  if(mode==='duplicate-id')content.items.push({...content.items[0],code:'different'});
  if(mode==='duplicate-code')content.items.push({...content.items[0],id:'different'});
  if(mode==='missing-parent')content.items[0].errorId='missing';
  if(mode==='malformed-id')content.items.push({...content.items[0],id:42,code:'different'});
  const seed=structuredClone(initial);seed.versions[0].snapshot=content;
  const h=await fixture({ipqcCMasterControl:JSON.stringify(seed),masterDataControl:JSON.stringify(master)});
  try{
   await h.begin('ipqc-c');let f=h.flow(await h.read('ipqc-c'));
   const row=f.working.items[0],entry={moduleAction:'revive-item',input:{id:row.id},guards:[guard('items',row),guard('errors',f.working.errors[0])]};
   let command={action:'save',generation:f.generation,expectedRevision:f.revision,operationId:randomUUID(),clientId:'focused-revival',sequence:1,localChanges:[entry]};
   const send=(command,status=200)=>h.call('ipqc-c/workflow','POST',{command},'edit-create',status,'?caseMetadata=1');
   if(mode==='pending'){
    const saved=h.flow(await h.command('ipqc-c','save')).saved;await h.command('ipqc-c','submit',{savedId:saved.id,reason:'fixture'});
    f=h.flow(await h.read('ipqc-c'));command.expectedRevision=f.revision;
   }
   if(mode==='stale-sequence'){
    await send({...command,localChanges:[]});f=h.flow(await h.read('ipqc-c'));command={...command,operationId:randomUUID(),expectedRevision:f.revision};
   }
   if(['photo','cas-revision','cas-acl','session-revoked'].includes(mode))command.localChanges.push({patches:[{op:'set',path:['items',{id:'target'},'mediaItems'],value:[{id:'b'.repeat(64),name:'new.png',note:''}]}],guards:[{path:['items',{id:'target'},'mediaItems'],value:[]}]});
   if(mode==='equipment')command.localChanges.push({patches:[{op:'set',path:['items',{id:'target'},'equipmentId'],value:'missing'}],guards:[guard('items',{...row,deleted:false,equipmentSnapshot:null})]});
   let raced=false;
   if(['cas-revision','cas-acl','session-revoked'].includes(mode))h.env.STATE_ARCHIVE.head=async()=>{
    if(!raced){raced=true;const state=await h.core.readState(),values={...state.values};
     if(mode==='cas-revision'){const c=JSON.parse(values.ipqcCMasterControl);c.workflow.revision++;values.ipqcCMasterControl=JSON.stringify(c);}
     else{const users=JSON.parse(values.platformUsers);const user=users.find(u=>u.id==='preview-edit-create');if(mode==='cas-acl')user.accessOverrides['ipqc-c.create']=false;else user.authEpoch++;values.platformUsers=JSON.stringify(users);}
     const encoded=await h.load('lib/state-records.ts').encodeRecordValues(h.env.STATE_ARCHIVE,values);
     h.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(encoded);
    }return {};
   };
   const before=h.snapshot(),status=mode==='cas-acl'?403:mode==='session-revoked'?401:['photo','equipment'].includes(mode)?422:409;
   const result=await send(command,status);
   const code=mode==='pending'?'PENDING_LOCKED':mode==='photo'?'PHOTO_NOT_UPLOADED':mode==='equipment'?'EQUIPMENT_UNAVAILABLE':mode==='stale-sequence'?'STALE_CLIENT_OPERATION':mode==='cas-revision'?'DRAFT_REVISION_CHANGED_RECONFIRM':mode==='cas-acl'?'FORBIDDEN':mode==='session-revoked'?'LOGIN_REQUIRED':'ENTITY_REMOVED_OR_AMBIGUOUS';
   assert.equal(result.error,code,mode);
   if(!raced)assert.deepEqual(h.snapshot(),before,mode+' atomic rejection');
   const control=JSON.parse((await h.core.readState()).values.ipqcCMasterControl);
   assert.equal(control.workflow.working.items[0].deleted,true,mode+' never commits revival');
   assert.equal(control.workflow.receipts[command.operationId],undefined,mode+' never writes revival receipt');
   if(mode==='pending')assert.equal(control.workflow.cases[0].content.items[0].deleted,true,'fixed pending body unchanged');
  }finally{h.close();}
 }
 console.log('PASS malformed identity/code, missing parent, pending, new photo/equipment checks, sequence, shared CAS revision/ACL and session-revocation races');
 for(const absent of ['selected','unrelated-live','unrelated-deleted']){
  const content={errors:[error('parent')],items:[item('target','parent'),item('sibling','parent',{deleted:absent==='unrelated-deleted'})]};
  delete content.items[absent==='selected'?0:1].equipmentSnapshot;
  const seed=structuredClone(initial);seed.versions[0].snapshot=content;
  const h=await fixture({ipqcCMasterControl:JSON.stringify(seed),masterDataControl:JSON.stringify(master)});
  try{
   await h.begin('ipqc-c');const f=h.flow(await h.read('ipqc-c')),expected=structuredClone(f.working);expected.items[0].deleted=false;expected.items[0].notApplicableReason='local';
   const command={action:'save',generation:f.generation,expectedRevision:f.revision,operationId:randomUUID(),clientId:'legacy-revival',sequence:1,localChanges:[revive(f.working,'target'),{patches:[{op:'set',path:['items',{id:'target'},'notApplicableReason'],value:'local'}],guards:[guard('items',{...f.working.items[0],deleted:false})]}]};
   const result=await h.call('ipqc-c/workflow','POST',{command},'edit-create',200,'?caseMetadata=1');assert.deepEqual(h.flow(result).working,expected,absent+' exact optional presence through patch and Save');
   const before=h.snapshot();await h.call('ipqc-c/workflow','POST',{command},'edit-create',200,'?caseMetadata=1');assert.deepEqual(h.snapshot(),before);
  }finally{h.close();}
 }
 for(const mode of ['new-local','original-live']){
  const row=item('target','parent',{deleted:false,equipmentId:'',equipmentGroupId:''});
  const content={errors:[error('parent')],items:mode==='original-live'?[row]:[]},seed=structuredClone(initial);seed.versions[0].snapshot=content;
  const h=await fixture({ipqcCMasterControl:JSON.stringify(seed),masterDataControl:JSON.stringify(master)});
  try{
   await h.begin('ipqc-c');const f=h.flow(await h.read('ipqc-c')),changes=[];
   if(mode==='new-local'){Object.assign(row,{id:'local-new-target',code:'placeholder',tool:'',method:'',frequency:'',note:'',reason:'',standardEnabled:true,cpkEnabled:false});delete row.sourceRow;changes.push({moduleAction:'create-item',localId:row.id,input:{errorId:'parent',item:{standard:row.standard,description:row.description}}});}
   changes.push({moduleAction:'delete-item',input:{id:row.id},guards:[guard('items',row)]},{moduleAction:'revive-item',input:{id:row.id},guards:[guard('items',{...row,deleted:true}),guard('errors',content.errors[0])]});
   const command={action:'save',generation:f.generation,expectedRevision:f.revision,operationId:randomUUID(),clientId:'preimage-revival',sequence:1,localChanges:changes},before=h.snapshot();
   const result=await h.call('ipqc-c/workflow','POST',{command},'editor',409,'?caseMetadata=1');assert.equal(result.error,'ENTITY_REMOVED_OR_AMBIGUOUS');assert.deepEqual(h.snapshot(),before,mode+' cannot become revival source');
  }finally{h.close();}
 }
 for(const mode of ['item','group','twice','absent','cas-retry','tampered-snapshot','tampered-note','tampered-source','missing-revision','stale-revision','wrong-origin','wrong-id','unrelated-normalization','no-delete']){
  const row=item('target','parent',{deleted:false,equipmentId:''}),sibling=item('sibling','parent',{deleted:false,equipmentId:''});
  if(mode==='absent')delete row.equipmentSnapshot;
  if(mode==='unrelated-normalization')delete sibling.equipmentSnapshot;
  const content={errors:[error('parent')],items:[row,sibling]},seed=structuredClone(initial);seed.versions[0].snapshot=content;
  const equipment={activeVersionId:'approved-eq',versions:[{id:'approved-eq',status:'approved',equipment:['eq1','eq2'].map(id=>({id,enabled:true,assetCode:id,name:id}))}]};
  const h=await fixture({ipqcCMasterControl:JSON.stringify(seed),masterDataControl:JSON.stringify(master),routineEquipmentControl:JSON.stringify(equipment)});
  try{
   await h.begin('ipqc-c');const f=h.flow(await h.read('ipqc-c')),patch=(id,value,old)=>({patches:[{op:'set',path:['items',{id},'equipmentId'],value}],guards:[{path:['items',{id},'equipmentId'],value:old}]}),changes=[];
   if(mode==='wrong-origin')changes.push({patches:[{op:'set',path:['items',{id:'target'},'note'],value:'local'}],guards:[{path:['items',{id:'target'},'note'],value:row.note}]});
   else changes.push(patch(mode==='wrong-id'?'sibling':'target','eq1',''));
   if(mode==='twice')changes.push(patch('target','eq2','eq1'));
   const guarded={...row,equipmentId:mode==='twice'?'eq2':'eq1'};
   if(mode==='wrong-origin'){guarded.equipmentId='';guarded.note='local';guarded.equipmentSnapshot={id:'forged'};}
   if(mode==='tampered-snapshot')guarded.equipmentSnapshot={id:'forged'};
   if(mode==='tampered-note')guarded.note='forged';
   if(mode==='tampered-source')guarded.sourceRow=99;
   const group=['group','unrelated-normalization'].includes(mode);
   changes.push(group?{moduleAction:'delete-error',input:{id:'parent',cascade:true},guards:[guard('errors',content.errors[0]),{path:['items'],value:[guarded,sibling]}]}:{moduleAction:'delete-item',input:{id:'target'},guards:[guard('items',guarded)]});
   const command={action:'save',generation:f.generation,expectedRevision:f.revision,operationId:randomUUID(),clientId:'equipment-delete',sequence:1,localChanges:changes};
   if(mode==='missing-revision')delete command.expectedRevision;
   if(mode==='stale-revision')command.expectedRevision++;
   let attempts=0;
   if(mode==='cas-retry'){const prepare=h.env.DB.prepare.bind(h.env.DB);h.env.DB.prepare=sql=>{const statement=prepare(sql);if(/UPDATE shared_state SET/.test(sql)){const run=statement.run.bind(statement);statement.run=async()=>++attempts===1?{meta:{changes:0}}:run();}return statement;};}
   const success=['item','group','twice','absent','cas-retry','unrelated-normalization'].includes(mode),before=h.snapshot();
   const result=await h.call('ipqc-c/workflow','POST',{command},mode==='no-delete'?'edit-create':'editor',success?200:mode==='no-delete'?403:409,'?caseMetadata=1');
   if(mode==='cas-retry')assert.equal(attempts,2);
   if(success){const current=h.flow(result).working.items[0];assert.equal(current.deleted,true);assert.equal(current.equipmentSnapshot.id,mode==='twice'?'eq2':'eq1');assert.equal(current.sourceRow,row.sourceRow);const saved=h.snapshot();await h.call('ipqc-c/workflow','POST',{command},'editor',200,'?caseMetadata=1');assert.deepEqual(h.snapshot(),saved);}
   else assert.deepEqual(h.snapshot(),before,mode+' never relaxes guards');
  }finally{h.close();}
 }
 for(const absent of ['selected','unrelated-live','unrelated-deleted']){
  const content={errors:[error('parent')],items:[item('target','parent',{deleted:false}),item('sibling','parent',{deleted:absent==='unrelated-deleted'})]};
  delete content.items[absent==='selected'?0:1].equipmentSnapshot;
  const seed=structuredClone(initial);seed.versions[0].snapshot=content;
  const h=await fixture({ipqcCMasterControl:JSON.stringify(seed),masterDataControl:JSON.stringify(master)});
  try{
   await h.begin('ipqc-c');const f=h.flow(await h.read('ipqc-c')),expected=structuredClone(f.working);expected.items[0].note='local';
   const command={action:'save',generation:f.generation,expectedRevision:f.revision,operationId:randomUUID(),clientId:'legacy-delete',sequence:1,localChanges:[{patches:[{op:'set',path:['items',{id:'target'},'note'],value:'local'}],guards:[{path:['items',{id:'target'},'note'],value:f.working.items[0].note}]},{moduleAction:'delete-item',input:{id:'target'},guards:[guard('items',expected.items[0])]}]};
   expected.items[0].deleted=true;
   const result=await h.call('ipqc-c/workflow','POST',{command},'editor',200,'?caseMetadata=1');assert.deepEqual(h.flow(result).working,expected,absent+' exact absence through scalar/delete/Save');assert.deepEqual(h.flow(result).saved.content,expected);
  }finally{h.close();}
 }
 console.log('PASS legacy optional metadata preservation, original tombstone preimage, equipment-origin deletion guards and exact rejection boundaries');
})().catch(e=>{console.error(e);process.exitCode=1;});
