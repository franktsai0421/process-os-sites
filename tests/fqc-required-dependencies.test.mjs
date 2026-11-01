import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {setup,send,nameEdit,storedRow,storedEnvelope,updateEnvelope,rawRef,replaceAggregate,injectRequiredFault,resetEvents,noMutation,businessRefSet,authKeys,requiredKeys,setupCapability,makeCapability} from './fqc-required-dependencies-fixture.mjs';
const fixture=createRequire(import.meta.url)('../scripts/fqc-apply-fixture.cjs');
const endpoint='/api/fqc/workflow?caseMetadata=1&compact=1';
const edit=()=>({patches:[{op:'set',path:['errors',{id:'error'},'name'],value:'Scoped change'}],guards:[{path:['errors',{id:'error'},'name'],value:'Synthetic error'}]});
const envelope=f=>JSON.parse(f.db.prepare('SELECT "values" FROM shared_state WHERE id=1').get().values);

// Intentional policy RED on merged v30: unrelated aggregate faults previously
// blocked FQC. The newly authorized dependency scope must not read that data.
for(const action of ['apply','save'])void test(`FQC required dependency policy: ${action} ignores an unread unrelated aggregate fault`,async()=>{
 const f=await fixture();try{
  const a=f.realm(),begun=await a.client.begin();
  await f.mutate(values=>{values.syntheticUnrelatedControl=JSON.stringify({content:{note:'Unrelated synthetic data'}});});
  const before=envelope(f),unrelated=before.__processRecords.values.syntheticUnrelatedControl;
  f.hooks.get=key=>{if(key===unrelated.key)throw Error('SYNTHETIC_UNRELATED_UNAVAILABLE');};
  const command=a.client.prepare(begun.control.workflow.generation,action,action==='apply'?edit():{});
  f.events.length=0;const response=await f.call(endpoint,{method:'POST',body:JSON.stringify({command})});
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert(!f.events.some(e=>e.kind==='get'&&e.key===unrelated.key),'unrelated aggregate must remain unread, not optimistically validated');
  assert.deepEqual(envelope(f).__processRecords.values.syntheticUnrelatedControl,unrelated,'unread pointer remains byte-equivalent');
 }finally{f.close();}
});

void test('FQC required dependency policy: denied edit cannot fetch any business aggregate',async()=>{
 const f=await fixture();try{
  const a=f.realm(),begun=await a.client.begin();
  await f.mutate(values=>{const users=JSON.parse(values.platformUsers);users[0].accessOverrides['fqc.edit']=false;values.platformUsers=JSON.stringify(users);});
  const manifest=envelope(f).__processRecords.values,business=new Set(['qualityMasterControl','masterDataControl','routineEquipmentControl'].map(key=>manifest[key].key));
  const command=a.client.prepare(begun.control.workflow.generation,'apply',edit());
  f.events.length=0;const response=await f.call(endpoint,{method:'POST',body:JSON.stringify({command})});
  assert.equal(response.status,403);assert.equal((await response.json()).error,'FORBIDDEN');
  assert.equal(f.events.filter(e=>e.kind==='get'&&business.has(e.key)).length,0,'authorization must precede business hydration');
 }finally{f.close();}
});

for(const key of requiredKeys)for(const mode of ['missing','sha','json'])void test(`FQC required ${key} ${mode} fault fails closed without writes`,async()=>{
 const context=await setup(),{f}=context;try{
  injectRequiredFault(f,key,mode);const before=storedRow(f);resetEvents(f);
  const response=await send(context);assert(response.status>=400,`required ${key}/${mode} was accepted`);noMutation(f,before);
  if(authKeys.includes(key)){const business=businessRefSet(f);assert(!f.events.some(event=>event.kind==='get'&&business.has(event.key)),'bad authority cannot fetch business aggregates');}
 }finally{f.close();}
});

for(const key of requiredKeys)void test(`FQC required ${key} transient fault cannot fall back to a second successful read`,async()=>{
 const context=await setup(),{f}=context;try{
  const target=storedEnvelope(f).__processRecords.values[key].key;let reads=0;
  f.hooks.get=received=>{if(received===target&&++reads===1)throw Error('SYNTHETIC_FIRST_READ_FAILED');};
  const before=storedRow(f);resetEvents(f);const response=await send(context);
  assert(response.status>=400,'a required fault is not unsupported-format evidence');assert.equal(reads,1);noMutation(f,before);
 }finally{f.close();}
});

