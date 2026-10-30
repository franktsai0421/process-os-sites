import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('public/process/master-shared-client.js','utf8');
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
 let answer,options,calls=0;const confirmed=new Promise(resolve=>answer=resolve),cells={history:true,edit:true,restore:true};
 const saved={id:'saved-original',at:'synthetic',actor:{name:'Synthetic'},content:{products:[]}},flow={generation:'g',working:{products:[]},saved};
 const control={active:{AB:{products:[]}},versions:[{id:'draft',scope:'AB',status:'draft',snapshot:flow.working}],workflowScopes:{AB:flow}};
 const sync={identity:{id:'writer'},epoch:1,delivery:1,identityGeneration(){return this.epoch;},captureDelivery(){return this.delivery;},isCurrentDelivery(value){return value===this.delivery;}};
 const client={hasUnknown:()=>false,permission:key=>cells[key]===true,command:async(generation,action,detail)=>{calls++;return{control:{versions:control.versions,workflow:flow},generation,action,detail};}};
 const window={ProcessSync:sync,createSharedDraftClient:()=>client,hasPermission:()=>false,VersionDraftUI:{reasonFor:()=>'',masterChanges:()=>[],confirmSubmit:()=>confirmed},openSharedDraftHistory:async value=>{options=value;}};
 const box={window,document:{documentElement:{lang:'zh'},querySelector:()=>null}};vm.runInNewContext(source,box);
 return{bridge:window.createMasterSharedBridge({control}),sync,flow,control,cells,answer:()=>answer('Synthetic reason'),get calls(){return calls;},get options(){return options;}};
}
for(const change of ['identity','epoch','delivery','generation','saved'])void test('submit dialog refuses changed '+change+' without sending a command',async()=>{
 const f=dialogFixture(),pending=f.bridge.submit('AB');
 if(change==='identity')f.sync.identity={id:'new-writer'};else if(change==='epoch')f.sync.epoch++;else if(change==='delivery')f.sync.delivery++;else if(change==='generation')f.flow.generation='new-generation';else f.flow.saved={...f.flow.saved,id:'new-saved'};
 f.answer();await assert.rejects(pending,change==='saved'||change==='generation'?/SAVED_VERSION_CHANGED_RECONFIRM/:/ACCOUNT_CHANGED_REOPEN_REQUIRED/);assert.equal(f.calls,0);
});
void test('submit dialog retains the confirmed saved snapshot when only working changes',async()=>{
 const f=dialogFixture(),pending=f.bridge.submit('AB');f.flow.working.products.push({id:'unsaved'});f.answer();const result=await pending;
 assert.equal(result.action,'submit');assert.equal(result.detail.savedId,'saved-original');assert.equal(f.calls,1);
});
void test('bridge history uses explicit restore capability without submit or blanket delete permission',async()=>{
 const f=dialogFixture();await f.bridge.history('AB');assert.equal(f.options.editable(),true);f.cells.restore=false;assert.equal(f.options.editable(),false);
 f.cells.restore=true;f.cells.edit=false;assert.equal(f.options.editable(),false);f.cells.edit=true;f.cells.history=false;assert.equal(f.options.editable(),false);
});
