import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('public/process/master-shared-client.js','utf8'),sharedSource=fs.readFileSync('public/process/shared-draft-client.js','utf8');
function fixture({openForm=false}={}){
 let resolve;const pending=new Promise(r=>resolve=r),flow={generation:'g',working:{products:[]},active:{content:{products:[]}}};
 const control={active:{AB:{products:[]}},versions:[{id:'draft',scope:'AB',status:'draft',snapshot:{products:[]}}],workflowScopes:{AB:flow}},original=JSON.stringify(control);
 const response={control:{activeVersionId:'active',versions:[{id:'active',status:'approved',snapshot:{products:[{code:'OLD'}]}},...(openForm?[{id:'draft',status:'draft',snapshot:{products:[]}}]:[])],workflow:{...flow,saved:{id:'saved',content:{products:[]}}}}};
 const sync={identity:{id:'same-id'},epoch:1,identityGeneration(){return this.epoch;},captureDelivery(){return this.epoch;},isCurrentDelivery(v){return v===this.epoch;}};
 const client={hasUnknown:()=>false,flush:async()=>{},command:()=>pending,begin:()=>pending,read:()=>pending,resolveUnknown:async()=>{}};
 const window={ProcessSync:sync,createSharedDraftClient:()=>client},box={window,document:{documentElement:{lang:'zh'},querySelector:()=>openForm?{}:null},confirm:()=>true};vm.runInNewContext(source,box);const bridge=window.createMasterSharedBridge({control});
 return{bridge,control,sync,resolve:()=>resolve(response),original};
}
for(const action of ['begin','save','patch'])for(const change of ['identity','epoch'])void test(action+' late ACK cannot adopt after '+change+' changes',async()=>{
 const f=fixture(),p=action==='patch'?f.bridge.patch('AB',[]):f.bridge.execute('AB',action);if(change==='identity')f.sync.identity={id:'same-id'};else f.sync.epoch++;f.resolve();await assert.rejects(p,/ACCOUNT_CHANGED_REOPEN_REQUIRED/);assert.equal(JSON.stringify(f.control),f.original);assert.equal(f.bridge.busy(),false);
});
void test('receipt recovery remains busy until refreshed saved snapshot is adopted',async()=>{
 const f=fixture(),p=f.bridge.recover('AB');await Promise.resolve();assert.equal(f.bridge.busy(),true);f.resolve();await p;assert.equal(f.bridge.busy(),false);assert.equal(f.control.workflowScopes.AB.saved.id,'saved');
});

void test('Save with an unapplied form preserves its draft object while adopting the saved snapshot',async()=>{const f=fixture({openForm:true}),form=f.control.versions[0];form.snapshot.products.push({id:'local',code:'UNAPPLIED'});const p=f.bridge.execute('AB','save');f.resolve();await p;assert.equal(f.control.versions.find(v=>v.id===form.id),form);assert.equal(form.snapshot.products[0].code,'UNAPPLIED');assert.equal(f.control.workflowScopes.AB.saved.id,'saved');assert.deepEqual(Array.from(f.control.workflowScopes.AB.saved.content.products),[]);});
void test('Save without an open form adopts the confirmed version projection',async()=>{const f=fixture(),p=f.bridge.execute('AB','save');f.resolve();await p;assert.equal(f.control.versions.some(v=>v.id==='draft'),false);assert.equal(f.control.workflowScopes.AB.saved.id,'saved');});

