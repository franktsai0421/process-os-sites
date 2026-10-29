import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {ARMS,EXPECTED,WORKER,optionsFor,runArms,classify,safeFailure} from '../scripts/windows-assets-pair.mjs';
const reply=()=>Response.json(EXPECTED,{status:409});
void test('only two arms; options differ solely by assets configuration',()=>{
 assert.deepEqual(ARMS,['assets-off','assets-on']);const log={},deny=()=>{};
 const off=optionsFor(false,'runtime','empty',log,deny),on=optionsFor(true,'runtime','empty',log,deny);
 assert.deepEqual(on.assets,{directory:'empty',routerConfig:{has_user_worker:true}});delete on.assets;assert.deepEqual(on,off);
 assert.equal(off.script,WORKER);assert.equal(off.outboundService,deny);assert.equal(off.cachePersist,false);assert.equal(off.d1Databases,undefined);assert.equal(off.r2Buckets,undefined);
});
void test('actual synthetic Worker returns expected JSON409 without reading request',async()=>{
 let touches=0;const worker=vm.runInNewContext('('+WORKER.replace('export default','').replace(/;$/,'')+')',{Response});
 const request=new Proxy({},{get(){touches++;throw Error('must not read request');}});const response=await worker.fetch(request);
 assert.equal(response.status,409);assert.deepEqual(await response.json(),EXPECTED);assert.equal(touches,0);
});
void test('same exact request twice, fresh instance per arm, response consumed and disposed before next arm',async()=>{
 const events=[],calls=[];const rows=await runArms(assets=>{events.push(['create',assets]);return {ready:async()=>{events.push(['ready',assets]);},dispatch:async(input,init)=>{calls.push({input,init});events.push(['dispatch',assets]);return reply();},dispose:async()=>{events.push(['dispose',assets]);}};},()=>undefined);
 assert.equal(classify(rows),'NOT_REPRODUCED_IN_TWO_ASSETS_CONTROLS');assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(Buffer.byteLength(calls[0].init.body),2);assert.equal(calls[0].init.body,'{}');assert.deepEqual(calls[0].init.headers,{'Content-Type':'application/json',Origin:'http://assets-pair.synthetic.invalid'});
 assert.deepEqual(events,[['create',false],['ready',false],['dispatch',false],['dispose',false],['create',true],['ready',true],['dispatch',true],['dispose',true]]);assert.ok(rows.every(row=>row.requestAttempts===1&&row.phase==='complete'&&row.disposed));
});
for(const failArm of [false,true])void test(`dispatch reset is reported without retry in arm ${failArm}`,async()=>{
 let calls=0,disposed=0;const rows=await runArms(assets=>({ready:async()=>{},dispatch:async()=>{calls++;if(assets===failArm)throw new TypeError('secret',{cause:Object.assign(new Error('secret'),{code:'ECONNRESET'})});return reply();},dispose:async()=>{disposed++;}}),()=>undefined);
 assert.equal(calls,2);assert.equal(disposed,2);assert.equal(rows[Number(failArm)].phase,'dispatch');assert.deepEqual(rows[Number(failArm)].failure.codes,['ECONNRESET']);assert.equal(classify(rows),'ASSETS_PAIR_DIFFERENCE_OR_FAILURE_OBSERVED');assert.ok(!JSON.stringify(rows).includes('secret'));
});
void test('wrong status fails before response body is consumed',async()=>{
 let reads=0;const rows=await runArms(()=>({ready:async()=>{},dispatch:async()=>({status:413,arrayBuffer:async()=>{reads++;return new ArrayBuffer(0);}}),dispose:async()=>{}}),()=>undefined);
 assert.equal(reads,0);assert.ok(rows.every(row=>row.phase==='status'&&row.failure.type==='AssertionError'));assert.equal(classify(rows),'ASSETS_PAIR_DIFFERENCE_OR_FAILURE_OBSERVED');
});
void test('body reset retains response-body phase and known code',async()=>{
 const rows=await runArms(()=>({ready:async()=>{},dispatch:async()=>({status:409,arrayBuffer:async()=>{throw Object.assign(new Error('secret'),{code:'ECONNRESET'});}}),dispose:async()=>{}}),()=>undefined);
 assert.ok(rows.every(row=>row.phase==='response-body'&&row.failure.codes[0]==='ECONNRESET'&&row.disposed));assert.equal(classify(rows),'ASSETS_PAIR_DIFFERENCE_OR_FAILURE_OBSERVED');
});
void test('wrong JSON is failure without printing response contents',async()=>{
 const rows=await runArms(()=>({ready:async()=>{},dispatch:async()=>Response.json({private:'secret'},{status:409}),dispose:async()=>{}}),()=>undefined);
 assert.ok(rows.every(row=>row.phase==='response-json'&&row.outcome==='FAILED'));assert.ok(!JSON.stringify(rows).includes('secret'));
});
void test('response completion is awaited before next runtime, no sleep or additional requests',async()=>{
 let release,creates=0;const pendingBody=new Promise(resolve=>{release=resolve;});
 const pending=runArms(()=>{const first=creates++===0;return {ready:async()=>{},dispatch:async()=>({status:409,arrayBuffer:async()=>{if(first)await pendingBody;return new TextEncoder().encode(JSON.stringify(EXPECTED)).buffer;}}),dispose:async()=>{}};},()=>undefined);
 for(let i=0;i<5;i++)await Promise.resolve();assert.equal(creates,1);release();assert.equal(classify(await pending),'NOT_REPRODUCED_IN_TWO_ASSETS_CONTROLS');assert.equal(creates,2);
});
void test('permission denial stops before any alternative arm',async()=>{
 let creates=0;const rows=await runArms(()=>{creates++;return {ready:async()=>{},dispatch:async()=>{throw Object.assign(new Error('secret'),{code:'EPERM'});},dispose:async()=>{}};},()=>undefined);
 assert.equal(creates,1);assert.equal(rows.length,1);assert.equal(classify(rows),'INCOMPLETE_OR_SETUP_DISPOSAL_STOP');
});
void test('setup failure disposes and stops without any dispatch',async()=>{
 let calls=0,disposed=0,creates=0;const rows=await runArms(()=>{creates++;return {ready:async()=>{throw Error('secret');},dispatch:async()=>{calls++;return reply();},dispose:async()=>{disposed++;}};},()=>undefined);
 assert.equal(creates,1);assert.equal(calls,0);assert.equal(disposed,1);assert.equal(rows[0].phase,'runtime-ready');assert.equal(classify(rows),'INCOMPLETE_OR_SETUP_DISPOSAL_STOP');
});
void test('disposal failure is explicit and stops the second arm',async()=>{
 let creates=0;const rows=await runArms(()=>{creates++;return {ready:async()=>{},dispatch:async()=>reply(),dispose:async()=>{throw Error('secret');}};},()=>undefined);
 assert.equal(creates,1);assert.equal(rows[0].outcome,'DISPOSE_FAILED');assert.equal(classify(rows),'INCOMPLETE_OR_SETUP_DISPOSAL_STOP');
});
void test('safe failure ignores sensitive getters, unknown codes, cyclic causes',()=>{
 let touches=0;const error={get code(){touches++;throw Error('secret');},get cause(){touches++;throw Error('secret');},get message(){touches++;throw Error('secret');}};
 assert.deepEqual(safeFailure(error),{type:'Error',codes:[]});assert.equal(touches,0);const cycle={code:'secret',cause:null};cycle.cause=cycle;assert.deepEqual(safeFailure(cycle),{type:'Error',codes:[]});
});