for(const action of ['apply','save'])for(const mode of ['missing','sha','invalid-ref'])void test(`FQC ${action} retains unread unrelated ${mode} pointer and full reader still detects it`,async()=>{
 const context=await setup(),{f}=context;try{
  await f.mutate(values=>{values.syntheticUnrelatedControl=JSON.stringify({content:{note:'Synthetic unrelated content'}});});
  if(mode==='invalid-ref')updateEnvelope(f,value=>{value.__processRecords.values.syntheticUnrelatedControl={key:'synthetic-invalid-ref',sha256:'invalid'};});
  else injectRequiredFault(f,'syntheticUnrelatedControl',mode);
  const before=storedEnvelope(f),pointer=before.__processRecords.values.syntheticUnrelatedControl;resetEvents(f);
  const response=await send(context,action,action==='apply'?nameEdit():{});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert(!f.events.some(event=>event.kind==='get'&&event.key===pointer.key),'excluded aggregate must never be fetched');
  const after=storedEnvelope(f);assert.deepEqual(after.__processRecords.values.syntheticUnrelatedControl,pointer);
  assert.deepEqual(after.__processRecords.legacySources,before.__processRecords.legacySources);
  await assert.rejects(f.core.readState(),'the original full integrity reader must still observe excluded damage');
 }finally{f.close();}
});

for(const cell of ['view','save','create','delete'])void test(`FQC denied ${cell} precedes all business hydration`,async()=>{
 const context=await setup(),{f}=context;try{
  await f.mutate(values=>{const users=JSON.parse(values.platformUsers);users[0].accessOverrides['fqc.'+cell]=false;values.platformUsers=JSON.stringify(users);});
  const business=businessRefSet(f),before=storedRow(f);resetEvents(f);
  const detail=cell==='create'?{patches:[{op:'insert',path:['errors'],value:{id:'new-error',name:'Synthetic new',category:'SYN',line:'A'}}]}:cell==='delete'?{patches:[{op:'set',path:['items',{id:'item'},'isDeleted'],value:true}],guards:[{path:['items',{id:'item'},'isDeleted'],value:false}]}:nameEdit();
  const response=await send(context,cell==='save'?'save':'apply',cell==='save'?{}:detail);assert.equal(response.status,403);assert.equal((await response.json()).error,'FORBIDDEN');
  assert(!f.events.some(event=>event.kind==='get'&&business.has(event.key)));noMutation(f,before);
 }finally{f.close();}
});

for(const mode of ['absent','stale-valid'])void test(`FQC ${mode} platformUsers mirror cannot replace verified authority`,async()=>{
 const context=await setup(),{f}=context;try{
  updateEnvelope(f,value=>{if(mode==='absent')delete value.platformUsers;else value.platformUsers='[]';});
  const response=await send(context);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  const expanded=f.load('lib/workflow-wire.ts').expandWorkflowPayload(await response.json());assert.equal(expanded.control.workflow.working.errors[0].name,'Scoped change');
 }finally{f.close();}
});

for(const mode of ['malformed','non-string'])void test(`FQC ${mode} inline authority metadata fails before business hydration`,async()=>{
 const context=await setup(),{f}=context;try{
  updateEnvelope(f,value=>{value.platformUsers=mode==='malformed'?'[':{unexpected:true};});
  const before=storedRow(f),business=businessRefSet(f);resetEvents(f);const response=await send(context);
  assert(response.status>=400);assert(!f.events.some(event=>event.kind==='get'&&business.has(event.key)));noMutation(f,before);
 }finally{f.close();}
});

for(const override of ['0','1','bad-json','bad-type'])void test(`FQC maintenance override ${override} retains precedence and validation`,async()=>{
 const context=await setup(),{f}=context;try{
  replaceAggregate(f,'maintenanceMode',override==='0'?'1':'0');
  updateEnvelope(f,value=>{value.maintenanceMode=override==='bad-json'?'[':override==='bad-type'?{unexpected:true}:override;});
  const before=storedRow(f),business=businessRefSet(f);resetEvents(f);const response=await send(context);
  if(override==='0')assert.equal(response.status,200);
  else{assert(override==='1'?response.status===503:response.status>=400);assert(!f.events.some(event=>event.kind==='get'&&business.has(event.key)));noMutation(f,before);}
 }finally{f.close();}
});

void test('FQC authority literal immutable-body names are not mistaken for actual references',async()=>{
 const context=await setup(),{f}=context;try{
  replaceAggregate(f,'processAccessControl',JSON.stringify({note:'__immutableBody',ordinary:{__immutableBody:'ordinary text'}}));
  const response=await send(context);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 }finally{f.close();}
});

void test('FQC authority actual immutable-body reference is rejected without following its body',async()=>{
 const context=await setup(),{f}=context;try{
  const forbidden=rawRef(f,JSON.stringify({note:'Synthetic forbidden authority body'}));
  replaceAggregate(f,'processAccessControl',JSON.stringify({nested:{__immutableBody:forbidden}}));
  const before=storedRow(f);resetEvents(f);const response=await send(context);
  assert(response.status>=400);assert(!f.events.some(event=>event.kind==='get'&&event.key===forbidden.key));noMutation(f,before);
 }finally{f.close();}
});

