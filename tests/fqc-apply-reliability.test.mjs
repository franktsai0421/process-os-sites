import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const fixture=createRequire(import.meta.url)('../scripts/fqc-apply-fixture.cjs');
const tick=()=>new Promise(setImmediate);
const edit=(field,value,base)=>({patches:[{op:'set',path:['errors',{id:'error'},field],value}],guards:[{path:['errors',{id:'error'},field],value:base}]});
void test('actual FQC slow R2 Apply survives the former 15s cutoff, settles at 32s without retry',async()=>{
 const f=await fixture(),a=f.realm();
 try{
  const begun=await a.client.begin();await a.client.read();let release,paused=false,activePost=false,serverFlight=Promise.resolve();
  f.hooks.get=async()=>{if(!activePost||paused)return;paused=true;await new Promise(resolve=>release=resolve);};
  a.intercept(async(url,o,send)=>{if(o.method!=='POST')return send();activePost=true;const operation=send();serverFlight=operation;return Promise.race([operation.finally(()=>activePost=false),new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true}))]);});
  const pending=a.client.command(begun.control.workflow.generation,'apply',edit('name','Delayed edit','Synthetic error'));const outcome=pending.then(value=>({value}),error=>({error}));
  while(!paused)await tick();a.advance(15000);await tick();a.advance(17000);assert.equal(a.elapsed,32000);
  release();await serverFlight;const result=await outcome;
  assert.equal(result.error,undefined,'15s abort manufactures UNKNOWN even when the actual handler can still commit the one Apply');
  assert.equal(result.value.control.workflow.working.errors[0].name,'Delayed edit');assert.equal(a.client.hasUnknown(),false);
  assert.equal(f.requests.filter(r=>r.method==='POST'&&JSON.parse(r.body).command).length,1);assert.equal(f.requests.filter(r=>r.url.includes('operationId=')).length,0);
 }finally{f.close();}
});
void test('FQC exact route bounds fresh revocation checks per Apply without weakening DTO',async()=>{
 const f=await fixture(),a=f.realm();try{const begun=await a.client.begin();await a.client.read();f.events.length=0;await a.client.command(begun.control.workflow.generation,'apply',edit('name','Counted edit','Synthetic error'));
 const revocation=f.events.filter(e=>e.kind==='read'&&e.sql.includes('process_revoked_sessions')).length;
 assert(revocation<=9,`Apply plus required authoritative readback made ${revocation} revocation reads`);
 }finally{f.close();}
});
const {fixture:uiFixture}=createRequire(import.meta.url)('../scripts/test-fqc-feedback-races.cjs');
async function mount(f,who='editor',session){const initial=await f.call('/api/fqc/workflow?caseMetadata=1',{},who);const data=await initial.json();return uiFixture({initialControl:data.control,identityUser:{id:who,name:'Synthetic '+who,role:'staff'},session,send:(url,options)=>f.call(url,options,who)});}
async function submit(ui,kind,id,name){ui.c.__fqcTest[kind==='error'?'openErrorModal':'openItemModal'](id);const form=ui.doc.querySelector('.fqc-modal-form');form.querySelector('[name="name"]').value=name;await form.onsubmit({preventDefault(){},target:form});assert.equal(form.isConnected,false,form.querySelector('.fqc-modal-alert')?.textContent);return form;}
for(const format of ['inline','records'])void test(`actual ${format} FQC Begin, new/edit error and item forms, manual Save and reload`,async()=>{
 const f=await fixture({format});try{const ui=await mount(f);await ui.c.__fqcTest.sharedAction('begin');
 await submit(ui,'error','error','Edited error');await submit(ui,'error','','Created error');
 await submit(ui,'item','item','Edited item');await submit(ui,'item','','Created item');
 let current=await f.state();assert.equal(current.workflow.working.errors[0].name,'Edited error');assert.equal(current.workflow.working.errors[1].name,'Created error');assert.equal(current.workflow.working.items[0].name,'Edited item');assert.equal(current.workflow.working.items[1].name,'Created item');assert.equal(current.workflow.saved,null);
 await ui.c.__fqcTest.sharedAction('save');current=await f.state();assert.deepEqual(current.workflow.saved.content,current.workflow.working);
 const reload=await mount(f,'editor',ui.records);assert.equal(reload.c.__fqcTest.transport().hasUnknown(),false);assert.deepEqual(JSON.parse(JSON.stringify(reload.library.workflow.working)),current.workflow.working);
 }finally{f.close();}
});
const deniedActions={view:'apply',edit:'apply',save:'save',submit:'submit',withdraw:'withdraw',approve:'approve',return:'return',create:'apply',delete:'apply',restore:'restore'};
for(const cell of Object.keys(deniedActions))void test(`actual old/new FQC permission ${cell} denial is identical and never writes`,async()=>{
 const outcomes=[];for(const baseline of [true,false]){const f=await fixture({baseline});try{const a=f.realm(),begun=await a.client.begin(),g=begun.control.workflow.generation;
 await f.mutate(values=>{const users=JSON.parse(values.platformUsers);users[0].accessOverrides['fqc.'+cell]=false;values.platformUsers=JSON.stringify(users);});
 const command={...a.client.prepare(g,deniedActions[cell]),...(cell==='create'?{patches:[{op:'insert',path:['errors'],value:{id:'new',name:'Synthetic new',category:'SYN',line:'A'}}]}:cell==='delete'?{patches:[{op:'set',path:['errors',{id:'error'},'isDeleted'],value:true}],guards:[{path:['errors',{id:'error'},'isDeleted'],value:false}]}:deniedActions[cell]==='apply'?edit('name','Forbidden','Synthetic error'):{}),...(['approve','return','withdraw'].includes(cell)?{caseId:'unrelated-case',reason:'Synthetic'}:{}),...(cell==='submit'?{savedId:'unrelated-save',reason:'Synthetic'}:{}),...(cell==='restore'?{restoreSaveId:'unrelated-save',expectedRevision:0}:{})};
 const before=f.db.prepare('SELECT * FROM shared_state').get(),res=await f.call('/api/fqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command})}),body=await res.json();assert.equal(res.status,403,JSON.stringify(body));assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);const outcome={status:res.status,error:body.error};outcomes.push(outcome);
 const meta=await f.call('/api/fqc/workflow?permissions=1');if(cell==='view')assert.equal(meta.status,403);else{assert.equal(meta.status,200);const dto=await meta.json();assert.equal(dto.permissions[cell],false);outcome.permissions=dto.permissions;}
 }finally{f.close();}}assert.deepEqual(outcomes[1],outcomes[0]);
});
for(const boundary of [2,3,4,5])for(const fail of [false,true])void test(`FQC fresh revocation boundary ${boundary} ${fail?'read fault':'revoked'} prevents CAS`,async()=>{
 const f=await fixture(),a=f.realm();try{const begun=await a.client.begin();let reads=0;f.hooks.sql=sql=>{if(sql.includes('process_revoked_sessions')&&++reads===boundary){if(fail)throw Error('SYNTHETIC_REVOCATION_UNAVAILABLE');f.revoke();}};
 const before=f.db.prepare('SELECT * FROM shared_state').get(),res=await f.call('/api/fqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command:a.client.prepare(begun.control.workflow.generation,'apply',edit('name','Forbidden','Synthetic error'))})});assert.equal(res.status,401);assert.equal(reads,boundary);assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);
 }finally{f.close();}
});
void test('FQC late revocation during immutable writes refuses CAS and preserves prior business state',async()=>{
 const f=await fixture(),a=f.realm();try{const begun=await a.client.begin();const before=f.db.prepare('SELECT * FROM shared_state').get();let revoked=false;f.hooks.put=()=>{if(!revoked){revoked=true;f.revoke();}};const res=await f.call('/api/fqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command:a.client.prepare(begun.control.workflow.generation,'apply',edit('name','Forbidden','Synthetic error'))})});assert.equal(res.status,401);assert(revoked);assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);
 }finally{f.close();}
});
for(const changed of ['edit','authEpoch','maintenance'])void test(`FQC CAS retry selects fresh ${changed}, not old phase permission`,async()=>{
 const f=await fixture(),a=f.realm();try{const begun=await a.client.begin();let hit=false;f.hooks.run=async sql=>{if(hit||!sql.startsWith('UPDATE shared_state'))return;hit=true;await f.mutate(values=>{if(changed==='maintenance'){values.maintenanceMode='1';return;}const users=JSON.parse(values.platformUsers);if(changed==='edit')users[0].accessOverrides['fqc.edit']=false;else users[0].authEpoch=2;values.platformUsers=JSON.stringify(users);});};
 const res=await f.call('/api/fqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command:a.client.prepare(begun.control.workflow.generation,'apply',edit('name','Forbidden','Synthetic error'))})});assert.equal(res.status,changed==='edit'?403:changed==='authEpoch'?401:503);assert(hit);assert.equal((await f.state()).workflow.working.errors[0].name,'Synthetic error');
 }finally{f.close();}
});
void test('FQC phase is exact-route, state/header bound, and keeps explicit non-FQC scopes out',async()=>{
 const f=await fixture();try{const state=await f.core.readState();for(const url of ['/api/iqc/workflow','/api/fqc/workflow?scope=AB','/api/master/workflow?scope=AB'])await assert.rejects(f.core.createFqcPermissionPhase(new Request('https://synthetic.invalid'+url),state),/INVALID_PERMISSION_PHASE/);
 for(const kind of ['header','state','revision']){const selected=await f.core.readState(),request=new Request('https://synthetic.invalid/api/fqc/workflow',{headers:{cookie:f.cookies.editor}}),phase=await f.core.createFqcPermissionPhase(request,selected);assert(phase.allowed('fqc.edit'));if(kind==='header')request.headers.set('cookie','other');if(kind==='state')selected.values.processAccessControl='changed';if(kind==='revision')selected.revision++;assert.equal(phase.allowed('fqc.edit'),false);assert.equal(await phase.current(),false);}
 }finally{f.close();}
});
void test('actual FQC batch assignment, matrix removal/addition, soft delete Apply remain separate from Save',async()=>{
 const f=await fixture();try{const ui=await mount(f);await ui.c.__fqcTest.sharedAction('begin');ui.c.__fqcTest.openExistingModal('SYN-P');const form=ui.doc.querySelector('#fqc-batch-existing-form');form.querySelectorAll('input[type="checkbox"]').forEach(node=>node.checked=true);await form.onsubmit({preventDefault(){},target:form});assert.equal(form.isConnected,false);assert.deepEqual((await f.state()).workflow.working.items[0].productCodes,['SYN-P']);
 for(const expected of [[],['SYN-P']]){await ui.c.__fqcTest.recoverySession().ready;await ui.main.querySelector('[data-matrix-item="item"]').click();const before=f.requests.filter(r=>r.method==='POST').length;await ui.c.__fqcTest.applyMatrixChoices();assert.equal(f.requests.filter(r=>r.method==='POST').length,before+1);assert.equal(ui.c.__fqcTest.matrixDirty(),false);assert.deepEqual((await f.state()).workflow.working.items[0].productCodes,expected);}
 await ui.c.__fqcTest.deleteItem('item');await ui.c.__fqcTest.deleteError('error');const flow=(await f.state()).workflow;assert(flow.working.items[0].isDeleted);assert(flow.working.errors[0].isDeleted);assert.equal(flow.saved,null);await ui.c.__fqcTest.sharedAction('save');assert.deepEqual((await f.state()).workflow.saved.content,flow.working);
 }finally{f.close();}
});
for(const who of ['other','editor'])void test(`two ${who==='editor'?'same-account tabs':'actors'} merge different fields and reject stale same field`,async()=>{
 const f=await fixture(),a=f.realm(),b=f.realm(who);try{const begun=await a.client.begin(),g=begun.control.workflow.generation;await Promise.all([a.client.read(),b.client.read()]);
 const item=(field,value,base)=>({patches:[{op:'set',path:['items',{id:'item'},field],value}],guards:[{path:['items',{id:'item'},field],value:base}]});
 await b.client.command(g,'apply',item('description','Peer description','Synthetic description'));await a.client.command(g,'apply',item('name','My name','Synthetic item'));
 const after=(await f.state()).workflow;assert.equal(after.working.items[0].name,'My name');assert.equal(after.working.items[0].description,'Peer description');
 await assert.rejects(b.client.command(g,'apply',item('name','Stale peer','Synthetic item')),/DEPENDENCY_CHANGED_RECONFIRM/);assert.equal((await f.state()).workflow.working.items[0].name,'My name');assert.equal(b.client.hasUnknown(),false);assert.equal(a.client.hasUnknown(),false);
 const commands=f.requests.filter(r=>r.method==='POST'&&JSON.parse(r.body).command).map(r=>JSON.parse(r.body).command);assert.notEqual(commands[0].clientId,commands[1].clientId);assert.notEqual(commands[0].operationId,commands[1].operationId);
 }finally{f.close();}
});
void test('45s pre-commit timeout + receipt 404 retains exact anchor across reload and never sends Save or replays Apply',async()=>{
 const f=await fixture(),a=f.realm();try{const begun=await a.client.begin();let posts=0;a.intercept((url,o,send)=>{if(o.method==='POST'){posts++;return new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true}));}return send();});
 const command=a.client.prepare(begun.control.workflow.generation,'apply',edit('name','Unsent input','Synthetic error')),pending=assert.rejects(a.client.sendPrepared(command),/RESULT_UNKNOWN/);await tick();a.advance(44999);await tick();assert.equal(posts,1);a.advance(1);await pending;const bytes=[...a.session];assert.equal(a.client.hasUnknown(),true);await assert.rejects(a.client.command(command.generation,'save'),/UNKNOWN/);await assert.rejects(a.client.sendPrepared(command),/OPERATION_NOT_FOUND/);assert.equal(posts,1);assert.deepEqual([...a.session],bytes);
 const reloaded=f.realm('editor',a.session);await reloaded.client.read();await assert.rejects(reloaded.client.resolveUnknown(),/OPERATION_NOT_FOUND/);assert.deepEqual([...a.session],bytes);assert.equal(reloaded.client.hasUnknown(),true);assert.equal((await f.state()).workflow.working.errors[0].name,'Synthetic error');
 }finally{f.close();}
});
for(const receiptUnavailable of [false,true])void test(`committed lost ACK ${receiptUnavailable?'waits through stale 404 then explicit query':'recovers from original receipt'} without another POST`,async()=>{
 const f=await fixture(),a=f.realm();try{const begun=await a.client.begin();let unavailable=receiptUnavailable,posts=0;a.intercept(async(url,o,send)=>{if(o.method==='POST'){posts++;await send();throw Error('SYNTHETIC_ACK_LOST');}if(unavailable&&url.includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});return send();});const command=a.client.prepare(begun.control.workflow.generation,'apply',edit('name','Committed input','Synthetic error'));
 if(receiptUnavailable){await assert.rejects(a.client.sendPrepared(command),/RESULT_UNKNOWN/);const bytes=[...a.session];await assert.rejects(a.client.command(command.generation,'save'),/UNKNOWN/);assert.deepEqual([...a.session],bytes);unavailable=false;await a.client.resolveUnknown();}else await a.client.sendPrepared(command);
 assert.equal(posts,1);assert.equal(a.client.hasUnknown(),false);assert.equal((await f.state()).workflow.working.errors[0].name,'Committed input');assert.equal(a.session.size,0);
 }finally{f.close();}
});
void test('actual form Save cannot swallow un-applied current input or a newly opened form while Apply settles',async()=>{
 const f=await fixture();try{const ui=await mount(f);await ui.c.__fqcTest.sharedAction('begin');ui.c.__fqcTest.openItemModal('item');let form=ui.doc.querySelector('.fqc-item-form');form.querySelector('[name="name"]').value='Unapplied value';const posts=f.requests.filter(r=>r.method==='POST').length;await assert.rejects(ui.c.__fqcTest.sharedAction('save'));assert.equal(f.requests.filter(r=>r.method==='POST').length,posts);assert.equal(form.querySelector('[name="name"]').value,'Unapplied value');
 let release,held=false;f.hooks.get=async()=>{if(held)return;held=true;await new Promise(resolve=>release=resolve);};const applying=form.onsubmit({preventDefault(){},target:form});while(!held)await tick();form.closest('.fqc-modal-overlay').remove();ui.c.__fqcTest.openItemModal('item');form=ui.doc.querySelector('.fqc-item-form');form.querySelector('[name="name"]').value='Next batch value';release();await applying;assert(form.isConnected);assert.equal(form.querySelector('[name="name"]').value,'Next batch value');assert.equal((await f.state()).workflow.working.items[0].name,'Unapplied value');assert.equal((await f.state()).workflow.saved,null);
 }finally{f.close();}
});
void test('actual pending-lock rejection and permission 403 preserve form input without claiming saved',async()=>{
 for(const mode of ['pending','permission']){const f=await fixture();try{const ui=await mount(f);await ui.c.__fqcTest.sharedAction('begin');ui.c.__fqcTest.openErrorModal('error');const form=ui.doc.querySelector('.fqc-modal-form');form.querySelector('[name="name"]').value='Retain rejected input';await f.mutate(values=>{if(mode==='permission'){const users=JSON.parse(values.platformUsers);users[0].accessOverrides['fqc.edit']=false;values.platformUsers=JSON.stringify(users);}else{const q=JSON.parse(values.qualityMasterControl);q.libraries.fqc.workflow.pendingId='synthetic-pending';values.qualityMasterControl=JSON.stringify(q);}});const before=f.db.prepare('SELECT * FROM shared_state').get();await form.onsubmit({preventDefault(){},target:form});assert(form.isConnected);assert.equal(form.querySelector('[name="name"]').value,'Retain rejected input');assert(form.querySelector('.fqc-modal-alert').textContent);assert.equal(f.requests.filter(r=>r.method==='POST').at(-1).result.error,mode==='pending'?'PENDING_LOCKED':'FORBIDDEN');assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);assert.equal((await f.state()).workflow.saved,null);assert.equal(ui.c.__fqcTest.transport().hasUnknown(),mode==='permission');
 }finally{f.close();}}
});
void test('actual FQC equipment-transfer Apply and history-restore Apply preserve saved/active boundaries',async()=>{
 const f=await fixture();try{await f.mutate(values=>{const q=JSON.parse(values.qualityMasterControl),eq=JSON.parse(values.routineEquipmentControl);Object.assign(q.libraries.fqc.versions[0].snapshot.items[0],{equipmentId:'eq1',tool:'M1'});eq.versions[0].equipment=['eq1','eq2'].map((id,index)=>({id,assetCode:'SYN-TOOL',pieceMark:'M'+(index+1),name:'Synthetic tool',enabled:true}));values.qualityMasterControl=JSON.stringify(q);values.routineEquipmentControl=JSON.stringify(eq);});
 const ui=await mount(f);await ui.c.__fqcTest.sharedAction('begin');const before=(await f.state()).workflow;const result=await ui.c.FQCQualityAPI.transferEquipment({sourceEquipmentId:'eq1',targetEquipment:{id:'eq2'},itemIds:['item']});assert.equal(result.saved,false);assert.equal((await f.state()).workflow.working.items[0].equipmentId,'eq2');assert.deepEqual((await f.state()).workflow.active,before.active);
 await ui.c.__fqcTest.sharedAction('save');const saved=(await f.state()).workflow.saved;await submit(ui,'error','error','Restore later');const client=ui.c.__fqcTest.transport();const response=await f.call('/api/fqc/workflow?restoreSaveId='+encodeURIComponent(saved.id));assert.equal(response.status,200);const preview=await response.json();await client.command(preview.generation,'restore',{restoreSaveId:preview.restoreSaveId,expectedRevision:preview.expectedRevision});const after=(await f.state()).workflow;assert.deepEqual(after.working,saved.content);assert.deepEqual(after.saved,saved);assert.deepEqual(after.active,before.active);
 }finally{f.close();}
});
void test('FQC operation fingerprint, actor attribution and replay fresh check are preserved',async()=>{
 const f=await fixture(),a=f.realm();try{const begun=await a.client.begin(),command=a.client.prepare(begun.control.workflow.generation,'apply',edit('name','Once only','Synthetic error'));await a.client.sendPrepared(command);const row=f.db.prepare('SELECT * FROM shared_state').get();
 for(const [who,changed]of [['other',false],['editor',true]]){const payload=changed?{...command,...edit('name','Wrong payload','Synthetic error')}:command;const res=await f.call('/api/fqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command:payload})},who);assert.equal(res.status,409);assert.equal((await res.json()).error,'OPERATION_ID_REUSED');assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),row);}
 const forbiddenReceipt=await f.call('/api/fqc/workflow?operationId='+command.operationId,{},'other');assert.equal(forbiddenReceipt.status,403);
 const replay=await f.call('/api/fqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command})});assert.equal(replay.status,200);assert.equal((await replay.json()).unchanged,true);assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),row);
 let reads=0;f.hooks.sql=sql=>{if(sql.includes('process_revoked_sessions')&&++reads===3)f.revoke();};const revoked=await f.call('/api/fqc/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command})});assert.equal(revoked.status,401);assert.equal(reads,3);assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),row);
 }finally{f.close();}
});
// The required-dependency path adds one pre-business fresh gate; the fixed
// eight-aggregate fixture has no unrelated aggregate to omit.
void test('paired main/current counts retain pre-business freshness without dropping commit evidence',async()=>{
 const measurements=[];for(const baseline of [true,false]){const f=await fixture({baseline}),a=f.realm();try{let begun;const actions=[];for(const action of ['begin','edit','create','save','receipt','read']){f.events.length=0;if(action==='begin')begun=await a.client.begin();if(action==='edit')await a.client.command(begun.control.workflow.generation,'apply',edit('name','Measured','Synthetic error'));if(action==='create')await a.client.command(begun.control.workflow.generation,'apply',{patches:[{op:'insert',path:['errors'],value:{id:'new',name:'New',category:'SYN',line:'A'}}]});if(action==='save')await a.client.command(begun.control.workflow.generation,'save');if(action==='receipt')await a.client.receipt(f.requests.filter(r=>r.result.receipt).at(-1).result.receipt.operationId);if(action==='read')await a.client.read();actions.push({action,revocation:f.events.filter(e=>e.kind==='read'&&e.sql.includes('process_revoked_sessions')).length,r2:f.events.filter(e=>e.kind==='get').length});}measurements.push(actions);}finally{f.close();}}
 assert.deepEqual(measurements[0].map(x=>x.revocation),[13,39,40,39,26,26]);assert.deepEqual(measurements[1].map(x=>x.revocation),[4,9,10,9,4,4]);assert.deepEqual(measurements[1].map(x=>x.r2),measurements[0].map(x=>x.r2));console.log(JSON.stringify({measurement:'Synthetic actual-handler counts; Apply/Save include required terminal GET, not live latency',before:measurements[0],after:measurements[1]}));
});
for(const [name,endpoint,scope,expected] of [
 ['bounded FQC','/api/fqc/workflow?caseMetadata=1','FQC',45000],
 ['generic FQC','/api/fqc/workflow?caseMetadata=1',null,15000],
 ['similar path','/api/fqc/workflow-other',null,15000],
 ['bounded IQC','/api/iqc/workflow?caseMetadata=1','IQC',45000],
 ['bounded PROCESS','/api/master/workflow?scope=PROCESS&caseMetadata=1','PROCESS',15000],
])void test(`mutation deadline stays exact: ${name} ${expected}ms, only one receipt GET`,async()=>{
 const f=await fixture(),a=f.realm();try{let posts=0,receipts=0;const flow={scope:scope==='IQC'?'iqc':scope==='PROCESS'?'master:PROCESS':'fqc',generation:'g',revision:0,saved:null,pendingId:null};a.intercept((url,o)=>{if(o.method==='POST'){posts++;return new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true}));}if(url.includes('operationId=')){receipts++;return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});}return Response.json({revision:1,control:{workflow:flow},permissions:{view:true,edit:true}});});
 const client=a.c.createSharedDraftClient({endpoint,actorId:'editor',headers:()=>({}),...(scope?{externalDurableBounded:{scope}}:{})});await client.read();const pending=assert.rejects(client.command('g','apply',edit('name','Held','Synthetic error')),/RESULT_UNKNOWN/);await tick();const timer=[...a.timers.values()].find(t=>t.ms===expected);assert(timer);a.advance(expected-1);await tick();assert.equal(receipts,0);a.advance(1);await pending;assert.equal(posts,1);assert.equal(receipts,1);assert(client.hasUnknown());
 }finally{f.close();}
});
void test('similar or scope-overridden bounded FQC paths fail admission instead of obtaining a longer budget',async()=>{
 const f=await fixture(),a=f.realm();try{for(const endpoint of ['/api/fqc/workflow-other','/api/fqc/workflow?scope=FQC','/api/iqc/workflow?caseMetadata=1'])assert.throws(()=>a.c.createSharedDraftClient({endpoint,actorId:'editor',headers:()=>({}),externalDurableBounded:{scope:'FQC'}}),/BOUNDED_EXTERNAL_SCOPE_REQUIRED/);assert.equal(f.requests.length,0);}finally{f.close();}
});
void test('actual FQC re-entry reads fresh permissions and never reuses an old form owner',async()=>{
 const f=await fixture();try{const ui=await mount(f);await ui.c.__fqcTest.sharedAction('begin');await submit(ui,'error','error','Before revisit');await ui.c.__fqcTest.sharedAction('save');
 for(let i=0;i<2;i++){ui.c.FQCMasterUI.navigation.reset();await ui.c.FQCMasterUI.bind(ui.main);assert(ui.main.querySelector('#fqc-save'));assert.equal(ui.c.__fqcTest.transport().permission('view'),true);assert.equal(ui.library.workflow.working.errors[0].name,'Before revisit');}
 ui.c.__fqcTest.openErrorModal('error');const form=ui.doc.querySelector('.fqc-modal-form');form.querySelector('[name="name"]').value='Old owner input';ui.c.FQCMasterUI.navigation.reset();await ui.c.FQCMasterUI.bind(ui.main);const posts=f.requests.filter(r=>r.method==='POST').length;await form.onsubmit({preventDefault(){},target:form});assert.equal(f.requests.filter(r=>r.method==='POST').length,posts);assert.equal(form.querySelector('[name="name"]').value,'Old owner input');assert.equal(form.querySelector('.fqc-modal-alert').textContent,ui.c.__fqcTest.displayDraftError('FQC_FORM_CONTEXT_CHANGED'));
 form.closest('.fqc-modal-overlay').remove();await f.mutate(values=>{const users=JSON.parse(values.platformUsers);users[0].accessOverrides['fqc.view']=false;values.platformUsers=JSON.stringify(users);});ui.c.FQCMasterUI.navigation.reset();await ui.c.FQCMasterUI.bind(ui.main);assert.equal(ui.main.querySelector('#fqc-save'),null);assert.equal(ui.c.__fqcTest.transport().permission('view'),false);assert.equal((await f.state()).workflow.working.errors[0].name,'Before revisit');
 }finally{f.close();}
});
