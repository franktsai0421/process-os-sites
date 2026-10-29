import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {CASES,WORKER,runCases,classify,safeFailure} from '../scripts/windows-miniflare-four.mjs';
void test('four fixed cases only; actual synthetic Worker reads exactly the read control',async()=>{
 assert.deepEqual(CASES.map(x=>[x.read,x.bytes]),[[false,1],[true,1],[false,9000],[true,9000]]);
 const worker=vm.runInNewContext('('+WORKER.replace('export default','').replace(/;$/,'')+')',{URL,Response});
 for(const read of [false,true]){let reads=0;const r=await worker.fetch({url:'http://synthetic.invalid/'+(read?'read':'unread'),arrayBuffer(){reads++;return Promise.resolve(new ArrayBuffer(1));}});assert.equal(r.status,413);assert.equal((await r.arrayBuffer()).byteLength,0);assert.equal(reads,Number(read));}
});
void test('same public SDK call shape, body, order and one attempt per control; response always consumed',async()=>{
 const calls=[],consumed=[];const rows=await runCases(async(input,init)=>{calls.push({input,init});return {status:413,arrayBuffer:async()=>{consumed.push(calls.length);return new ArrayBuffer(0);}};},()=>undefined);
 assert.equal(calls.length,4);assert.deepEqual(consumed,[1,2,3,4]);assert.equal(classify(rows),'NOT_REPRODUCED_IN_FOUR_SDK_REQUESTS');
 for(const [i,{input,init}]of calls.entries()){assert.equal(input,'http://miniflare-transport.synthetic.invalid/'+(CASES[i].read?'read':'unread'));assert.equal(init.method,'POST');assert.deepEqual(init.headers,{'Content-Type':'application/x-process-chunk-batch'});assert.deepEqual(init.body,new Uint8Array(CASES[i].bytes));assert.equal(rows[i].attempts,1);assert.equal(rows[i].phase,'complete');}
});
for(const failing of [0,1,2,3])void test(`dispatch failure slot${failing} retains reset and never retries`,async()=>{
 let calls=0;const rows=await runCases(async()=>{const slot=calls++;if(slot===failing)throw new TypeError('not logged',{cause:Object.assign(new Error('not logged'),{code:'ECONNRESET'})});return new Response(null,{status:413});},()=>undefined);
 assert.equal(calls,4);assert.equal(rows[failing].phase,'dispatch');assert.deepEqual(rows[failing].failure.codes,['ECONNRESET']);assert.equal(classify(rows),'SDK_TRANSPORT_OR_RESPONSE_DIFFERENCE_OBSERVED');assert.ok(!JSON.stringify(rows).includes('not logged'));
});
void test('body read failure is observable, not a successful status-only response',async()=>{
 let calls=0;const rows=await runCases(async()=>{calls++;return {status:413,arrayBuffer:async()=>{throw Object.assign(new Error('private'),{code:'ECONNRESET'});}};},()=>undefined);
 assert.equal(calls,4);assert.ok(rows.every(row=>row.phase==='response-body'&&row.status===413&&row.outcome==='FAILED'));assert.equal(classify(rows),'SDK_TRANSPORT_OR_RESPONSE_DIFFERENCE_OBSERVED');
});
void test('status mismatch fails at original status assertion before body read',async()=>{
 let reads=0;const rows=await runCases(async()=>({status:403,arrayBuffer:async()=>{reads++;return new ArrayBuffer(0);}}),()=>undefined);assert.equal(reads,0);assert.ok(rows.every(row=>row.status===403&&row.phase==='status'&&row.failure.type==='AssertionError'));assert.equal(classify(rows),'SDK_TRANSPORT_OR_RESPONSE_DIFFERENCE_OBSERVED');
});
void test('unexpected response payload fails without logging bytes',async()=>{
 const rows=await runCases(async()=>new Response('private synthetic',{status:413}),()=>undefined);assert.ok(rows.every(row=>row.phase==='response-body'&&row.outcome==='FAILED'));assert.ok(!JSON.stringify(rows).includes('private'));assert.equal(classify(rows),'SDK_TRANSPORT_OR_RESPONSE_DIFFERENCE_OBSERVED');
});
void test('body completion precedes next dispatch, without arbitrary sleep',async()=>{
 let release,calls=0;const blocked=new Promise(resolve=>{release=resolve;});
 const pending=runCases(async()=>{const slot=calls++;return {status:413,arrayBuffer:async()=>{if(slot===0)await blocked;return new ArrayBuffer(0);}};},()=>undefined);
 await Promise.resolve();await Promise.resolve();assert.equal(calls,1);release();const rows=await pending;assert.equal(calls,4);assert.equal(classify(rows),'NOT_REPRODUCED_IN_FOUR_SDK_REQUESTS');
});
void test('permission denial stops all later controls, no alternative path',async()=>{
 let calls=0;const rows=await runCases(async()=>{calls++;throw Object.assign(new Error('sensitive'),{code:'EPERM'});},()=>undefined);assert.equal(calls,1);assert.equal(rows.length,1);assert.equal(classify(rows),'INCOMPLETE_OR_PERMISSION_STOP');
});
void test('getter, unknown code and cyclic cause cannot leak or loop',()=>{
 let touches=0;const poison={get code(){touches++;throw Error('private');},get cause(){touches++;throw Error('private');},get message(){touches++;throw Error('private');}};assert.deepEqual(safeFailure(poison),{type:'Error',codes:[]});assert.equal(touches,0);
 const cycle={code:'PRIVATE',cause:null};cycle.cause=cycle;assert.deepEqual(safeFailure(cycle),{type:'Error',codes:[]});
});
