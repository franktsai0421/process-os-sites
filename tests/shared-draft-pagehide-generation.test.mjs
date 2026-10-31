// Actual transport source with synthetic event target/storage/fetch; no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../public/process/shared-draft-client.js',import.meta.url),'utf8');
function fixture(){
 const data=new Map(),listeners=new Map(),calls=[],storage=[];let delivery=1,epoch=1,revision=1,handler=null;
 const flow=()=>({scope:'iqc',generation:'g1',revision,working:{errors:[],items:[]},saved:{id:'saved'},pendingId:null});
 const full=()=>({revision,permissions:{view:true,edit:true,save:true,create:true,submit:true},control:{workflow:flow(),versions:[]}});
 const box={window:null,console,crypto:webcrypto,URL,URLSearchParams,AbortController,Response,performance,location:{origin:'https://fixture.invalid',pathname:'/process/'},document:{documentElement:{lang:'zh'},body:{style:{}},querySelector:()=>null,querySelectorAll:()=>[]},setTimeout:()=>1,clearTimeout(){},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);},sessionStorage:{get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem(k,v){data.set(k,v);storage.push(['set',k,v]);},removeItem(k){data.delete(k);storage.push(['remove',k]);}},ProcessSync:{identity:{id:'actor'},identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:value=>value===delivery,requiresReload:false}};box.window=box;
 box.fetch=async(url,options)=>{calls.push({url,method:options.method});if(handler)return handler(url,options);if(options.method!=='POST')return Response.json(full());const c=JSON.parse(options.body).command;revision++;return Response.json({revision,receipt:{operationId:c.operationId,generation:'g1',revision,savedId:'saved',caseId:null,unchanged:false}});};
 vm.runInNewContext(source,box);
 const create=(options={})=>box.createSharedDraftClient({endpoint:'/api/iqc/workflow?caseMetadata=1',actorId:'actor',headers:()=>({'Content-Type':'application/json'}),externalDurableBounded:{scope:'IQC'},...options});
 return{box,data,calls,storage,create,full,listeners,emit(type){for(const fn of (listeners.get(type)||[]))fn({persisted:true});},advance(){delivery++;},epoch(){epoch++;},handler:value=>handler=value,posts:()=>calls.filter(c=>c.method==='POST').length};
}
const prepare=c=>c.prepareRecovery('g1',{patches:[{op:'set',path:['name'],value:'new'}],guards:[{path:['name'],value:'old'}]});
void test('six delivery remounts across bounded scopes retain one document pagehide listener',()=>{
 const f=fixture(),routes={IQC:'/api/iqc/workflow?caseMetadata=1','IPQC-C':'/api/ipqc-c/workflow?caseMetadata=1',BOM:'/api/bom/workflow?caseMetadata=1',PROCESS:'/api/master/workflow?scope=PROCESS&caseMetadata=1',FQC:'/api/fqc/workflow?caseMetadata=1'};
 assert.equal(f.listeners.get('pagehide').size,1);for(let mount=0;mount<6;mount++){f.advance();for(const [scope,endpoint]of Object.entries(routes)){const c=f.create({endpoint,externalDurableBounded:{scope}});assert(c.isRuntimeCurrent());assert.equal(f.create({endpoint,externalDurableBounded:{scope}}),c);}assert.equal(f.listeners.get('pagehide').size,1);}assert.equal(f.calls.length,0);assert.equal(f.storage.length,0);
});
void test('pagehide permanently retires old bounded clients; pageshow does not revive and fresh clients work',async()=>{
 const f=fixture(),old=f.create();await old.read();f.emit('pagehide');f.emit('pageshow');assert.equal(old.isRuntimeCurrent(),false);const before=f.calls.length;assert.throws(()=>prepare(old),/OWNER_CHANGED/);await assert.rejects(old.read(),/OWNER_CHANGED/);assert.equal(f.calls.length,before);
 const fresh=f.create();assert.notEqual(fresh,old);assert(fresh.isRuntimeCurrent());await fresh.read();f.emit('pageshow');assert(fresh.isRuntimeCurrent());f.emit('pagehide');assert.equal(fresh.isRuntimeCurrent(),false);assert.equal(f.listeners.get('pagehide').size,1);
});
void test('six AB replacement generations keep constant listeners and old create preparation cannot revive',()=>{
 const f=fixture(),options={endpoint:'/api/ipqc-ab/workflow?scope=A%3AG&caseMetadata=1',externalDurableBounded:undefined,abCreateRejections:true};
 for(let mount=0;mount<6;mount++){const c=f.create(options);assert(c.isCreateRuntimeCurrent());assert.equal(f.create(options),c);c.prepareCreate('g','create-error',{name:'synthetic'});f.emit('pagehide');f.emit('pageshow');assert.equal(c.isCreateRuntimeCurrent(),false);assert.throws(()=>c.prepareCreate('g','create-error',{name:'synthetic'}),/AB_CREATE_OWNER_OR_COMMAND_CHANGED/);assert.equal(f.listeners.get('pagehide').size,1);}assert.equal(f.calls.length,0);assert.equal(f.storage.length,0);
});
for(const change of ['actor','epoch','delivery'])void test('existing '+change+' ownership fence remains zero-POST',()=>{const f=fixture(),c=f.create();if(change==='actor')f.box.ProcessSync.identity={id:'actor'};if(change==='epoch')f.epoch();if(change==='delivery')f.advance();assert.throws(()=>prepare(c),/OWNER_CHANGED/);assert.equal(f.calls.length,0);});
void test('pagehide retains unknown receipt metadata; fresh client cannot rePOST lost operation',async()=>{
 const f=fixture(),c=f.create();await c.read();const command=prepare(c);f.handler((_url,options)=>{if(options.method==='POST')throw Error('lost ACK');return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});});await assert.rejects(c.sendPrepared(command,{assertDispatch:()=>true}));assert(c.hasUnknown());const stored=[...f.data],writes=f.storage.length;f.emit('pagehide');f.emit('pageshow');assert.deepEqual([...f.data],stored);assert.equal(f.storage.length,writes);const fresh=f.create();assert(fresh.hasUnknown());await assert.rejects(fresh.resolveUnknown(),/OPERATION_NOT_FOUND/);assert(fresh.hasUnknown());assert.equal(f.posts(),1);assert.deepEqual([...f.data],stored);
});
void test('pagehide invalidates old verified readback and cannot transfer proof to fresh client',async()=>{
 const f=fixture(),c=f.create();await c.read();const command=prepare(c),result=await c.sendPrepared(command,{assertDispatch:()=>true});assert(c.verifiedReadback(result,command.operationId));assert.equal(f.posts(),1);f.emit('pagehide');f.emit('pageshow');assert.equal(c.verifiedReadback(result,command.operationId),null);assert.equal(f.create().verifiedReadback(result,command.operationId),null);assert.equal(f.posts(),1);
});
void test('late pagehide in headers preserves unknown and prevents dispatch',async()=>{
 const f=fixture();let hide=false;const c=f.create({headers:()=>{if(hide)f.emit('pagehide');return {};}});await c.read();const command=prepare(c);hide=true;await assert.rejects(c.sendPrepared(command,{assertDispatch:()=>true}),/OWNER_CHANGED/);assert.equal(f.posts(),0);assert(c.hasUnknown());assert.equal(f.data.size,1);
});
void test('Canvas keeps its separate durable proof and owner lifecycle rather than inheriting bounded-only pagehide semantics',()=>{
 const f=fixture();for(let mount=0;mount<6;mount++){const canvas=f.create({endpoint:'/api/process-authoring/workflow?channel=canvas-v2',externalDurableBounded:undefined,externalDurableCanvas:{assertDispatch:()=>true}});assert(canvas.isRuntimeCurrent());f.emit('pagehide');assert(canvas.isRuntimeCurrent(),'Canvas was not directly pagehide-retired before this change');f.advance();assert.equal(canvas.isRuntimeCurrent(),false);}assert.equal(f.listeners.get('pagehide').size,1);assert.equal(f.calls.length,0);
});
void test('ordinary generic cache semantics do not acquire the bounded/AB pagehide fence',()=>{
 const f=fixture(),options={endpoint:'/api/master/workflow?scope=AB',externalDurableBounded:undefined},c=f.create(options);f.emit('pagehide');f.emit('pageshow');assert.equal(f.create(options),c);assert.equal(f.listeners.get('pagehide').size,1);assert.equal(f.calls.length,0);
});
