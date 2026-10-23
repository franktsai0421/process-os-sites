import assert from 'node:assert/strict';
import {writeBatchBounded} from '../lib/snapshot-write-pool.mjs';
const tests=[];const test=async(name,run)=>{await run();tests.push(name);};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
await test('four writes overlap but the fifth waits for an available slot',async()=>{
 const held=Array.from({length:16},deferred),started=[],done=[];let active=0,peak=0;
 const result=writeBatchBounded(Array.from({length:16},(_,i)=>i),async i=>{started.push(i);peak=Math.max(peak,++active);await held[i].promise;active--;done.push(i);});
 assert.deepEqual(started,[0,1,2,3]);held[0].resolve();await new Promise(r=>setImmediate(r));assert.deepEqual(started,[0,1,2,3,4]);
 for(const item of held)item.resolve();await result;assert.equal(peak,4);assert.equal(done.length,16);
});
await test('one failure stops new work and drains already started writes before rejection',async()=>{
 const held=deferred(),entered=[],error=Error('SYNTHETIC_QUOTA');let settled=false;
 const result=writeBatchBounded([0,1,2,3,4,5],async i=>{entered.push(i);if(i===0)throw error;await held.promise;});
 const checked=result.then(()=>{throw Error('EXPECTED_REJECTION');},e=>{assert.equal(e,error);settled=true;});
 await new Promise(r=>setImmediate(r));assert.deepEqual(entered,[0,1,2,3]);assert.equal(settled,false);held.resolve();await checked;assert.equal(settled,true);assert.deepEqual(entered,[0,1,2,3]);
});
await test('synchronous failure is retained and no further writer is started',async()=>{const seen=[];await assert.rejects(writeBatchBounded([0,1,2],i=>{seen.push(i);throw Error('SYNTHETIC_FENCE');}),/SYNTHETIC_FENCE/);assert.deepEqual(seen,[0]);});
await test('multiple failures are drained and the first error remains authoritative',async()=>{let finished=0;await assert.rejects(writeBatchBounded([0,1,2,3,4],async i=>{await Promise.resolve();finished++;throw Error('SYNTHETIC_'+i);}),/SYNTHETIC_0/);assert.equal(finished,4);});
await test('invalid batch shapes refuse before a writer runs',async()=>{for(const input of [null,[],Array(17)])await assert.rejects(writeBatchBounded(input,()=>assert.fail()),/IMPORT_BATCH_COUNT/);});
console.log(JSON.stringify({status:'PASS_SYNTHETIC_DRAINED_BATCH_POOL',cases:tests.length,tests,network:false,realData:false}));