function dialogFixture(){
 let answer,options,submitOptions,calls=0,dialogs=0;const confirmed=new Promise(resolve=>answer=resolve),cells={submit:true,history:true,edit:true,restore:true};
 const saved={id:'saved-original',at:'synthetic',actor:{name:'Synthetic'},content:{products:[]}},flow={generation:'g',revision:3,pendingId:null,working:{products:[]},saved};
 const control={active:{AB:{products:[]}},versions:[{id:'draft',scope:'AB',status:'draft',snapshot:flow.working}],workflowScopes:{AB:flow}};
 const sync={identity:{id:'writer'},epoch:1,delivery:1,identityGeneration(){return this.epoch;},captureDelivery(){return this.delivery;},isCurrentDelivery(value){return value===this.delivery;}};
 const client={hasUnknown:()=>false,permission:key=>cells[key]===true,command:async(generation,action,detail)=>{calls++;return{control:{versions:control.versions,workflow:flow},generation,action,detail};}};
 const window={ProcessSync:sync,hasPermission:()=>false,VersionDraftUI:{reasonFor:()=>'',masterChanges:()=>[],confirmSubmit:(_reason,_scope,value)=>{dialogs++;submitOptions=value;return confirmed;}}};
 const box={window,document:{documentElement:{lang:'zh'},querySelector:()=>null}};vm.createContext(box);
 // Execute the real strict snapshot helper; only transport/dialog boundaries are
 // synthetic. A missing saved version, invalid revision, pending or dirty shared
 // content must be rejected by product code, not by a permissive helper mock.
 vm.runInContext(sharedSource,box);window.createSharedDraftClient=()=>client;window.openSharedDraftHistory=async value=>{options=value;};vm.runInContext(source,box);
 return{bridge:window.createMasterSharedBridge({control}),sync,flow,control,cells,answer:(reason='Synthetic reason')=>answer(reason),get calls(){return calls;},get dialogs(){return dialogs;},get submitOptions(){return submitOptions;},get options(){return options;}};
}
for(const change of ['identity','same-id-identity','epoch','delivery','generation','saved','revision'])void test('submit dialog refuses changed '+change+' without sending a command',async()=>{
 const f=dialogFixture(),pending=f.bridge.submit('AB');
 if(change==='identity')f.sync.identity={id:'new-writer'};else if(change==='same-id-identity')f.sync.identity={id:'writer'};else if(change==='epoch')f.sync.epoch++;else if(change==='delivery')f.sync.delivery++;else if(change==='generation')f.flow.generation='new-generation';else if(change==='revision')f.flow.revision++;else f.flow.saved={...f.flow.saved,id:'new-saved'};
 const before=JSON.stringify(f.control);f.answer();await assert.rejects(pending,change==='saved'||change==='generation'?/SAVED_VERSION_CHANGED_RECONFIRM/:change==='revision'?/DRAFT_REVISION_CHANGED_RECONFIRM/:/ACCOUNT_CHANGED_REOPEN_REQUIRED/);assert.equal(f.calls,0);assert.equal(JSON.stringify(f.control),before);assert.equal(f.bridge.busy(),false);
});
void test('submit dialog refuses a newer shared working revision and retains both saved and unsaved content',async()=>{
 const f=dialogFixture(),pending=f.bridge.submit('AB'),saved=JSON.stringify(f.flow.saved);
 // A real shared Apply advances revision; this is not a raw in-place mutation
 // that invents changed server working content at the same revision.
 f.flow.working.products.push({id:'unsaved'});f.flow.revision++;const before=JSON.stringify(f.control);f.answer();
 await assert.rejects(pending,/DRAFT_REVISION_CHANGED_RECONFIRM/);assert.equal(f.calls,0);assert.equal(JSON.stringify(f.control),before);assert.equal(JSON.stringify(f.flow.saved),saved);assert.equal(f.flow.working.products[0].id,'unsaved');
});
for(const [change,code]of [['missing-saved','SUCCESSFUL_SAVE_REQUIRED'],['missing-revision','DRAFT_REVISION_REQUIRED'],['invalid-revision','DRAFT_REVISION_REQUIRED'],['pending','PENDING_LOCKED'],['unsaved','UNSAVED_CHANGES_SAVE_REQUIRED']])void test('actual Submit capture rejects '+change+' before confirmation without mutation',async()=>{
 const f=dialogFixture();if(change==='missing-saved')f.flow.saved=null;else if(change==='missing-revision')delete f.flow.revision;else if(change==='invalid-revision')f.flow.revision=-1;else if(change==='pending')f.flow.pendingId='pending-case';else f.flow.working.products.push({id:'unsaved'});
 const before=JSON.stringify(f.control);await assert.rejects(f.bridge.submit('AB'),error=>error.message===code);assert.equal(f.calls,0);assert.equal(f.dialogs,0);assert.equal(JSON.stringify(f.control),before);assert.equal(f.bridge.busy(),false);
});
void test('unchanged confirmation sends only its explicit savedId and draft revision',async()=>{
 const f=dialogFixture(),pending=f.bridge.submit('AB');assert.equal(f.submitOptions.savedVersion.id,'saved-original');assert.equal(f.submitOptions.savedVersion.revision,3);f.answer();const result=await pending;
 assert.equal(result.action,'submit');assert.equal(result.detail.savedId,'saved-original');assert.equal(result.detail.expectedRevision,3);assert.equal(f.calls,1);assert.equal(f.dialogs,1);
});
void test('cancelled Submit confirmation makes no command or local mutation',async()=>{
 const f=dialogFixture(),before=JSON.stringify(f.control),pending=f.bridge.submit('AB');f.answer(null);assert.equal(await pending,null);assert.equal(f.calls,0);assert.equal(JSON.stringify(f.control),before);assert.equal(f.bridge.busy(),false);
});
void test('bridge history uses explicit restore capability without submit or blanket delete permission',async()=>{
 const f=dialogFixture();f.cells.submit=false;await f.bridge.history('AB');assert.equal(f.options.editable(),true);f.cells.restore=false;assert.equal(f.options.editable(),false);
 f.cells.restore=true;f.cells.edit=false;assert.equal(f.options.editable(),false);f.cells.edit=true;f.cells.history=false;assert.equal(f.options.editable(),false);
});
