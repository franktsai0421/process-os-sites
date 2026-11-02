import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const require=createRequire(import.meta.url),ts=require('typescript'),logs=[],cache=new Map();
function load(file){const name=path.resolve(file);if(cache.has(name))return cache.get(name).exports;const mod={exports:{}};cache.set(name,mod);vm.runInNewContext(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require(id){if(id.startsWith('node:'))return require(id);const target=path.resolve(path.dirname(name),id);return load(/\.(mjs|ts)$/.test(target)?target:target+'.ts');},console:{info:value=>logs.push(JSON.parse(value))},URL,performance,Date,crypto:webcrypto,Response,Request,Headers,ReadableStream,TextEncoder,TextDecoder,ArrayBuffer},{filename:name});return mod.exports;}
const t=load('lib/navigation-timing.ts');
const request=(path='/api/process-bootstrap',method='GET')=>new Request('https://fixture.invalid'+path+'?private=DO_NOT_LOG',{method,headers:{'X-Process-Timing':'1'}});
// Tests inspect headers for ordinary replies; only post-header stream work logs.
const run=async(handler,path,method)=>{const r=await t.navigationTiming(request(path,method),true,()=>{if(path!=='/api/platform-login')t.timingAuthority({role:'admin',sessionType:'platform'});return handler();}),header=r.headers.get('server-timing');if(header){const spans=[...header.matchAll(/s(\d+);dur=([\d.]+);desc="([a-zA-Z0-9.]+):([\d.]+):(-?\d+):(-?\d+)"/g)].map(m=>({i:Number(m[1]),name:m[3],parent:Number(m[5]),bytes:Number(m[6])})),totals=Object.fromEntries([...header.matchAll(/t\d+;dur=([\d.]+);desc="([a-zA-Z0-9.]+):(\d+)"/g)].map(m=>[m[2],{count:Number(m[3]),ms:Number(m[1])}]));logs.push({spans,totals,dropped:Number(/pt;dur=[\d.]+;desc="v1:\w+:[a-f0-9-]{36}:(\d+)"/.exec(header)[1])});}return r;};
await test('disabled and expiry gates add no binding wrappers, header or telemetry',async()=>{
 const db={};assert.equal(t.timingBinding(db,'db'),db);
 assert.equal(t.timingEnabled({PROCESS_NAVIGATION_TIMING:'1'}),false);
 assert.equal(t.timingEnabled({PROCESS_NAVIGATION_TIMING:'1',PROCESS_NAVIGATION_TIMING_UNTIL:new Date(Date.now()+10000).toISOString()}),true);
 const before=logs.length,r=await t.navigationTiming(request(),false,()=>Promise.resolve(Response.json({ok:true})));
 assert.equal(r.headers.get('server-timing'),null);assert.equal(logs.length,before);
});
await test('denials, exceptions, logout and business writes produce no diagnostics',async()=>{
 const before=logs.length;
 for(const status of [401,403,409,503])assert.equal((await run(()=>Promise.resolve(new Response(null,{status})))).headers.get('server-timing'),null);
 await assert.rejects(run(()=>Promise.reject(Error('DO_NOT_LOG'))));
 assert.equal((await run(()=>Promise.resolve(Response.json({ok:true})),'/api/platform-login','POST')).headers.get('server-timing'),null);
 assert.equal((await run(()=>Promise.resolve(Response.json({ok:true})),'/api/fqc/workflow','POST')).headers.get('server-timing'),null);
 assert.equal(logs.length,before);
});
await test('actual operation errors and response body survive; only fixed labels/numbers exported',async()=>{
 const r=await run(async()=>{
  const db=t.timingBinding({prepare(sql){assert.equal(sql,'DO_NOT_LOG');return {bind(value){assert.equal(value,'SECRET_ROW');return this;},async first(){return {account:'SECRET_ROW'};}};}},'db');
  const value=await t.timingSpan('auth',()=>db.prepare('DO_NOT_LOG').bind('SECRET_ROW').first());
  t.timingParse('{"secret":"DO_NOT_LOG"}');return t.timingJSON(value);
 });
 assert.deepEqual(await r.json(),{account:'SECRET_ROW'});assert.match(r.headers.get('server-timing'),/db.first/);
 assert.doesNotMatch(r.headers.get('server-timing')+JSON.stringify(logs),/DO_NOT_LOG|SECRET_ROW|private|fixture.invalid/);
 const row=logs.at(-1);assert.equal(row.totals['db.first'].count,1);assert.equal(row.totals.auth.count,1);assert.equal(row.spans.find(s=>s.name==='db.first').parent,0);
 await assert.rejects(run(()=>t.timingSpan('decode',()=>Promise.reject(Error('EXACT_FAILURE')))),/EXACT_FAILURE/);
});
await test('concurrent requests keep separate IDs; parallel children have the same parent',async()=>{
 const replies=await Promise.all([0,1].map(()=>run(async()=>{await t.timingSpan('decode',()=>Promise.all([t.timingSpan('r2.get',()=>Promise.resolve(null)),t.timingSpan('r2.get',()=>Promise.resolve(null))]));return t.timingJSON({ok:true});})));
 assert.notEqual(replies[0].headers.get('server-timing'),replies[1].headers.get('server-timing'));
 for(const row of logs.slice(-2)){assert.equal(row.spans[1].parent,0);assert.equal(row.spans[2].parent,0);assert.equal(row.totals['r2.get'].count,2);}
});
await test('native batch receivers and repeated bucket identity preserved',async()=>{
 const statement={bind(){return this;},async first(){return 3;}};
 await run(async()=>{
  const native={prepare(){return statement;},async batch(stmts){assert.equal(stmts[0],statement);return [3];}},db=t.timingBinding(native,'db');
  assert.equal(db,t.timingBinding(native,'db'));assert.deepEqual(await db.batch([db.prepare('not recorded').bind()]),[3]);
  const bucket=t.timingBinding({async get(){return {size:8,async text(){return 'contents';}};}},'r2');assert.equal(await (await bucket.get('not recorded')).text(),'contents');
  return t.timingJSON({ok:true});
 });
 assert.equal(logs.at(-1).spans.find(s=>s.name==='r2.get').bytes,8);
});
await test('bounded interval output preserves total operation counts',async()=>{
 const r=await run(async()=>{for(let i=0;i<100;i++)t.timingParse('{}');return t.timingJSON({ok:true});});
 assert.ok(r.headers.get('server-timing').length<12000);assert.equal(logs.at(-1).spans.length,64);assert.equal(logs.at(-1).dropped,37);assert.equal(logs.at(-1).totals.parse.count,100);
});
await test('stream bytes stay unchanged; completion logs retain post-header spans',async()=>{
 const {recordJSONResponse}=load('lib/state-records-response.ts');
 const before=logs.length,r=await run(async()=>recordJSONResponse({hello:['DO_NOT_LOG',1]}, {},{}));
 assert.match(r.headers.get('server-timing'),/pt;dur=/);
 assert.equal(await r.text(),'{"hello":["DO_NOT_LOG",1]}');
 assert.equal(logs.length,before+2);assert.equal(logs.at(-1).outcome,'complete');assert.ok(logs.at(-1).totals.serialize.count>0);
 assert.doesNotMatch(JSON.stringify(logs),/DO_NOT_LOG/);
});
await test('successful credential login explicitly enables emission without reading credentials',async()=>{
 const r=await run(async()=>{t.timingAuthority({role:'admin',sessionType:'platform'});return t.timingJSON({ok:true});},'/api/platform-login','POST');assert.match(r.headers.get('server-timing'),/v1:login:/);
});

