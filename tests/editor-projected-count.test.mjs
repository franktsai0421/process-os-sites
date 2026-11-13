import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync('public/process/app.js','utf8').replace(/\r\n/g,'\n');
const start=app.indexOf('function editor() {'),end=app.indexOf('\nfunction productStatus()',start);
assert(start>=0&&end>start);
const selection=fs.readFileSync('public/process/editor-line-selection.js','utf8');
const journalHost={structuredClone};vm.runInNewContext(fs.readFileSync('public/process/canvas-local.js','utf8'),journalHost);
const workspace=JSON.stringify(['Fixture','A']);
const operation=id=>({id,stageCode:'S',number:id,name:id,editorType:'manual',productCodes:[],bomSelections:{},machineIds:[],nextIds:[],mediaItems:[],x:0,y:0});
const model=(s=[operation('one')],t=[])=>({workspaces:[{id:workspace,line:'A',category:'Fixture',stages:{S:s,T:t,HIDDEN:[operation('hidden')]}}]});
function fixture(){
 const state={view:'editor',editorLine:'A',category:'Fixture',editorVersionId:'draft',editorByCategory:{'Fixture:A':structuredClone(model().workspaces[0].stages)}};
 let projection=model(),journal=new journalHost.CanvasJournal(projection);const calls=[];
 const box={structuredClone,console,state,lines:[{code:'A',name:'A'}],currentUser:{role:'admin'},data:{products:[{code:'A1',category:'Fixture'}]},approvalVersions:[{id:'draft',status:'draft'}],
  routeFor:()=>({line:'A'}),lineFor:()=>({stages:[{code:'S'},{code:'T'}]}),categoryStageCodes:()=>['S','T','HIDDEN'],editorKey:()=>state.category+':'+state.editorLine,
  escapeHtml:v=>String(v??''),ensureCategoryEditor:()=>state.editorByCategory[state.category+':'+state.editorLine],synchronizeWorkspaceBomSelections(){},syncProductRoute(){},render(){},
  document:{documentElement:{lang:'zh-Hant'},querySelector:()=>null},MutationObserver:class{observe(){}},
  ProcessAuthoringV3:{enabled:()=>true},ProcessEditorV2:{workspace:()=>'<div class="fixture-canvas"></div>'},
  ProcessCanvasLocal:{project(w,s,input){calls.push([w,s]);const source=projection.workspaces.find(row=>row.id===w)?.stages[s]||input;return journal.project(w,s,source);}},
 };
 box.window=box;vm.createContext(box);vm.runInContext(selection,box);vm.runInContext(app.slice(start,end),box);
 return {box,state,calls,html:()=>box.editor(),publish(next){projection=structuredClone(next);journal=new journalHost.CanvasJournal(projection);},addLocal(id){journal.operation(workspace,'S',operation(id),null);},removeLocal(id){journal.remove(workspace,'S',id);}};
}
void test('header uses the saved projection while the original editor copy remains stale',()=>{
 const f=fixture(),before=structuredClone(f.state.editorByCategory);f.publish(model([operation('one'),operation('two')],[{...operation('three'),stageCode:'T'}]));
 assert.match(f.html(),/2 個工段 · 3 個流程/);assert.deepEqual(f.state.editorByCategory,before);
 assert.deepEqual(f.calls,[[workspace,'S'],[workspace,'T']]);
});
void test('header matches local canvas additions and deletions without saving or touching hidden stages',()=>{
 const f=fixture();f.addLocal('two');assert.match(f.html(),/2 個工段 · 2 個流程/);
 f.removeLocal('one');assert.match(f.html(),/2 個工段 · 1 個流程/);
 assert.equal(f.state.editorByCategory['Fixture:A'].S.length,1);assert.ok(f.calls.every(([,stage])=>stage!=='HIDDEN'));
});
void test('Vietnamese count derives from the same current canvas projection',()=>{
 const f=fixture();f.box.document.documentElement.lang='vi';f.publish(model([operation('one'),operation('two')]));assert.match(f.html(),/2 công đoạn · 2 bước/);
});
void test('legacy or unloaded V2 selection keeps the caller-provided count and does not project',()=>{
 for(const disabled of ['legacy','unloaded']){
  const f=fixture();if(disabled==='legacy')f.box.ProcessAuthoringV3.enabled=()=>false;else f.box.ProcessEditorV2=undefined;
  assert.match(f.box.editorSelectionPath(5,16),/5 個工段 · 16 個流程/);assert.equal(f.calls.length,0);
 }
});
