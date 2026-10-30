import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {createOwnedDraftLedger} from '../public/process/owned-draft-ledger.mjs';
const {createSharedDraft,applyDraftCommand}=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({})('lib/shared-draft.ts');
const source=fs.readFileSync(new URL('../public/process/canvas-local.js',import.meta.url),'utf8');
const copy=v=>structuredClone(v);
const memoryStorage=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),data};};
async function setup(){
 const content={workspaces:[{id:'workspace',stages:{stage:[{id:'operation-a',x:10,y:20,nextIds:[]}]}}]};let state=createSharedDraft('process:platform',content,null,'generation-canvas'),model,number=0,sequence=0,posts=0,gate=null,failure=null;
 const ctx={actor:{id:'frank',name:'Frank',admin:true},at:'synthetic',id:()=>`generated-${++number}`,allowed:()=>true,structure:()=>{},validate:()=>[],semantic:v=>v,activeId:null};
 const records=new Map(),storage=()=>{const entries=new Map();return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};};
 const client={prepare(generation,action,details={}){return {generation,action,operationId:`command-${++sequence}`,clientId:'client-canvas',sequence,...copy(details)};},async sendPrepared(command){posts++;if(gate)await gate;if(failure)throw failure;const result=applyDraftCommand(state,command,ctx);state=result.state;records.set(command.operationId,result.receipt);return {receipt:copy(result.receipt),control:{workflow:copy(state)},permissions:{view:true,edit:true,save:true,delete:true}};},async read(){return {control:{workflow:copy(state)},permissions:{view:true,edit:true,save:true,delete:true}};},async receipt(id){if(!records.has(id))throw Object.assign(Error('NOT_FOUND'),{status:404});return {receipt:copy(records.get(id))};},async flush(){},discardRejected(){}};
 await client.sendPrepared(client.prepare(state.generation,'save'));model=copy(state);
 const ledger=createOwnedDraftLedger({actorId:'frank',scope:'process:platform',recoveryStorage:memoryStorage()});ledger.observe(model);
 const context={window:null,console,structuredClone,performance,crypto:webcrypto,localStorage:storage(),sessionStorage:storage(),location:{origin:'https://fixture.invalid',pathname:'/process/'},document:{documentElement:{lang:'zh'},querySelector:()=>null},confirm:()=>true,addEventListener(){},ProcessSync:{identity:{id:'frank'},platformHeaders:()=>({})},createSharedDraftClient:()=>client};
 context.window=context;const adopt=result=>{model=result.control.workflow;ledger.observe(model);context.ProcessCanvasLocal?.accept(model);};
 context.ProcessAuthoringV3={ownedLedger:ledger,flow:()=>model,canEditCanvas:()=>!model.pendingId,acceptCanvas:adopt,updateLocalSaveState(){}};
 vm.runInNewContext(source,context,{filename:'canvas-local.js'});const local=context.ProcessCanvasLocal;local.accept(model);
 return {local,client,ledger,adopt,context,get model(){return model;},get state(){return state;},get posts(){return posts;},hold(){let release;gate=new Promise(resolve=>{release=resolve;});return ()=>{gate=null;release();};},fail(error){failure=error;},edit(value=40){local.edit('workspace','stage',[{id:'operation-a',f:'x',value}]);},x:()=>local.project('workspace','stage',model.working.workspaces[0].stages.stage)[0].x};
}
void test('departure lease freezes new canvas input/travel/UI sync through handoff then releases',async()=>{
 const f=await setup();f.edit();const lease=f.local.lockForDeparture();assert(lease.current());assert.throws(()=>f.edit(80),/離頁/);assert.throws(()=>f.local.travel('workspace','stage'),/離頁/);await assert.rejects(f.local.sync(),/離頁/);assert.equal(f.x(),40);
 const detail=await f.local.saveForDeparture(lease);assert.equal(detail.expectedRevision,f.state.revision);assert.equal(f.local.dirty(),false);assert.equal(f.ledger.inspect().ownChanges,1);assert.throws(()=>f.edit(80),/離頁/);lease.release();lease.release();assert.equal(lease.current(),false);f.edit(80);assert.equal(f.x(),80);
});
void test('departure waits admitted canvas write before deciding; late input is fenced',async()=>{
 const f=await setup();f.edit();const release=f.hold(),sync=f.local.sync(),lease=f.local.lockForDeparture();let done=false;const settled=f.local.settleForDeparture(lease).then(()=>{done=true;});await Promise.resolve();assert.equal(done,false);assert.throws(()=>f.edit(99),/離頁/);release();await sync;await settled;assert.equal(f.local.dirty(),false);assert.equal(f.ledger.inspect().ownChanges,1);lease.release();
});
void test('only after confirmed own inverse may discard clear local journal, preserving saved snapshot',async()=>{
 const f=await setup(),saved=copy(f.state.saved);f.edit(40);await f.local.sync();f.edit(80);const lease=f.local.lockForDeparture();await f.local.settleForDeparture(lease);
 const result=await f.ledger.discard(f.client);assert.equal(f.local.dirty(),true);assert.equal(f.x(),80);f.adopt(result);await f.local.discardForDeparture(f.model,lease);assert.equal(f.local.dirty(),false);assert.equal(f.x(),10);assert.deepEqual(copy(f.state.saved),saved);assert.equal(f.ledger.inspect().state,'clean');lease.release();
});
void test('unknown canvas write keeps journal, refuses departure clearing, and releases without losing input',async()=>{
 const f=await setup();f.edit();f.fail(Error('NETWORK_TIMEOUT'));await assert.rejects(f.local.sync(),/NETWORK_TIMEOUT/);const lease=f.local.lockForDeparture();await assert.rejects(f.local.settleForDeparture(lease),/尚未確認/);await assert.rejects(f.local.discardForDeparture(f.model,lease));assert.equal(f.local.pending(),true);assert.equal(f.x(),40);assert.equal(f.ledger.inspect().canDiscard,false);lease.release();assert.equal(f.x(),40);
});
void test('lease and local discard fail closed after account/generation changes',async()=>{
 const f=await setup();f.edit();const lease=f.local.lockForDeparture();f.context.ProcessSync.identity={id:'other'};assert.equal(lease.current(),false);await assert.rejects(f.local.discardForDeparture(f.model,lease),/離頁/);assert.equal(f.local.dirty(),true);lease.release();
});