void test('FQC missing shared-state row fails on one SELECT, never retries a possibly different snapshot',async()=>{
 const context=await setup(),{f}=context;try{
  f.db.prepare('DELETE FROM shared_state WHERE id=1').run();resetEvents(f);const response=await send(context);
  assert(response.status>=400);assert.equal(f.events.filter(event=>event.kind==='read'&&event.sql.includes('FROM shared_state')).length,1);
  assert.equal(f.events.filter(event=>event.kind==='get'||event.kind==='put').length,0);assert(!storedRow(f));
 }finally{f.close();}
});

void test('FQC opaque root metadata and non-target manifest references survive the scoped overlay',async()=>{
 const context=await setup(),{f}=context;try{
  updateEnvelope(f,value=>{value.syntheticRootMetadata={version:7,notes:['retained']};value.__processRecords.syntheticManifestMetadata={proof:'not an integrity claim'};value.__processRecords.values.syntheticOpaque={key:'synthetic-unverified',sha256:'unknown'};});
  const before=storedEnvelope(f);resetEvents(f);const response=await send(context);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  const after=storedEnvelope(f);assert.deepEqual(after.syntheticRootMetadata,before.syntheticRootMetadata);assert.deepEqual(after.__processRecords.syntheticManifestMetadata,before.__processRecords.syntheticManifestMetadata);
  for(const[key,ref]of Object.entries(before.__processRecords.values))if(key!=='qualityMasterControl')assert.deepEqual(after.__processRecords.values[key],ref,key);
  assert.deepEqual(after.__processRecords.legacySources,before.__processRecords.legacySources);
  for(const[key,ref]of Object.entries(before.__processRecords.allocations||{}))if(key!=='qualityMasterControl')assert.deepEqual(after.__processRecords.allocations[key],ref,key);
  assert(!f.events.some(event=>event.kind==='get'&&event.key==='synthetic-unverified'));
 }finally{f.close();}
});

void test('FQC whole-quality closure keeps required sibling body faults blocking',async()=>{
 const context=await setup(),{f}=context;try{
  await f.mutate(values=>{const quality=JSON.parse(values.qualityMasterControl);quality.libraries.syntheticSibling={activeVersionId:'sibling-active',versions:[{id:'sibling-active',number:1,status:'approved',snapshot:{errors:[],items:[],note:'Synthetic sibling body'}}]};values.qualityMasterControl=JSON.stringify(quality);});
  const qualityRef=storedEnvelope(f).__processRecords.values.qualityMasterControl,quality=JSON.parse(f.objects.get(qualityRef.key).toString());
  const body=quality.libraries.syntheticSibling.versions[0].snapshot.__immutableBody;assert(body);f.objects.delete(body.key);
  const before=storedRow(f);resetEvents(f);const response=await send(context);assert(response.status>=400);noMutation(f,before);
 }finally{f.close();}
});

void test('FQC ordinary Apply families and explicit Save all work with unread unrelated data',async()=>{
 const context=await setup(),{f,a,generation}=context;try{
  await f.mutate(values=>{
   values.syntheticUnrelatedControl=JSON.stringify({content:{note:'Unrelated synthetic content'}});
   const equipment=JSON.parse(values.routineEquipmentControl);equipment.versions[0].equipment.push({id:'new-equipment',assetCode:'SYN-EQ',pieceMark:'SYN-M2',name:'Synthetic target',enabled:true});values.routineEquipmentControl=JSON.stringify(equipment);
  });
  const ref=storedEnvelope(f).__processRecords.values.syntheticUnrelatedControl;f.hooks.get=key=>{if(key===ref.key)throw Error('SYNTHETIC_UNRELATED_UNAVAILABLE');};
  const item=f.snapshot().items[0],set=(collection,id,field,value,before)=>({patches:[{op:'set',path:[collection,{id},field],value}],guards:[{path:[collection,{id},field],value:before}]});
  /** @type {Array<[label: string, detail: {patches: Array<Record<string, unknown>>, guards?: Array<Record<string, unknown>>}]>} */
  const actions=[
   ['edit error',nameEdit()],
   ['edit item',set('items','item','name','Edited item','Synthetic item')],
   ['insert error',{patches:[{op:'insert',path:['errors'],value:{id:'new-error',name:'New error',category:'SYN',line:'A',isDeleted:false}}]}],
   ['insert item',{patches:[{op:'insert',path:['items'],value:{...item,id:'new-item',errorId:'new-error',name:'New item',checkNo:'',isDeleted:false}}]}],
   ['batch assign',{patches:['item','new-item'].map(id=>({op:'set',path:['items',{id},'productCodes'],value:['SYN-P']})),guards:['item','new-item'].map(id=>({path:['items',{id},'productCodes'],value:[]}))}],
   ['matrix remove',set('items','item','productCodes',[],['SYN-P'])],
   ['equipment replace',{patches:[{op:'set',path:['items',{id:'item'},'equipmentId'],value:'new-equipment'},{op:'set',path:['items',{id:'item'},'tool'],value:'SYN-M2'}],guards:[{path:['items',{id:'item'},'equipmentId'],value:undefined},{path:['items',{id:'item'},'tool'],value:'目視檢查'}]}],
   ['soft delete',{patches:[{op:'set',path:['items',{id:'new-item'},'isDeleted'],value:true},{op:'set',path:['errors',{id:'new-error'},'isDeleted'],value:true}],guards:[{path:['items',{id:'new-item'},'isDeleted'],value:false},{path:['errors',{id:'new-error'},'isDeleted'],value:false}]}],
  ];
  let current;resetEvents(f);
  for(const[label,detail]of actions){
   const result=await a.client.command(generation,'apply',detail);current=result.control.workflow;
   assert.equal(current.saved,null,label+' must not silently Save');assert.equal(current.active.content.errors[0].name,'Synthetic error',label+' must not change active');
   assert(a.client.verifiedReadback(result,result.receipt.operationId),label+' requires the genuine terminal GET');assert.equal(a.client.hasUnknown(),false);
  }
  assert.equal(current.working.errors[0].name,'Scoped change');assert.equal(current.working.items[0].name,'Edited item');
  assert.equal(current.working.items[0].equipmentId,'new-equipment');assert.equal(current.working.items[0].equipmentSnapshot.pieceMark,'SYN-M2');
  assert(current.working.errors.find(row=>row.id==='new-error').isDeleted);assert(current.working.items.find(row=>row.id==='new-item').isDeleted);
  const saved=await a.client.command(generation,'save');assert.deepEqual(saved.control.workflow.saved.content,current.working);
  const reloaded=f.realm(),reload=await reloaded.client.read();assert.deepEqual(JSON.parse(JSON.stringify(reload.control.workflow.saved.content)),JSON.parse(JSON.stringify(current.working)));assert.equal(reloaded.client.hasUnknown(),false);
  assert(!f.events.some(event=>event.kind==='get'&&event.key===ref.key));assert.deepEqual(storedEnvelope(f).__processRecords.values.syntheticUnrelatedControl,ref);
 }finally{f.close();}
});

