// Production transport with synthetic fetch/storage only. No server/browser/network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../public/process/shared-draft-client.js',import.meta.url),'utf8');
const routes={BOM:'/api/bom/workflow?caseMetadata=1'};
function fixture(scope='BOM'){
 const data=new Map(),calls=[],storage=[],events=new Map();let epoch=1,delivery=1,revision=1,generation='g1',handler=null,projection=false;
 const flow=()=>({scope:'bom',generation,revision,working:{bom:{ROOT:[{id:'row1',itemName:'old'}]},referenceIssues:[]},saved:{id:'save1'},pendingId:null,editable:true});
 const permissions=()=>({view:true,edit:true,save:true,submit:true,approve:true,withdraw:true,return:true,history:true,create:true,delete:true,restore:true,import:true});
 const full=()=>({revision,control:{workflow:flow(),versions:[]},permissions:permissions()});
 const box={window:null,console,crypto:webcrypto,URL,URLSearchParams,AbortController,Response,performance,location:{origin:'https://fixture.invalid',pathname:'/process/'},document:{documentElement:{lang:'zh'},body:{style:{}},querySelector:()=>null,querySelectorAll:()=>[]},setTimeout:()=>1,clearTimeout(){},addEventListener(name,fn){const list=events.get(name)||[];list.push(fn);events.set(name,list);},sessionStorage:{get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem(key){storage.push(['get',key]);return data.get(key)??null;},setItem(key,value){storage.push(['set',key,value]);data.set(key,value);},removeItem(key){storage.push(['remove',key]);data.delete(key);}},ProcessSync:{identity:{id:'actor1'},identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:v=>v===delivery,requiresReload:false}};
 box.window=box;box.fetch=async(url,options)=>{const body=options.body?JSON.parse(options.body):null,event={url,options,body,command:body?.command};calls.push(event);if(handler)return handler(event);if(!body)return Response.json(full());if(body.action==='begin')return Response.json({revision,control:{workflow:flow(),versions:[]}});revision++;const receipt={operationId:body.command.operationId,generation,revision,savedId:'save1',caseId:null,unchanged:false};return Response.json(projection?{revision,receipt,cSaveProjection:{version:1,generation,flowRevision:revision,marker:'original-projection'}}:{revision,receipt,requestId:'d181dc48-e01c-4fda-913b-c510a0b5e431',control:{workflow:flow(),versions:[],originalPostShape:true}});};
 vm.runInNewContext(source,box,{filename:'shared-draft-client.js'});
 return{box,data,calls,storage,full,flow,permissions,setEpoch:value=>epoch=value,setDelivery:value=>delivery=value,setRevision:value=>revision=value,setGeneration:value=>generation=value,setHandler:value=>handler=value,setProjection:value=>projection=value,emit(name,event){for(const fn of events.get(name)||[])fn(event);},client(options={}){return box.createSharedDraftClient({endpoint:routes[scope],actorId:'actor1',headers:()=>({'Content-Type':'application/json'}),externalDurableBounded:{scope},guardAccessResults:true,conditionalState:true,...options});}};
}
const manual={patches:[{op:'set',path:['bom','ROOT',{id:'row1'},'itemName'],value:'new'}],guards:[{path:['bom','ROOT',{id:'row1'},'itemName'],value:'old'}]};
const command=c=>c.prepareRecovery('g1',manual);
const markerKeys=f=>[...f.data.keys()].filter(key=>key.startsWith('shared-draft-receipt-only-v1:'));
const requestId='d181dc48-e01c-4fda-913b-c510a0b5e431';


