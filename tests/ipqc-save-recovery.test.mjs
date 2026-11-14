// Actual IPQC handlers + SQLite/R2 + shipped browser transport. Synthetic only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),{fixture}=require('../scripts/quality-replacement-preview-fixture.cjs');
const source=fs.readFileSync('public/process/shared-draft-client.js','utf8');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const initial={schemaVersion:1,activeVersionId:null,source:null,issues:[],reservedErrorCodes:[],reservedItemCodes:[],versions:[{id:'synthetic-initial',number:1,status:'draft',snapshot:{errors:[],items:[]},baseVersionId:null,revision:1,creatorId:'fixture',creatorName:'fixture',createdAt:'fixture',updatedAt:'fixture',history:[]}]};
const master={active:{AB:{products:[{code:'SYNTH-AB',name:'synthetic',line:'A',category:'G',stages:['A-CUT']}],lines:[{code:'A',stages:[{code:'A-CUT',name:'Cut'}]}],categoryGroups:[{line:'A',name:'G',defaultStages:['A-CUT']}]},C:{products:[{code:'SYNTH-C',name:'synthetic',line:'C',category:'PVC',stages:['C-PVC']}],stages:[{code:'C-PVC',name:'PVC'}]}}};
async function setup(t,scopeName){
 const f=await fixture({masterDataControl:JSON.stringify(master),ipqcCMasterControl:JSON.stringify(initial)},{includeIPQCC:true});t.after(()=>f.close());
 const suffix=scopeName==='ipqc-ab'?'&scope=A%3AG':'';
 await f.begin(scopeName,'editor',200,suffix);
 await f.command(scopeName,'apply',{moduleAction:'create-error',input:scopeName==='ipqc-ab'?{stageCode:'A-CUT',name:'SYNTHETIC ONLY'}:{productCode:'SYNTH-C',stageCode:'C-PVC',name:'SYNTHETIC ONLY'}},'editor',200,suffix);
 let g=await f.read(scopeName,'editor',suffix);
 await f.command(scopeName,'apply',{moduleAction:'create-item',input:{errorId:(g.control||g).workflow.working.errors[0].id,item:scopeName==='ipqc-ab'?{productCodes:['SYNTH-AB']}:{standardEnabled:true,standard:'SYNTHETIC ONLY standard'}}},'editor',200,suffix);
 if(scopeName==='ipqc-ab')await f.begin(scopeName,'editor',200,'&module=1');
 const endpoint='/api/'+scopeName+'/workflow?'+(scopeName==='ipqc-ab'?'module=1&':'')+'caseMetadata=1';
 const basis=await f.read(scopeName,'editor',scopeName==='ipqc-ab'?'&module=1':'');g=await f.read(scopeName,'editor',suffix);
 const row=(g.control||g).workflow.working.items[0],field=scopeName==='ipqc-ab'?'standard':'description';
 const change={patches:[{op:'set',path:['items',{id:row.id},field],value:'中文 / Tiếng Việt SYNTHETIC ONLY'}],guards:[{path:['items',{id:row.id},field],value:row[field]}]};
 const detail=scopeName==='ipqc-ab'?{expectedRevision:(basis.control||basis).workflow.revision,moduleAction:'save-local-v1',input:{stateRevision:basis.revision,scopes:[{scope:'A:G',generation:(g.control||g).workflow.generation,baseId:(g.control||g).activeVersionId,changes:[change]}]}}:{expectedRevision:(basis.control||basis).workflow.revision,localChanges:[change]};
 return{f,scopeName,endpoint,basis,detail,field,id:row.id,suffix};
}
function transport(ctx,memory=new Map()){
 let now=0,next=0,mode='normal',release,readyResolve;const ready=new Promise(resolve=>{readyResolve=resolve;});const timers=new Map(),calls=[],notices=[];
 const setTimer=(fn,ms)=>{const id=++next;timers.set(id,{at:now+ms,fn});return id;};
 const box={window:null,crypto:webcrypto,URL,URLSearchParams,AbortController,Response,Request,Headers,performance,TextEncoder,
  setTimeout:setTimer,clearTimeout:id=>timers.delete(id),addEventListener(){},location:{origin:'http://fixture',pathname:'/process/'},
  document:{documentElement:{lang:'zh'},body:{style:{}},querySelector:()=>null,querySelectorAll:()=>[]},
  ProcessSync:{identity:{id:'preview-editor'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:v=>v===1,requiresReload:false},
  sessionStorage:{get length(){return memory.size;},key:i=>[...memory.keys()][i]??null,getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}};
 const invoke=async(url,options)=>{const u=new URL(url,'http://fixture');return ctx.f.load('app'+u.pathname+'/route.ts')[options.method](new Request(u,{...options,headers:{...ctx.f.sessions.editor,...options.headers}}));};
 box.fetch=async(url,options)=>{
  calls.push({url,method:options.method,body:options.body,signal:options.signal});
  if(options.method!=='POST'){if(mode==='slow-read')return new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});release=async()=>resolve(await invoke(url,options));readyResolve();});return invoke(url,options);}
  const selected=mode;
  if(selected==='late')return new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});release=async()=>{const result=await invoke(url,options);resolve(result);return result;};readyResolve();});
  const result=await invoke(url,options);
  if(selected==='lost')throw Error('SYNTHETIC_RESPONSE_LOST');
  if(selected==='slow-headers')return new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});release=()=>resolve(result);readyResolve();});
  if(selected==='slow-body')return {ok:result.ok,status:result.status,json:()=>new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});release=async()=>resolve(await result.json());readyResolve();})};
  return result;
 };
 box.window=box;vm.runInNewContext(source,box);
 const client=box.createSharedDraftClient({endpoint:ctx.endpoint,externalDurableBounded:{scope:ctx.scopeName==='ipqc-ab'?'IPQC-AB':'IPQC-C'},durableBegin:true,guardAccessResults:true,allowUnknownDeparture:true,actorId:'preview-editor',headers:()=>ctx.f.sessions.editor});
 client.watchRequestProgress(()=>notices.push(JSON.parse(JSON.stringify(client.requestProgress()))));
 async function advance(ms){const end=now+ms;await turn();for(;;){const due=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].fn();await turn();}now=end;await turn();}
 return{client,memory,calls,notices,box,advance,ready,setMode:value=>{mode=value;},release:()=>release(),pending:()=>timers.size};
}
async function prepared(ctx,x){await x.client.read();return x.client.prepare((ctx.basis.control||ctx.basis).workflow.generation,'save',ctx.detail);}
const posts=x=>x.calls.filter(call=>call.method==='POST');
for(const scopeName of ['ipqc-ab','ipqc-c']){
 for(const mode of ['slow-headers','slow-body'])void test(scopeName+' real Save waits beyond15/45s with visible progress and exact receipt; duplicate click writes once '+mode,{timeout:20000},async t=>{
  const ctx=await setup(t,scopeName),x=transport(ctx),command=await prepared(ctx,x);x.setMode(mode);
  const task=x.client.sendPrepared(command);await x.ready;await x.advance(60000);
  assert.equal(posts(x).length,1);assert.equal(posts(x)[0].signal.aborted,false);assert(x.client.hasUnknown());assert.equal(x.box.sharedDraftAccountState().unknown,true);assert.equal(x.box.sharedDraftNavigationState().queued,0);assert.equal(x.box.sharedDraftDepartureBlocked(),false);assert(x.client.requestProgress().length);assert(x.notices.some(notice=>notice.some(value=>value.elapsedMs===45000)));
  const duplicate=x.client.sendPrepared(command);await turn();assert.equal(posts(x).length,1);
  x.release();const result=await task;await duplicate;assert.equal(result.receipt.operationId,command.operationId);assert.equal(x.client.hasUnknown(),false);assert.equal(x.client.requestProgress().length,0);assert.equal(x.pending(),0);
  const reloaded=await ctx.f.read(scopeName,'editor',ctx.suffix);assert.equal((reloaded.control||reloaded).workflow.working.items[0][ctx.field],'中文 / Tiếng Việt SYNTHETIC ONLY');
 });
 void test(scopeName+' timeout before CAS: receipt404 does not mean uncommitted; late commit survives reload and resolves original only',{timeout:20000},async t=>{
  const ctx=await setup(t,scopeName),x=transport(ctx),command=await prepared(ctx,x),before=ctx.f.snapshot().row.revision;x.setMode('late');
  const task=assert.rejects(x.client.sendPrepared(command),/RESULT_UNKNOWN/);await x.ready;const bytes=[...x.memory];await x.advance(180000);await task;
  assert.equal(ctx.f.snapshot().row.revision,before);assert.equal(x.client.hasUnknown(),true);assert.deepEqual([...x.memory],bytes);assert.equal(posts(x).length,1);
  await assert.rejects(x.client.resolveUnknown(),/OPERATION_NOT_FOUND/);assert.deepEqual([...x.memory],bytes);assert.equal(x.box.sharedDraftAccountState().unknown,true);assert.equal(x.box.sharedDraftNavigationState().unknown,false);
  await x.release();assert.equal(ctx.f.snapshot().row.revision,before+1);assert.equal(x.client.hasUnknown(),true);
  const fresh=transport(ctx,x.memory);await fresh.client.read();const result=await fresh.client.resolveUnknown();assert.equal(result.receipt.operationId,command.operationId);assert.equal(fresh.client.hasUnknown(),false);assert.equal(posts(fresh).length,0);assert.equal(ctx.f.snapshot().row.revision,before+1);
 });
 void test(scopeName+' commit and lost ACK recovers exact original receipt and readback, GET zero writes',{timeout:20000},async t=>{
  const ctx=await setup(t,scopeName),x=transport(ctx),command=await prepared(ctx,x),before=ctx.f.snapshot().row.revision;x.setMode('lost');
  const result=await x.client.sendPrepared(command);assert.equal(result.receipt.operationId,command.operationId);assert.equal(result.recovered,true);assert.equal(x.client.hasUnknown(),false);assert.equal(posts(x).length,1);assert.equal(ctx.f.snapshot().row.revision,before+1);
  const snapshot=ctx.f.snapshot();await x.client.receipt(command.operationId);assert.deepEqual(ctx.f.snapshot(),snapshot);
 });
}
for(const scopeName of ['ipqc-ab','ipqc-c'])void test(scopeName+' isolated saved snapshot reopens, submits, withdraws, resubmits and is approved by a different actor',{timeout:20000},async t=>{
 const ctx=await setup(t,scopeName),x=transport(ctx),command=await prepared(ctx,x),result=await x.client.sendPrepared(command),query=scopeName==='ipqc-ab'?'&module=1':'';
 const savedId=result.receipt.savedId;assert(savedId);
 const reopened=await ctx.f.read(scopeName,'editor',query);assert.equal((reopened.control||reopened).workflow.saved.id,savedId);
 const submitted=await ctx.f.command(scopeName,'submit',{savedId,reason:'SYNTHETIC ONLY review'},'editor',200,query),caseId=submitted.receipt.caseId;assert(caseId);
 const locked=await ctx.f.read(scopeName,'editor',query);assert.equal((locked.control||locked).workflow.pendingId,caseId);
 await ctx.f.command(scopeName,'withdraw',{caseId,reason:'SYNTHETIC ONLY withdrawal'},'editor',200,query);
 const withdrawn=await ctx.f.read(scopeName,'editor',query);assert.equal((withdrawn.control||withdrawn).workflow.pendingId,null);assert.equal((withdrawn.control||withdrawn).workflow.saved.id,savedId);
 const second=await ctx.f.command(scopeName,'submit',{savedId,reason:'SYNTHETIC ONLY resubmission'},'editor',200,query);assert.notEqual(second.receipt.caseId,caseId);
 await ctx.f.command(scopeName,'approve',{caseId:second.receipt.caseId,reason:'SYNTHETIC ONLY approval'},'reviewer',200,query);
 const approved=await ctx.f.read(scopeName,'editor',query);assert.equal(approved.control?.activeVersionId||approved.workflow?.activeId,second.receipt.caseId);
 const values=(await ctx.f.core.readState()).values,ipqc=ctx.f.load('lib/process-ipqc.ts'),line=scopeName==='ipqc-ab'?'A':'C',category=scopeName==='ipqc-ab'?'G':'PVC',stage=scopeName==='ipqc-ab'?'A-CUT':'C-PVC',product=scopeName==='ipqc-ab'?'SYNTH-AB':'SYNTH-C';
 const choices=ipqc.ipqcChoices(values,{line,category},stage,[product]).choices;assert.equal(choices.length,1);const choice=choices[0];assert.equal(choice.itemId,ctx.id);assert.equal(choice.sourceVersionId,second.receipt.caseId);
 const assignment=(({source,scope,itemId,sourceVersionId,productCodes})=>({source,scope,itemId,sourceVersionId,productCodes}))(choice),workspace={id:'synthetic-only',line,category,stages:{[stage]:[{id:'synthetic-block',name:'SYNTHETIC ONLY block',number:'01',productCodes:[product],ipqcAssignments:[assignment]}]}};
 ipqc.validateIPQCAssignments([workspace],[],values);const bad=structuredClone(workspace);bad.stages[stage][0].ipqcAssignments[0].sourceVersionId='unapproved';assert.throws(()=>ipqc.validateIPQCAssignments([bad],[],values),/IPQC_SOURCE_CHANGED/);
 const old=await ctx.f.call(scopeName+'/workflow','GET',undefined,'editor',200,'?caseId='+encodeURIComponent(caseId)+query);assert.equal(old.reviewCase.status,'withdrawn');
});