void test('FQC insert without allocation index still reads retained history and never reuses a reserved number',async()=>{
 const context=await setup(),{f}=context;try{
  await f.mutate(values=>{
   values.syntheticUnrelatedControl=JSON.stringify({note:'Unrelated synthetic content'});
   const quality=JSON.parse(values.qualityMasterControl),snapshot=f.snapshot();snapshot.errors[0].code='SYN-FQC-L99';snapshot.errors[0].id='historical-error';snapshot.items=[];
   quality.libraries.fqc.versions.push({id:'historical',number:'V99',status:'superseded',snapshot,revision:1,creatorId:'editor',creatorName:'Synthetic editor',createdAt:'synthetic',updatedAt:'synthetic',history:[]});values.qualityMasterControl=JSON.stringify(quality);
  });
  updateEnvelope(f,value=>{delete value.__processRecords.allocations.qualityMasterControl;});
  const before=storedEnvelope(f),quality=JSON.parse(f.objects.get(before.__processRecords.values.qualityMasterControl.key).toString()),historical=quality.libraries.fqc.versions.find(version=>version.id==='historical').snapshot.__immutableBody;
  f.hooks.get=key=>{if(key===before.__processRecords.values.syntheticUnrelatedControl.key)throw Error('SYNTHETIC_UNRELATED_UNAVAILABLE');};resetEvents(f);
  const response=await send(context,'apply',{patches:[{op:'insert',path:['errors'],value:{id:'new-error',name:'New error',category:'SYN',line:'A'}}]});
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));const expanded=f.load('lib/workflow-wire.ts').expandWorkflowPayload(await response.json());assert.equal(expanded.control.workflow.working.errors.find(row=>row.id==='new-error').code,'SYN-FQC-L100');
  assert(f.events.some(event=>event.kind==='get'&&event.key===historical.key),'without an index the original complete FQC history remains necessary');
 }finally{f.close();}
});

void test('FQC selected snapshot revision change retries into current permission before another business read',async()=>{
 const context=await setup(),{f}=context;try{
  const qualityKey=storedEnvelope(f).__processRecords.values.qualityMasterControl.key,business=businessRefSet(f);let changed=false,concurrentWrite=false,businessReads=0;
  f.hooks.get=async key=>{if(!concurrentWrite&&business.has(key))businessReads++;if(changed||key!==qualityKey)return;changed=true;concurrentWrite=true;try{await f.mutate(values=>{const users=JSON.parse(values.platformUsers);users[0].accessOverrides['fqc.edit']=false;values.platformUsers=JSON.stringify(users);});}finally{concurrentWrite=false;}};
  resetEvents(f);const response=await send(context);assert.equal(response.status,403);assert(changed);
  // The fixture's deliberate concurrent write is separate from attempted FQC CAS.
  assert.equal(f.events.filter(event=>event.kind==='sql'&&event.sql.startsWith('UPDATE shared_state')).length,0);assert.equal(businessReads,3,'retry must reject current permission before a second business read');
  f.hooks.get=null;assert.equal((await f.state()).workflow.working.errors[0].name,'Synthetic error');
 }finally{f.close();}
});

