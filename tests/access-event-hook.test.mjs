import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {webcrypto} from 'node:crypto';
const source=fs.readFileSync('public/process/shared-draft-client.js','utf8');
function fixture(observer){const disk=new Map(),calls=[],events=[];let command,committed=false;
 const window={ProcessSync:{identity:{id:'actor'},requiresReload:false},ProcessAccessEvents:{observe(event){events.push(event);observer?.(event);}}};
 vm.runInNewContext(source,{window,URL,URLSearchParams,document:{documentElement:{lang:'zh'}},crypto:webcrypto,AbortController,setTimeout,clearTimeout,sessionStorage:{getItem:key=>disk.get(key)||null,setItem:(key,value)=>disk.set(key,value),removeItem:key=>disk.delete(key)},fetch:async(url,options)=>{calls.push({url,method:options.method});if(options.body){command=JSON.parse(options.body).command;throw Error('lost ACK');}return committed?Response.json({receipt:{operationId:command.operationId,generation:command.generation,revision:1,savedId:null,caseId:null,unchanged:false}}):Response.json({error:'OPERATION_NOT_FOUND'},{status:404});}});
 return {disk,calls,events,window,commit:()=>{committed=true;},client:window.createSharedDraftClient({endpoint:'/api/bom/workflow?caseMetadata=1',actorId:'actor',headers:()=>({})})};
}
for(const observer of [undefined,()=>{throw Error('reporting failure');}])void test('metadata reporting cannot settle unknown or bypass original no-resend '+!!observer,async()=>{
 const f=fixture(observer);await assert.rejects(f.client.command('generation','apply',{patches:[{op:'set',path:['field'],value:'PRIVATE_INPUT_NOT_COLLECTED'}]}),/RESULT_UNKNOWN/);
 assert.equal(f.events.length,1);assert.deepEqual(Object.keys(f.events[0]).sort(),['action','actorId','module','occurredAt','operationId','phase']);assert.equal(f.events[0].module,'bom');assert(!JSON.stringify(f.events).includes('PRIVATE_INPUT'));
 const raw=[...f.disk];assert(f.client.hasUnknown());await assert.rejects(f.client.command('generation','save'));await assert.rejects(f.client.retryUnknown());assert.deepEqual([...f.disk],raw);assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
 f.commit();await f.client.retryUnknown();assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(f.disk.size,0);assert.equal(f.events.at(-1).phase,'receipt-observed');assert.equal(f.events.at(-1).operationId,f.events[0].operationId);
});
