import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=name=>fs.readFileSync(new URL('../public/process/'+name,import.meta.url),'utf8');
function fn(file,name){const text=source(file),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let value;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name){assert(!value);value=n.getText(ast);}ts.forEachChild(n,visit);}visit(ast);assert(value,name);return value;}
function box(context,file,names){vm.createContext(context);for(const name of names)vm.runInContext(fn(file,name),context);return context;}
function equipment(){
 const frames=[],events={};let renders=0,focus=0,scroll=0,summaries=0,generation=1,activeArea;
 const node=()=>({isConnected:true,value:'',focus(){focus++;},setSelectionRange(){},showModal(){this.open=true;},contains:()=>true});
 let input=node(),dialog=node(),field=node();const summary={set innerHTML(value){this.markup=value;summaries++;},querySelectorAll:()=>[]};
 const area={isConnected:true,firstElementChild:{},querySelector:s=>s==='#equipment-search'?input:s==='#equipment-editor-dialog'?dialog:s.startsWith('[data-equipment-field')?field:s==='#equipment-panel .equipment-summary'?summary:null,set innerHTML(_){renders++;input.isConnected=false;input=node();dialog=node();field=node();this.firstElementChild={};}};activeArea=area;
 const sync={captureDelivery:()=>generation,isCurrentDelivery:owner=>owner===generation,requiresReload:false},host={ProcessSync:sync};
 const document={
  querySelector:s=>s==='#data-content'?activeArea:s==='#equipment-search'?input:null,
  querySelectorAll:()=>[],addEventListener:(event,cb)=>events[event]=cb,
  createElement(tag){assert.equal(tag,'template');return{
   set innerHTML(v){this.content={querySelector:s=>{assert.equal(s,'.equipment-summary');return{innerHTML:v};}};}
  };}
 };
 const b=box({document,host,search:'',lineFilter:'',stageFilter:'',editing:null,repaintGeneration:0,scrollY:15,scrollTo(){scroll++;},requestAnimationFrame:cb=>frames.push(cb),processMasterView:()=>'<master/>',bindDataInner(){},bindLightbox(){},commitEditor(){},panel:()=>'<filtered>'+b.search+'</filtered>',CSS:{escape:v=>v}},'process-equipment.js',['currentEquipmentMount','repaint','bindEquipmentRows','refreshEquipmentSearch','bind']);
 const trackerWindow={};vm.runInNewContext(source('navigation-forms.js'),{window:trackerWindow,document});host.ProcessNavigationForms=trackerWindow.ProcessNavigationForms;
 Object.assign(input,{tagName:'INPUT',type:'search',defaultValue:'',matches:()=>true});b.bind();
 return{b,host,document,area,summary,frames,events,input:()=>input,dialog:()=>dialog,stats:()=>({renders,focus,scroll,summaries}),newGeneration(){generation++;},replaceArea(){activeArea={...area};},replaceContent(){area.firstElementChild={};},replaceInput(){input=node();}};
}
void test('PROCESS search preserves composing node and departure guard; adopts one final value without refocus',()=>{
 const f=equipment(),input=f.input();f.events.compositionstart({target:input});input.oncompositionstart();
 for(const value of ['中','中文','中文 Việt']){input.value=value;input.oninput({target:input,isComposing:true});}
 assert.equal(f.host.ProcessNavigationForms.composing(),true);assert.equal(f.input(),input);assert.deepEqual(f.stats(),{renders:0,focus:0,scroll:0,summaries:0});
 input.oncompositionend({target:input});f.events.compositionend({target:input});input.oninput({target:input,isComposing:false});
 assert.equal(f.input(),input);assert.equal(input.value,'中文 Việt');assert.equal(f.b.search,'中文 Việt');assert.equal(f.stats().summaries,1);assert.equal(f.frames.length,0);assert.equal(f.host.ProcessNavigationForms.composing(),false);
 input.value='';input.oninput({target:input,isComposing:false});assert.equal(f.stats().summaries,2);input.oninput({target:input,isComposing:false});assert.equal(f.stats().summaries,2);
});
void test('PROCESS composition flag also covers browsers with a false interim isComposing',()=>{const f=equipment(),i=f.input();i.oncompositionstart();i.value='Kiểm';i.oninput({isComposing:false});assert.equal(f.stats().summaries,0);i.oncompositionend({});assert.equal(f.stats().summaries,1);});
for(const invalidation of ['newGeneration','replaceArea','replaceContent','replaceInput'])void test('PROCESS old search callback is inert after '+invalidation,()=>{const f=equipment(),i=f.input();f[invalidation]();i.value='stale';i.oninput({isComposing:false});assert.equal(f.b.search,'');assert.equal(f.stats().summaries,0);});
for(const invalidation of ['newGeneration','replaceArea','replaceContent','replaceInput','reload','repaint'])void test('PROCESS deferred repaint ownership rejects '+invalidation,()=>{
 const f=equipment();f.b.repaint(false,true);assert.equal(f.frames.length,1);
 if(invalidation==='reload')f.host.ProcessSync.requiresReload=true;else if(invalidation==='repaint')f.b.repaint(false,true);else f[invalidation]();
 f.frames.shift()();assert.equal(f.stats().focus,0);assert.equal(f.stats().scroll,0);
 if(invalidation==='repaint'){f.frames.shift()();assert.equal(f.stats().focus,1);assert.equal(f.stats().scroll,1);}
});
void test('PROCESS current repaint retains legacy dialog focus and refuses focus during composition',()=>{
 const f=equipment();f.b.repaint(true,false,'name');f.frames.shift()();assert.equal(f.dialog().open,true);assert.equal(f.stats().focus,1);
 f.b.repaint(false,true);f.host.ProcessNavigationForms={composing:()=>true};f.frames.shift()();assert.equal(f.stats().focus,1);assert.equal(f.stats().scroll,1);
});
function iqc(){let refreshes=0;const handlers={},input={value:'',isConnected:true,addEventListener:(name,cb)=>handlers[name]=cb};const root={querySelectorAll:selector=>selector==='#iqc-search'?[input]:[]};const b=box({root,ui:{search:''},refreshPartRows(){refreshes++;},bindPartRows(){},render(){},importPreview(){}},'iqc-master.js',['bind']);b.bind();return{handlers,input,b,refreshes:()=>refreshes};}
void test('IQC final composition value renders once; typing/clear still update and accents stay exact',()=>{
 const f=iqc();for(const value of ['中','中文','Kiể']){f.input.value=value;f.handlers.input({target:f.input,isComposing:true});}assert.equal(f.refreshes(),0);
 f.input.value='Kiểm tra';f.handlers.compositionend({target:f.input});f.handlers.input({target:f.input,isComposing:false});assert.equal(f.refreshes(),1);assert.equal(f.b.ui.search,'Kiểm tra');
 f.input.value='Kiểm tra'.normalize('NFD');f.handlers.input({target:f.input,isComposing:false});assert.equal(f.refreshes(),2);assert.equal(f.b.ui.search,f.input.value);
 f.input.value='';f.handlers.input({target:f.input,isComposing:false});assert.equal(f.refreshes(),3);f.handlers.compositionend({target:f.input});assert.equal(f.refreshes(),3);
});