for(const scopeName of ['ipqc-ab','ipqc-c'])for(const timeout of [false,true])void test(scopeName+' slow explicit read stays bounded and cannot imply a write, timeout='+timeout,{timeout:20000},async t=>{
 const ctx=await setup(t,scopeName),x=transport(ctx),before=ctx.f.snapshot();x.setMode('slow-read');
 const task=x.client.read(),checked=timeout?assert.rejects(task,/WORKFLOW_READ_TIMEOUT/):task;await x.ready;await x.advance(timeout?180000:90000);
 if(!timeout){assert.equal(x.calls[0].signal.aborted,false);assert(x.client.requestProgress().length);await x.release();}
 await checked;assert.equal(posts(x).length,0);assert.equal(x.client.hasUnknown(),false);assert.equal(x.pending(),0);assert.deepEqual(ctx.f.snapshot(),before);
});

for(const scopeName of ['ipqc-ab','ipqc-c'])for(const sameWindow of [false,true])void test(scopeName+' return during committed in-flight Save settles original; retired late ACK cannot resurrect the marker, sameWindow='+sameWindow,{timeout:20000},async t=>{
 const ctx=await setup(t,scopeName),old=transport(ctx),command=await prepared(ctx,old),before=ctx.f.snapshot().row.revision;old.setMode('slow-headers');
 const pending=old.client.sendPrepared(command).then(value=>({value}),error=>({error}));await old.ready;
 const originalMarkers=[...old.memory];assert(originalMarkers.length);assert.equal(ctx.f.snapshot().row.revision,before+1);
 old.box.ProcessSync.captureDelivery=()=>2;old.box.ProcessSync.isCurrentDelivery=value=>value===2;
 const fresh=sameWindow?{box:old.box,calls:old.calls,client:old.box.createSharedDraftClient({endpoint:ctx.endpoint,externalDurableBounded:{scope:scopeName==='ipqc-ab'?'IPQC-AB':'IPQC-C'},durableBegin:true,guardAccessResults:true,allowUnknownDeparture:true,actorId:'preview-editor',headers:()=>ctx.f.sessions.editor})}:transport(ctx,old.memory);await fresh.client.read();const result=await fresh.client.resolveUnknown();
 assert.equal(result.receipt.operationId,command.operationId);assert.equal(fresh.client.hasUnknown(),false);assert.equal(posts(fresh).length,sameWindow?1:0);if(sameWindow)assert.equal(old.box.sharedDraftAccountState().unknown,false);const settled=[...old.memory];
 old.release();await pending;assert.deepEqual([...old.memory],settled,'late retired transport cannot restore, replace or clear the settled identity');
 assert.equal(fresh.client.hasUnknown(),false);assert.equal(ctx.f.snapshot().row.revision,before+1);assert.equal(posts(old).length,1);
});
