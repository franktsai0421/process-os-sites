// Complete production authoring closure; isolated read transport/DOM, no server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/process/process-authoring-v3.js','utf8');
const clone=value=>structuredClone(value);
function fixture(){
  let enabled=false,epoch=1,delivery=1,stage='CUT';
  const calls={reads:0,posts:0,adopts:0,paints:0,controls:0},requests=[],interaction={modal:false,gesture:false};
  const state={view:'editor',category:'TEST',editorLine:'A',approvalTab:'master',editorByCategory:{}};
  const model={versions:[{id:'draft',status:'draft'}],workflow:{generation:'g1',revision:1,pendingId:null,saved:{id:'saved-1'},working:{workspaces:[{id:JSON.stringify(['TEST','A']),category:'TEST',line:'A',stages:{CUT:[{id:'one',name:'Original',x:10}]}}]}}};
  const c={structuredClone,console,JSON,Error,Promise,queueMicrotask,setInterval(){},setTimeout(){return 1;},clearTimeout(){},localStorage:{getItem:()=>enabled?'enabled':null},state,
    document:{documentElement:{lang:'zh'},addEventListener(){},querySelector(selector){if(selector==='#inspector-form'&&interaction.modal)return {closest:()=>({})};if(selector==='.gesture-active'&&interaction.gesture)return {};return null;},querySelectorAll:()=>[],activeElement:{matches:()=>false},createElement:()=>({dataset:{}})},
    bindView(){},renderInspector(){},render(){calls.paints++;},toast(){},editorKey:()=>state.category+':'+state.editorLine,createMasterSharedBridge:()=>({diff(){}}),
    createSharedDraftClient:()=>({read(since){calls.reads++;return new Promise((resolve,reject)=>requests.push({since,resolve:(response={control:clone(model),permissions:{view:true,edit:true}})=>resolve(response),reject}));},command(){calls.posts++;throw Error('UNEXPECTED_POST');}}),
    ProcessSync:{identity:{id:'actor-a'},requiresReload:false,identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:value=>value===delivery&&!c.ProcessSync.requiresReload},
    ProcessCanvasLocal:{accept(){calls.adopts++;},resetClean(){},dirty:()=>false},
    ProcessEditorV2:{interacting:()=>interaction.gesture,currentCanvas:()=>({workspace:JSON.stringify([state.category,state.editorLine]),stage}),departure:{inspect:()=>({hasDialog:interaction.modal})},updateControls(){calls.controls++;}},
  };c.window=c;vm.runInNewContext(source,c,{filename:'process-authoring-v3.js'});enabled=true;
  const api=c.ProcessAuthoringV3;
  return {api,c,state,model,calls,requests,interaction,epoch:()=>epoch++,delivery:()=>delivery++,stage:value=>stage=value,
    async load(response){const pending=api.load();requests.at(-1).resolve(response);await pending;},
    async read(response){const pending=api.readCanvasRecovery();requests.at(-1).resolve(response);return pending;},
    response:()=>({control:clone(model),permissions:{view:true,edit:true}}),
  };
}
void test('explicit recovery GET is unconditional, metadata peek is pure and first GET never adopts or POSTs',async()=>{
  const f=fixture();await f.load();const current=f.api.flow(),local=f.state.editorByCategory,before={...f.calls};
  for(let i=0;i<100;i++)assert.equal(f.api.recoveryAuthority().canView,true);
  assert.deepEqual(f.calls,before);f.model.workflow.revision=2;const read=await f.read();
  assert.equal(f.requests.at(-1).since,undefined);assert.equal(f.calls.reads,before.reads+1);assert.equal(f.calls.posts,0);assert.equal(f.calls.paints,before.paints);assert.equal(f.calls.adopts,before.adopts);assert.equal(f.api.flow(),current);assert.equal(f.state.editorByCategory,local);assert.equal(read.control.workflow.revision,2);
});
void test('proper read admits once without replacing local canvas or rendering the page',async()=>{
  const f=fixture();await f.load();const local=f.state.editorByCategory,before={...f.calls};f.model.workflow.revision=2;f.model.workflow.working.workspaces[0].stages.CUT[0].name='Remote';const read=await f.read();
  const result=f.api.acceptCanvasRecovery(read);assert.equal(result.revision,2);assert.equal(f.api.flow().working.workspaces[0].stages.CUT[0].name,'Remote');assert.equal(f.state.editorByCategory,local);assert.equal(local['TEST:A'].CUT[0].name,'Original');assert.equal(f.calls.paints,before.paints);assert.equal(f.calls.posts,0);assert.throws(()=>f.api.acceptCanvasRecovery(read),/READ_REQUIRED/);
});
for(const phase of ['read','accept'])for(const change of ['actor','identity-object','epoch','delivery','view','category','line','tab','stage','context-reset','requires-reload','generation'])void test(`recovery ${phase} fences stale ${change}`,async()=>{
  const f=fixture();await f.load();const current=f.api.flow();let result,pending;
  if(phase==='accept')result=await f.read();else pending=f.api.readCanvasRecovery();
  if(change==='actor')f.c.ProcessSync.identity={id:'actor-b'};
  if(change==='identity-object')f.c.ProcessSync.identity={id:'actor-a'};
  if(change==='epoch')f.epoch();if(change==='delivery')f.delivery();if(change==='view')f.state.view='dashboard';if(change==='category')f.state.category='OTHER';if(change==='line')f.state.editorLine='B';if(change==='tab')f.state.approvalTab='process';if(change==='stage')f.stage('PACK');if(change==='context-reset')f.api.navigation.reset();if(change==='requires-reload')f.c.ProcessSync.requiresReload=true;if(change==='generation'){current.generation='g2';current.revision=9;}
  const before={...f.calls},model=f.api.flow();
  if(phase==='read'){f.requests.at(-1).resolve();await assert.rejects(pending,/CONTEXT_CHANGED|VERSION_CHANGED/);}else assert.throws(()=>f.api.acceptCanvasRecovery(result),/CONTEXT_CHANGED|VERSION_CHANGED/);
  assert.equal(f.api.flow(),model);assert.equal(f.calls.adopts,before.adopts);assert.equal(f.calls.posts,0);assert.equal(f.calls.paints,before.paints);
});
for(const permission of [undefined,false])void test(`response view permission ${String(permission)} cannot be adopted even when edit is true`,async()=>{
  const f=fixture();await f.load();const current=f.api.flow(),response=f.response();response.permissions={edit:true,...(permission===undefined?{}:{view:permission})};await assert.rejects(f.read(response),/READBACK_REQUIRED/);assert.equal(f.api.flow(),current);
});
void test('authority getter never infers viewing from edit permission',async()=>{
  const f=fixture(),response=f.response();response.permissions={edit:true};await f.load(response);assert.equal(f.api.recoveryAuthority().canView,false);await assert.rejects(f.api.readCanvasRecovery(),/AUTHORITY_REQUIRED/);assert.equal(f.calls.reads,1);
});
void test('pending readonly read updates authority and controls but retains open form and canvas objects',async()=>{
  const f=fixture();await f.load();f.interaction.modal=true;const local=f.state.editorByCategory;local['TEST:A'].CUT[0].name='Typed in local form';const before={...f.calls};f.model.workflow.pendingId='case-1';f.model.workflow.revision=2;const response=f.response();response.permissions.edit=false;const read=await f.read(response);const authority=f.api.acceptCanvasRecovery(read);
  assert.equal(authority.pending,true);assert.equal(authority.canEdit,false);assert.equal(authority.canView,true);assert.equal(authority.hasOpenForm,true);assert.equal(f.state.editorByCategory,local);assert.equal(local['TEST:A'].CUT[0].name,'Typed in local form');assert.equal(f.interaction.modal,true);assert.equal(f.calls.paints,before.paints);assert.equal(f.calls.controls,before.controls+1);
});
void test('an older preview cannot roll back a newer accepted model or its permissions',async()=>{
  const f=fixture();await f.load();f.model.workflow.revision=2;const old=await f.read();f.model.workflow.revision=3;const newer=f.response();newer.permissions.edit=false;const next=await f.read(newer);f.api.acceptCanvasRecovery(next);const adopted=f.api.flow();assert.throws(()=>f.api.acceptCanvasRecovery(old),/READBACK_REQUIRED|AUTHORITY_CHANGED/);assert.equal(f.api.flow(),adopted);assert.equal(f.api.recoveryAuthority().canEdit,false);assert.equal(f.api.flow().revision,3);
});
void test('late recovery GET older than current adopted revision is rejected before admission',async()=>{
  const f=fixture();await f.load();const pending=f.api.readCanvasRecovery();f.api.flow().revision=9;const response=f.response();response.control.workflow.revision=2;f.requests.at(-1).resolve(response);await assert.rejects(pending,/READBACK_REQUIRED/);assert.equal(f.api.flow().revision,9);
});
void test('server generation mismatch and regressed revisions are never admitted',async()=>{
  for(const change of ['generation','revision']){const f=fixture();await f.load();const response=f.response();if(change==='generation')response.control.workflow.generation='g2';else response.control.workflow.revision=0;await assert.rejects(f.read(response),/READBACK_REQUIRED/);assert.equal(f.api.flow().generation,'g1');assert.equal(f.api.flow().revision,1);}
});
void test('arbitrary or cloned result cannot mint admission and caller mutation cannot alter trusted model',async()=>{
  const f=fixture();await f.load();const read=await f.read();assert.throws(()=>f.api.acceptCanvasRecovery(f.response()),/READ_REQUIRED/);assert.throws(()=>f.api.acceptCanvasRecovery(clone(read)),/READ_REQUIRED/);read.control.workflow.revision=999;read.control.workflow.working.workspaces[0].stages.CUT[0].name='Injected';read.permissions.edit=false;f.api.acceptCanvasRecovery(read);assert.equal(f.api.flow().revision,1);assert.equal(f.api.flow().working.workspaces[0].stages.CUT[0].name,'Original');assert.equal(f.api.recoveryAuthority().canEdit,true);
});
void test('editor wiring adds only explicit recovery action and leaves Sync/Form paths intact',()=>{
  const editor=fs.readFileSync('public/process/process-editor.js','utf8');assert(editor.includes("button('local-recovery',t('本機恢復','Khôi phục cục bộ'))"));assert(editor.includes("if(a==='local-recovery')return localCanvas().openRecovery();"));assert(editor.includes("if(a==='sync'){await localCanvas().sync(wid(),view().stage);render();return;}"));
});
void test('one opaque pre-command capture supports two explicit authoritative GETs without mutation',async()=>{
  const f=fixture();await f.load();const token=f.api.captureCanvasRecovery(),before={...f.calls};assert.deepEqual(Object.keys(token),[]);assert.deepEqual(f.calls,before);
  for(let i=0;i<2;i++){const pending=f.api.readCanvasRecovery(token);f.requests.at(-1).resolve();await pending;}
  assert.equal(f.calls.reads,before.reads+2);assert.equal(f.calls.posts,0);assert.equal(f.calls.adopts,before.adopts);await assert.rejects(f.api.readCanvasRecovery({}),/PIN_REQUIRED/);
});
void test('pre-command capture cannot be reused across changed context and makes zero late GETs',async()=>{
  const f=fixture();await f.load();const token=f.api.captureCanvasRecovery(),before=f.calls.reads;f.epoch();await assert.rejects(f.api.readCanvasRecovery(token),/CONTEXT_CHANGED/);assert.equal(f.calls.reads,before);
});
void test('explicit clean replacement updates base and editor rows but still does not render',async()=>{
  const f=fixture();await f.load();f.model.workflow.revision=2;f.model.workflow.working.workspaces[0].stages.CUT[0].name='Latest';const read=await f.read(),before=f.calls.paints;
  f.api.acceptCanvasRecovery(read,{replaceEditor:true});assert.equal(f.state.editorByCategory['TEST:A'].CUT[0].name,'Latest');assert.equal(f.api.flow().revision,2);assert.equal(f.calls.paints,before);assert.equal(f.calls.posts,0);
});
for(const change of ['modal','gesture','legacy-input','local-edit-epoch'])void test(`explicit replacement rejects ${change}, metadata-only adoption still preserves inputs`,async()=>{
  const f=fixture();await f.load();f.model.workflow.revision=2;const read=await f.read(),local=f.state.editorByCategory;
  if(change==='modal')f.interaction.modal=true;if(change==='gesture')f.interaction.gesture=true;if(change==='legacy-input')local['TEST:A'].CUT[0].name='New input';if(change==='local-edit-epoch')f.api.updateLocalSaveState();
  assert.throws(()=>f.api.acceptCanvasRecovery(read,{replaceEditor:true}),/LOCAL_CHANGED/);assert.equal(f.api.flow().revision,1);f.api.acceptCanvasRecovery(read);assert.equal(f.api.flow().revision,2);assert.equal(f.state.editorByCategory,local);if(change==='legacy-input')assert.equal(local['TEST:A'].CUT[0].name,'New input');
});
void test('opaque capture made before sync preserves later local edits under metadata-only readback',async()=>{
  const f=fixture();await f.load();const token=f.api.captureCanvasRecovery();f.api.updateLocalSaveState();f.model.workflow.revision=2;const pending=f.api.readCanvasRecovery(token);f.requests.at(-1).resolve();const read=await pending,local=f.state.editorByCategory;f.api.acceptCanvasRecovery(read);assert.equal(f.api.flow().revision,2);assert.equal(f.state.editorByCategory,local);assert.equal(f.calls.posts,0);
});
void test('late read cannot undo a separately adopted permission revocation at the same workflow revision',async()=>{
  const f=fixture();await f.load();const old=f.api.readCanvasRecovery(),oldRequest=f.requests.at(-1),denied=f.response();denied.permissions.edit=false;const newRead=f.api.readCanvasRecovery();f.requests.at(-1).resolve(denied);f.api.acceptCanvasRecovery(await newRead);oldRequest.resolve();await assert.rejects(old,/AUTHORITY_CHANGED/);assert.equal(f.api.recoveryAuthority().canEdit,false);assert.equal(f.api.flow().revision,1);
});
void test('malformed missing versions and contradictory same-revision save identity cannot be adopted',async()=>{
  for(const change of ['versions','saved','pending']){const f=fixture();await f.load();const response=f.response();if(change==='versions')delete response.control.versions;if(change==='saved')response.control.workflow.saved.id='different-save';if(change==='pending')response.control.workflow.pendingId='different-case';await assert.rejects(f.read(response),/READBACK_REQUIRED/);assert.equal(f.api.flow().saved.id,'saved-1');assert.equal(f.api.flow().pendingId,null);}
});