void test('FQC revocation at the fresh prebody gate forbids all business hydration',async()=>{
 const context=await setup(),{f}=context;try{
  const business=businessRefSet(f),before=storedRow(f);let revocationReads=0;
  f.hooks.sql=sql=>{if(sql.includes('process_revoked_sessions')&&++revocationReads===2)f.revoke();};
  resetEvents(f);const response=await send(context);assert.equal(response.status,401);assert.equal(revocationReads,2);
  assert(!f.events.some(event=>event.kind==='get'&&business.has(event.key)));noMutation(f,before);
 }finally{f.close();}
});

for(const mode of ['missing','sha','json'])void test(`FQC required allocation ${mode} fault blocks Apply and Save before immutable writes`,async()=>{
 for(const action of ['apply','save']){const context=await setup(),{f}=context;try{
  const ref=storedEnvelope(f).__processRecords.allocations.qualityMasterControl;assert(ref);
  if(mode==='missing')f.objects.delete(ref.key);
  else if(mode==='sha')f.objects.set(ref.key,Buffer.from('{"synthetic":"wrong index SHA"}'));
  else{const broken=rawRef(f,'[');updateEnvelope(f,value=>{value.__processRecords.allocations.qualityMasterControl=broken;});}
  const before=storedRow(f);resetEvents(f);const response=await send(context,action,action==='apply'?nameEdit():{});
  assert(response.status>=400,action+' accepted a damaged required allocation index');noMutation(f,before);
 }finally{f.close();}}
});

void test('FQC private writer rejects forged state, changed command, and provenance tampering',async()=>{
 const context=await setupCapability(),{f}=context;
 try{
  const variants={
   'cloned state':cap=>({state:{...cap.state}}),
   'changed command':cap=>{cap.command.patches[0].value='Changed after binding';},
   'changed revision':cap=>{cap.state.revision++;},
   'changed manifest':cap=>{cap.state.recordStorage.envelope.syntheticTamper=true;},
   'changed values':cap=>({values:{...cap.values,platformUsers:'[]'}}),
   'new unverified known hash':cap=>{cap.state.recordStorage.known.add('a'.repeat(64));},
   'replaced model map':cap=>{cap.state.recordStorage.models=new Map();},
   'changed sibling library':cap=>{cap.models.get('qualityMasterControl').libraries.syntheticSibling={untrusted:true};},
   'changed sealed working':cap=>{cap.result.state.working.errors[0].name='Changed after seal';},
   'changed sealed receipt':cap=>{cap.result.state.receipts[cap.command.operationId].result.revision++;},
  };
  for(const[label,change]of Object.entries(variants)){
   const cap=await makeCapability(context),overrides=change(cap),before=storedRow(f);resetEvents(f);
   await assert.rejects(cap.encode(overrides),undefined,label);noMutation(f,before);
  }
  const cap=await makeCapability(context),before=storedRow(f);resetEvents(f);
  assert.throws(()=>cap.required.captureFqcRequiredBasis(cap.state,{...cap.command},cap.control),/binding/);noMutation(f,before);
 }finally{f.close();}
});

for(const action of ['apply','save'])void test(`FQC private ${action} capability cannot alter protected content, old receipts, or another client`,async()=>{
 const context=await setupCapability(action),{f}=context;
 try{
  const common={
   'active content':cap=>{cap.result.state.active.content.errors[0].name='Forged active';},
   'existing history':cap=>{cap.result.state.saves[0].reason='Forged old history';},
   'existing receipt':cap=>{delete cap.result.state.receipts[context.peerReceiptId];},
   'foreign client sequence':cap=>{cap.result.state.sequences[context.peerSequenceKey]=999;},
  };
  const variants=action==='apply'?{...common,'saved content':cap=>{cap.result.state.saved.content.errors[0].name='Forged saved';}}:{...common,'working content':cap=>{cap.result.state.working.errors[0].name='Forged working';}};
  for(const[label,change]of Object.entries(variants)){
   const cap=await makeCapability(context,action,{seal:false}),before=storedRow(f);change(cap);resetEvents(f);
   await assert.rejects(async()=>{cap.seal();await cap.encode();},undefined,label);noMutation(f,before);
  }
 }finally{f.close();}
});

