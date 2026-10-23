import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';
import {writeBatchBounded} from '../lib/snapshot-write-pool.mjs';import {sha256} from '../lib/snapshot-contract.mjs';
const items=await Promise.all(Array.from({length:16},async(_,id)=>{const bytes=new Uint8Array(65536).fill(id);return{id,bytes,sha256:await sha256(bytes)};}));
async function measure(parallel){let clock=0,active=0,peak=0,done=false;const pending=[],receipts=new Map(),start=performance.now();
 async function write(item){peak=Math.max(peak,++active);await new Promise(resolve=>pending.push({at:clock+10,resolve}));active--;receipts.set(item.id,{bytes:item.bytes.length,sha256:item.sha256});}
 const operation=(parallel?writeBatchBounded(items,write):(async()=>{for(const item of items)await write(item);})()).then(()=>done=true);
 let turns=0;while(!done){assert.ok(++turns<1000);await new Promise(r=>setImmediate(r));if(done)break;assert.ok(pending.length);clock=Math.min(...pending.map(x=>x.at));for(const entry of pending.filter(x=>x.at===clock)){pending.splice(pending.indexOf(entry),1);entry.resolve();}}
 await operation;return{mode:parallel?'four-way':'serial',modeledMilliseconds:clock,actualHarnessMilliseconds:performance.now()-start,maximumActive:peak,receipts:[...receipts].sort((a,b)=>a[0]-b[0])};
}
const serial=await measure(false),parallel=await measure(true);assert.equal(serial.modeledMilliseconds,160);assert.equal(parallel.modeledMilliseconds,40);assert.equal(serial.maximumActive,1);assert.equal(parallel.maximumActive,4);assert.deepEqual(parallel.receipts,serial.receipts);
console.log(JSON.stringify({status:'PASS_IDENTICAL_SYNTHETIC_DELAY_MODEL',cases:1,bytes:1048576,puts:16,perPutModeledMilliseconds:10,serial:{...serial,receipts:undefined},parallel:{...parallel,receipts:undefined},remotePerformanceMeasured:false,network:false,realData:false,actualHarnessTimingIsNotTransferLatency:true}));
