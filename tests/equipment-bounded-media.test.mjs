// Actual shipped IIFE, synthetic HTTP/clock. No real service or device.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture} from '../scripts/equipment-save-choice-fixture.mjs';
import {setup} from './tooling-approved-history-fixture.mjs';
const tick=()=>new Promise(setImmediate),hash=b=>createHash('sha256').update(b).digest('hex');
for(const phase of ['headers','body'])void test('equipment upload '+phase+' deadline retains original hash and sends no duplicate PUT',async()=>{
 const f=await fixture({hold:''});try{
  const bytes=new Uint8Array([1,2,3]),file=new Blob([bytes],{type:'image/png'}),id=hash(bytes),calls=[],timers=new Map();let counter=0,release;
  f.c.setTimeout=(fn,ms)=>{timers.set(++counter,{fn,ms});return counter;};f.c.clearTimeout=id=>timers.delete(id);
  const late=new Promise(resolve=>release=resolve);let recovered=false;
  f.c.fetch=async(url,o={})=>{calls.push([url,o.method||'GET']);if(o.method==='PUT'){if(phase==='headers')return late;return{ok:true,json:()=>late};}return recovered?new Response(bytes):new Response('',{status:404});};
  const save=f.p.uploadImage(file);for(let i=0;i<30&&!timers.size;i++)await tick();assert.equal(timers.size,1);const deadline=[...timers.values()][0];assert.equal(deadline.ms,45000);deadline.fn();await assert.rejects(save,/尚未確認/);
  await assert.rejects(f.p.uploadImage(file),/尚未確認/);assert.equal(calls.filter(c=>c[1]==='PUT').length,1,'404 never authorizes replay');
  release(phase==='headers'?Response.json({id}):{id});await tick();recovered=true;
  assert.equal(await f.p.uploadImage(new Blob([bytes],{type:'image/png'})),id);assert.equal(calls.filter(c=>c[1]==='PUT').length,1);assert(calls.slice(1).every(c=>c[0]==='/api/routine-equipment/photo?id='+id&&c[1]==='GET'));assert.equal(timers.size,0);
 }finally{f.close();}
});
void test('equipment late upload after actor change cannot complete Save',async()=>{const f=await fixture({hold:''});try{let release;const file=new Blob(['photo'],{type:'image/png'}),id=hash('photo');f.c.fetch=()=>new Promise(r=>release=r);const task=f.p.uploadImage(file);for(let i=0;i<30&&!release;i++)await tick();f.mutate('actor');release(Response.json({id}));await assert.rejects(task,/CONTEXT_CHANGED/);assert.equal(f.posts().length,0);}finally{f.close();}});
for(const path of ['/api/tooling/iqc','/api/tooling/iqc?partId=synthetic'])for(const phase of ['headers','body'])void test('Tooling bounded '+path+' '+phase+' can recover without writes',async()=>{
 const x=await setup();try{const timers=new Map();let counter=0;const calls=[];x.c.setTimeout=(fn,ms)=>{timers.set(++counter,{fn,ms});return counter;};x.c.clearTimeout=id=>timers.delete(id);x.c.fetch=async(url,o={})=>{calls.push(o.method||'GET');if(phase==='headers')return new Promise(()=>{});return{json:()=>new Promise(()=>{})};};
 const task=x.c.historyProbe.boundedToolingRead(path,{cache:'no-store'});await tick();assert.equal(timers.size,1);const timer=[...timers.values()][0];assert.equal(timer.ms,45000);timer.fn();await assert.rejects(task,/逾時/);assert.equal(timers.size,0);x.c.fetch=async()=>Response.json({parts:[]});assert.deepEqual(JSON.parse(JSON.stringify((await x.c.historyProbe.boundedToolingRead(path)).body)),{parts:[]});assert(calls.every(method=>method==='GET'));
 }finally{x.f.close();}
});
void test('Tooling late IQC detail cannot cross account ownership',async()=>{const x=await setup();try{let release;x.c.fetch=()=>new Promise(r=>release=r);const task=x.c.historyProbe.boundedToolingRead('/api/tooling/iqc?partId=synthetic');x.c.ProcessSync.identity={id:'other'};release(Response.json({snapshot:{}}));await assert.rejects(task,/DELIVERY_SUPERSEDED/);}finally{x.f.close();}});