for(const action of ['apply','save'])void test(`FQC private ${action} encoding is single-use and leaves unrelated refs untouched`,async()=>{
 const context=await setupCapability(action),{f}=context;try{
  const cap=await makeCapability(context,action),before=storedEnvelope(f),row=storedRow(f);resetEvents(f);
  await assert.rejects(f.records.encodeRecordValues(f.env.STATE_ARCHIVE,cap.values,cap.state.recordStorage,cap.models),/Partial read cannot be saved/);
  assert.equal(f.events.filter(event=>event.kind==='put').length,0);
  const encoded=JSON.parse(await cap.encode());assert.notDeepEqual(encoded.__processRecords.values.qualityMasterControl,before.__processRecords.values.qualityMasterControl);
  for(const[key,ref]of Object.entries(before.__processRecords.values))if(key!=='qualityMasterControl')assert.deepEqual(encoded.__processRecords.values[key],ref,key);
  assert.deepEqual(encoded.__processRecords.legacySources,before.__processRecords.legacySources);assert.deepEqual(storedRow(f),row,'encoding is not a CAS');
  const putCount=f.events.filter(event=>event.kind==='put').length;assert(putCount>0);
  await assert.rejects(cap.encode(),/binding|handle/);assert.equal(f.events.filter(event=>event.kind==='put').length,putCount);
 }finally{f.close();}
});

void test('FQC low-level handles reject forged handle, wrong bucket, revision, and storage identity',async()=>{
 const context=await setupCapability(),{f}=context;try{
  for(const mode of ['handle','bucket','revision','storage']){
   const cap=await makeCapability(context,'apply',{lowLevel:true}),before=storedRow(f);resetEvents(f);
   const overrides=mode==='handle'?{handle:Object.freeze({})}:mode==='bucket'?{bucket:{...f.env.STATE_ARCHIVE}}:mode==='revision'?{revision:cap.state.revision+1}:{storage:{...cap.state.recordStorage}};
   await assert.rejects(cap.encode(overrides),/handle/);noMutation(f,before);
  }
 }finally{f.close();}
});

for(const field of ['action','allocate'])void test(`FQC low-level reader pins ${field} across authorization callback`,async()=>{
 const context=await setup(),{f,a,generation}=context;try{
  const command=a.client.prepare(generation,'apply',nameEdit()),selection={action:'apply',allocate:false},before=storedRow(f),business=businessRefSet(f);resetEvents(f);
  await assert.rejects(f.records.readFqcRequiredRecordMutation(f.env.STATE_ARCHIVE,storedEnvelope(f),before.revision,selection,()=>{
   if(field==='action')selection.action='save';else selection.allocate=true;
   return Promise.resolve({actorId:'editor',operationId:command.operationId,clientId:command.clientId,sequence:command.sequence});
  }));
  assert(!f.events.some(event=>event.kind==='get'&&business.has(event.key)));noMutation(f,before);
 }finally{f.close();}
});

for(const field of ['scope','schemaVersion'])void test(`FQC low-level reader rejects a wrong workflow ${field}`,async()=>{
 const context=await setup(),{f,a,generation}=context;try{
  await f.mutate(values=>{const quality=JSON.parse(values.qualityMasterControl);quality.libraries.fqc.workflow[field]=field==='scope'?'iqc':999;values.qualityMasterControl=JSON.stringify(quality);});
  const command=a.client.prepare(generation,'apply',nameEdit()),before=storedRow(f);resetEvents(f);
  await assert.rejects(f.records.readFqcRequiredRecordMutation(f.env.STATE_ARCHIVE,storedEnvelope(f),before.revision,{action:'apply',allocate:false},()=>Promise.resolve({actorId:'editor',operationId:command.operationId,clientId:command.clientId,sequence:command.sequence})));
  noMutation(f,before);
 }finally{f.close();}
});

// A recognized records-v1 corruption is not an unsupported format. A second
// SELECT is deliberately healthy so an accidental fallback would hide the fault.
void test('FQC manifest fault cannot recover through a second shared-row SELECT',async()=>{
 for(const fault of ['values-array','values-null','allocations-array','required-invalid-ref']){
  const context=await setup(),{f}=context;try{
   const healthy=storedRow(f).values;
   updateEnvelope(f,envelope=>{
    if(fault==='values-array')envelope.__processRecords.values=[];
    if(fault==='values-null')envelope.__processRecords.values=null;
    if(fault==='allocations-array')envelope.__processRecords.allocations=[];
    if(fault==='required-invalid-ref')envelope.__processRecords.values.platformUsers={key:'invalid-required-ref',sha256:'invalid'};
   });
   const before=storedRow(f);let reads=0;
   f.hooks.sql=sql=>{if(/\bFROM shared_state\b/.test(sql)&&++reads>1)f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(healthy);};
   resetEvents(f);const response=await send(context);
   assert(response.status>=400,`${fault}: a later healthy row cannot erase the first selected fault`);
   assert.equal(reads,1,`${fault}: recognized required-manifest corruption must not trigger a fallback SELECT`);
   noMutation(f,before);
  }finally{f.close();}
 }
});

