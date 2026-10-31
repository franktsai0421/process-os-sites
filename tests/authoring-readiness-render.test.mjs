import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

// Execute the complete authoring controller with delayed transport and minimal
// DOM ports. These checks count paints; they do not claim browser timings.
const source=fs.readFileSync('public/process/process-authoring-v3.js','utf8');
const drain=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(){
  let enabled=false,epoch=1,delivery=1,timerId=0,afterAccept=()=>{};
  const requests=[],events=[],timers=new Map(),interactions={modal:false,gesture:false,focused:false};
  const model={versions:[{id:'draft',status:'draft'}],workflow:{generation:'g',revision:1,working:{workspaces:['TEST','OTHER'].map(category=>({id:category,category,line:'A',stages:{A:[{id:'one',x:10,y:20}]}}))}}};
  const state={view:'editor',category:'TEST',editorLine:'A',approvalTab:'master',editorByCategory:{}};
  const c={structuredClone,console,JSON,Error,Promise,queueMicrotask,
    setInterval(){},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
    localStorage:{getItem:()=>enabled?'enabled':null},state,
    document:{documentElement:{lang:'zh'},addEventListener(){},querySelector(selector){
      if(selector==='#inspector-form'&&interactions.modal)return{closest:()=>({})};
      if(selector==='.gesture-active'&&interactions.gesture)return{};
      return null;
    },querySelectorAll:()=>[],createElement:()=>({dataset:{}}),activeElement:{matches:()=>interactions.focused}},
    bindView(){},renderInspector(){},render(){events.push({type:'render',category:state.category,revision:c.ProcessAuthoringV3.flow()?.revision,x:state.editorByCategory[state.category+':'+state.editorLine]?.A?.[0]?.x});},
    toast(message){events.push({type:'error',message});},editorKey:()=>state.category+':'+state.editorLine,
    createMasterSharedBridge:()=>({diff(){}}),
    createSharedDraftClient:({actorId})=>({read(since){
      let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});
      requests.push({actorId,since,resolve:(value={control:structuredClone(model),permissions:{view:true,edit:true,history:true}})=>resolve(value),reject});
      return promise;
    },contentIssues(){events.push({type:'advisory'});return new Promise(()=>{});}}),
    ProcessSync:{identity:{id:'admin'},requiresReload:false,identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:owner=>owner===delivery&&!c.ProcessSync.requiresReload},
    ProcessEditorV2:{interacting:()=>interactions.gesture},
    ProcessCanvasLocal:{accept(){afterAccept();},resetClean(){}},
  };
  c.window=c;
  vm.runInNewContext(source,c,{filename:'process-authoring-v3.js'});
  enabled=true;
  const paints=()=>events.filter(event=>event.type==='render');
  return{c,state,model,requests,events,timers,interactions,paints,api:c.ProcessAuthoringV3,
    identityEpoch(){epoch++;},delivery(){delivery++;},onAccept:fn=>afterAccept=fn,
    async load(){const pending=c.ProcessAuthoringV3.load();requests.at(-1).resolve();await pending;},
  };
}

void test('cold readiness paints the authoritative canvas once and does not await advisory work',async()=>{
  const f=fixture();let completed=false;
  const ready=f.api.readyForEditor().then(()=>{completed=true;});
  await drain();assert.equal(f.requests.length,1);assert.equal(completed,false);assert.equal(f.paints().length,0);
  f.requests[0].resolve();await ready;
  assert.deepEqual(f.paints(),[{type:'render',category:'TEST',revision:1,x:10}]);
  assert.equal(f.api.canMutate(),true);assert.equal(f.timers.size,1);
  for(const run of f.timers.values())run();
  assert.equal(f.events.filter(event=>event.type==='advisory').length,1);
  assert.equal(completed,true,'unresolved advisory does not masquerade as the mandatory canvas read');
});

void test('same-context concurrent readiness joins the existing load and paints once',async()=>{
  const f=fixture(),poll=f.api.load();
  const ready1=f.api.readyForEditor(),ready2=f.api.readyForEditor();
  await drain();assert.equal(f.requests.length,1);
  f.requests[0].resolve();await Promise.all([poll,ready1,ready2]);
  assert.equal(f.paints().length,1);
});

void test('separate ready calls with an owned flow still repaint after later module registration',async()=>{
  const f=fixture();await f.load();assert.equal(f.paints().length,1);
  await f.api.readyForEditor();await f.api.readyForEditor();
  assert.equal(f.paints().length,3);assert.equal(f.requests.length,1);
});

void test('owned-flow readiness does not swallow or wait for a different background read repaint',async()=>{
  const f=fixture();await f.load();
  const poll=f.api.load();let completed=false;
  const ready=f.api.readyForEditor().then(()=>{completed=true;});
  await drain();assert.equal(completed,true);await ready;
  assert.equal(f.paints().length,2);assert.equal(f.paints().at(-1).x,10);
  f.model.workflow.revision=2;f.model.workflow.working.workspaces[0].stages.A[0].x=99;
  f.requests[1].resolve();await poll;
  assert.equal(f.paints().length,3);assert.equal(f.paints().at(-1).x,99);
});

