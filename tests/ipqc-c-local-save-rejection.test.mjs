// Production transport with synthetic original POST responses; no network or native browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../public/process/shared-draft-client.js',import.meta.url),'utf8');
const path=['items',{id:'item'},'name'],requestId='12345678-1234-4234-8234-123456789abc';
const detail=()=>({localChanges:[{patches:[{op:'set',path,value:'local'}],guards:[{path,value:'base'}]}]});
function fixture({scope='IPQC-C',body,status=409,receiptOnly=false}){
 const memory=new Map(),calls=[],events=[];let original;
 const box={window:null,addEventListener:(name,fn)=>{if(name==='beforeunload')events.push(fn);},crypto:webcrypto,URL,URLSearchParams,AbortController,Response,performance,setTimeout,clearTimeout,
  location:{origin:'https://fixture.invalid',pathname:'/process/'},document:{documentElement:{lang:'zh'},body:{style:{}},querySelector:()=>null,querySelectorAll:()=>[]},
  ProcessSync:{identity:{id:'actor'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:value=>value===1,requiresReload:false},
  sessionStorage:{get length(){return memory.size;},key:i=>[...memory.keys()][i]??null,getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},
  fetch:async(url,options)=>{calls.push({url,method:options.method});if(options.method==='POST'){original=[...memory];if(receiptOnly)throw Error('lost ACK');return Response.json(body,{status});}if(!url.includes('operationId='))return Response.json({control:{workflow:{scope:url.split('/')[2],generation:'generation',revision:1,pendingId:null},versions:[]},permissions:{view:true,edit:true,save:true,submit:true}});return Response.json(receiptOnly?body:{error:'OPERATION_NOT_FOUND'},{status:receiptOnly?status:404});}};
 box.window=box;vm.runInNewContext(source,box);const client=box.createSharedDraftClient({endpoint:'/api/'+scope.toLowerCase()+'/workflow?caseMetadata=1',externalDurableBounded:{scope},actorId:'actor',headers:()=>({})});
 return{client,memory,calls,box,events,original:()=>original};
}
for(const code of ['DEPENDENCY_CHANGED_RECONFIRM','INVALID_LOCAL_SAVE'])void test('verified IPQC-C local Save '+code+' settles only original receipt marker',async()=>{
 const f=fixture({body:{error:code,requestId,details:{path}},status:code==='INVALID_LOCAL_SAVE'?422:409});f.memory.set('unrelated','keep');
 const command=f.client.prepare('generation','save',detail());const error=await f.client.sendPrepared(command).catch(error=>error);
 assert.equal(error.message,code);assert.equal(f.client.hasUnknown(),false);assert.equal(f.client.isConfirmedRejection(error,command),true);assert.deepEqual([...f.memory],[['unrelated','keep']]);assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(f.calls.some(call=>call.url.includes('operationId=')),false);assert.equal(f.original().length,2);
});
for(const fault of ['wrong-path','missing-request-id','forged-request-id','wrong-status','wrong-code','no-nested-guards','receipt-only','wrong-action'])void test('unproven IPQC-C local Save '+fault+' keeps original marker and cannot resend',async()=>{
 const body={error:'DEPENDENCY_CHANGED_RECONFIRM',requestId,details:{path}},input=detail();let status=409;
 if(fault==='wrong-path')body.details.path=['items',{id:'other'},'name'];
 if(fault==='missing-request-id')delete body.requestId;
 if(fault==='forged-request-id')body.requestId='proxy-request';
 if(fault==='wrong-status')status=422;
 if(fault==='wrong-code')body.error='UNKNOWN_REFUSAL';
 if(fault==='no-nested-guards')input.localChanges[0].guards=[];
 const f=fixture({body,status,receiptOnly:fault==='receipt-only'}),command=f.client.prepare('generation',fault==='wrong-action'?'apply':'save',input);
 await assert.rejects(f.client.sendPrepared(command));assert.equal(f.client.hasUnknown(),true);assert.deepEqual([...f.memory],f.original());
 await assert.rejects(f.client.resolveUnknown());await assert.rejects(f.client.sendPrepared(command));assert.deepEqual([...f.memory],f.original());assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
});
for(const scope of ['FQC','IQC'])void test(scope+' cannot inherit IPQC-C nested-localChanges rejection proof',async()=>{
 const f=fixture({scope,body:{error:'DEPENDENCY_CHANGED_RECONFIRM',requestId,details:{path}}});await assert.rejects(f.client.command('generation','save',detail()));assert.equal(f.client.hasUnknown(),true);assert.deepEqual([...f.memory],f.original());
});

void test('three-module departure preserves raw unknowns; unrelated transport still blocks navigation and unload',async()=>{
 const f=fixture({scope:'FQC',receiptOnly:true,body:{error:'OPERATION_NOT_FOUND'},status:404});
 const create=scope=>f.box.createSharedDraftClient({endpoint:'/api/'+scope.toLowerCase()+'/workflow?caseMetadata=1',externalDurableBounded:{scope},allowUnknownDeparture:scope==='IQC',actorId:'actor',headers:()=>({})});
 const fqc=f.client,iqc=create('IQC'),c=create('IPQC-C');
 for(const client of [fqc,iqc,c])await assert.rejects(client.command('generation','save'));
 const anchors=[fqc,iqc].map(client=>client.departureUnknown());assert(anchors.every(Boolean));
 const leases=[fqc,iqc].map((client,index)=>client.coverDeparture(anchors[index],()=>true));
 const retained=[...f.memory];assert.equal(retained.length,3);assert.equal(f.box.sharedDraftAccountState().unknown,true);
 assert.equal(f.box.sharedDraftDepartureBlocked(),false);assert.equal(fqc.otherDeparturePending(),false);
 // The active router's checked FQC exemption must still consult real peer obligations.
 f.box.ProcessDeliveryNavigation={canUnloadWithoutPrompt:()=>!fqc.otherDeparturePending()};
 let prevented=0;for(const handler of f.events)handler({preventDefault(){prevented++;}});assert.equal(prevented,0);
 const unrelated=f.box.createSharedDraftClient({endpoint:'/api/tooling/workflow',actorId:'actor',headers:()=>({})});
 await assert.rejects(unrelated.command('generation','save'));
 assert.equal(f.box.sharedDraftDepartureBlocked(),true);assert.equal(fqc.otherDeparturePending(),true);
 for(const handler of f.events)handler({preventDefault(){prevented++;}});assert.equal(prevented,1);
 for(const client of [fqc,iqc,c,unrelated])assert.equal(client.hasUnknown(),true);
 for(const [key,value]of retained)assert.equal(f.memory.get(key),value);
 assert.equal(f.box.sharedDraftAccountState().unknown,true);assert.equal(f.calls.filter(call=>call.method==='POST').length,4);
 for(const lease of leases)lease.release();
});
