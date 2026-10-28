import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync('public/process/shared-draft-client.js','utf8');
const noticeSource=fs.readFileSync('public/process/effective-version-notice.js','utf8');
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function clock(){let now=0,id=0;const timers=new Map();return{
 setTimeout(fn,ms){const key=++id;timers.set(key,{at:now+ms,fn});return key;},
 clearTimeout(key){timers.delete(key);},
 async tick(ms){const end=now+ms;await drain();for(;;){const entry=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();await drain();}now=end;await drain();},
 get pending(){return timers.size;},get now(){return now;}};}
function responseAfter(c,ms,signal,value,status=200){return new Promise((resolve,reject)=>{
 const abort=()=>{c.clearTimeout(timer);reject(signal.reason);};
 const timer=c.setTimeout(()=>{signal.removeEventListener('abort',abort);resolve(Response.json(value,{status}));},ms);
 signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
});}
function clientFixture(handler,endpoint='/api/process-authoring/workflow?caseMetadata=1'){const c=clock(),calls=[],memory=new Map(),owner={identity:{id:'owner'}},window={ProcessSync:owner};
 vm.runInNewContext(source,{window,document:{documentElement:{lang:'vi'}},fetch:(url,options)=>{calls.push({url,method:options.method});return handler(c,url,options);},crypto:webcrypto,AbortController,setTimeout:c.setTimeout.bind(c),clearTimeout:c.clearTimeout.bind(c),sessionStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}});
 return {c,calls,owner,memory,client:window.createSharedDraftClient({endpoint,actorId:'owner',headers:()=>({})})};}
let cases=0;
async function test(name,run){await run();cases++;console.log('PASS '+name);}
await test('24-second owned read survives old 15-second boundary; exact response and one GET',async()=>{
 const f=clientFixture((c,_url,o)=>responseAfter(c,24000,o.signal,{revision:496,permissions:{view:true},control:{workflow:{generation:'g',revision:7}}}));
 let done=false;const p=f.client.read().then(v=>{done=true;return v;});await f.c.tick(15001);assert.equal(done,false);await f.c.tick(8999);const v=await p;assert.equal(v.revision,496);assert.equal(v.control.workflow.revision,7);assert.deepEqual(f.calls.map(x=>x.method),['GET']);assert.equal(f.c.pending,0);
});
await test('hung read aborts at 45 seconds with no automatic retry or unknown write',async()=>{
 const f=clientFixture((c,_url,o)=>responseAfter(c,60000,o.signal,{}));const p=assert.rejects(f.client.read(),e=>e.name==='AbortError');await f.c.tick(45000);await p;assert.equal(f.calls.length,1);assert.equal(f.client.hasUnknown(),false);assert.equal(f.c.pending,0);
});
for(const [endpoint,deadline] of [['/api/process-authoring/workflow?caseMetadata=1',45000],['/api/iqc/workflow',15000]])await test('mutation deadline '+deadline+'ms for '+endpoint+'; only receipt GET follows; unresolved command stays fenced',async()=>{
 const f=clientFixture((c,_url,o)=>o.method==='POST'?responseAfter(c,60000,o.signal,{}):Promise.resolve(Response.json({error:'OPERATION_NOT_FOUND'},{status:404})),endpoint);
 let settled=false;const p=assert.rejects(f.client.command('g','apply',{patches:[]}),/RESULT_UNKNOWN_CHECK_BEFORE_RETRY/).then(()=>{settled=true;});await f.c.tick(deadline-1);assert.equal(settled,false);assert.deepEqual(f.calls.map(x=>x.method),['POST']);const bytes=[...f.memory];assert.equal(bytes.length,1);await f.c.tick(1);await p;assert.deepEqual(f.calls.map(x=>x.method),['POST','GET']);assert.equal(f.client.hasUnknown(),true);assert.deepEqual([...f.memory],bytes);await assert.rejects(f.client.command('g','save'),/UNKNOWN/);assert.deepEqual([...f.memory],bytes);assert.equal(f.calls.length,2);assert.equal(f.c.pending,0);
});
await test('slow response from previous actor is rejected, never adopted',async()=>{
 const f=clientFixture((c,_url,o)=>responseAfter(c,24000,o.signal,{revision:496,permissions:{view:true}}));const p=assert.rejects(f.client.read(),/ACCOUNT_CHANGED/);await f.c.tick(16000);f.owner.identity={id:'other'};await f.c.tick(8000);await p;assert.equal(f.calls.length,1);
});
function noticeFixture(ms){const c=clock(),calls=[],notices=[],intervals=[],nodes=new Map();const window={ProcessSync:{identity:{id:'owner'},platformHeaders:()=>({})},addEventListener(){}};
 const node=()=>({dataset:{},setAttribute(){},append(){},replaceChildren(){},remove(){nodes.delete('#effective-version-notice');}});
 const document={hidden:false,documentElement:{lang:'vi'},addEventListener(){},querySelector(selector){if(selector==='main')return{prepend(n){nodes.set('#effective-version-notice',n);notices.push(n);}};if(selector.includes('[data-load-error]')){const n=nodes.get('#effective-version-notice');return n?.dataset.loadError?n:null;}return nodes.get(selector)||null;},createElement:node};
 vm.runInNewContext(source+'\n'+noticeSource,{window,document,localStorage:{getItem:k=>k==='processAuthoringControl'?'{}':null},location:{href:'/process/'},setInterval:fn=>intervals.push(fn),AbortSignal:{timeout(delay){const controller=new AbortController();c.setTimeout(()=>controller.abort(),delay);return controller.signal;}},fetch:(url,o)=>{calls.push(url);return responseAfter(c,ms,o.signal,{revision:496,effective:{processAuthoringControl:'active'}});}});
 return{c,calls,notices,window,intervals};}
await test('16-second effective-version check succeeds without false error or overlapping polling',async()=>{
 const f=noticeFixture(16116);await f.c.tick(15001);void f.window.EffectiveVersionNotice.check();assert.equal(f.calls.length,1);await f.c.tick(1115);assert.equal(f.notices.length,0);assert.equal(f.calls.length,1);
});
await test('effective-version hung request remains bounded, displays warning and does not refresh data',async()=>{
 const f=noticeFixture(60000);await f.c.tick(30000);f.intervals[0]();assert.equal(f.calls.length,1);await f.c.tick(15000);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.length,1);assert.equal(f.notices.length,1);assert.equal(f.notices[0].dataset.loadError,'1');
});
console.log(JSON.stringify({status:'PASS',cases,synthetic:true,realData:false,network:false}));
