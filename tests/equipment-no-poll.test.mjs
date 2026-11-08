// Full production caller and transport in a synthetic DOM/HTTP fixture.
// No browser, server authorization, layout, live data or network claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
const source=fs.readFileSync(process.env.EQUIPMENT_POLL_SOURCE||'public/process/routine-equipment.js','utf8');
const clientSource=fs.readFileSync('public/process/shared-draft-client.js','utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const storage=()=>{const data=new Map();return{data,get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};};
function fixture(){
 const dom=canvasDOM(),document=dom.document;
 document.getElementById=id=>document.querySelector('#'+id);document.visibilityState='visible';
 const host=document.createElement('main');host.id='data-content';host.dataset.activeTab='quality-routine-equipment';document.body.append(host);
 const snapshot={equipment:[{id:'eq',assetCode:'SYNTHETIC',pieceMark:'01',name:'Tool',unit:'支',groupId:'grp',enabled:true,notes:''}],categories:[{id:'cat',code:'C01',name:'Category'}],subcategories:[{id:'sub',categoryId:'cat',name:'Sub'}],groups:[{id:'grp',categoryId:'cat',subcategoryId:'sub',name:'Group'}],issues:[]};
 const control={schemaVersion:1,issues:[],reservedMarks:{},activeVersionId:null,versions:[{id:'draft',number:1,status:'draft',history:[],snapshot:clone(snapshot),...clone(snapshot)}],workflow:{scope:'routine-equipment',generation:'gen',revision:1,pendingId:null,working:clone(snapshot),saved:null,cases:[]}};
 const permissions=Object.fromEntries(['view','edit','save','create','delete','submit','approve','return','withdraw','history','restore'].map(k=>[k,true]));
 let actor={id:'owner',name:'Owner',role:'admin'},epoch=1,delivery=1,nextTimer=0,responseStatus=200,intercept=null;
 const calls=[],timers=new Map(),session=storage();
 const c={...dom,console,crypto:webcrypto,URL,URLSearchParams,Response,Request,Headers,AbortController,AbortSignal,structuredClone,Map,Set,Promise,JSON,Date,Math,Intl,Number,Error,
  location:{href:'https://synthetic.invalid/process/',origin:'https://synthetic.invalid',pathname:'/process/'},CSS:{escape:String},scrollX:0,scrollY:0,scrollTo(){},requestAnimationFrame(){},
  setTimeout(fn,ms){timers.set(++nextTimer,{fn,ms});return nextTimer;},clearTimeout:id=>timers.delete(id),setInterval(){throw Error('EQUIPMENT_INTERVAL_FORBIDDEN');},clearInterval(){},
  localStorage:storage(),sessionStorage:session,hasPermission:()=>true,confirm:()=>true,alert(){},
  ProcessSync:{get identity(){return actor;},identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:d=>d===delivery,platformHeaders:()=>({'Content-Type':'application/json'}),requiresReload:false},
  VersionDraftUI:{mount(){},t:value=>value,date:()=>'',updateSync(){},preserveView:()=>()=>{}}
 };c.window=c;dom.events(c);
 c.fetch=async(url,options={})=>{
  calls.push({url:String(url),method:options.method||'GET'});
  assert.equal(options.method||'GET','GET','reading/retry never authorizes a write');
  if(intercept)await intercept(url);
  return Response.json(responseStatus===200?{control:clone(control),revision:10,permissions}: {error:'READ_FAILED'},{status:responseStatus});
 };
 vm.createContext(c);vm.runInContext(clientSource,c,{filename:'shared-draft-client.js'});
 // Do not provide a permissive fake scheduler: any scheduler construction fails.
 c.createForegroundPoll=()=>{throw Error('EQUIPMENT_FOREGROUND_POLL_FORBIDDEN');};
 const hook=`window.testPort={read,render,enterExistingDraft,get working(){return working;},get base(){return syncBase;},get owner(){return inputOwner;},get control(){return control;},get revision(){return revision;},get unavailable(){return readUnavailable;},get client(){return sharedClient;},get message(){return message;},replaceVersion(){selectedVersionId='other';}};`;
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,hook+'})();'),c,{filename:'routine-equipment.js'});
 const p=c.testPort;
 async function idle(){
  for(const kind of ['focus','visibilitychange','pageshow']){c.dispatchEvent({type:kind});document.dispatchEvent?.({type:kind});}
  // Drain finite UI timers, but fail an unexpectedly recurring callback rather
  // than hanging. Normal read request deadlines have already been cleared.
  let executions=0;
  while(timers.size){assert(++executions<=10,'recursive scheduled callback is forbidden');const [id,item]=timers.entries().next().value;timers.delete(id);await item.fn();await tick();}
  await tick();assert.equal(timers.size,0);
 }
 return{c,p,host,calls,control,permissions,session,timers,idle,status:n=>responseStatus=n,intercept:fn=>intercept=fn,
  change(kind){if(kind==='actor')actor={id:'other',role:'admin'};if(kind==='actor-object')actor={...actor};if(kind==='epoch')epoch++;if(kind==='delivery')delivery++;if(kind==='reload')c.ProcessSync.requiresReload=true;if(kind==='tab')host.dataset.activeTab='other';if(kind==='disconnect')host.remove();if(kind==='version')p.replaceVersion();if(kind==='reset')c.RoutineEquipmentUI.navigation.reset();if(kind==='generation')p.control.workflow.generation='new';if(kind==='missing-epoch')delete c.ProcessSync.identityGeneration;if(kind==='malformed-epoch')c.ProcessSync.identityGeneration=()=>null;if(kind==='missing-capture')delete c.ProcessSync.captureDelivery;if(kind==='missing-current')delete c.ProcessSync.isCurrentDelivery;}
 };
}

