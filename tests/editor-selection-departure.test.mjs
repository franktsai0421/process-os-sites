import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/process/editor-line-selection.js','utf8');
function fixture(guarded=true){
 const requests=[],events=[],lineSelect={value:'A'},categorySelect={value:'G1'},state={view:'editor',category:'G1',editorLine:'A',editorVersionId:'v1',selectedOperation:'operation'};
 const box={Map,Set,JSON,Error,state,currentUser:{role:'admin'},lines:[{code:'A'},{code:'C'}],data:{products:[{code:'P1',category:'G1'},{code:'C1',category:'G2'}]},routeFor:p=>({line:p==='P1'?'A':'C'}),editorKey:()=>state.category+':'+state.editorLine,syncProductRoute:()=>events.push('route'),ensureCategoryEditor:()=>events.push('workspace'),render:()=>events.push('render'),document:{querySelector:s=>s==='#editor-line-select'?lineSelect:categorySelect},window:guarded?{ProcessDeliveryNavigation:{guardAction:spec=>{requests.push(spec);return Promise.resolve({status:'cancelled'});}}}:{}};
 vm.createContext(box);vm.runInContext(source.slice(0,source.indexOf('function editorSelectionPath(')),box);
 return {box,requests,events,state,lineSelect,categorySelect};
}
void test('a native selection waits for its guard and Stay preserves source selection without a redraw',async()=>{
 const f=fixture();f.lineSelect.value='C';await f.box.changeEditorSelection('C','G2');assert.equal(f.requests.length,1);assert.equal(f.state.editorLine,'A');assert.equal(f.state.category,'G1');assert.equal(f.state.selectedOperation,'operation');assert.equal(f.lineSelect.value,'A');assert.equal(f.categorySelect.value,'G1');assert.deepEqual(f.events,[]);
});
void test('only the committed intent changes the workspace and selected product',async()=>{
 const f=fixture();await f.box.changeEditorSelection('C','G2');f.requests[0].run();assert.equal(f.state.editorLine,'C');assert.equal(f.state.category,'G2');assert.equal(f.state.productCode,'C1');assert.equal(f.state.selectedOperation,null);assert.deepEqual(f.events,['route','workspace','render']);
});
void test('a target removed while the decision was pending is rejected before state changes',async()=>{
 const f=fixture();await f.box.changeEditorSelection('C','G2');f.box.data.products.pop();assert.throws(()=>f.requests[0].run(),/EDITOR_SELECTION_CHANGED/);assert.equal(f.state.editorLine,'A');assert.deepEqual(f.events,[]);
});
void test('existing standalone editor selection still works without the integrated navigation adapter',()=>{
 const f=fixture(false);f.box.changeEditorSelection('C','G2');assert.equal(f.state.editorLine,'C');assert.equal(f.state.productCode,'C1');assert.equal(f.events.filter(x=>x==='render').length,1);
});
void test('same or invalid targets do not create a departure decision',async()=>{
 const f=fixture();await f.box.changeEditorSelection('A','G1');await f.box.changeEditorSelection('not-a-line','G2');assert.equal(f.requests.length,0);assert.deepEqual(f.events,[]);
});

// Actual stage handler shares the same checked departure coordinator as line selection.
const editorSource=fs.readFileSync('public/process/process-editor.js','utf8');
const stageSource=editorSource.slice(editorSource.indexOf(' function changeStage('),editorSource.indexOf(' function bind(){'));
const {createDepartureCoordinator}=await import('../public/process/navigation-lifecycle.mjs');
function stageFixture(initial='dirty'){
 let stageStatus={state:initial,canAbandon:true},epoch=1,permit=true,workspace='G1:A',allowed=['S1','S2'],releaseCount=0,abandoned=0,shown=0;
 const v={stage:'S1'},events=[],durable=new Map([['operation','original-unknown-receipt']]);
 let releaseGate;const gate=new Promise(resolve=>{releaseGate=resolve;});
 const coordinator=createDepartureCoordinator({owner:()=>({epoch}),isCurrent:o=>o.epoch===epoch,inspect:()=>stageStatus,autoAbandon:()=>true,
  async act(action){assert.equal(action,'abandon');abandoned++;await gate;if(!permit)throw Error('PERMISSION_CHANGED');const departureId={};stageStatus={state:'departing',departureId};return {departureId,release(){releaseCount++;}};},show(){shown++;}});
 const host={ProcessDeliveryNavigation:{guardAction:spec=>coordinator.request({...spec,run:ticket=>{const value=spec.run();if(ticket)coordinator.committed(ticket);return {status:'ready',value};}})}};
 const box={host,Promise,JSON,Error,key:()=>workspace,view:()=>v,visibleStages:()=>allowed,remember:()=>events.push('remember'),clearLink:()=>events.push('clearLink'),render:()=>events.push('render')};vm.createContext(box);vm.runInContext(stageSource,box);
 return {box,v,events,durable,releaseGate,invalidate:()=>epoch++,deny:()=>{permit=false;},removeTarget:()=>{allowed=['S1'];},changeWorkspace:()=>{workspace='G2:C';},changeStage:()=>{v.stage='S3';},stats:()=>({abandoned,shown,releaseCount})};
}
for(const state of ['dirty','unknown'])void test('stage '+state+' switch waits for checked abandonment without saving or prompting',async()=>{
 const f=stageFixture(state),before=[...f.durable],pending=f.box.changeStage('S2');assert.equal(f.v.stage,'S1');assert.deepEqual(f.events,[]);
 f.releaseGate();assert.equal((await pending).status,'ready');assert.equal(f.v.stage,'S2');assert.deepEqual(f.events,['remember','clearLink','render']);assert.deepEqual([...f.durable],before);assert.deepEqual(f.stats(),{abandoned:1,shown:0,releaseCount:1});
});
for(const mode of ['invalidate','deny','removeTarget','changeWorkspace','changeStage'])void test('stage handoff refuses '+mode+' while departure is pending',async()=>{
 const f=stageFixture(),pending=f.box.changeStage('S2');f[mode]();f.releaseGate();const result=await pending;assert(['invalidated','error'].includes(result.status));assert.notEqual(f.v.stage,'S2');assert.deepEqual(f.events,[]);assert.equal(f.durable.get('operation'),'original-unknown-receipt');assert.equal(f.stats().shown,0);
});
void test('stage same/invalid target is inert and missing departure service fails closed',async()=>{
 const f=stageFixture();await f.box.changeStage('S1');await f.box.changeStage('missing');assert.equal(f.stats().abandoned,0);delete f.box.host.ProcessDeliveryNavigation;assert.equal((await f.box.changeStage('S2')).status,'blocked');assert.equal(f.v.stage,'S1');
 assert.match(editorSource,/changeStage\(b\.dataset\.peStage\)/);
});
