import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/process/process-equipment.js',import.meta.url),'utf8');
const section=source.slice(source.indexOf('  const referenceDeadlineMs'),source.indexOf('  function openEditor'));
function fixture(language='zh-Hant'){
  let epoch=1, nextTimeout;
  const requests=[],inputs={note:'unsaved'},identity={},target={originalId:'EQ + 1',record:inputs};
  const element=()=>({isConnected:true,html:'',children:[],set textContent(v){this.html=v;this.children=[];},set innerHTML(v){this.html=v;this.children=[];},append(...children){this.children.push(...children);}});
  let box=element();
  const document={querySelector:()=>box,createElement:()=>({dataset:{}})};
  const host={ProcessSync:{identity,identityGeneration:()=>epoch,captureDelivery:()=>epoch,isCurrentDelivery:id=>id===epoch,platformHeaders:()=>({'X-Test':'1'})}};
  const ctx=vm.createContext({host,document,AbortController,editing:target,t:(zh,vi)=>language==='vi'?vi:zh,h:x=>String(x).replaceAll('<','&lt;'),setTimeout:(fn,ms)=>{nextTimeout={fn,ms};return 1;},clearTimeout(){},fetch:(url,init)=>new Promise((resolve,reject)=>{requests.push({url,init,resolve,reject});init.signal.addEventListener('abort',()=>reject(Error('abort')),{once:true});})});
  vm.runInContext(section+';fixtureLookup=lookupEquipmentReferences;fixtureRender=renderEquipmentReferences;',ctx);
  return {start:()=>ctx.fixtureLookup(target),render:()=>ctx.fixtureRender(target),target,requests,inputs,get box(){return box;},get timeout(){return nextTimeout;},replaceBox(){box.isConnected=false;box=element();},retire(){epoch++;},close(){ctx.editing=null;target.referenceLookup.controller.abort();}};
}
const response=(status,body)=>({ok:status===200,status,json:async()=>body});
test('lookup uses stable ID and does not cut off the standard 24-second read',async()=>{
  const f=fixture(),work=f.start();
  assert.ok(f.timeout.ms>24000);assert.ok(f.timeout.ms<=45000);
  assert.match(f.requests[0].url,/id=EQ%20%2B%201$/);assert.equal(f.requests[0].init.cache,'no-store');
  f.requests[0].resolve(response(200,{total:1,references:[{products:[],name:'<name>',status:'saved'}]}));
  await work;assert.match(f.box.html,/&lt;name>/);assert.match(f.box.html,/草稿/);
  f.replaceBox();f.render();assert.match(f.box.html,/草稿/);assert.equal(f.requests.length,1);
});
test('transient server failure can be retried without losing input',async()=>{
  const f=fixture('vi'),work=f.start();f.requests[0].resolve(response(503,{}));await work;
  assert.match(f.box.html,/Chưa thể xác nhận/);assert.doesNotMatch(f.box.html,/Không có tham chiếu/);
  const retry=f.box.children[1].onclick();f.requests[1].resolve(response(200,{total:0,references:[]}));await retry;
  assert.match(f.box.html,/Không có tham chiếu/);assert.equal(f.inputs.note,'unsaved');
});
test('permission denial, missing target, and bad response are not zero references',async()=>{
  for(const [status,body,expect] of [[403,{},/查看權限/],[404,{},/找不到/],[200,{total:1,references:[]},/無法確認/]]){
    const f=fixture(),work=f.start();f.requests[0].resolve(response(status,body));await work;
    assert.match(f.box.html,expect);assert.doesNotMatch(f.box.html,/目前沒有使用中的引用/);
  }
});
test('known references with restricted details stay non-empty logically',async()=>{
  const f=fixture(),work=f.start();f.requests[0].resolve(response(200,{total:5,references:[],detailsRestricted:true}));await work;
  assert.match(f.box.html,/有引用/);assert.doesNotMatch(f.box.html,/目前沒有使用中的引用/);
});
test('timeout can retry; closed modal or changed identity cannot receive stale results',async()=>{
  const a=fixture(), first=a.start();a.timeout.fn();await first;assert.match(a.box.html,/重試/);
  const b=fixture(), second=b.start();b.close();await second;assert.doesNotMatch(b.box.html,/無法確認/);
  const c=fixture(), third=c.start();c.retire();c.requests[0].resolve(response(200,{total:0,references:[]}));await third;
  assert.doesNotMatch(c.box.html,/沒有使用/);
});
