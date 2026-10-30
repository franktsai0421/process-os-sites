import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/process/spreadsheet-loader.js','utf8');
const turn=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function fixture(){
 const requests=[],selects=[],timers=new Map();let epoch=1,delivery=1,timer=0;
 function node(){return {isConnected:true,children:[],attributes:{},append(n){this.children.push(n);n.parentNode=this;},remove(){this.isConnected=false;if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];}};}
 const parent=node(),input=node();parent.append(input);input.disabled=false;input.files=[];
 const sync={identity:{id:'actor'},identityGeneration:()=>epoch,captureDelivery:()=>({delivery}),isCurrentDelivery:o=>o.delivery===delivery};
 const c={window:null,document:{documentElement:{lang:'zh'},querySelectorAll:()=>selects,createElement:node,head:{append:n=>requests.push(n)}},state:{view:'data',dataTab:'bom',masterScope:'AB'},ProcessSync:sync,Map,WeakMap,Promise,Error,JSON,setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id)};c.window=c;vm.runInNewContext(source,c);
 return {c,requests,input,parent,selects,api:c.ProcessSpreadsheet,complete(){c.XLSX={read(){},utils:{},writeFile(){}};requests.at(-1).onload();},rotate(){epoch++;},navigate(){delivery++;},node};
}
void test('no eager vendor request; concurrent load is single flight and failure permits explicit retry',async()=>{
 const f=fixture();assert.equal(f.requests.length,0);const first=f.api.load(),same=f.api.load();assert.equal(first,same);assert.equal(f.requests.length,1);
 const rejected=assert.rejects(first,/Excel/);f.requests[0].onerror();await rejected;await turn();
 const retry=f.api.load();assert.equal(f.requests.length,2);f.complete();await retry;await f.api.load();assert.equal(f.requests.length,2);
});
void test('duplicate intent waits original async handler and never changes its business disabled flag',async()=>{
 const f=fixture();let calls=0,release;const gate=new Promise(r=>release=r),handler=f.api.wrap('export',async()=>{calls++;f.input.disabled=true;await gate;});const event={target:f.input,currentTarget:f.input};
 const task=handler(event);handler(event);f.complete();await turn();assert.equal(calls,1);handler(event);assert.equal(calls,1);release();await task;assert.equal(f.input.disabled,true);assert.equal(f.parent.children.length,1);
});
void test('new file replaces only unstarted intent; failure keeps file and retry invokes once',async()=>{
 const f=fixture(),a={},b={},seen=[];f.input.files=[a];const handler=f.api.wrap('import',e=>seen.push(e.target.files[0])),event={target:f.input,currentTarget:f.input};
 const first=handler(event);f.input.files=[b];const second=handler(event);assert.equal(f.requests.length,1);f.complete();await Promise.all([first,second]);assert.deepEqual(seen,[b]);
 const g=fixture(),selected={};g.input.files=[selected];let calls=0;const h=g.api.wrap('import',()=>{calls++;});const task=h({target:g.input,currentTarget:g.input});g.requests[0].onerror();await task;assert.equal(calls,0);assert.equal(g.input.files[0],selected);
 const alert=g.parent.children.find(n=>n.attributes.role==='alert'),button=alert.children[1];const retry=button.onclick();g.complete();await retry;assert.equal(calls,1);
});
void test('actor, epoch, delivery, route and same-page selection changes refuse delayed work without locking controls',async()=>{
 for(const change of [f=>f.c.ProcessSync.identity.id='other',f=>f.rotate(),f=>f.navigate(),f=>f.c.state.masterScope='C',f=>f.selects[0].value='new']){
  const f=fixture();f.selects.push({...f.node(),value:'old'});let calls=0;const task=f.api.wrap('export',()=>calls++)({target:f.input,currentTarget:f.input});change(f);f.complete();await task;assert.equal(calls,0);assert.equal(f.input.disabled,false);assert(f.parent.children.some(n=>n.attributes.role==='alert'));
 }
 const f=fixture();let selection='A',calls=0;const task=f.api.wrap('export',()=>calls++,()=>selection)({target:f.input,currentTarget:f.input});selection='B';f.complete();await task;assert.equal(calls,0);
});
void test('loaded XLSX keeps retry errors from replaying a handler that may already have written',async()=>{
 const f=fixture();let calls=0;const task=f.api.wrap('import',()=>{calls++;throw Error('domain failure');})({target:f.input,currentTarget:f.input});f.complete();await task;
 const alert=f.parent.children.find(n=>n.attributes.role==='alert');assert.equal(alert.children.length,1);assert.equal(calls,1);
});
void test('a replaced intent stays cancelled even if selection returns to its old value',async()=>{
 const f=fixture();let selection='A';const seen=[],handler=f.api.wrap('export',()=>seen.push(selection),()=>selection),event={target:f.input,currentTarget:f.input};
 const first=handler(event);selection='B';const second=handler(event);selection='A';const third=handler(event);f.complete();await Promise.all([first,second,third]);assert.deepEqual(seen,['A']);
});
