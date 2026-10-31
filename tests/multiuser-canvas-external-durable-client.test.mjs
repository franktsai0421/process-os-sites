// Actual production client in VM. All fetches are synthetic; no browser/server/network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../public/process/shared-draft-client.js',import.meta.url),'utf8');
const endpoint='/api/process-authoring/workflow?caseMetadata=1&channel=canvas-v2';
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const receipt=command=>({operationId:command.operationId,generation:command.generation,revision:2,savedId:null,caseId:null,unchanged:false});
function fixture({entries=[],epoch=1,handler,proof}={}){
 const data=new Map(entries),storageCalls=[],requests=[],allowed=new Set();let delivery=1,currentEpoch=epoch,nextHandler=handler,proofCalls=0;
 const box={window:null,console,crypto:webcrypto,URL,URLSearchParams,AbortController,Response,performance,location:{origin:'https://fixture.invalid',pathname:'/process/'},document:{documentElement:{lang:'zh'},body:{style:{}},querySelector:()=>null,querySelectorAll:()=>[]},setTimeout:()=>1,clearTimeout(){},addEventListener(){},sessionStorage:{getItem(key){storageCalls.push({kind:'get',key});return data.get(key)??null;},setItem(key,value){storageCalls.push({kind:'set',key,value});data.set(key,value);},removeItem(key){storageCalls.push({kind:'remove',key});data.delete(key);}},ProcessSync:{identity:{id:'actor-a'},identityGeneration:()=>currentEpoch,captureDelivery:()=>delivery,isCurrentDelivery:value=>value===delivery,requiresReload:false}};
 box.window=box;box.fetch=async(url,options)=>{const command=options.body?JSON.parse(options.body).command:null,event={url,options,command};requests.push(event);if(nextHandler)return nextHandler(event);return Response.json(command?{receipt:receipt(command)}:{control:{workflow:{generation:'g1',revision:2}},permissions:{view:true,edit:true}});};
 vm.runInNewContext(source,box,{filename:'shared-draft-client.js'});
 const config={assertDispatch(command){proofCalls++;if(proof)return proof(command);if(!allowed.has(command.operationId))return false;allowed.delete(command.operationId);return true;}};
 return{box,data,storageCalls,requests,allowed,get proofCalls(){return proofCalls;},setHandler:value=>nextHandler=value,setEpoch:value=>currentEpoch=value,setDelivery:value=>delivery=value,create(options={}){return box.createSharedDraftClient({endpoint,actorId:box.ProcessSync.identity.id,headers:()=>({'Content-Type':'application/json'}),...options});},external(options={}){return this.create({externalDurableCanvas:config,...options});}};
}
function command(client,value='local'){return client.prepare('g1','apply',{source:'canvas-v2:'+JSON.stringify(['workspace','stage']),patches:[{path:['workspaces',{id:'workspace'},'stages','stage',{id:'node'},'name'],value}],guards:[{path:['workspaces',{id:'workspace'},'stages','stage',{id:'node'}],value:{id:'node',name:'old'}}]});}
const legacyKey='shared-draft-v3-operation:actor-a:'+endpoint;