void test('FQC malformed patches preserve merged-848 error ordering without an authentication claim',async()=>{
 for(const role of ['absent','reader','editor']){
  const results=[];
  for(const sourceRef of ['848be13da54c7ae747bcdd96df19e01129fe980a',undefined]){
   const context=await setup(sourceRef?{sourceRef}:undefined),{f,a,generation}=context;try{
    if(role==='reader')await f.mutate(values=>{const accounts=JSON.parse(values.platformUsers),reader=accounts.find(account=>account.id==='other');for(const key of Object.keys(reader.accessOverrides))if(key.startsWith('fqc.'))reader.accessOverrides[key]=key==='fqc.view';values.platformUsers=JSON.stringify(accounts);});
    const command=a.client.prepare(generation,'apply',{patches:[null],guards:[]}),before=storedRow(f);
    resetEvents(f);const response=await f.call(endpoint,{method:'POST',body:JSON.stringify({command})},role==='reader'?'other':role);
    const body=await response.json();results.push({status:response.status,error:body.error,io:f.events.map(event=>({kind:event.kind,...(event.sql?{sql:event.sql}:{})}))});noMutation(f,before);
   }finally{f.close();}
  }
  // In merged 848, needsFullHistory dereferences the null patch before identity
  // evaluation. This is a legacy 500, not proof of a 401/403 authentication gate.
  assert.deepEqual(results[0],{status:500,error:'WORKFLOW_WRITE_FAILED',io:[]},`${role}: pin the actual merged malformed-input behavior`);
  assert.deepEqual(results[1],results[0],`${role}: malformed input must retain merged-848 error ordering`);
 }
});

void test('FQC early denials preserve exact merged-848 DTO and authorization precedence',async()=>{
 const variants=[
  ...['apply','save'].map(action=>({name:`absent ${action}`,action,actor:'absent',status:401,error:'LOGIN_REQUIRED',id:false})),
  ...['apply','save'].map(action=>({name:`revoked ${action}`,action,revoke:true,status:401,error:'LOGIN_REQUIRED',id:false})),
  ...['apply','save'].map(action=>({name:`maintenance ${action}`,action,maintenance:true,status:503,error:'MAINTENANCE',id:false})),
  {name:'create denied',detail:'create',deny:['create'],id:false},
  {name:'delete denied',detail:'delete',deny:['delete'],id:false},
  {name:'view denied',deny:['view'],id:true},
  {name:'edit denied',deny:['edit'],id:true},
  {name:'save denied',action:'save',deny:['save'],id:true},
  {name:'raw create allowed while edit denied',detail:'create',deny:['edit'],id:true},
  {name:'create and edit denied',detail:'create',deny:['create','edit'],id:false},
  {name:'delete raw allowed while edit denied',detail:'delete',deny:['edit'],id:false},
  {name:'mixed create and delete denied',detail:'both',deny:['create','delete'],id:false},
  {name:'mixed create denied before kernel view denial',detail:'both',deny:['create','view'],id:false},
 ];
 for(const variant of variants){
  const results=[];
  for(const sourceRef of ['848be13da54c7ae747bcdd96df19e01129fe980a',undefined]){
   const context=await setup(sourceRef?{sourceRef}:undefined),{f,a,generation}=context;try{
    if(variant.maintenance||variant.deny)await f.mutate(values=>{if(variant.maintenance)values.maintenanceMode='1';if(variant.deny){const accounts=JSON.parse(values.platformUsers);for(const cell of variant.deny)accounts[0].accessOverrides['fqc.'+cell]=false;values.platformUsers=JSON.stringify(accounts);}});
    if(variant.revoke)f.revoke();
    const insert={op:'insert',path:['errors'],value:{id:'new-synthetic-error',name:'New synthetic error',category:'SYN',line:'A'}},remove={op:'set',path:['items',{id:'item'},'isDeleted'],value:true};
    const action=variant.action||'apply',detail=variant.detail?{patches:variant.detail==='both'?[insert,remove]:[variant.detail==='create'?insert:remove],guards:variant.detail==='create'?[]:[{path:remove.path}]}:action==='save'?{}:nameEdit();
    const command=a.client.prepare(generation,action,detail),before=storedRow(f),business=businessRefSet(f);resetEvents(f);
    const response=await f.call(endpoint,{method:'POST',body:JSON.stringify({command})},variant.actor||'editor'),body=await response.json(),error=variant.error||'FORBIDDEN';
    assert.equal(response.status,variant.status||403,variant.name);
    if(variant.id)assert.match(body.requestId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,`${variant.name}: kernel error retains a real request id`);
    assert.deepEqual(body,variant.id?{error,requestId:body.requestId}:{error},`${variant.name}: exact DTO keys, not requestId-stripped normalization`);
    noMutation(f,before);
    if(!sourceRef)assert(!f.events.some(event=>event.kind==='get'&&business.has(event.key)),`${variant.name}: admission must precede business hydration`);
    results.push({status:response.status,error,keys:Object.keys(body).sort(),headers:Object.fromEntries(response.headers)});
   }finally{f.close();}
  }
  assert.deepEqual(results[1],results[0],`${variant.name}: paired exact status/header/DTO shape`);
 }
});

