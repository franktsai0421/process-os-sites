import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),load=require('../scripts/ipqc-ab-import-harness.cjs')(),{recordJSONResponse}=load('lib/state-records-response.ts');
const ref=raw=>{const sha256=createHash('sha256').update(raw).digest('hex');return{__immutableBody:{key:'state-records/v1/'+sha256+'.json',sha256}};};
void test('bounded AB response matches complete JSON including repeated live bodies, unicode and historical refs',async()=>{
 const raw=JSON.stringify({items:[{id:'history',standard:'歷史 🧰',equipmentId:'tool'}],errors:[]}),body={items:Array.from({length:3000},(_,i)=>({id:String(i),standard:'x'.repeat(400)+'🧰漢字'})),errors:[]};
 const payload={control:{versions:[{snapshot:body},{snapshot:ref(raw)}],workflow:{active:{content:body},working:body,saved:{content:body}}},permissions:{view:true},omitted:undefined};
 const bucket={get:async()=>({text:async()=>raw})},response=recordJSONResponse(payload,bucket,{'Cache-Control':'no-store'},{boundedContainers:true}),reader=response.body.getReader(),parts=[];let max=0;
 for(;;){const next=await reader.read();if(next.done)break;max=Math.max(max,next.value.length);parts.push(Buffer.from(next.value));}
 assert(max<=64*1024);assert(parts.length>50);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Content-Type'),'application/json');
 const actual=JSON.parse(Buffer.concat(parts).toString()),expected=JSON.parse(JSON.stringify(payload));expected.control.versions[1].snapshot=JSON.parse(raw);assert.deepEqual(actual,expected);
});
for(const mode of ['missing','corrupt'])void test(`AB stream propagates ${mode} immutable history and never returns truncated JSON as success`,async()=>{
 const raw='{"items":[],"errors":[]}',bucket={get:async()=>mode==='missing'?null:{text:async()=>'{"changed":true}'}};
 const response=recordJSONResponse({history:ref(raw)},bucket,{}, {boundedContainers:true});await assert.rejects(response.json(),mode==='missing'?/missing/:/corrupt/);
});
void test('cancelled AB stream never advances into remaining immutable history',async()=>{
 let gets=0;const raw='{"items":[],"errors":[]}',bucket={get:async()=>{gets++;return{text:async()=>raw};}},payload={live:Array.from({length:1000},()=>({text:'x'.repeat(1000)})),history:[ref(raw),ref(raw)]};
 const reader=recordJSONResponse(payload,bucket,{}, {boundedContainers:true}).body.getReader();await reader.read();await reader.cancel();await new Promise(setImmediate);assert.equal(gets,0);
});

void test('separate-process capacity regression preserves bytes and bounds UTF-8 backing storage',()=>{
 const probe=mode=>JSON.parse(execFileSync(process.execPath,['--expose-gc','tests/ipqc-ab-capacity-probe.cjs',mode],{encoding:'utf8'}));
 const before=probe('baseline'),after=probe('current');assert.equal(after.bytes,before.bytes);assert.equal(after.sha256,before.sha256);assert(after.arrayBufferDelta<before.arrayBufferDelta/4,JSON.stringify({before,after}));assert(after.maxChunk<=64*1024);
});
