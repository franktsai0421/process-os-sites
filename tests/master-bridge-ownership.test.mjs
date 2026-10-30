import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('public/process/master-shared-client.js','utf8');
function fixture(){
 let resolve;const pending=new Promise(r=>resolve=r),flow={generation:'g',working:{products:[]},active:{content:{products:[]}}};
 const control={active:{AB:{products:[]}},versions:[{id:'draft',scope:'AB',status:'draft',snapshot:{products:[]}}],workflowScopes:{AB:flow}},original=JSON.stringify(control);
 const response={control:{activeVersionId:'active',versions:[{id:'active',status:'approved',snapshot:{products:[{code:'OLD'}]}}],workflow:{...flow,saved:{id:'saved',content:{products:[]}}}}};
 const sync={identity:{id:'same-id'},epoch:1,identityGeneration(){return this.epoch;},captureDelivery(){return this.epoch;},isCurrentDelivery(v){return v===this.epoch;}};
 const client={hasUnknown:()=>false,flush:async()=>{},command:()=>pending,begin:()=>pending,read:()=>pending,resolveUnknown:async()=>{}};
 const window={ProcessSync:sync,createSharedDraftClient:()=>client},box={window,document:{documentElement:{lang:'zh'},querySelector:()=>null},confirm:()=>true};vm.runInNewContext(source,box);const bridge=window.createMasterSharedBridge({control});
 return{bridge,control,sync,resolve:()=>resolve(response),original};
}
for(const action of ['begin','save','patch'])for(const change of ['identity','epoch'])void test(action+' late ACK cannot adopt after '+change+' changes',async()=>{
 const f=fixture(),p=action==='patch'?f.bridge.patch('AB',[]):f.bridge.execute('AB',action);if(change==='identity')f.sync.identity={id:'same-id'};else f.sync.epoch++;f.resolve();await assert.rejects(p,/ACCOUNT_CHANGED_REOPEN_REQUIRED/);assert.equal(JSON.stringify(f.control),f.original);assert.equal(f.bridge.busy(),false);
});
void test('receipt recovery remains busy until refreshed saved snapshot is adopted',async()=>{
 const f=fixture(),p=f.bridge.recover('AB');await Promise.resolve();assert.equal(f.bridge.busy(),true);f.resolve();await p;assert.equal(f.bridge.busy(),false);assert.equal(f.control.workflowScopes.AB.saved.id,'saved');
});
