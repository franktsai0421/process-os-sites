import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(process.env.AB_CREATE_DEADLINE_SOURCE||'public/process/shared-draft-client.js','utf8');
const drain=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function clock(){let now=0,id=0;const timers=new Map();return{
 setTimeout(fn,ms){const key=++id;timers.set(key,{at:now+ms,fn});return key;},clearTimeout:key=>timers.delete(key),
 async tick(ms){await drain();const end=now+ms;for(;;){const item=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!item)break;now=item[1].at;timers.delete(item[0]);item[1].fn();await drain();}now=end;await drain();},get pending(){return timers.size;}};}
function fixture({phase='headers',delay=60000,optIn=true,endpoint='/api/ipqc-ab/workflow?scope=A%3AG&caseMetadata=1'}={}){
 const c=clock(),calls=[],memory=new Map(),events=new Map();let committed=false;
 const receipt=command=>({receipt:{operationId:command.operationId,generation:command.generation,revision:1,savedId:null,caseId:null,unchanged:false}});
 const later=(o,value)=>new Promise((resolve,reject)=>{const timer=c.setTimeout(()=>{o.signal.removeEventListener('abort',abort);committed=true;resolve(value);},delay);const abort=()=>{c.clearTimeout(timer);reject(o.signal.reason);};o.signal.addEventListener('abort',abort,{once:true});});
 const box={window:null,document:{documentElement:{lang:'zh'},querySelector:()=>null,querySelectorAll:()=>[]},crypto:webcrypto,AbortController,URLSearchParams,TextEncoder,location:{origin:'http://fixture',pathname:'/process/'},setTimeout:(fn,ms)=>c.setTimeout(fn,ms),clearTimeout:id=>c.clearTimeout(id),addEventListener:(type,fn)=>events.set(type,fn),sessionStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},ProcessSync:{identity:{id:'owner'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:v=>v===1,requiresReload:false},fetch:async(url,o)=>{
  calls.push({url,method:o.method,command:o.body&&JSON.parse(o.body).command});
  if(o.method==='GET')return Response.json({error:'OPERATION_NOT_FOUND',requestId:'12345678-1234-4234-8234-123456789abc'},{status:404});
  const command=JSON.parse(o.body).command;
  return phase==='headers'?later(o,Response.json(receipt(command))):{ok:true,status:200,json:()=>later(o,receipt(command))};
 }};box.window=box;vm.runInNewContext(source,box);
 const client=box.createSharedDraftClient({endpoint,actorId:'owner',headers:()=>({}),...(optIn?{abCreateRejections:true}:{})});
 return{c,calls,memory,client,box,committed:()=>committed};
}
for(const action of ['create-error','create-item'])void test(action+' survives 15s boundary with one POST and accepts a 24s ACK',async()=>{
 const f=fixture({delay:24000}),command=f.client.prepareCreate('g',action,{stageCode:'A-CUT'});let done=false;
 const pending=f.client.sendPrepared(command).then(value=>{done=true;return value;});await f.c.tick(15001);
 assert.equal(done,false);assert.equal(f.committed(),false);assert.deepEqual(f.calls.map(x=>x.method),['POST']);
 await f.c.tick(8999);assert.equal((await pending).receipt.operationId,command.operationId);assert.equal(f.client.hasUnknown(),false);assert.equal(f.memory.size,0);assert.equal(f.c.pending,0);assert.equal(f.calls.length,1);
});
for(const phase of ['headers','body'])void test('45s '+phase+' timeout stays fenced and retains its exact diagnostic cause',async()=>{
 const f=fixture({phase}),command=f.client.prepareCreate('g','create-error',{stageCode:'A-CUT'});let done=false;
 const flight=f.client.sendPrepared(command),pending=flight.then(()=>assert.fail('must remain unknown'),error=>{done=true;return error;});
 await f.c.tick(44999);assert.equal(done,false);const bytes=[...f.memory];assert.equal(bytes.length,1);await f.c.tick(1);const error=await pending;
 const timeout=phase==='headers'?error.cause:error;
 assert.equal(timeout.code,'WORKFLOW_MUTATION_TIMEOUT_UNKNOWN');assert.equal(timeout.phase,phase);assert.equal(timeout.deadlineMs,45000);assert.equal(timeout.outcome,'unknown');assert.equal(timeout.cause.name,'AbortError');
 if(phase==='headers'){assert.equal(error.message,'RESULT_UNKNOWN_CHECK_BEFORE_RETRY');assert.equal(error.operationId,command.operationId);assert.equal(error.recoveryCause.status,404);assert.equal(error.recoveryCause.requestId,'12345678-1234-4234-8234-123456789abc');}
 assert.equal(f.client.isConfirmedCreateRejection(command,error,flight),false);assert.throws(()=>f.client.finalizeRejectedCreate(command,error,flight));
 assert.equal(f.client.hasUnknown(),true);assert.deepEqual([...f.memory],bytes);assert.equal(f.committed(),false);
 assert.deepEqual(f.calls.map(x=>x.method),phase==='headers'?['POST','GET']:['POST']);
 await assert.rejects(f.client.retryUnknown(),/OPERATION_NOT_FOUND/);assert.deepEqual([...f.memory],bytes);
 await assert.rejects(f.client.sendPrepared(command));await assert.rejects(f.client.sendPrepared(f.client.prepareCreate('g','create-error',{stageCode:'A-CUT'})),/PREVIOUS_OPERATION_UNKNOWN/);
 assert.equal(f.calls.filter(x=>x.method==='POST').length,1);assert(f.calls.filter(x=>x.method==='GET').every(x=>new URL(x.url,'http://fixture').searchParams.get('operationId')===command.operationId));assert.equal(f.c.pending,0);
});
for(const mode of ['ordinary-opted-in','generic-ab','module-ab','iqc'])void test(mode+' mutation retains the existing 15s deadline',async()=>{
 const endpoint=mode==='module-ab'?'/api/ipqc-ab/workflow?module=1&caseMetadata=1':mode==='iqc'?'/api/iqc/workflow':'/api/ipqc-ab/workflow?scope=A%3AG&caseMetadata=1';
 const f=fixture({optIn:mode==='ordinary-opted-in',endpoint});let done=false;
 const pending=f.client.command('g','apply',{patches:[]}).then(()=>assert.fail('must remain unknown'),error=>{done=true;return error;});
 await f.c.tick(14999);assert.equal(done,false);await f.c.tick(1);assert.equal((await pending).message,'RESULT_UNKNOWN_CHECK_BEFORE_RETRY');assert.equal(f.client.hasUnknown(),true);assert.deepEqual(f.calls.map(x=>x.method),['POST','GET']);assert.equal(f.c.pending,0);
});