await test('forged opt-in, missing authority and later restricted authority never publish or spend quota',async()=>{
 for(let i=0;i<40;i++){const denied=await t.navigationTiming(request(),true,async()=>new Response(null,{status:401}));assert.equal(denied.headers.get('server-timing'),null);}
 for(let i=0;i<40;i++){
  const r=await t.navigationTiming(request(),true,async()=>{t.timingAuthority({role:'staff'});return Response.json({ok:true});});assert.equal(r.headers.get('server-timing'),null);assert.deepEqual(await r.json(),{ok:true});
 }
 for(const actor of [null,{role:'admin',sessionType:'demo'},{role:'admin',authMode:'demo'}]){
  const r=await t.navigationTiming(request(),true,async()=>{t.timingAuthority({role:'admin'});t.timingAuthority(actor);t.timingAuthority({role:'admin'});return Response.json({ok:true});});assert.equal(r.headers.get('server-timing'),null);
 }
 const missing=await t.navigationTiming(request(),true,async()=>Response.json({ok:true}));assert.equal(missing.headers.get('server-timing'),null);
 const valid=await run(async()=>Response.json({ok:true}));assert.match(valid.headers.get('server-timing'),/v1:bootstrap:/);
});
await test('off, expired, invalid and too distant windows reject sampling',()=>{
 for(const [flag,expiry] of [['0',1000],['1',-1],['1',90000000],['1',NaN]])assert.equal(t.timingEnabled({PROCESS_NAVIGATION_TIMING:flag,PROCESS_NAVIGATION_TIMING_UNTIL:Number.isFinite(expiry)?new Date(Date.now()+expiry).toISOString():'invalid'}),false);
});
