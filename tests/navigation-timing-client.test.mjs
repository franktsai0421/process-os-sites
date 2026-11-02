import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {navigationTimingClient} from '../lib/navigation-timing-client.mjs';
function fixture(enabled,path='/navigation-timing',retained=[]){
 const key='process-navigation-timing-v1',store=new Map(enabled?[[key,JSON.stringify({until:Date.now()+600000})]]:[]),listeners=new Map(),counts={observe:0,disconnect:0,timer:0,clear:0,fetch:0,badge:0};
 if(retained.length)store.set(key+'-rows',JSON.stringify({until:enabled?JSON.parse(store.get(key)).until:Date.now()+600000,rows:retained}));
 const original=async()=>{counts.fetch++;return Response.json({ok:true});},window={fetch:original};
 const context={window,location:{pathname:path,href:'https://fixture.invalid'+path,origin:'https://fixture.invalid'},sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},crypto:webcrypto,performance:{timeOrigin:0,now:()=>1,getEntriesByType:()=>[]},URL,Request,Response,Headers,Date,JSON,setTimeout:()=>{counts.timer++;return 1;},clearTimeout:()=>counts.clear++,addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:(k,v)=>{if(listeners.get(k)===v)listeners.delete(k);},PerformanceObserver:class{observe(){counts.observe++;}disconnect(){counts.disconnect++;}},document:{readyState:'complete',documentElement:{dataset:{},hasAttribute:()=>false},createElement:()=>({style:{},remove(){counts.badge--;}}),body:{append(){counts.badge++;}}}};
 vm.runInNewContext('('+navigationTimingClient.toString()+')()',context);
 return {window,original,counts,listeners,store,context,key};
}
await test('off normal page and off diagnostic page preserve fetch identity and install no observer/events/timers',()=>{
 for(const path of ['/process/','/navigation-timing']){const f=fixture(false,path);assert.equal(f.window.fetch,f.original);assert.equal(f.counts.observe,0);assert.equal(f.counts.timer,0);assert.equal(f.listeners.size,0);f.window.ProcessNavigationTiming?.stop();f.window.ProcessNavigationTiming?.stop();assert.equal(f.window.fetch,f.original);assert.equal(f.counts.disconnect,0);}
});
await test('active recorder never wraps twice, and repeated stop restores own hooks exactly once',()=>{
 const f=fixture(true),wrapped=f.window.fetch;assert.notEqual(wrapped,f.original);assert.equal(f.counts.observe,1);
 vm.runInNewContext('('+navigationTimingClient.toString()+')()',f.context);assert.equal(f.window.fetch,wrapped);assert.equal(f.counts.observe,1);
 f.window.ProcessNavigationTiming.stop();f.window.ProcessNavigationTiming.stop();assert.equal(f.window.fetch,f.original);assert.equal(f.counts.disconnect,1);assert.equal(f.counts.clear,1);assert.equal(f.counts.badge,0);assert.equal(f.listeners.size,0);assert.equal(f.store.has(f.key),false);
});
await test('missing authorized server sample stops recorder without changing business response',async()=>{
 const f=fixture(true),response=await f.window.fetch('/api/process-bootstrap');assert.deepEqual(await response.json(),{ok:true});assert.equal(f.counts.fetch,1);assert.equal(f.window.fetch,f.original);assert.equal(f.counts.disconnect,1);assert.equal(f.store.has(f.key),false);
});
await test('teardown cannot overwrite another later fetch owner',()=>{
 const f=fixture(true),other=async()=>Response.json({other:true});f.window.fetch=other;f.window.ProcessNavigationTiming.stop();assert.equal(f.window.fetch,other);assert.equal(f.counts.disconnect,1);
});

const retained=[{kind:'ready',route:'shell',doc:'00000000-0000-0000-0000-000000000001',at:1,start:0,end:1}];
await test('inactive Clear empties RAM and storage; pagehide and snapshots cannot resurrect old rows',()=>{
 const f=fixture(false,'/navigation-timing',retained);assert.equal(f.window.ProcessNavigationTiming.snapshot().rows.length,1);
 f.window.ProcessNavigationTiming.clear();f.listeners.get('pagehide')?.();assert.equal(f.window.ProcessNavigationTiming.snapshot().rows.length,0);assert.equal(f.store.has(f.key+'-rows'),false);assert.equal(f.listeners.size,0);assert.equal(f.window.fetch,f.original);
});
await test('armed Stop then Clear removes retained rows even from already queued callbacks and later snapshots',()=>{
 const f=fixture(true,'/navigation-timing',retained),queuedSave=f.listeners.get('pagehide');f.window.ProcessNavigationTiming.stop();assert(f.window.ProcessNavigationTiming.snapshot().rows.length>0);
 f.window.ProcessNavigationTiming.clear();queuedSave();f.window.ProcessNavigationTiming.snapshot();f.window.ProcessNavigationTiming.clear();assert.equal(f.window.ProcessNavigationTiming.snapshot().rows.length,0);assert.equal(f.store.has(f.key+'-rows'),false);assert.equal(f.store.has(f.key),false);assert.equal(f.counts.disconnect,1);assert.equal(f.window.fetch,f.original);
});
