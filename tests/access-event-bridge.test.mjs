import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('public/process/access-event-reporter.js','utf8');
void test('simultaneous lazy observations share one owner queue; only scalar metadata crosses import wait',async()=>{
 let release,created=0,epoch=1;const events=[],timers=[],values=new Map(),localStorage={get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};const window={ProcessSync:{identity:{id:'A'},identityGeneration:()=>epoch,features:{accessEvents:['bom']},requiresReload:false,captureDelivery:()=>({epoch}),isCurrentDelivery:owner=>owner.epoch===epoch},addEventListener(){},dispatchEvent(){}};
 window.moduleReady=new Promise(resolve=>{release=resolve;});
 vm.runInNewContext(source.replace("import('./access-event-client.mjs?v=20261106-access-offline2')",'window.moduleReady'),{window,localStorage,indexedDB:{},document:{documentElement:{hasAttribute:()=>false}},setTimeout:fn=>timers.push(fn),CustomEvent:class{},location:{origin:'https://fixture.invalid'}});
 const input={actorId:'A',module:'bom',action:'save',operationId:'operation-0001',occurredAt:123,phase:'unknown',input:'PRIVATE',receipt:{private:true}};
 window.ProcessAccessEvents.observe(input);window.ProcessAccessEvents.observe({...input,operationId:'operation-0002'});window.ProcessAccessEvents.observe({...input,phase:'receipt-observed'});input.operationId='mutated-after-call';assert.equal([...values.keys()].filter(key=>key.startsWith('process-access-event-stage-v2:https://fixture.invalid:A:')).length,3);timers[0]();
 release({createAccessEventStorage:()=>async()=>undefined,createAccessEventReporter:()=>{created++;return {observe:async value=>{events.push(value);return true;},async flush(){}};}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(created,1);assert.deepEqual(events.map(event=>event.operationId),['operation-0001','operation-0002','operation-0001']);assert(events.every(event=>Object.keys(event).length===5));assert(!JSON.stringify(events).includes('PRIVATE'));
 epoch++;window.ProcessSync.identity={id:'B'};window.ProcessAccessEvents.observe({...input,actorId:'A'});await new Promise(resolve=>setImmediate(resolve));assert.equal(events.length,3);
});
void test('unverified gate, another account, local storage failure and capacity fail closed',()=>{
 const values=new Map(),statuses=[],window={ProcessSync:{identity:{id:'A'},identityGeneration:()=>1,features:{accessEvents:[]},requiresReload:false},addEventListener(){},dispatchEvent:event=>statuses.push(event.detail?.status)};
 const localStorage={get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 vm.runInNewContext(source.replace("import('./access-event-client.mjs?v=20261106-access-offline2')",'window.neverImported'),{window,localStorage,document:{documentElement:{hasAttribute:()=>false}},setTimeout(){},CustomEvent:class{constructor(_type,options){this.detail=options.detail;}},location:{origin:'https://fixture.invalid'}});
 const input={actorId:'A',module:'bom',action:'save',operationId:'operation-0001',occurredAt:123,phase:'unknown'};
 window.ProcessAccessEvents.observe(input);assert.equal(values.size,0);
 window.ProcessSync.features={accessEvents:['bom']};window.ProcessAccessEvents.observe({...input,actorId:'B'});assert.equal(values.size,0);
 localStorage.setItem=()=>{throw Error('QUOTA');};window.ProcessAccessEvents.observe(input);assert.equal(values.size,0);assert.equal(statuses.at(-1),'storage-or-source-failed');
 localStorage.setItem=(key,value)=>values.set(key,value);for(let n=0;n<101;n++)window.ProcessAccessEvents.observe({...input,operationId:'operation-'+String(n).padStart(8,'0')});
 assert.equal([...values.keys()].filter(key=>key.startsWith('process-access-event-stage-v2:https://fixture.invalid:A:')).length,100);assert.equal(statuses.at(-1),'capacity');
});