void test('full equipment mount, explicit read and reset never construct or rearm a poll',async()=>{
 const f=fixture();await f.c.RoutineEquipmentUI.mount(f.host);
 assert.equal(f.calls.length,2,'mount data GET plus fresh permission GET');assert.equal(f.p.control.workflow.generation,'gen');
 await f.idle();assert.equal(f.calls.length,2,'focus, visibility and idle do not refresh');
 await f.p.read();assert.equal(f.calls.length,4,'explicit read remains available');await f.idle();assert.equal(f.calls.length,4);
 f.c.RoutineEquipmentUI.navigation.reset();await f.idle();assert.equal(f.calls.length,4);
 await f.c.RoutineEquipmentUI.mount(f.host);assert.equal(f.calls.length,6);await f.idle();assert.equal(f.calls.length,6);
});

void test('dirty remount and explicit read retain original working/base objects and newer input',async()=>{
 const f=fixture();await f.c.RoutineEquipmentUI.mount(f.host);
 const local=f.p.working,base=f.p.base;local.equipment[0].notes='mine';
 await f.c.RoutineEquipmentUI.mount(f.host);assert.equal(f.calls.length,2);await f.idle();assert.equal(f.calls.length,2);
 f.control.workflow.working.equipment[0].notes='peer';await f.p.read(true,true);
 assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(local.equipment[0].notes,'mine');assert.equal(base.equipment[0].notes,'');
 await f.idle();assert.equal(f.calls.length,4);
});

for(const status of [401,403,503])void test('actual '+status+' Retry button makes only explicit GETs and retains local edits',async()=>{
 const f=fixture();await f.c.RoutineEquipmentUI.mount(f.host);const local=f.p.working,base=f.p.base;local.equipment[0].notes='retained';
 f.status(status);await assert.rejects(f.p.read(),/READ_FAILED/);assert.equal(f.p.unavailable,true);f.p.render();const count=f.calls.length;
 await f.idle();assert.equal(f.calls.length,count,'failed read never self-retries');
 const retry=f.host.querySelector('#routine-load-retry');assert(retry,'visible existing Retry control');f.status(200);retry.click();
 for(let i=0;i<8;i++)await tick();assert.equal(f.calls.length,count+2);assert.equal(f.p.unavailable,false);assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(local.equipment[0].notes,'retained');
 await f.idle();assert.equal(f.calls.length,count+2);
});

for(const kind of ['actor','actor-object','epoch','delivery','reload','tab','disconnect','version','reset'])void test('late explicit read rejects '+kind+' without stale adoption or timer',async()=>{
 const f=fixture();await f.c.RoutineEquipmentUI.mount(f.host);const before=f.p.control,local=f.p.working,base=f.p.base;local.equipment[0].notes='private';
 let release,started;const held=new Promise(r=>release=r),waiting=new Promise(r=>started=r);f.intercept(async()=>{started();await held;});
 const pending=f.p.read(true,true);await waiting;f.change(kind);const current=f.p.control;release();await assert.rejects(pending,/DELIVERY_SUPERSEDED/);
 assert.equal(f.p.control,current);if(kind!=='reset'){assert.equal(current,before);assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(local.equipment[0].notes,'private');}
 assert.equal(f.calls.length,3,'stale data reply never advances to permission read');await f.idle();assert.equal(f.calls.length,3);
});

void test('later typing while explicit read waits remains unsent with original comparison base',async()=>{
 const f=fixture();await f.c.RoutineEquipmentUI.mount(f.host);const local=f.p.working,base=f.p.base;local.equipment[0].notes='first';
 let release,started;const held=new Promise(r=>release=r),waiting=new Promise(r=>started=r);f.intercept(async()=>{started();await held;});
 const pending=f.p.read(true,true);await waiting;local.equipment[0].notes='newer';release();await pending;
 assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(local.equipment[0].notes,'newer');assert.equal(base.equipment[0].notes,'');await f.idle();assert.equal(f.calls.length,4);
});

void test('legacy unidentified Begin marker remains byte-identical across mount, read and receipt query',async()=>{
 const f=fixture(),key='routine-equipment-begin-recovery:owner',raw=JSON.stringify({schema:1,actorId:'owner',activeVersionId:null,generation:'gen'});f.session.setItem(key,raw);
 await f.c.RoutineEquipmentUI.mount(f.host);assert.equal(f.p.unavailable,true);const count=f.calls.length;
 await f.p.enterExistingDraft();assert.equal(f.calls.length,count,'unidentified outcome is never polled, resent or adopted as a receipt');
 await f.p.read(true,true);assert.equal(f.session.getItem(key),raw);assert.equal(f.p.unavailable,true);await f.idle();assert.equal(f.calls.length,count+2);
 f.c.RoutineEquipmentUI.navigation.reset();assert.equal(f.session.getItem(key),raw);
});

for(const kind of ['actor','actor-object','epoch','delivery','reload','tab','disconnect','generation','missing-epoch','malformed-epoch','missing-capture','missing-current'])void test('explicit read with retained input fails closed before dispatch for '+kind,async()=>{
 const f=fixture();await f.c.RoutineEquipmentUI.mount(f.host);const local=f.p.working,base=f.p.base,owner=f.p.owner,before=f.p.control;local.equipment[0].notes='private';f.change(kind);
 await assert.rejects(f.p.read());assert.equal(f.calls.length,2,'invalid retained-input provenance dispatches no GET');assert.equal(f.p.working,local);assert.equal(f.p.base,base);assert.equal(f.p.owner,owner);assert.equal(f.p.control,before);assert.equal(local.equipment[0].notes,'private');await f.idle();assert.equal(f.calls.length,2);
});