void test('ordinary polling retains changed-workspace repaint and metadata-only suppression',async()=>{
  const f=fixture();await f.load();f.model.workflow.revision=2;await f.load();
  assert.equal(f.paints().length,1);
  f.model.workflow.revision=3;f.model.workflow.working.workspaces[0].stages.A[0].x=99;await f.load();
  assert.equal(f.paints().length,2);assert.equal(f.paints().at(-1).x,99);
});

void test('approval process reads retain their own repaint without editor readiness',async()=>{
  const f=fixture();f.state.view='approval';f.state.approvalTab='process';
  await f.load();f.model.workflow.revision=2;await f.load();
  assert.equal(f.paints().length,2);assert.equal(f.requests.length,2);
});

void test('mandatory read failure rejects readiness without painting; retry can succeed',async()=>{
  const f=fixture(),failed=assert.rejects(f.api.readyForEditor(),/FORBIDDEN/);
  await drain();f.requests[0].reject(Error('FORBIDDEN'));await failed;
  assert.equal(f.paints().length,0);assert.equal(f.api.flow(),undefined);
  const retry=f.api.readyForEditor();await drain();f.requests[1].resolve();await retry;
  assert.equal(f.paints().length,1);
});

for(const change of ['identity','epoch','delivery','view','category','line','tab','reset','reload-required'])void test('pending readiness rejects stale '+change+' and cannot paint the next context',async()=>{
  const f=fixture(),rejected=assert.rejects(f.api.readyForEditor(),/DEPENDENCY_CHANGED_RECONFIRM/);
  await drain();
  if(change==='identity')f.c.ProcessSync.identity={id:'other'};
  if(change==='epoch')f.identityEpoch();
  if(change==='delivery')f.delivery();
  if(change==='view')f.state.view='dashboard';
  if(change==='category')f.state.category='OTHER';
  if(change==='line')f.state.editorLine='C';
  if(change==='tab')f.state.approvalTab='process';
  if(change==='reset')f.api.navigation.reset();
  if(change==='reload-required')f.c.ProcessSync.requiresReload=true;
  f.requests[0].resolve();await rejected;
  assert.equal(f.paints().length,0);assert.equal(f.api.flow(),undefined);
});

void test('same actor with a new identity epoch requires a current read before ready',async()=>{
  const f=fixture();await f.load();f.identityEpoch();
  let completed=false;const ready=f.api.readyForEditor().then(()=>{completed=true;});
  await drain();assert.equal(completed,false);assert.equal(f.requests.length,2);assert.equal(f.requests[1].since,'');
  f.requests[1].resolve();await ready;assert.equal(f.paints().length,2);
});

void test('old completion cannot clear a newer readiness after reset',async()=>{
  const f=fixture(),old=assert.rejects(f.api.readyForEditor(),/DEPENDENCY_CHANGED_RECONFIRM/);
  await drain();f.api.navigation.reset();f.delivery();
  const next=f.api.readyForEditor();await drain();assert.equal(f.requests.length,2);
  f.requests[0].resolve();await old;
  const joined=f.api.readyForEditor();await drain();assert.equal(f.requests.length,2);
  f.requests[1].resolve();await Promise.all([next,joined]);assert.equal(f.paints().length,1);
});

void test('waiting on an obsolete category load cannot mark a new category ready; explicit retry reads it',async()=>{
  const f=fixture(),old=f.api.load();f.state.category='OTHER';
  const failed=assert.rejects(f.api.readyForEditor(),/AUTHORING_LOAD_REQUIRED/);
  await drain();f.requests[0].resolve();await Promise.all([old,failed]);
  assert.equal(f.paints().length,0);
  const retry=f.api.readyForEditor();await drain();f.requests[1].resolve();await retry;
  assert.equal(f.paints().length,1);assert.equal(f.paints()[0].category,'OTHER');
});

for(const interaction of ['modal','gesture','focused','local-change'])void test('existing owned canvas preserves '+interaction+' without another read or repaint',async()=>{
  const f=fixture();await f.load();
  if(interaction==='local-change')f.state.editorByCategory['TEST:A'].A[0].x=123;
  else f.interactions[interaction]=true;
  await f.api.readyForEditor();assert.equal(f.requests.length,1);assert.equal(f.paints().length,1);
  if(interaction==='local-change')assert.equal(f.state.editorByCategory['TEST:A'].A[0].x,123);
});

for(const interaction of ['modal','gesture','focused','local-change'])void test('a late '+interaction+' cannot turn an unpainted adopted canvas into ready',async()=>{
  const f=fixture();f.onAccept(()=>{
    if(interaction==='local-change')f.state.editorByCategory['TEST:A'].A[0].x=123;
    else f.interactions[interaction]=true;
  });
  const rejected=assert.rejects(f.api.readyForEditor(),/DEPENDENCY_CHANGED_RECONFIRM/);
  await drain();f.requests[0].resolve();await rejected;
  assert.equal(f.paints().length,0);
  if(interaction==='local-change')assert.equal(f.state.editorByCategory['TEST:A'].A[0].x,123);
  await assert.rejects(f.api.readyForEditor(),/DEPENDENCY_CHANGED_RECONFIRM/);
  assert.equal(f.paints().length,0,'a second call cannot report an unpainted canvas as ready');
  f.onAccept(()=>{});
  if(interaction==='local-change')f.state.editorByCategory['TEST:A'].A[0].x=10;
  else f.interactions[interaction]=false;
  await f.api.readyForEditor();assert.equal(f.paints().length,1);assert.equal(f.requests.length,1);
});
