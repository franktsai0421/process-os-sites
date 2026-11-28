import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{fixture}=require('../scripts/equipment-atomic-fixture.cjs'),tick=()=>new Promise(setImmediate),gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
void test('equipment editor paints immediately while references wait; late completion never replaces typed fields',async()=>{
 const h=await fixture();try{const f=await h.connect(),send=f.c.fetch,held=gate();let started=false;f.c.fetch=async(url,options)=>{if(String(url)==='/api/quality-equipment-replacement?sourceId=source'){started=true;await held.promise;}return send(url,options);};
 await f.test.openEditEquipment('source');assert(f.host.querySelector('#routine-editor'));const input=f.host.querySelector('#routine-editor [data-field="notes"]');input.value='Typed while references load';input.oninput();assert.match(f.host.innerHTML,/載入各品質系統/);for(let i=0;!started&&i<10;i++)await tick();assert(started);held.resolve();for(let i=0;i<30;i++)await tick();assert.equal(f.host.querySelector('#routine-editor [data-field="notes"]'),input);assert.equal(input.value,'Typed while references load');
 }finally{h.close();}
});
async function setup(){const h=await fixture();await h.command('routine-equipment','save',{moduleAction:'save-local-v1',patches:[{op:'insert',path:['equipment'],value:{id:'isolated-delete',assetCode:'SYN-DELETE',groupId:'group',name:'Isolated removable',unit:'支',enabled:true,confirmed:false,calibrationMethod:'none',calibratedAt:'',expiresAt:''}}],guards:[{path:['groups',{id:'group'}],value:(await h.state()).workflow.working.groups[0]}]});return{h,f:await h.connect()};}
for(const mode of ['success','failed','cancel','switch'])void test(`equipment delete fresh reference preflight ${mode} has visible progress, no duplicates and preserves protected data`,async()=>{
 const{h,f}=await setup();let release;try{
  const send=f.c.fetch,held=gate(),started=gate();let reads=0;f.c.fetch=async(url,options={})=>{if(String(url)==='/api/iqc'){reads++;started.resolve();await held.promise;if(mode==='failed')throw Error('READ_FAILED');if(options.signal?.aborted)throw Error('READ_ABORTED');}return send(url,options);};release=held.resolve;
  const before=h.requests.filter(r=>r.method==='POST').length,task=f.test.deleteEquipment('isolated-delete');await started.promise;assert.match(f.host.textContent,/引用檢查中/);assert(f.host.querySelector('#routine-reference-cancel'));await f.test.deleteEquipment('isolated-delete');assert.equal(reads,1);assert.equal(h.requests.filter(r=>r.method==='POST').length,before);
  if(mode==='cancel')f.host.querySelector('#routine-reference-cancel').click();if(mode==='switch')f.test.bumpVersion();held.resolve();await task;
  assert.equal(h.requests.filter(r=>r.method==='POST').length,before,'delete completion remains local until explicit Save');
  if(mode==='success'){assert(!f.test.working.equipment.some(r=>r.id==='isolated-delete'));assert.match(f.host.textContent,/尚未保存|本地/);assert(await f.test.writeShared('save'),f.test.message);assert(!(await h.state()).workflow.saved.content.equipment.some(r=>r.id==='isolated-delete'));assert((await h.state()).workflow.saved.content.equipment.some(r=>r.id==='source'));}
  else {assert(f.test.working.equipment.some(r=>r.id==='isolated-delete'));assert((await h.state()).workflow.saved.content.equipment.some(r=>r.id==='isolated-delete'));if(mode!=='switch')assert(!f.host.querySelector('#routine-reference-cancel'));if(mode==='failed')assert.match(f.host.textContent,/無法確認品質標準引用/);if(mode==='cancel')assert.match(f.host.textContent,/已取消/);}
 }finally{release?.();h.close();}
});
void test('equipment delete with active reference blocks without local removal or Save',async()=>{
 const{h,f}=await setup();try{
  f.c.FQCQualityAPI={getEquipmentReferences:()=>[{status:'approved',isActive:true,versionId:'approved',itemId:'linked',checkNo:'SYN-LINK',equipmentId:'isolated-delete'}]};const before=h.requests.filter(r=>r.method==='POST').length;await f.test.deleteEquipment('isolated-delete');assert(f.test.working.equipment.some(r=>r.id==='isolated-delete'));assert.equal(h.requests.filter(r=>r.method==='POST').length,before);assert.match(f.test.message,/仍有引用/);
 }finally{h.close();}
});
void test('equipment delete finite reference-read deadline fails closed and clears progress without any write',async()=>{
 const{h,f}=await setup();try{const send=f.c.fetch,timer=f.c.setTimeout;let expire,started;const waiting=new Promise(r=>started=r);f.c.setTimeout=(fn,ms)=>{if(ms===45000)expire=fn;return timer(fn,ms);};f.c.fetch=(url,options={})=>String(url)==='/api/iqc'?new Promise((_,reject)=>{started();options.signal.addEventListener('abort',()=>reject(Error('READ_TIMEOUT')),{once:true});}):send(url,options);
 const before=h.requests.filter(r=>r.method==='POST').length,task=f.test.deleteEquipment('isolated-delete');await waiting;assert(expire);expire();await task;assert(f.test.working.equipment.some(r=>r.id==='isolated-delete'));assert.match(f.test.message,/無法確認品質標準引用/);assert(!f.host.querySelector('#routine-reference-cancel'));assert.equal(h.requests.filter(r=>r.method==='POST').length,before);
 }finally{h.close();}
});
