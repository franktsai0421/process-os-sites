// Canvas proof CPU guardrails; synthetic fixtures only, never browser timing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createOwnedDraftLedger} from '../public/process/owned-draft-ledger.mjs';

const shared=fs.readFileSync('public/process/shared-draft-client.js','utf8');
const begin=shared.indexOf('  const canvasJSONShapes='),end=shared.indexOf('  const canvasOwner=',begin);
assert(begin>0&&end>begin);
function jsonFixture(){const context=vm.createContext({});return {context,...vm.runInContext(shared.slice(begin,end)+';({copy:canvasJSONCopy,matches:canvasJSONMatches})',context)};}
// Reuse the existing actual four-layer fixture without registering its tests.
// Only instrumentation is added; production methods and all HTTP routes remain real.
const stack=fs.readFileSync('tests/canvas-post-authority-stack.test.mjs','utf8');
function fixtureBoundary(text){
 const markers=[...text.matchAll(/^(?:void )?test\('actual four-layer first Sync/gm)];
 assert.equal(markers.length,1,'unique named first stack test registration');return markers[0].index;
}
assert.equal(fixtureBoundary("prefix\ntest('actual four-layer first Sync"),7);
assert.equal(fixtureBoundary("prefix\nvoid test('actual four-layer first Sync"),7);
assert.throws(()=>fixtureBoundary('missing'),/unique named/);
assert.throws(()=>fixtureBoundary("test('actual four-layer first Sync\nvoid test('actual four-layer first Sync"),/unique named/);
const fixtureStart=stack.indexOf('const source=name=>'),fixtureEnd=fixtureBoundary(stack);
assert(fixtureStart>0&&fixtureEnd>fixtureStart);
const fixtureSource=stack.slice(fixtureStart,fixtureEnd)
 .replace('metrics={json:0,paint:0}','metrics={json:0,paint:0,raw:[],controlShadowClones:0}')
 .replace('return copy(value);},performance',"if(value?.workflow&&new Error().stack.includes('canvasObserveResponse'))metrics.controlShadowClones++;return structuredClone(value);},performance")
 .replace("vm.runInContext(code('shared-draft-client'),box);","vm.runInContext(code('shared-draft-client').replace('function canvasJSONShape(value){','function canvasJSONShape(value){window.__canvasShapeChecks=(window.__canvasShapeChecks||0)+1;'),box);")
 .replace('metrics.json++;return JSON.stringify(...args);',"metrics.json++;if(args[0]?.action==='apply'&&args[0]?.operationId)metrics.raw.push(new Error().stack);return JSON.stringify(...args);");
assert(fixtureSource.includes('metrics.raw.push'));
assert(fixtureSource.includes('metrics.controlShadowClones++'),'CPU fixture uses native structuredClone, not JSON normalization');
const {fixture,syntheticServer,workspace,stage,methods,clear,rows,started}=vm.runInNewContext('const baselineSources=new Map();'+fixtureSource+';({fixture,syntheticServer,workspace,stage,methods,clear,rows,started})',{
 fs,vm,webcrypto,createOwnedDraftLedger,structuredClone,performance,Response,Buffer,AbortController,URL,URLSearchParams,queueMicrotask,console,assert
});

function plain(value){return JSON.parse(JSON.stringify(value));}
void test('private JSON snapshot detaches/freeze containers but shares immutable strings without touching caller',()=>{
 const f=jsonFixture(),input=JSON.parse('{"media":"data:image/png;base64,synthetic","list":[{"id":"a"}],"__proto__":{"value":"data"}}'),copy=f.copy(input);
 assert.deepEqual(plain(copy),input);assert(Object.isFrozen(copy));assert(Object.isFrozen(copy.list[0]));assert(!Object.isFrozen(input));assert(!Object.isFrozen(input.list[0]));assert(Object.hasOwn(copy,'__proto__'));assert.equal(copy.value,undefined);assert(f.matches(input,copy));input.list[0].id='changed';assert(!f.matches(input,copy));
});
for(const [name,make]of [
 ['undefined',()=>({x:undefined})],['function',()=>({x(){}})],['symbol value',()=>({x:Symbol('x')})],['symbol key',()=>({[Symbol('x')]:1})],['nonfinite',()=>({x:Infinity})],['date',()=>({x:new Date(0)})],['map',()=>({x:new Map()})],['null prototype',()=>Object.assign(Object.create(null),{x:1})],['custom prototype',()=>Object.assign(Object.create({}),{x:1})],['sparse array',()=>Object.assign(Array(3),{0:1,2:3})],['extra array property',()=>Object.assign([1],{extra:1})],['nonenumerable',()=>Object.defineProperty({x:1},'hidden',{value:1})],['own toJSON',()=>({x:1,toJSON(){return{x:1};}})],['cycle',()=>{const x={};x.x=x;return x;}],['non-path alias',()=>{const x={id:'x'};return{a:x,b:x};}]
])void test(name+' cannot create a private fast snapshot',()=>{const f=jsonFixture();assert.throws(()=>f.copy(make()),/CANVAS_JSON_SHAPE_UNSUPPORTED/);});
void test('accessors are not invoked by snapshot or later command verification',()=>{
 const f=jsonFixture();let reads=0;const input={x:1},copy=f.copy(input);Object.defineProperty(input,'x',{enumerable:true,get(){reads++;return 1;}});assert.throws(()=>f.copy(input),/UNSUPPORTED/);assert.throws(()=>f.matches(input,copy),/UNSUPPORTED/);assert.equal(reads,0);
});
void test('key order, nonenumerable and symbol additions, and prototype replacement invalidate exact command',()=>{
 const f=jsonFixture();for(const change of [x=>{const a=x.a;delete x.a;x.a=a;},x=>Object.defineProperty(x,'hidden',{value:1}),x=>{x[Symbol('x')]=1;},x=>Object.setPrototypeOf(x,Object.create(Object.prototype))]){const x={a:1,b:2},copy=f.copy(x);change(x);let accepted=false;try{accepted=f.matches(x,copy);}catch{}assert.equal(accepted,false);}
});
void test('inherited toJSON pollution is rejected without executing it, including after snapshot',()=>{
 const f=jsonFixture();vm.runInContext('globalThis.value={x:1};globalThis.gets=0;',f.context);const copy=f.copy(f.context.value);
 vm.runInContext('Object.defineProperty(Object.prototype,"toJSON",{configurable:true,get(){gets++;return ()=>({x:1});}})',f.context);
 assert.throws(()=>f.copy(f.context.value),/UNSUPPORTED/);assert.throws(()=>f.matches(f.context.value,copy),/UNSUPPORTED/);assert.equal(f.context.gets,0);
});
void test('canonical sender clone may change JSON realm, never accept a custom prototype',()=>{
 const f=jsonFixture(),input={x:{id:'x'}},copy=f.copy(input),sender=vm.runInContext('({x:{id:"x"}})',f.context);assert.equal(f.matches(sender,copy),false);assert(f.matches(sender,copy,false));Object.setPrototypeOf(sender.x,Object.create(Object.getPrototypeOf(sender.x)));assert.throws(()=>f.matches(sender,copy,false),/UNSUPPORTED/);
});

void test('actual stack retains three single-POST batches and zero proof raw-command stringify',async t=>{
 const f=await fixture();for(let i=0;i<3;i++){clear(f);f.metrics.raw.length=0;f.edit('CPU guard '+i);await f.local.sync(workspace,stage);assert.deepEqual([...methods(f)],['POST']);assert.equal(rows(f)[0].name,'CPU guard '+i);assert.equal(f.local.pending(),false);assert.equal(f.metrics.raw.filter(stack=>/canvasArm|canvasVerify|canvasObservePost|Object\.prepare\b/.test(stack)).length,0);assert.equal(f.metrics.raw.length,3,'two durable-store checks plus original sender capture remain');if(i===0)t.diagnostic(JSON.stringify({rawCalls:f.metrics.raw.length,sites:f.metrics.raw.map(s=>s.split('\n').slice(1,4))}));}
});
void test('actual stack next input and other canvas remain local with original ACK',async()=>{
 const f=await fixture();f.local.edit(workspace,'T',[{id:'two',f:'name',value:'Other local'}]);clear(f);f.edit('Sent');f.remote.mode('held');const flight=f.local.sync(workspace,stage);await started(f);f.edit('After dispatch');f.remote.releasePost();await flight;assert.deepEqual([...methods(f)],['POST']);assert.equal(rows(f)[0].name,'After dispatch');assert.equal(f.local.project(workspace,'T',f.api.flow().working.workspaces[0].stages.T)[0].name,'Other local');assert(f.local.dirty());
});
void test('actual stack unknown receipt404 retains pending and never rePOSTs',async()=>{
 const f=await fixture();clear(f);f.edit('Unknown');f.remote.mode('lost');await assert.rejects(f.local.sync(workspace,stage));const count=f.remote.calls.filter(c=>c.method==='POST').length;await assert.rejects(f.local.sync(workspace,stage));assert.equal(f.remote.calls.filter(c=>c.method==='POST').length,count);assert.equal(count,1);assert(f.local.pending());assert.equal(rows(f)[0].name,'Unknown');
});
void test('actual stack late owner prevents adoption and retains old local batch',async()=>{
 const f=await fixture();f.edit('Old owner');clear(f);f.remote.mode('held');const flight=f.local.sync(workspace,stage);await started(f);f.epoch();f.remote.releasePost();await assert.rejects(flight);assert.equal(f.api.flow().revision,0);assert(f.local.pending());assert.deepEqual([...methods(f)],['POST']);
});
void test('actual original command remains mutable but an in-place change cannot acquire its prepared proof',async()=>{
 const f=await fixture(),primary=f.clients[0],target=f.clients[1],result=await primary.read(),authority=f.box.SharedDraftCanvasAuthority,anchor=authority.capture(primary,result,result.control);
 const command=target.prepare('g1','apply',{source:'canvas-v2:'+JSON.stringify([workspace,stage]),patches:[{op:'set',path:['workspaces',{id:workspace},'stages',stage,{id:'one'},'name'],value:'X'}],guards:[]});
 assert(anchor);assert(!Object.isFrozen(command));assert(!Object.isFrozen(command.patches));command.patches[0].value='Altered';assert.equal(authority.arm(target,command,anchor),null);assert.equal(f.remote.calls.filter(c=>c.method==='POST').length,0);
});
void test('GET non-enumerable decoration does not change JSON authority or freeze the public model',async()=>{
 const remote=syntheticServer(),fetch=remote.fetch;let first=true;remote.fetch=async(...args)=>{const response=await fetch(...args);if(first){first=false;const json=response.json.bind(response);response.json=async()=>{const body=await json();Object.defineProperty(body.control,'unsupported',{value:true,enumerable:false});return body;};}return response;};
 const f=await fixture({remote});assert.equal(f.api.flow().revision,0);assert.equal(f.metrics.controlShadowClones,1);assert(!Object.isFrozen(f.api.flow()));clear(f);f.edit('JSON content unchanged');await f.local.sync(workspace,stage);assert.deepEqual([...methods(f)],['POST']);assert.equal(f.local.pending(),false);
});
void test('non-cloneable GET shadow fails only the optional proof, not ordinary load or original fallback',async()=>{
 const remote=syntheticServer(),fetch=remote.fetch;let first=true;remote.fetch=async(...args)=>{const response=await fetch(...args);if(first){first=false;const json=response.json.bind(response);response.json=async()=>{const body=await json();body.control.unsupported=()=>true;return body;};}return response;};
 const f=await fixture({remote});assert.equal(f.api.flow().revision,0);assert.equal(f.api.recoveryAuthority().canView,true);clear(f);f.edit('Clone unavailable');await f.local.sync(workspace,stage);assert.deepEqual([...methods(f)],['POST','GET']);assert.equal(f.local.pending(),false);
});
void test('native GET private shadow remains detached from publicly mutated JSON at both capture and arm',async()=>{
 const f=await fixture(),primary=f.clients[0],target=f.clients[1],actual=await primary.read(),authority=f.box.SharedDraftCanvasAuthority,anchor=authority.capture(primary,actual,actual.control);assert(anchor);assert(!Object.isFrozen(actual.control));assert(!Object.isFrozen(actual.control.workflow.working));
 const command=target.prepare('g1','apply',{source:'canvas-v2:'+JSON.stringify([workspace,stage]),patches:[{op:'set',path:['workspaces',{id:workspace},'stages',stage,{id:'one'},'name'],value:'X'}],guards:[]});actual.control.workflow.working.workspaces[0].stages.S[0].name='Not server authority';assert.equal(authority.capture(primary,actual,actual.control),null);assert.equal(authority.arm(target,command,anchor),null);assert.equal(f.remote.calls.filter(call=>call.method==='POST').length,0);
});
void test('initial large-container GET uses one native control shadow and no descriptor-copy metadata walk',async()=>{
 const remote=syntheticServer(),list=remote.flow.working.workspaces[0].stages.S;for(let i=1;i<1000;i++)list.push({...list[0],id:'row-'+i,name:'Synthetic '+i});const f=await fixture({remote});assert.equal(f.metrics.controlShadowClones,1);assert.equal(f.box.__canvasShapeChecks||0,0);assert.deepEqual([...methods(f)],['GET']);assert.equal(f.api.flow().working.workspaces[0].stages.S.length,1000);clear(f);f.edit('Still guarded');await f.local.sync(workspace,stage);assert.deepEqual([...methods(f)],['POST']);assert.equal(f.metrics.raw.length,3);assert(f.box.__canvasShapeChecks>0,'command descriptor guards remain active');assert.equal(f.local.pending(),false);
});

function selectorCommand(){const workspace={id:'w'},operation={id:'o'};return {patches:[{op:'set',path:['workspaces',workspace,'stages','S',operation,'name'],value:'new'}],guards:[{path:['workspaces',workspace,'stages','S',operation,'name'],value:'old'}]};}
void test('only producer path-selector aliases expand privately with identical wire JSON and per-occurrence verification',()=>{
 const f=jsonFixture(),input=selectorCommand();assert.equal(input.patches[0].path[1],input.guards[0].path[1]);assert.throws(()=>f.copy(input),/UNSUPPORTED/);const copy=f.copy(input,true);
 assert.equal(JSON.stringify(copy),JSON.stringify(input));assert.notEqual(copy.patches[0].path[1],copy.guards[0].path[1]);assert(f.matches(input,copy));input.guards[0].path[1].id='changed';assert.equal(input.patches[0].path[1].id,'changed');assert.equal(f.matches(input,copy),false);
});
for(const kind of ['value alias','whole path alias','selector extra field','selector outside stage path','selector reused outside path','selector getter'])void test(kind+' is not covered by selector-only exception',()=>{
 const f=jsonFixture(),input=selectorCommand();
 if(kind==='value alias'){const value={id:'value'};input.patches[0].value=value;input.guards[0].value=value;}
 if(kind==='whole path alias')input.guards[0].path=input.patches[0].path;
 if(kind==='selector extra field')input.patches[0].path[1].extra='not selector';
 if(kind==='selector outside stage path'){input.patches[0].path[2]='other';input.guards[0].path[2]='other';}
 if(kind==='selector reused outside path')input.extra=input.patches[0].path[1];
 let reads=0;if(kind==='selector getter')Object.defineProperty(input.patches[0].path[1],'id',{enumerable:true,get(){reads++;return'w';}});
 assert.throws(()=>f.copy(input,true),/UNSUPPORTED/);assert.equal(reads,0);
});
void test('fake getter on an aliased prepared selector is never executed by private arm verification',async()=>{
 const f=await fixture(),primary=f.clients[0],target=f.clients[1],actual=await primary.read(),authority=f.box.SharedDraftCanvasAuthority,anchor=authority.capture(primary,actual,actual.control),input=selectorCommand();
 const command=target.prepare('g1','apply',{...input,source:'canvas-v2:'+JSON.stringify([workspace,stage])});let gets=0;Object.defineProperty(input.patches[0].path[1],'id',{enumerable:true,get(){gets++;return'w';}});assert.equal(authority.arm(target,command,anchor),null);assert.equal(gets,0);assert.equal(f.remote.calls.filter(c=>c.method==='POST').length,0);
});
for(const phase of ['before arm','queued after capture','after ACK'])void test('actual aliased selector mutation '+phase+' cannot acquire fast ACK or alter wire semantics',async()=>{
 const f=await fixture(),prepare=f.api.prepareCanvasPost;let command;const mutate=()=>{assert.equal(command.patches[0].path[1],command.guards[0].path[1]);Object.defineProperty(command.patches[0].path[1],'extra',{value:'not JSON',enumerable:false});};
 f.api.prepareCanvasPost=(pin,target,cmd)=>{command=cmd;if(phase==='before arm')mutate();return prepare(pin,target,cmd);};
 if(phase==='queued after capture'){const send=f.clients[1].sendPrepared;f.clients[1].sendPrepared=(...args)=>{const original=send(...args);mutate();return original;};}
 if(phase==='after ACK'){const preview=f.api.previewCanvasPost;f.api.previewCanvasPost=(ticket,result)=>{mutate();return preview(ticket,result);};}
 clear(f);f.edit('Wire same');await f.local.sync(workspace,stage);assert.deepEqual([...methods(f)],['POST','GET']);assert.equal(rows(f)[0].name,'Wire same');assert.equal(f.local.pending(),false);assert.equal(Object.hasOwn(f.remote.calls[0].command.patches[0].path[1],'extra'),false);
});
void test('raw-media actual stack keeps original three raw-command checks, one wire POST and no authority serialization',async()=>{
 const remote=syntheticServer(),base='data:image/png;base64,'+'a'.repeat(256*1024),next='data:image/png;base64,'+'b'.repeat(256*1024);for(const model of [remote.flow.active.content,remote.flow.working])model.workspaces[0].stages.S[0].media=base;
 const f=await fixture({remote});clear(f);f.metrics.raw.length=0;f.local.edit(workspace,stage,[{id:'one',f:'media',value:next}]);await f.local.sync(workspace,stage);assert.deepEqual([...methods(f)],['POST']);assert.equal(f.metrics.raw.length,3);assert.equal(f.metrics.raw.filter(stack=>/canvasArm|canvasVerify|canvasObservePost|Object\.prepare\b/.test(stack)).length,0);assert.equal(rows(f)[0].media,next);assert(f.remote.calls[0].requestBytes>512*1024);assert.equal(f.local.pending(),false);
});

void test('whole path-array alias uses one original POST plus GET, not selector fast authority',async()=>{
 const f=await fixture(),prepare=f.clients[1].prepare;f.clients[1].prepare=(generation,action,details)=>{details.guards[0].path=details.patches[0].path;return prepare(generation,action,details);};clear(f);f.edit('Path-array fallback');await f.local.sync(workspace,stage);assert.deepEqual([...methods(f)],['POST','GET']);assert.equal(rows(f)[0].name,'Path-array fallback');assert.equal(f.local.pending(),false);
});
void test('undefined guard value keeps original JSON dispatch and GET fallback instead of extending private format',async()=>{
 const f=await fixture();clear(f);f.local.edit(workspace,stage,[{id:'one',f:'media',value:'data:image/png;base64,synthetic'}]);await f.local.sync(workspace,stage);assert.deepEqual([...methods(f)],['POST','GET']);assert.equal(rows(f)[0].media,'data:image/png;base64,synthetic');assert.equal(Object.hasOwn(f.remote.calls[0].command.guards[0],'value'),false);assert.equal(f.local.pending(),false);
});
