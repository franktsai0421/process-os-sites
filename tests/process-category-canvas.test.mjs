// Current production category visibility + canvas renderer, synthetic data/DOM only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
const app=fs.readFileSync('public/process/app.js','utf8'),editor=fs.readFileSync('public/process/process-editor.js','utf8');
function cut(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);}
function fixture(lang='zh'){
 const {document}=canvasDOM();document.documentElement.lang=lang;
 const stages=['C-01','C-02','C-03','C-04','C-05'],view={stage:'C-03',search:'',stageSearch:'',product:''},products=[{code:'synthetic-C',name:'Fixture',category:'GIA CONG'}],calls=[];
 const box={document,state:{editorLine:'C',category:'GIA CONG'},data:{products},routing:{lines:[{code:'C',stages:stages.map(code=>({code}))}]},ACTIVE_MASTER_CATEGORIES:[{line:'C',name:'GIA CONG',defaultStages:stages}],routeFor:()=>({line:'C',stages:['C-01']}),lineFor:()=>({stages:stages.map(code=>({code}))}),MasterAdminUI:{maximumRoute(...args){calls.push(args);return {stages:['C-01']};}},view:()=>view,key:()=> 'GIA CONG:C',productsForCategory:()=>products,stageFor:code=>({name:code+' fixture'}),viewport:()=>({zoom:1}),ops:()=>[],card:()=>'',can:()=>false,canvasCan:()=>false,button:(_action,label)=>'<button>'+label+'</button>',h:value=>String(value??''),t:(zh,vi)=>lang==='vi'?vi:zh};box.window=box;vm.createContext(box);
 vm.runInContext(cut(app,'function categoryStageCodes(','function editorKey()')+cut(editor,' function visibleStages()',' function viewport()')+cut(editor,' function workspace()',' const priorEditor='),box);
 return {box,document,stages,view,calls,paint(){const root=document.createElement('main');root.innerHTML=box.workspace();return root;}};
}
for(const lang of ['zh','vi'])void test(`C category with five approved stages renders all five despite a one-stage product route in ${lang}`,()=>{
 const f=fixture(lang),before=JSON.stringify(f.box.ACTIVE_MASTER_CATEGORIES),root=f.paint();
 assert.deepEqual(root.querySelectorAll('[data-pe-stage]').map(row=>row.dataset.peStage),f.stages);assert.equal(root.querySelector('.pe-editor').dataset.stageKey,'C-03');assert.equal(f.calls.length,0,'configured defaults never invoke product-route fallback');assert.equal(JSON.stringify(f.box.ACTIVE_MASTER_CATEGORIES),before);
 assert.match(root.textContent,lang==='vi'?/Công đoạn được giữ theo tuyến nhóm đã duyệt/:/此工段由已核准的群組路線保留/);
});
void test('explicit empty category defaults render no stages without falling back or mutating the hidden stage map during render',()=>{
 const f=fixture(),hidden={'C-OLD':[{id:'retained'}]};f.box.state.editorByCategory={'GIA CONG:C':hidden};f.box.ACTIVE_MASTER_CATEGORIES[0].defaultStages=[];
 assert.deepEqual(f.paint().querySelectorAll('[data-pe-stage]'),[]);assert.equal(f.view.stage,'');assert.equal(f.calls.length,0);assert.equal(f.box.state.editorByCategory['GIA CONG:C'],hidden);assert.equal(hidden['C-OLD'][0].id,'retained');
});
void test('legacy category without configured defaults still delegates to existing product-route union',()=>{
 const f=fixture();delete f.box.ACTIVE_MASTER_CATEGORIES[0].defaultStages;
 assert.deepEqual(f.paint().querySelectorAll('[data-pe-stage]').map(row=>row.dataset.peStage),['C-01']);assert.equal(f.calls.length,1);
});