void test('external durability opt-in is limited to explicit Canvas routes and a proof function',()=>{
 const f=fixture();for(const route of ['/api/fqc/workflow','/api/process-authoring/workflow','/api/process-authoring/workflow?channel=canvas-v2&channel=canvas','/api/process-authoring/workflow/other?channel=canvas-v2'])assert.throws(()=>f.external({endpoint:route}),/CANVAS_EXTERNAL_DURABILITY_REQUIRED/);
 for(const option of [false,null,{}, {assertDispatch:true}])assert.throws(()=>f.create({externalDurableCanvas:option}),/CANVAS_EXTERNAL_DURABILITY_REQUIRED/);
 assert.equal(f.storageCalls.length,0);assert.equal(f.requests.length,0);
});
void test('Canvas constructor and GET never read or erase an old corrupt generic command',async()=>{
 const old='{corrupt old command with rawmedia',f=fixture({entries:[[legacyKey,old]]}),c=f.external();assert.equal(c.hasUnknown(),false);await c.read();assert.equal(f.requests.length,1);assert.equal(f.requests[0].options.method,'GET');assert.equal(f.data.get(legacyKey),old);assert.deepEqual(f.storageCalls,[]);
});
void test('missing durable proof returns notSent without POST or automatic receipt lookup',async()=>{
 const f=fixture(),c=f.external();await assert.rejects(c.sendPrepared(command(c)),error=>error.notSent===true&&error.message==='CANVAS_DURABLE_DISPATCH_REQUIRED');assert.equal(f.requests.length,0);assert.equal(c.hasUnknown(),false);assert.deepEqual(f.storageCalls,[]);
});
for(const [name,proof]of [['async',()=>Promise.resolve(true)],['throwing',()=>{throw Error('REGISTRY_WRITE_FAILED');}]])void test(name+' proof cannot authorize a POST or be swallowed into UNKNOWN',async()=>{
 const f=fixture({proof}),c=f.external();await assert.rejects(c.sendPrepared(command(c)),error=>error.notSent===true&&error.message==='CANVAS_DURABLE_DISPATCH_REQUIRED');assert.equal(f.requests.length,0);assert.deepEqual(f.storageCalls,[]);
});
void test('external client cannot start Begin, Save or any non-Apply mutation',async()=>{
 const f=fixture(),c=f.external();await assert.rejects(c.begin(),error=>error.notSent===true);for(const action of ['save','submit','restore'])assert.throws(()=>c.sendPrepared(c.prepare('g1',action)),error=>error.notSent===true&&error.message==='CANVAS_EXTERNAL_APPLY_ONLY');assert.equal(f.requests.length,0);assert.equal(f.proofCalls,0);assert.deepEqual(f.storageCalls,[]);
});
void test('valid single-use proof allows one POST without retaining command, guards or media',async()=>{
 const f=fixture({entries:[[legacyKey,'old untouched bytes']]}),c=f.external(),cmd=command(c,'data:image/png;base64,'+'A'.repeat(6000));f.allowed.add(cmd.operationId);const result=await c.sendPrepared(cmd);assert.equal(result.receipt.operationId,cmd.operationId);assert.equal(f.requests.filter(event=>event.options.method==='POST').length,1);assert.equal(f.proofCalls,1);assert.equal(c.hasUnknown(),false);assert.equal(f.data.get(legacyKey),'old untouched bytes');assert.deepEqual(f.storageCalls,[]);await assert.rejects(c.sendPrepared(cmd),error=>error.notSent===true);assert.equal(f.requests.length,1);
});
void test('unknown and missing receipt keep the original operation receipt-only, never another POST',async()=>{
 const f=fixture({entries:[[legacyKey,'untouched']],handler:({command:cmd})=>{if(cmd)throw Error('NETWORK_LOST');return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});}}),c=f.external(),cmd=command(c);f.allowed.add(cmd.operationId);await assert.rejects(c.sendPrepared(cmd),/RESULT_UNKNOWN_CHECK_BEFORE_RETRY/);assert.equal(c.hasUnknown(),true);await assert.rejects(c.receipt(cmd.operationId,cmd.generation),/OPERATION_NOT_FOUND/);await assert.rejects(c.sendPrepared(cmd),/OPERATION_NOT_FOUND/);assert.equal(f.requests.filter(event=>event.options.method==='POST').length,1);assert.equal(f.proofCalls,1);for(const event of f.requests.filter(event=>event.options.method==='GET'))assert.equal(new URL(event.url,'https://fixture.invalid').searchParams.get('operationId'),cmd.operationId);assert.deepEqual(f.storageCalls,[]);assert.equal(f.data.get(legacyKey),'untouched');
 f.setHandler(()=>Response.json({receipt:receipt(cmd)}));await c.receipt(cmd.operationId,cmd.generation);assert.equal(c.hasUnknown(),false);assert.equal(f.requests.filter(event=>event.options.method==='POST').length,1);assert.deepEqual(f.storageCalls,[]);
});
void test('fresh Canvas instance never autoimports old command and queries only explicitly supplied receipt',async()=>{
 const f=fixture(),first=f.external(),cmd=command(first);f.data.set(legacyKey,JSON.stringify(cmd));const next=f.external();assert.notEqual(next,first);assert.equal(f.requests.length,0);assert.equal(next.hasUnknown(),false);f.setHandler(()=>Response.json({receipt:receipt(cmd)}));await next.receipt(cmd.operationId,cmd.generation);assert.equal(f.requests.length,1);assert.equal(f.requests[0].options.method,'GET');assert.deepEqual(f.storageCalls,[]);assert.equal(f.data.get(legacyKey),JSON.stringify(cmd));
});
void test('proxy 4xx is returned unchanged and cannot reuse the consumed durable proof for a second POST',async()=>{
 const f=fixture({handler:()=>Response.json({error:'PROXY_REJECTED'},{status:409})}),c=f.external(),cmd=command(c);f.allowed.add(cmd.operationId);await assert.rejects(c.sendPrepared(cmd),error=>error.status===409&&error.message==='PROXY_REJECTED');await assert.rejects(c.sendPrepared(cmd),error=>error.notSent===true);assert.equal(f.requests.length,1);assert.deepEqual(f.storageCalls,[]);
});
for(const change of ['actor','epoch','delivery','identity','reload'])void test('queued '+change+' change blocks the POST before durable-proof consumption',async()=>{
 const f=fixture(),c=f.external(),cmd=command(c);f.allowed.add(cmd.operationId);const pending=c.sendPrepared(cmd);if(change==='actor')f.box.ProcessSync.identity={id:'actor-b'};if(change==='epoch')f.setEpoch(2);if(change==='delivery')f.setDelivery(2);if(change==='identity')f.box.ProcessSync.identity={id:'actor-a'};if(change==='reload')f.box.ProcessSync.requiresReload=true;await assert.rejects(pending,/ACCOUNT_CHANGED|OWNER_CHANGED|DELIVERY_INVALIDATED/);assert.equal(f.requests.length,0);assert.equal(f.proofCalls,0);assert.deepEqual(f.storageCalls,[]);
});
for(const change of ['actor','epoch','delivery'])void test('late ACK after '+change+' change does not settle or query the old operation',async()=>{
 const gate=deferred(),f=fixture({handler:()=>gate.promise}),c=f.external(),cmd=command(c);f.allowed.add(cmd.operationId);const pending=c.sendPrepared(cmd);await Promise.resolve();assert.equal(f.requests.length,1);if(change==='actor')f.box.ProcessSync.identity={id:'actor-b'};if(change==='epoch')f.setEpoch(2);if(change==='delivery')f.setDelivery(2);gate.resolve(Response.json({receipt:receipt(cmd)}));await assert.rejects(pending,/ACCOUNT_CHANGED|OWNER_CHANGED/);assert.equal(c.hasUnknown(),true);assert.equal(f.requests.length,1);assert.deepEqual(f.storageCalls,[]);
});
void test('identity changed by headers is rechecked immediately before the proof/fetch',async()=>{
 const f=fixture(),c=f.external({headers:()=>{f.setEpoch(2);return{};}}),cmd=command(c);f.allowed.add(cmd.operationId);await assert.rejects(c.sendPrepared(cmd),/OWNER_CHANGED/);assert.equal(f.requests.length,0);assert.equal(f.proofCalls,0);assert.deepEqual(f.storageCalls,[]);
});
void test('late receipt after epoch change cannot settle the RAM unknown',async()=>{
 const f=fixture({handler:({command:cmd})=>{if(cmd)throw Error('NETWORK_LOST');return Response.json({error:'NOT_FOUND'},{status:404});}}),c=f.external(),cmd=command(c);f.allowed.add(cmd.operationId);await assert.rejects(c.sendPrepared(cmd));const gate=deferred();f.setHandler(()=>gate.promise);const pending=c.receipt(cmd.operationId,cmd.generation);f.setEpoch(2);gate.resolve(Response.json({receipt:receipt(cmd)}));await assert.rejects(pending,/OWNER_CHANGED/);assert.equal(c.hasUnknown(),true);assert.equal(f.requests.filter(event=>event.options.method==='POST').length,1);assert.deepEqual(f.storageCalls,[]);
});
void test('generic clients keep their old cache and before-POST session persistence/removal',async()=>{
 const f=fixture({epoch:undefined}),c=f.create();assert.equal(f.create(),c);const cmd=command(c,'generic media');f.setHandler(({command:sent})=>{assert.equal(JSON.parse(f.data.get(legacyKey)).operationId,sent.operationId);return Response.json({receipt:receipt(sent)});});await c.sendPrepared(cmd);assert.deepEqual(f.storageCalls.map(call=>call.kind),['get','set','remove']);assert.equal(f.data.has(legacyKey),false);assert.equal(f.requests.length,1);
});
void test('generic reload still imports an unknown and clears only its exact retained command after receipt',async()=>{
 const original={operationId:webcrypto.randomUUID(),generation:'g1',action:'apply',patches:[],guards:[]},raw=JSON.stringify(original),f=fixture({entries:[[legacyKey,raw]],handler:()=>Response.json({receipt:receipt(original)})}),c=f.create();assert.equal(c.hasUnknown(),true);assert.deepEqual(f.storageCalls.map(call=>call.kind),['get']);await c.retryUnknown();assert.equal(c.hasUnknown(),false);assert.deepEqual(f.storageCalls.map(call=>call.kind),['get','remove']);assert.equal(f.requests.length,1);assert.equal(f.requests[0].options.method,'GET');
});
void test('generic and external modes cannot reuse each other’s cached transport or recovery policy',()=>{
 const f=fixture({entries:[[legacyKey,'invalid generic record']]}),external=f.external(),generic=f.create();assert.notEqual(external,generic);assert.equal(external.hasUnknown(),false);assert.equal(generic.hasUnknown(),true);assert.equal(f.create(),generic);assert.deepEqual(f.storageCalls.map(call=>call.kind),['get']);assert.equal(f.data.get(legacyKey),'invalid generic record');
});

void test('a transport rejection cannot forge the private pre-dispatch notSent proof',async()=>{
 const f=fixture({handler:({command:cmd})=>{if(cmd)throw Object.assign(Error('NETWORK_LOST'),{notSent:true});return Response.json({error:'NOT_FOUND'},{status:404});}}),c=f.external(),cmd=command(c);f.allowed.add(cmd.operationId);await assert.rejects(c.sendPrepared(cmd),error=>error.message==='RESULT_UNKNOWN_CHECK_BEFORE_RETRY'&&error.notSent===undefined);assert.equal(c.hasUnknown(),true);assert.equal(f.requests.filter(event=>event.options.method==='POST').length,1);assert.deepEqual(f.storageCalls,[]);
});
