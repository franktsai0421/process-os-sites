import nodeTest from 'node:test';
const test=(name,run)=>nodeTest(name,{timeout:3000},run);
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),tick=()=>new Promise(resolve=>setImmediate(resolve));
const shared=fs.readFileSync(new URL('../public/process/shared-draft-client.js',import.meta.url),'utf8');
const iqc=fs.readFileSync(new URL('../public/process/iqc-master.js',import.meta.url),'utf8');
const snapshot={categories:[],suppliers:[],parts:[],errors:[],items:[]};
const permissions={view:true,edit:true,save:true,submit:true,withdraw:true,approve:true,return:true,history:true,delete:true};
function full(revision=1,generation='g',stateRevision=revision){return {revision:stateRevision,permissions:{...permissions},control:{schemaVersion:1,issues:[],reservedErrorCodes:[],reservedCheckNos:[],versions:[{id:'draft',status:'draft',snapshot:structuredClone(snapshot)}],workflow:{scope:'iqc',generation,revision,saved:{id:revision===1?'save':'saved2',content:structuredClone(snapshot)},cases:[],working:structuredClone(snapshot),active:{id:null,content:structuredClone(snapshot)}}}};}
function fixture(){
  let epoch=1;const requests=[],clients=[],values=new Map();
  const storage={get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(String(k))??null,setItem:(k,v)=>values.set(String(k),String(v)),removeItem:k=>values.delete(String(k))};
  const sync={identity:{id:'a'},identityGeneration:()=>epoch,captureDelivery:()=>({epoch,actor:sync.identity}),isCurrentDelivery:o=>o.epoch===epoch&&o.actor===sync.identity,platformHeaders:()=>({})};
  const window={ProcessSync:sync,addEventListener(){},renders:0},document={documentElement:{lang:'zh'},querySelector:()=>null,querySelectorAll:()=>[],body:{}};
  const page={isConnected:true,innerHTML:'',retry:{},querySelector:s=>s==='#iqc-read-retry'?page.retry:null,querySelectorAll:()=>[]};
  const context=vm.createContext({window,document,crypto:webcrypto,console,location:{origin:'https://fixture.invalid',pathname:'/process/'},URLSearchParams,AbortController,setTimeout:()=>1,clearTimeout(){},sessionStorage:storage,fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),CustomEvent:class{constructor(type){this.type=type;}}});
  vm.runInContext(shared,context);require('../scripts/entry-performance/fixture-ports.cjs')(context);
  const create=window.createSharedDraftClient;window.createSharedDraftClient=(...args)=>{const client=create(...args);if(!clients.includes(client))clients.push(client);return client;};
  const tail='})(window);';assert.equal(iqc.split(tail).length,2);
  vm.runInContext(iqc.replace(tail,`render=()=>{if(!renderReadDenied())host.renders++;};host.probe={post,load,mayEdit,mayDraftAction,transport,init:(value,node)=>{control=value.control;revision=value.revision;root=node;},state:()=>({control,revision,readDenied}),replaceClient:()=>{sharedClient=null;sharedActor='';},setModel:(value)=>{control=value.control;revision=value.revision;},changeMount:()=>mountSequence++};${tail}`),context);
  window.probe.init(full(),page);
  return {window,api:window.probe,page,requests,clients,values,respond(i,body,status=200){assert.ok(requests[i],`request ${i} exists`);requests[i].resolve({status,ok:status<400,json:async()=>body});},flip(){sync.identity={id:'a'};epoch++;},markerCount:()=>[...values.keys()].filter(key=>key.startsWith('shared-draft-receipt-only-v1:')).length};
}
async function warm(){const f=fixture(),loaded=f.api.load();await tick();f.respond(0,full());await loaded;return f;}
async function start(f,{lost=false}={}){
  const promise=f.api.post('save').catch(error=>error);await tick();const i=f.requests.length-1,command=JSON.parse(f.requests[i].options.body).command;
  const receipt={operationId:command.operationId,generation:'g',revision:2,savedId:'saved2',caseId:null,unchanged:false};
  if(lost){f.requests[i].reject(Error('SYNTHETIC_ACK_LOST'));await tick();assert.match(f.requests.at(-1).url,/operationId=/);f.respond(f.requests.length-1,{receipt});}
  else f.respond(i,{receipt});
  await tick();assert.equal(f.requests.at(-1).options.method,'GET');assert.doesNotMatch(f.requests.at(-1).url,/operationId=/);
  return {promise,receipt,terminal:f.requests.length-1,command};
}
for(const lost of [false,true])test(`ordinary Save adopts exact terminal GET without extra read (lost ACK=${lost})`,async()=>{
  const f=await warm(),op=await start(f,{lost}),data=full(2,'g',9);f.respond(op.terminal,data);const result=await op.promise;
  assert.equal(result.message,undefined);assert.equal(result.recovered,lost?true:undefined);assert.equal(result.revision,undefined,'preserve receipt-only public shape');
  assert.equal(f.api.state().revision,9);assert.equal(f.api.state().control,data.control);assert.equal(f.api.state().readDenied,null);
  assert.equal(f.clients[0].verifiedReadback(result,op.command.operationId),data);
  assert.equal(f.clients[0].verifiedReadback({...result},op.command.operationId),null,'caller clone has no proof');
  assert.equal(f.clients[0].verifiedReadback(result,webcrypto.randomUUID()),null,'operation mismatch');
  const other=f.window.createSharedDraftClient({endpoint:'/api/fqc/workflow?caseMetadata=1',externalDurableBounded:{scope:'FQC'},actorId:'a',headers:()=>({})});
  assert.equal(other.verifiedReadback(result,op.command.operationId),null,'proof belongs to original client');
  assert.equal(f.requests.length,lost?4:3);assert.equal(f.markerCount(),0);assert.equal(f.clients[0].hasUnknown(),false);
  f.flip();assert.equal(f.clients[0].verifiedReadback(result,op.command.operationId),null,'old owner cannot use internal recovered proof');
});
for(const lost of [false,true])for(const status of [401,403])for(const nonJSON of [false,true])test(`terminal denial quarantines UI but preserves unknown (${lost}/${status}/${nonJSON})`,async()=>{
  const f=await warm(),before=f.api.state().control,op=await start(f,{lost});
  if(nonJSON)f.requests[op.terminal].resolve({status,ok:false,json:async()=>{throw Error('INVALID_JSON');}});else f.respond(op.terminal,{error:'FORBIDDEN'},status);
  const error=await op.promise;assert.equal(error.operationAcknowledged,undefined);assert.equal(f.api.state().readDenied,error);assert.equal(f.api.state().control,before);
  assert.equal(f.clients[0].hasUnknown(),true);assert.equal(f.markerCount(),1);assert.equal(f.api.mayEdit(),false);assert.doesNotMatch(f.page.innerHTML,/操作已確認/);
  const grant=f.clients[0].permissions();await tick();f.respond(f.requests.length-1,{revision:2,permissions});await grant;
  assert.equal(f.clients[0].permission('view'),true);assert.equal(f.api.mayEdit(),false,'permission event cannot release quarantine');
  const reload=f.api.load();await tick();f.respond(f.requests.length-1,full(2));await reload;assert.equal(f.api.state().readDenied,null);
  assert.equal(f.clients[0].hasUnknown(),true,'full load is not receipt settlement');assert.equal(f.markerCount(),1);
  const retry=f.clients[0].retryUnknown().catch(error=>error);await tick();assert.match(f.requests.at(-1).url,/operationId=/);f.respond(f.requests.length-1,{error:'NOT_FOUND'},404);assert.equal((await retry).status,404);
  assert.equal(f.markerCount(),1);assert.equal(f.requests.filter(r=>r.options.method==='POST').length,1);
});
for(const lost of [false,true])test(`old terminal denial cannot replace newer denied load (lost ACK=${lost})`,async()=>{
  const f=await warm(),op=await start(f,{lost}),newer=f.api.load().catch(error=>error);await tick();f.respond(f.requests.length-1,{error:'NEW_LOAD_DENIED'},403);const newError=await newer;
  f.respond(op.terminal,{error:'OLD_READ_DENIED'},401);await op.promise;assert.equal(f.api.state().readDenied,newError);assert.equal(newError.operationAcknowledged,undefined);assert.equal(f.markerCount(),1);
});
for(const change of ['owner','mount','replacement'])test(`late terminal denial does not quarantine ${change}`,async()=>{
  const f=await warm(),op=await start(f);if(change==='owner')f.flip();else if(change==='mount')f.api.changeMount();else{f.flip();f.api.replaceClient();f.api.transport();}
  f.respond(op.terminal,{error:'FORBIDDEN'},403);await op.promise;assert.equal(f.api.state().readDenied,null);assert.equal(f.markerCount(),1);
});
test('newer complete model defeats old terminal GET without rollback or clearing marker',async()=>{
  const f=await warm(),op=await start(f),newer=f.api.load();await tick();const fresh=full(5,'g2',10);f.respond(f.requests.length-1,fresh);await newer;
  f.respond(op.terminal,full(2));await tick();assert.match(f.requests.at(-1).url,/operationId=/);f.respond(f.requests.length-1,{error:'NOT_FOUND'},404);const error=await op.promise;assert.ok(error.message);assert.equal(f.api.state().control,fresh.control);assert.equal(f.api.state().revision,10);assert.equal(f.api.state().readDenied,null);assert.equal(f.markerCount(),1);
});
for(const change of ['load','generation','globalRevision','flowRevision','clone'])test(`post-await exact adoption refuses ${change} change`,async()=>{
  const f=await warm(),client=f.clients[0],original=client.command;let release,settled;const gate=new Promise(resolve=>{release=resolve;});
  client.command=(...args)=>original(...args).then(async result=>{settled=result;await gate;return change==='clone'?{...result}:result;});
  const op=await start(f);f.respond(op.terminal,full(2));await tick();assert.ok(settled);
  if(change==='load'){const read=f.api.load();await tick();f.respond(f.requests.length-1,full(3,'g',10));await read;}
  else if(change==='generation')f.api.setModel(full(3,'other',3));else if(change==='globalRevision')f.api.setModel(full(1,'g',20));else if(change==='flowRevision')f.api.setModel(full(3,'g',1));
  const before=f.api.state();release();const error=await op.promise;assert.match(error.message,/SUPERSEDED|READBACK_REQUIRED/);assert.equal(f.api.state().control,before.control);assert.equal(f.api.state().revision,before.revision);assert.equal(f.api.state().readDenied,null);assert.equal(f.requests.filter(r=>r.options.method==='POST').length,1);
});
for(const invalid of ['partialPermissions','wrongPermission','nullVersion'])test(`verified GET still requires complete IQC payload: ${invalid}`,async()=>{
  const f=await warm(),before=f.api.state().control,op=await start(f,{lost:true}),data=full(2);
  if(invalid==='partialPermissions')data.permissions={view:true};else if(invalid==='wrongPermission')data.permissions.delete='true';else data.control.versions=[null];
  f.respond(op.terminal,data);const error=await op.promise;assert.ok(error.operationAcknowledged);assert.equal(f.api.state().readDenied,error);assert.equal(f.api.state().control,before);assert.equal(f.api.mayEdit(),false);assert.equal(f.requests.filter(r=>r.options.method==='POST').length,1);
});
test('fabricated fetch status/permission event cannot act as owned state-read denial',async()=>{
  const f=await warm(),write=f.api.post('save').catch(error=>error);await tick();const post=f.requests.length-1;
  const deniedPermissions=f.clients[0].permissions();await tick();f.respond(f.requests.length-1,{revision:1,permissions:{...permissions,view:false}});await deniedPermissions;
  f.requests[post].reject(Object.assign(Error('FAKE_STATUS'),{status:403,operationAcknowledged:true}));await write;
  assert.equal(f.clients[0].readPauseState('state'),null);assert.equal(f.api.state().readDenied,null);assert.equal(f.clients[0].hasUnknown(),true);assert.equal(f.markerCount(),1);
});
for(const action of ['approve','withdraw','reject'])test(`ordinary ${action} adopts legal review generation rotation`,async()=>{
  const f=await warm();f.window.VersionDraftUI={confirmReview:async()=>({reason:'Synthetic reviewed reason',selfReviewConfirmed:true})};
  f.api.state().control.workflow.cases.push({id:'case1',actor:{id:'other'}});f.api.state().control.workflow.pendingId='case1';
  const promise=f.api.post(action,{versionId:'case1'}).catch(error=>error);await tick();const post=f.requests.length-1,command=JSON.parse(f.requests[post].options.body).command;
  assert.equal(command.action,action==='reject'?'return':action);assert.equal(command.generation,'g');assert.equal(command.caseId,'case1');
  const receipt={operationId:command.operationId,generation:'g2',revision:2,savedId:action==='approve'?null:'save',caseId:null,unchanged:false};
  if(action==='approve'){f.requests[post].reject(Error('SYNTHETIC_ACK_LOST'));await tick();assert.match(f.requests.at(-1).url,/operationId=/);f.respond(f.requests.length-1,{receipt});}
  else f.respond(post,{receipt});
  await tick();const data=full(2,'g2',9);data.control.workflow.saved=action==='approve'?null:{id:'save',content:structuredClone(snapshot)};f.respond(f.requests.length-1,data);const result=await promise;
  assert.equal(result.message,undefined);assert.equal(result.revision,undefined);assert.equal(f.api.state().control,data.control);assert.equal(f.api.state().revision,9);assert.equal(f.api.state().readDenied,null);
  assert.equal(f.clients[0].verifiedReadback(result,command.operationId),data);assert.equal(f.markerCount(),0);assert.equal(f.clients[0].hasUnknown(),false);assert.equal(f.requests.length,action==='approve'?4:3);assert.equal(f.requests.filter(r=>r.options.method==='POST').length,1);
});
