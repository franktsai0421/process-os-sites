// Exercise startup overlap ownership without browser/network or shared-state edits.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync('public/process/user-access-initial-read.js','utf8');
function fixture(tab='users'){
 let epoch=0,requests=0,finish,signal;
 const events=new EventTarget(),identity={id:'frank'};
 const sync={identity,destination:{view:'data',dataTab:tab},captureDelivery:()=>({epoch}),isCurrentDelivery:owner=>owner.epoch===epoch,platformHeaders:()=>({})};
 const window={ProcessSync:sync,addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
 const context={window,AbortController,setTimeout,clearTimeout,fetch:(_url,options)=>{requests++;signal=options.signal;return new Promise(resolve=>finish=resolve);}};
 vm.runInNewContext(source,context);
 return{window,sync,requests:()=>requests,signal:()=>signal,change:()=>epoch++,invalidate:()=>{epoch++;events.dispatchEvent(new Event('process-delivery-invalidated'));},finish:()=>finish({ok:true,json:async()=>({actor:{id:'frank'},revision:1})})};
}
assert.equal(fixture('bom').requests(),0);
const live=fixture(),pending=live.window.ProcessUserAccessInitialRead.take();assert(pending);assert.equal(live.window.ProcessUserAccessInitialRead,undefined);live.finish();assert.equal((await pending).value.revision,1);assert.equal(live.requests(),1);
for(const invalidate of [f=>f.change(),f=>f.sync.identity={id:'frank'},f=>f.invalidate()]){
 const f=fixture();invalidate(f);assert.equal(f.window.ProcessUserAccessInitialRead.take(),null);assert.equal(f.signal().aborted,true);f.finish();
}
await new Promise(resolve=>setImmediate(resolve));
console.log('PASS: initial users read overlaps once; other destinations make no request; identity/generation/delivery changes discard and abort it');
