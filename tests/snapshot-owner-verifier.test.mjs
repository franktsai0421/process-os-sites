import test from 'node:test';import assert from 'node:assert/strict';
import {createOwnerVerifier} from '../lib/snapshot-owner-verifier.mjs';import {sha256} from '../lib/snapshot-contract.mjs';
const pins={projectId:'appgprj_synthetic',origin:'https://owner.example.test',ownerId:'frank',targetFingerprint:'a'.repeat(64),manifestSha256:'b'.repeat(64)};
async function fixture({lost=false,stall=false,wrong=false,blocked=false,refused=false,alterConfig=false,ready=false}={}){
 const id=await sha256(new TextEncoder().encode(JSON.stringify([pins.projectId,pins.targetFingerprint,pins.manifestSha256]))),controller=new AbortController(),log=[],progress=[];
 let cursor=ready?320:288,version=21,audits=0,budget={state:blocked?'stopped':'open',inFlight:false},running=0,maxRunning=0;
 const row=()=>({id,phase:cursor===320?'integrity-verified':'receiving',version,verifiedCursor:cursor,chunkCount:320,received:320,missing:[]});
 const request=async(url,o)=>{const u=new URL(url),action=u.searchParams.get('action')||'status';log.push({method:o.method,action,version:u.searchParams.get('version')});assert.equal(u.origin,pins.origin);assert.equal(u.pathname,'/api/snapshots/import');assert.equal(o.credentials,'same-origin');assert.equal(o.headers.Origin,pins.origin);
  if(refused)return Response.json({error:'LOGIN_REQUIRED'},{status:401});
  if(action==='configuration')return Response.json({pins:alterConfig?{...pins,ownerId:'other'}:pins,bootstrapClosed:true,budget});
  if(action==='budget-status')return Response.json(budget);if(action==='status')return Response.json(row());
  if(action==='activation-status')return Response.json({id,phase:audits===2?'sealed':audits?'auditing':'not-audited',...(audits?{version:audits,auditedResources:audits*4}:{})});
  assert.equal(o.method,'POST');assert.ok(['verify','audit'].includes(action));running++;maxRunning=Math.max(maxRunning,running);
  try{if(action==='verify'){assert.equal(Number(u.searchParams.get('version')),version);cursor+=16;version++;if(stall){queueMicrotask(()=>controller.abort());return await new Promise(()=>{});}if(lost)throw Error('synthetic connection lost');return Response.json({...row(),version:wrong?version-1:version,budget});}
   audits++;return Response.json({id,phase:audits===2?'sealed':'auditing',version:audits,auditedResources:audits*4,totalResources:8,budget});
  }finally{running--;}
 };
 const runner=await createOwnerVerifier({pins,request,signal:controller.signal,onProgress:async p=>progress.push(p)});
 return{runner,log,progress,controller,get cursor(){return cursor;},get maxRunning(){return maxRunning;}};
}
test('one click continuously verifies from288 and audits tosealed without files/keys/pauses/activation',async()=>{
 const f=await fixture(),r=await f.runner.run();assert.equal(r.status,'sealed');assert.equal(r.businessTrafficEnabled,false);assert.equal(f.maxRunning,1);
 assert.deepEqual(f.log.filter(x=>x.method==='POST').map(x=>x.action),['verify','verify','audit','audit']);assert.deepEqual(f.log.filter(x=>x.action==='verify').map(x=>x.version),['21','22']);
 assert.deepEqual(f.progress.filter(p=>p.lastSuccessAt&&p.stage==='verifying').map(p=>p.verifiedChunks),[304,320]);assert.equal(f.progress.at(-1).stage,'sealed');await assert.rejects(f.runner.run(),/ALREADY_USED/);
});
for(const options of [{refused:true},{alterConfig:true},{blocked:true}])test('login/owner pins/budget refusal has zero POST '+JSON.stringify(options),async()=>{const f=await fixture(options),r=await f.runner.run();assert.equal(r.status,'stopped');assert.equal(f.log.some(x=>x.method==='POST'),false);});
for(const options of [{lost:true},{wrong:true}])test('uncertain or contradictory POST never retries; two readonly reconciliation calls '+JSON.stringify(options),async()=>{
 const f=await fixture(options),r=await f.runner.run();assert.equal(r.status,'stopped');assert.equal(r.uncertain,true);assert.equal(r.automaticRetryAllowed,false);assert.equal(f.log.filter(x=>x.method==='POST').length,1);assert.deepEqual(f.log.slice(-2).map(x=>x.action),['budget-status','status']);assert.equal(f.cursor,304);
});
test('stop aborts even a provider ignoring cancellation; readback only and no next mutation',async()=>{
 const f=await fixture({stall:true}),start=performance.now(),r=await f.runner.run();assert.equal(r.status,'stopped');assert.ok(performance.now()-start<1000);assert.equal(f.log.filter(x=>x.method==='POST').length,1);assert.deepEqual(f.log.slice(-2).map(x=>x.action),['budget-status','status']);
});
test('reopened runner starts at server-committed progress; sealed transfer does not reverify',async()=>{
 const f=await fixture({ready:true}),r=await f.runner.run();assert.equal(r.status,'sealed');assert.equal(f.log.some(x=>x.action==='verify'),false);assert.equal(f.log.filter(x=>x.action==='audit').length,2);
});