void test('BOM selected Apply uses exact original CAS authority, not a fabricated GET readback',async()=>{
 const f=fixture(),c=f.client();await c.read();f.calls.length=0;const cmd=command(c),result=await c.sendPrepared(cmd,{assertDispatch:()=>true});
 assert.deepEqual(f.calls.map(r=>r.command?.action||'GET'),['apply']);assert.equal(c.verifiedReadback(result,cmd.operationId),null);
 const proof=c.verifiedApplyAuthority(result,cmd.operationId);assert.equal(proof.response,result);assert.equal(proof.priorPermissions.view,true);assert.equal(result.permissions,undefined);assert.equal(c.hasUnknown(),false);assert.equal(markerKeys(f).length,0);
 assert.equal(c.verifiedApplyAuthority({...result},cmd.operationId),null);assert.equal(c.verifiedApplyAuthority(result,'other'),null);
 assert.throws(()=>{result.control.workflow.working.bom.ROOT[0].itemName='forged';},TypeError);
});
void test('three selected Apply operations and final Save retain one final full GET',async()=>{
 const f=fixture(),c=f.client();await c.read();f.calls.length=0;
 for(let i=0;i<3;i++){const cmd=command(c),result=await c.sendPrepared(cmd,{assertDispatch:()=>true});assert(c.verifiedApplyAuthority(result,cmd.operationId));}
 const save=c.prepareRecoverySave('g1'),result=await c.sendPrepared(save,{assertDispatch:()=>true});assert(c.verifiedReadback(result,save.operationId));assert.equal(c.verifiedApplyAuthority(result,save.operationId),null);assert.deepEqual(f.calls.map(r=>r.command?.action||'GET'),['apply','apply','apply','save','GET']);
});
for(const mode of ['ordinary','missing-control','missing-requestId','wrong-flow-receipt','global-not-newer','missing-import-permission','historical-reply'])void test(`BOM original authority falls back to full GET: ${mode}`,async()=>{
 const f=fixture(),c=f.client();if(mode==='missing-import-permission')f.setHandler(()=>{const r=f.full();delete r.permissions.import;return Response.json(r);});await c.read();f.calls.length=0;
 f.setHandler(({command:sent})=>{f.setRevision(2);if(!sent)return Response.json(f.full());const r={...f.full(),requestId,receipt:{operationId:sent.operationId,generation:'g1',revision:2,savedId:'save1',caseId:null,unchanged:false}};delete r.permissions;if(mode==='missing-control')delete r.control;if(mode==='missing-requestId')delete r.requestId;if(mode==='wrong-flow-receipt')r.control.workflow.revision=3;if(mode==='global-not-newer')r.revision=1;if(mode==='historical-reply')r.unchanged=true;return Response.json(r);});
 if(mode==='wrong-flow-receipt')f.setHandler(({command:sent})=>{f.setRevision(3);if(!sent)return Response.json(f.full());return Response.json({revision:3,requestId,control:f.full().control,receipt:{operationId:sent.operationId,generation:'g1',revision:2,savedId:'save1',caseId:null,unchanged:false}});});
 const cmd=mode==='ordinary'?c.prepare('g1','apply',manual):command(c),result=await c.sendPrepared(cmd,{assertDispatch:()=>true});assert.deepEqual(f.calls.map(r=>r.command?.action||'GET'),['apply','GET']);assert(c.verifiedReadback(result,cmd.operationId));assert.equal(c.verifiedApplyAuthority(result,cmd.operationId),null);
});
void test('lost POST ACK can only recover through original receipt and full GET',async()=>{
 const f=fixture(),c=f.client();await c.read();f.calls.length=0;const cmd=command(c);f.setHandler(({command:sent,url})=>{if(sent)throw Error('lost');f.setRevision(2);return Response.json(url.includes('operationId=')?{receipt:{operationId:cmd.operationId,generation:'g1',revision:2,savedId:'save1',caseId:null,unchanged:false}}:f.full());});
 const result=await c.sendPrepared(cmd,{assertDispatch:()=>true});assert.equal(result.recovered,true);assert(c.verifiedReadback(result,cmd.operationId));assert.equal(c.verifiedApplyAuthority(result,cmd.operationId),null);assert.deepEqual(f.calls.map(r=>r.command?.action||(r.url.includes('operationId=')?'receipt':'GET')),['apply','receipt','GET']);
});
for(const change of ['epoch','delivery','identity','permission','model'])void test(`original Apply does not authorize stale ${change}`,async()=>{
 const f=fixture(),c=f.client();await c.read();f.calls.length=0;let release;const wait=new Promise(r=>release=r);let dispatched;const started=new Promise(r=>dispatched=r);
 f.setHandler(async({command:sent})=>{if(sent){dispatched();await wait;f.setRevision(2);return Response.json({revision:2,requestId,control:f.full().control,receipt:{operationId:sent.operationId,generation:'g1',revision:2,savedId:'save1',caseId:null,unchanged:false}});}if(change==='permission'){const full=f.full();full.permissions.edit=false;return Response.json(full);}if(change==='model'){f.setRevision(4);return Response.json(f.full());}return Response.json(f.full());});
 const cmd=command(c),flight=c.sendPrepared(cmd,{assertDispatch:()=>true});await started;
 if(change==='epoch')f.setEpoch(2);if(change==='delivery')f.setDelivery(2);if(change==='identity')f.box.ProcessSync.identity={id:'actor1'};if(change==='permission')await c.permissions();if(change==='model')await c.read();release();
 if(['epoch','delivery','identity','model'].includes(change)){await assert.rejects(flight);assert.equal(c.hasUnknown(),true);}else{const result=await flight;assert.equal(c.verifiedApplyAuthority(result,cmd.operationId),null);assert(c.verifiedReadback(result,cmd.operationId));assert.equal(c.permission('edit'),false);}
 assert.equal(f.calls.filter(r=>r.command).length,1);
});
void test('post proof expires after a later model read or access invalidation',async()=>{
 const f=fixture(),c=f.client();await c.read();const cmd=command(c),result=await c.sendPrepared(cmd,{assertDispatch:()=>true});assert(c.verifiedApplyAuthority(result,cmd.operationId));await c.read();assert.equal(c.verifiedApplyAuthority(result,cmd.operationId),null);
 const next=command(c),later=await c.sendPrepared(next,{assertDispatch:()=>true});assert(c.verifiedApplyAuthority(later,next.operationId));c.invalidateReadState();assert.equal(c.verifiedApplyAuthority(later,next.operationId),null);
});
void test('final Save denial retains unknown even after valid fast Apply',async()=>{
 const f=fixture(),c=f.client();await c.read();const cmd=command(c);await c.sendPrepared(cmd,{assertDispatch:()=>true});const save=c.prepareRecoverySave('g1');f.setHandler(({command:sent})=>sent?Response.json({receipt:{operationId:save.operationId,generation:'g1',revision:3,savedId:'s2',caseId:null,unchanged:false}}):Response.json({error:'FORBIDDEN'},{status:403}));await assert.rejects(c.sendPrepared(save,{assertDispatch:()=>true}));assert.equal(c.hasUnknown(),true);assert.equal(markerKeys(f).length,1);
});