void test('FQC outer unknown fields retain the original unrelated-fault fallback',async()=>{
 for(const action of ['apply','save'])for(const outer of [{unknownFlag:true},{admissionReply:{error:'FORBIDDEN',status:403}}]){
  const results=[];
  for(const sourceRef of ['848be13da54c7ae747bcdd96df19e01129fe980a',undefined]){
   const context=await setup(sourceRef?{sourceRef}:undefined),{f,a,generation}=context;try{
    await f.mutate(values=>{values.syntheticUnrelatedControl=JSON.stringify({note:'Unrelated fallback sentinel'});});
    const ref=storedEnvelope(f).__processRecords.values.syntheticUnrelatedControl;f.objects.delete(ref.key);
    const command=a.client.prepare(generation,action,action==='apply'?nameEdit():{}),before=storedRow(f);resetEvents(f);
    const response=await f.call(endpoint,{method:'POST',body:JSON.stringify({command,...outer})}),body=await response.json();
    assert.equal(response.status,500);assert.equal(body.error,'WORKFLOW_WRITE_FAILED');noMutation(f,before);
    assert(f.events.some(event=>event.kind==='get'&&event.key===ref.key),'unsupported outer fields cannot opt into the new scope or impersonate an admission sentinel');
    results.push({status:response.status,error:body.error,keys:Object.keys(body).sort(),headers:Object.fromEntries(response.headers),gets:f.events.filter(event=>event.kind==='get').length});
   }finally{f.close();}
  }
  assert.deepEqual(results[1],results[0],`${action}/${Object.keys(outer)[0]}: original failure and read behavior`);
 }
});

void test('FQC absent optional dependency keys preserve merged-848 defaults and explicit guards',async()=>{
 for(const variant of [
  {name:'missing AB permits an independent name edit',key:'masterDataControl',status:200},
  {name:'missing equipment permits an independent name edit',key:'routineEquipmentControl',status:200},
  {name:'missing AB fails an explicit expected-AB guard',key:'masterDataControl',status:409,error:'AB_EFFECTIVE_CHANGED_RECONFIRM',abGuard:true},
  {name:'missing equipment rejects a new equipment selection',key:'routineEquipmentControl',status:422,error:'EQUIPMENT_UNAVAILABLE',equipment:true},
 ]){
  const results=[];
  for(const sourceRef of ['848be13da54c7ae747bcdd96df19e01129fe980a',undefined]){
   const context=await setup(sourceRef?{sourceRef}:undefined),{f,a,generation}=context;try{
    updateEnvelope(f,envelope=>{delete envelope.__processRecords.values[variant.key];});
    const before=storedRow(f),original=await f.state();
    const detail=variant.equipment?{patches:[{op:'set',path:['items',{id:'item'},'equipmentId'],value:'missing'},{op:'set',path:['items',{id:'item'},'tool'],value:'Synthetic tool'}],guards:[{path:['items',{id:'item'},'equipmentId']},{path:['items',{id:'item'},'tool'],value:'目視檢查'}]}:{...nameEdit(),...(variant.abGuard?{input:{expectedAB:{versionId:'ab',codes:['SYN-P']}}}:{})};
    const command=a.client.prepare(generation,'apply',detail);resetEvents(f);
    const response=await f.call(endpoint,{method:'POST',body:JSON.stringify({command})}),body=await response.json();
    assert.equal(response.status,variant.status,variant.name);
    if(variant.status===200){
     const expanded=f.load('lib/workflow-wire.ts').expandWorkflowPayload(body),flow=expanded.control.workflow;
     assert.equal(flow.working.errors[0].name,'Scoped change');
     assert.deepEqual(JSON.parse(JSON.stringify(flow.saved)),JSON.parse(JSON.stringify(original.workflow.saved)));assert.deepEqual(JSON.parse(JSON.stringify(flow.active)),JSON.parse(JSON.stringify(original.workflow.active)));
     assert.equal(storedRow(f).revision,before.revision+1);
     assert(!Object.hasOwn(storedEnvelope(f).__processRecords.values,variant.key),'absence must not be replaced by a synthesized aggregate');
     results.push({status:response.status,working:JSON.parse(JSON.stringify(flow.working)),headers:Object.fromEntries(response.headers)});
    }else{
     assert.equal(body.error,variant.error);assert.match(body.requestId,/^[0-9a-f-]{36}$/i);assert.deepEqual(Object.keys(body).sort(),['error','requestId']);
     noMutation(f,before);results.push({status:response.status,error:body.error,headers:Object.fromEntries(response.headers)});
    }
   }finally{f.close();}
  }
  assert.deepEqual(results[1],results[0],`${variant.name}: paired defaults/guard semantics`);
 }
});
