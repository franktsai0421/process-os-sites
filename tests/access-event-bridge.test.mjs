import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('public/process/access-event-reporter.js','utf8');
void test('simultaneous lazy observations share one owner queue; only scalar metadata crosses import wait',async()=>{
 let release,created=0,epoch=1;const events=[],timers=[];const window={ProcessSync:{identity:{id:'A'},identityGeneration:()=>epoch,requiresReload:false},addEventListener(){},dispatchEvent(){}};
 window.moduleReady=new Promise(resolve=>{release=resolve;});
 vm.runInNewContext(source.replace("import('./access-event-client.mjs?v=20261105-events1')",'window.moduleReady'),{window,document:{documentElement:{hasAttribute:()=>false}},setTimeout:fn=>timers.push(fn),CustomEvent:class{},location:{origin:'https://fixture.invalid'}});
 const input={actorId:'A',module:'bom',action:'save',operationId:'operation-0001',occurredAt:123,phase:'unknown',input:'PRIVATE',receipt:{private:true}};
 window.ProcessAccessEvents.observe(input);window.ProcessAccessEvents.observe({...input,operationId:'operation-0002'});input.operationId='mutated-after-call';timers[0]();
 release({createAccessEventReporter:()=>{created++;return {observe:value=>events.push(value),flush(){}};}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(created,1);assert.deepEqual(events.map(event=>event.operationId),['operation-0001','operation-0002']);assert(events.every(event=>Object.keys(event).length===5));assert(!JSON.stringify(events).includes('PRIVATE'));
 epoch++;window.ProcessSync.identity={id:'B'};window.ProcessAccessEvents.observe({...input,actorId:'A'});await new Promise(resolve=>setImmediate(resolve));assert.equal(events.length,2);
});
