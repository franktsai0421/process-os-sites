import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/process/master-admin-ui.js','utf8');
const start=source.indexOf("      on('#master-line-import-file','change',async event=>"),handler=source.slice(start,source.indexOf('\n',start));
const deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve};};
function fixture(){
 const parsed=deferred(),saved=deferred(),counts={parse:0,write:0,merge:0,render:0,toast:0};let epoch=1,allowed=true,confirmed=true;
 const input={files:[{name:'fixture.xlsx'}],value:'fixture.xlsx'},catalog={products:[],lines:[]},flow={generation:'g'},sync={identity:{id:'owner'},identityGeneration:()=>epoch,captureDelivery:()=>1,isCurrentDelivery:()=>true};
 const box={pendingImport:null,state:{masterScope:'AB'},window:{ProcessSync:sync},shared:{flow:()=>flow},permitted:()=>allowed,editable:()=>catalog,record(){},draft:()=>({}),t:zh=>zh,confirm:()=>confirmed,toast:()=>counts.toast++,redraw:()=>counts.render++,console:{warn(){}},
  on(_selector,_event,fn){box.change=fn;},LineStageExcel:{readFile(){counts.parse++;return parsed.promise;},merge(){counts.merge++;},replace(){counts.merge++;}},persist(){counts.write++;return saved.promise;}};
 vm.createContext(box);vm.runInContext(handler,box);
 return{box,input,catalog,flow,sync,counts,parsed,saved,run:()=>box.change({target:input}),epoch:()=>epoch++,allowed:v=>allowed=v,confirmed:v=>confirmed=v};
}
void test('line import holds departure busy through parse and acknowledged Apply, coalescing repeat input',async()=>{const f=fixture(),run=f.run();assert(f.box.pendingImport);await f.run();assert.equal(f.counts.parse,1);f.parsed.resolve([{code:'A',stages:[]}]);await new Promise(setImmediate);assert.equal(f.counts.write,1);assert(f.box.pendingImport);assert.equal(f.counts.render,0);f.saved.resolve({receipt:{status:'confirmed'}});await run;assert.equal(f.box.pendingImport,null);assert.equal(f.counts.render,1);assert.equal(f.input.value,'');});
for(const kind of ['identity','epoch','scope','generation','permission'])void test('line import '+kind+' change while parsing cannot Apply or touch shared data',async()=>{const f=fixture(),run=f.run();if(kind==='identity')f.sync.identity={id:'other'};if(kind==='epoch')f.epoch();if(kind==='scope')f.box.state.masterScope='C';if(kind==='generation')f.flow.generation='new';if(kind==='permission')f.allowed(false);f.parsed.resolve([{code:'A',stages:[]}]);await run;assert.equal(f.counts.write,0);assert.equal(f.counts.merge,0);assert.equal(f.counts.render,0);assert.equal(f.box.pendingImport,null);});
void test('canceling explicit line import confirmation preserves data and releases departure lock',async()=>{const f=fixture();f.confirmed(false);const run=f.run();f.parsed.resolve([{code:'A',stages:[]}]);await run;assert.equal(f.counts.write,0);assert.equal(f.counts.merge,0);assert.equal(f.box.pendingImport,null);});