void test('original Apply impossible receipt never clears its marker',async()=>{
 const f=fixture(),c=f.client();await c.read();const cmd=command(c);f.setHandler(({command:sent})=>sent?Response.json({revision:2,requestId,control:f.full().control,receipt:{operationId:cmd.operationId,generation:'g1',revision:1,savedId:'save1',caseId:null,unchanged:false}}):Response.json({error:'OPERATION_NOT_FOUND'},{status:404}));await assert.rejects(c.sendPrepared(cmd,{assertDispatch:()=>true}));assert.equal(c.hasUnknown(),true);assert.equal(markerKeys(f).length,1);assert.equal(f.calls.filter(r=>r.command).length,1);
});
void test('fast Apply cleanup failure remains receipt-only and never repeats POST',async()=>{
 const f=fixture(),c=f.client();await c.read();const cmd=command(c),remove=f.box.sessionStorage.removeItem.bind(f.box.sessionStorage);f.box.sessionStorage.removeItem=()=>{throw Error('quota');};await assert.rejects(c.sendPrepared(cmd,{assertDispatch:()=>true}));assert.equal(c.hasUnknown(),true);assert.equal(markerKeys(f).length,1);f.box.sessionStorage.removeItem=remove;f.setHandler(({url})=>Response.json(url.includes('operationId=')?{receipt:{operationId:cmd.operationId,generation:'g1',revision:2,savedId:'save1',caseId:null,unchanged:false}}:f.full()));const result=await c.retryUnknown();assert(c.verifiedReadback(result,cmd.operationId));assert.equal(c.verifiedApplyAuthority(result,cmd.operationId),null);assert.equal(c.hasUnknown(),false);assert.equal(f.calls.filter(r=>r.command).length,1);
});
