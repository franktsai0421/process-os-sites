import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync('public/process/shared-draft-client.js','utf8'),tick=()=>new Promise(setImmediate);
const permissions=Object.fromEntries(['view','edit','create','save','submit','withdraw','approve','return','history','delete','restore'].map(k=>[k,true]));
function fixture({scope='IQC',endpoint='/api/iqc/workflow?caseMetadata=1',storage=new Map(),responsePhase='headers'}={}){
 let time=0,epoch=1,seq=0,mode='held',receipt=null,revision=1;const timers=new Map(),requests=[];
 const snapshot={categories:[],suppliers:[],parts:[],errors:[],items:[]};
 const full=()=>({revision,permissions:{...permissions},control:{workflow:{scope:scope==='BOM'?'bom':'iqc',generation:'g',revision,working:snapshot,active:{id:null,content:snapshot},saved:null,pendingId:null,cases:[]}}});
 const sync={identity:{id:'a'},identityGeneration:()=>epoch,captureDelivery:()=>({epoch}),isCurrentDelivery:d=>d.epoch===epoch,platformHeaders:()=>({})};
 const window={ProcessSync:sync,addEventListener(){},dispatchEvent(){}},sessionStorage={get length(){return storage.size;},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const context=vm.createContext({window,document:{querySelectorAll:()=>[],documentElement:{lang:'zh'}},location:{origin:'https://fixture.invalid',pathname:'/process/'},sessionStorage,console,crypto:webcrypto,URLSearchParams,AbortController,TextEncoder,setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,at:time+ms});return id;},clearTimeout:id=>timers.delete(id),fetch:(url,options)=>{
  const request={url,options};requests.push(request);
  if(options.method==='POST'){const wait=new Promise((resolve,reject)=>{request.resolve=()=>{const command=JSON.parse(options.body).command;revision++;receipt={operationId:command.operationId,generation:'g',revision,savedId:null,caseId:null,unchanged:false};resolve(responsePhase==='body'?{receipt}:Response.json({receipt}));};options.signal.addEventListener('abort',()=>reject(options.signal.reason));});return responsePhase==='body'?Promise.resolve({status:200,ok:true,json:()=>wait}):wait;}
  if(url.includes('operationId='))return Promise.resolve(mode==='missing'||!receipt?Response.json({error:'OPERATION_NOT_FOUND'},{status:404}):Response.json({receipt}));
  return Promise.resolve(Response.json(full()));
 }});vm.runInContext(source,context);
 const client=window.createSharedDraftClient({endpoint,externalDurableBounded:{scope},actorId:'a',headers:()=>({})});
 return{client,requests,storage,sync,async warm(){await client.read();},advance(ms){time+=ms;for(const[id,t]of timers)if(t.at<=time){timers.delete(id);t.fn();}},mode:v=>mode=v,flip(){epoch++;sync.identity={id:'a'};},permissions,post:()=>requests.find(r=>r.options.method==='POST')};
}
const detail={moduleAction:'createItem',input:{errorId:'synthetic-error',nameVi:'Kiểm tra 中文',mediaItems:[{id:'a'.repeat(64),src:'/synthetic.png'}],equipmentId:'synthetic-new-tool'}};
void test('IQC delayed ACK survives 15s, one Apply at 32s, no Save or receipt lookup',async()=>{
 const f=fixture();await f.warm();const pending=f.client.command('g','apply',detail);await tick();f.advance(15000);await tick();assert(!f.post().options.signal.aborted);f.advance(17000);f.post().resolve();await pending;
 assert.equal(f.requests.filter(r=>r.options.method==='POST').length,1);assert(!f.requests.some(r=>r.url.includes('operationId=')));assert.equal(f.client.hasUnknown(),false);assert.equal(f.storage.size,0);
});
for(const responsePhase of ['headers','body'])void test(`45s ${responsePhase} timeout keeps original failure plus 404, duplicate attempts/reload only query receipt`,async()=>{
 const f=fixture({responsePhase});await f.warm();const command=f.client.prepare('g','apply',detail),pending=f.client.sendPrepared(command).catch(e=>e);await tick();const bytes=[...f.storage];
 const duplicate=f.client.command('g','apply',detail).catch(e=>e);f.advance(44999);assert(!f.post().options.signal.aborted);f.advance(1);const error=await pending;assert.match((await duplicate).message,/UNKNOWN/);
 assert.equal(error.cause.code,'WORKFLOW_MUTATION_TIMEOUT_UNKNOWN');assert.equal(error.cause.deadlineMs,45000);assert.equal(error.cause.phase,responsePhase);assert.equal(error.recoveryCause.status,404);assert.equal(error.recoveryCause.message,'OPERATION_NOT_FOUND');assert.deepEqual([...f.storage],bytes);
 await assert.rejects(f.client.retryUnknown(),/OPERATION_NOT_FOUND/);await assert.rejects(f.client.command('g','save'),/UNKNOWN/);assert.equal(f.requests.filter(r=>r.options.method==='POST').length,1);
 const next=fixture({storage:f.storage});await next.warm();await assert.rejects(next.client.resolveUnknown(),/OPERATION_NOT_FOUND/);assert.equal(next.requests.filter(r=>r.options.method==='POST').length,0);assert.deepEqual([...f.storage],bytes);
 // A late server commit can still become visible after the original local abort.
 f.post().resolve();await f.client.resolveUnknown();assert.equal(f.client.hasUnknown(),false);assert.equal(f.requests.filter(r=>r.options.method==='POST').length,1);
});
void test('late IQC ACK after identity change never releases retained unknown',async()=>{
 const f=fixture();await f.warm();const pending=f.client.command('g','apply',detail).catch(e=>e);await tick();const bytes=[...f.storage];f.flip();f.post().resolve();assert.match((await pending).message,/OWNER_CHANGED|ACCOUNT_CHANGED/);assert.deepEqual([...f.storage],bytes);assert.equal(f.requests.filter(r=>r.options.method==='POST').length,1);
});
void test('unrelated bounded BOM route retains 15s deadline',async()=>{
 const f=fixture({scope:'BOM',endpoint:'/api/bom/workflow?caseMetadata=1'});await f.warm();const pending=f.client.command('g','apply',{patches:[]}).catch(e=>e);await tick();f.advance(15000);assert(f.post().options.signal.aborted);await pending;
});
