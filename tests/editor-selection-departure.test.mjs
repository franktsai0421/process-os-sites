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