void test('production authoring + canvas + store restore updates authoritative base before projecting local edits',async()=>{
  const {webcrypto}=await import('node:crypto'),data=new Map(),held=new Set();
  const storage={get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  const locks={async request(name,_options,fn){await Promise.resolve();if(held.has(name))return fn(null);held.add(name);try{return await fn({name});}finally{held.delete(name);}}};
  const mount=f=>{const events=new Map(),getEnabled=f.c.localStorage.getItem;f.c.localStorage={...storage,getItem:key=>key==='processAuthoringControl'?getEnabled():storage.getItem(key)};Object.defineProperty(f.c.localStorage,'length',{get:()=>storage.length});f.c.crypto=webcrypto;f.c.performance=performance;f.c.location={origin:'https://fixture.invalid',pathname:'/process/'};f.c.navigator={locks};f.c.addEventListener=(name,fn)=>{const list=events.get(name)||new Set();list.add(fn);events.set(name,list);};f.c.removeEventListener=(name,fn)=>events.get(name)?.delete(fn);vm.runInNewContext(fs.readFileSync('public/process/canvas-recovery-store.js','utf8'),f.c);vm.runInNewContext(fs.readFileSync('public/process/canvas-local.js','utf8'),f.c);f.c.ProcessCanvasLocal.accept(f.api.flow());return{name:f.c.ProcessCanvasLocal,close:()=>{for(const fn of events.get('pagehide')||[])fn();}};};
  const first=fixture();first.model.workflow.revision=2;first.model.workflow.working.workspaces[0].stages.CUT[0].name='Remote base';await first.load();const source=mount(first);await source.name.recoveryReady();const workspace=JSON.stringify(['TEST','A']);source.name.edit(workspace,'CUT',[{id:'one',f:'name',value:'Recovered local'}]);source.name.flushRecovery();const key=[...data.keys()][0];assert(key);source.close();await new Promise(setImmediate);
  const second=fixture();await second.load();const target=mount(second);await target.name.recoveryReady();assert.equal(second.state.editorByCategory['TEST:A'].CUT[0].name,'Original');second.model.workflow.revision=2;second.model.workflow.working.workspaces[0].stages.CUT[0].name='Remote base';
  const request=target.name.restoreRecovery(key,()=>true);for(let count=2;count<=3;count++){for(let turn=0;second.requests.length<count&&turn<20;turn++)await new Promise(setImmediate);assert.equal(second.requests.length,count);second.requests.at(-1).resolve();}
  assert.equal(await request,true);assert.equal(second.state.editorByCategory['TEST:A'].CUT[0].name,'Remote base');assert.equal(target.name.project(workspace,'CUT',second.state.editorByCategory['TEST:A'].CUT)[0].name,'Recovered local');assert.equal(second.api.flow().revision,2);assert.equal(second.calls.reads,3);assert.equal(second.calls.posts,0);assert(data.has(key));target.close();
});
