import {test} from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {createIncidentMemoryHost,incidentFileClaim} from '../lib/snapshot-incident-host.mjs';
import fs from 'node:fs';import path from 'node:path';
import {openIncidentVerificationSession} from '../lib/snapshot-incident-session.mjs';
import {incident} from '../scripts/verify-recovery-20261023.mjs';
import {sha256} from '../lib/snapshot-contract.mjs';
const programCommit='a'.repeat(40),gate='SYNTHETIC_GATE_ONLY',encode=v=>new TextEncoder().encode(JSON.stringify(v));
class TTY extends EventEmitter{isTTY=true;isRaw=false;visible='';setRawMode(v){this.isRaw=v;}resume(){}pause(){}feed(v){const s=JSON.stringify(v)+'\n';if(!this.isRaw)this.visible+=s;this.emit('data',Buffer.from(s));}}
function harness({mode='version18',replyConfig=true,replyBearer=true,replyReview=true,badConfig=false,expireReview=false,lostAck=false,badNonce=false,eofBearer=false,badContinue=false,reviewDelay=0,lostMaintenanceAck=false}={}){
 const initialVersion=mode==='version19'?20:19;
 const input=new TTY(),lines=[],stderr=[],log=[],statistics={entropy:0,claim:0,claimClose:0,sessionClose:0,sessionOpen:0},saved=[];let config,configSha,clock=1800000000000,stage='registered',cursor=272,version=initialVersion,audits=0,serial=0,last=null,maintenanceReceipt;
 const nonce=()=> '10000000-0000-4000-8000-'+String(++serial).padStart(12,'0');
 const response=v=>Response.json(v,{headers:{'Cache-Control':'no-store'}});
 const counts={planned:0,pending:0,succeeded:18,failed:0,unknown:0},budget={state:'open',inFlight:false};
 async function fetchAuthorized(url,o){
  const u=new URL(url),action=u.searchParams.get('action')||'status';assert.equal(u.origin,incident.origin);assert.equal(u.pathname,'/api/snapshots/import');assert.equal(o.headers instanceof Headers?o.headers.get('OAI-Sites-Authorization'):o.headers['OAI-Sites-Authorization'],'Bearer '+gate);log.push({method:o.method,action});
  if(action.startsWith('v19-')){
   assert.equal(mode,'version19');
   if(action==='v19-plan')return response({stage:'not-admitted',planSha256:'c'.repeat(64),configSha,programCommit,nonce:config.nonce});
   if(action==='v19-status')return response({stage:'resumed',inFlight:false,importInFlight:false,budgetState:'open',version:20,verifiedCursor:272,configSha,receipts:[maintenanceReceipt]});
   assert.equal(action,'v19-resume');const b=JSON.parse(o.body);assert.equal(b.nonce,config.nonce);maintenanceReceipt={nonce:b.nonce,action,requestSha256:await sha256(encode({action,nonce:b.nonce,planSha256:b.planSha256,configSha})),state:'complete'};if(lostMaintenanceAck)throw Error(gate);return response({stage:'resumed',receipt:maintenanceReceipt});
  }
  if(action.startsWith('incident-')){
   if(action==='incident-register')return response({stage:'registered'});
   if(action==='incident-plan')return response({stage,planSha256:stage==='registered'?'a'.repeat(64):'b'.repeat(64),configSha,programCommit});
   if(action==='incident-status')return response({stage:'resumed',inFlight:false,importInFlight:false,budgetState:'open',version:19,verifiedCursor:272,configSha,receipts:[]});
   const b=JSON.parse(o.body);stage=({'incident-hold':'held','incident-maintenance':'maintenance','incident-resume':'resumed'})[action];assert.ok(stage);
   return response({stage,receipt:{nonce:b.nonce,action,requestSha256:await sha256(encode({action,nonce:b.nonce,planSha256:b.planSha256,configSha})),state:'complete'}});
  }
  const h=new Headers(o.headers);
  if(action==='configuration')return response({pins:Object.fromEntries(['projectId','origin','ownerId','targetFingerprint','manifestSha256','transferId'].map(k=>[k,incident[k]])),bootstrapClosed:true,writeAvailable:true,budget,nativeScope:'incident-verify-audit-only-v1',baseline:{verified:false},continuation:{version:initialVersion,cursor:272,uploadAllowed:false}});
  if(action==='budget-status')return response(budget);
  if(action==='request-status')return response(last);
  if(action==='status'){const p=Number(u.searchParams.get('cursor')||0),end=Math.min(p+100,1401);return response({id:incident.transferId,phase:cursor===1401?'integrity-verified':'receiving',version,verifiedCursor:cursor,received:1401,chunkCount:1401,missing:[],nextCursor:end<1401?end:null});}
  assert.ok(['verify','audit'].includes(action),'no staging writes/registration/baseline calls');
  last={found:true,nonce:h.get('X-Process-Import-Nonce'),requestSha256:h.get('X-Process-Import-Request-SHA256'),action,state:'complete',counts};
  if(action==='verify'){assert.equal(Number(u.searchParams.get('version')),version);cursor=Math.min(cursor+16,1401);version++;if(lostAck&&cursor===288)throw Error(gate);const receipt=badNonce?{...last,nonce:'20000000-0000-4000-8000-000000000001'}:last;return response({id:incident.transferId,version,verifiedCursor:cursor,phase:cursor===1401?'integrity-verified':'receiving',receipt,budget});}
  assert.equal(cursor,1401);audits++;return response({id:incident.transferId,version:audits,phase:audits===2?'sealed':'auditing',auditedResources:audits*4,totalResources:8,receipt:last,budget});
 }
 const stdout={write(s){const v=JSON.parse(s);lines.push(v);if(v.status==='HOST_RECOVERY_CONFIG_GENERATED'){config=v.config;configSha=v.configSha256;}if(v.status==='HOST_AWAITING_VERIFY_REVIEW'&&replyReview){const count=log.length;setTimeout(()=>{assert.equal(log.length,count,'pause sends zero requests');if(expireReview)clock=config.grant.writeExpiresAt;input.feed({type:'continue-verification',grantId:config.grant.id,checkpointSha256:badContinue?'0'.repeat(64):v.checkpointSha256,transferId:incident.transferId,manifestSha256:incident.manifestSha256});},reviewDelay);}}};
 const err={write(s){assert.equal(input.isRaw,true,'echo disabled before ready');stderr.push(s);if(s.includes('configuration confirmation')&&replyConfig)queueMicrotask(()=>input.feed({type:'configured',projectId:incident.projectId,programCommit,configSha256:badConfig?'0'.repeat(64):configSha,envRevision:9}));if(s.includes('Site bearer')&&replyBearer)queueMicrotask(()=>eofBearer?input.emit('end'):input.feed({type:'bearer',maintenanceId:config.maintenance.id,grantId:config.grant.id,siteEntryToken:gate}));}};
 const host=createIncidentMemoryHost({programCommit,mode,nonce,input,stdout,stderr:err,now:()=>clock,random:n=>{statistics.entropy++;return Buffer.alloc(n,statistics.entropy+2);},setupTimeoutMs:replyConfig?1000:10,reviewTimeoutMs:replyReview?1000:10,claimGeneration:()=>{statistics.claim++;return{generated:v=>saved.push(v),close:()=>statistics.claimClose++};},fetchAuthorized,openSession:async options=>{statistics.sessionOpen++;const session=await openIncidentVerificationSession({...options,nonce});const close=session.close;session.close=()=>{statistics.sessionClose++;close();};return session;}});
 return{host,input,lines,stderr,log,statistics,saved,get config(){return config;},get clock(){return clock;}};
}
function clean(f){
 const visible=JSON.stringify(f.lines)+f.stderr.join('')+f.input.visible+JSON.stringify(f.saved);
 for(const token of [Buffer.alloc(32,3).toString('base64url'),Buffer.alloc(32,4).toString('base64url'),gate])assert.equal(visible.includes(token),false);
 assert.equal(f.input.isRaw,false);for(const e of ['data','end','error'])assert.equal(f.input.listenerCount(e),0);assert.equal(f.statistics.entropy,2);assert.equal(f.statistics.claim,1);assert.equal(f.statistics.claimClose,1);
}
void test('real new host/session lifecycle: one provider, fixed T0, clean first-window pause then verify/audit only; no secret output',async()=>{
 const f=harness(),result=await f.host.run();assert.equal(result.status,'HOST_VERIFY_AUDIT_SEALED');assert.equal(result.verifiedCursor,1401);assert.equal(result.dataReady,false);assert.equal(f.statistics.sessionOpen,1);assert.equal(f.statistics.sessionClose,1);assert.equal(f.log.filter(v=>v.method==='POST'&&v.action==='incident-register').length,1);assert.equal(f.log.filter(v=>v.method==='POST'&&v.action==='verify').length,71);assert.equal(f.log.filter(v=>v.action==='audit').length,2);assert.equal(f.log.some(v=>['batch','reconcile-existing','register','copy','restore','activate'].includes(v.action)),false);
 const p=f.lines.find(v=>v.status==='HOST_AWAITING_VERIFY_REVIEW');assert.equal(p.checkpoint.verifiedCursor,288);assert.equal(p.checkpoint.writeExpiresAt,f.config.grant.issuedAt+14400000);assert.equal(p.checkpoint.receiptExpiresAt,f.config.grant.issuedAt+18000000);clean(f);assert.equal((await f.host.run()).status,'HOST_ALREADY_USED');assert.equal(f.statistics.entropy,2);
});
void test('lost first-window ACK does not replay POST; only two receipt GETs and cleanup',async()=>{
 const f=harness({lostAck:true}),r=await f.host.run();assert.equal(r.status,'HOST_STOPPED');assert.equal(f.log.filter(v=>v.action==='verify').length,1);assert.equal(f.log.filter(v=>['budget-status','request-status'].includes(v.action)).length,2);assert.equal(f.lines.some(v=>v.status==='HOST_AWAITING_VERIFY_REVIEW'),false);assert.equal(f.log.some(v=>v.action==='audit'),false);clean(f);
});
void test('wrong exact nonce cannot become a clean checkpoint',async()=>{const f=harness({badNonce:true}),r=await f.host.run();assert.equal(r.status,'HOST_STOPPED');assert.equal(f.log.filter(v=>v.action==='verify').length,1);assert.equal(f.lines.some(v=>v.status==='HOST_AWAITING_VERIFY_REVIEW'),false);clean(f);});
void test('review pause times out with no more writes, preserving the same T0',async()=>{const f=harness({replyReview:false}),r=await f.host.run();assert.equal(r.status,'HOST_STOPPED');assert.equal(f.log.filter(v=>v.action==='verify').length,1);assert.equal(f.log.some(v=>v.action==='audit'),false);assert.equal(f.config.grant.issuedAt,1800000000000);clean(f);});
void test('write expiry at review denies continuation but metadata receipts remain bounded',async()=>{const f=harness({expireReview:true}),r=await f.host.run();assert.equal(r.status,'HOST_STOPPED');assert.equal(f.log.filter(v=>v.action==='verify').length,1);assert.equal(f.log.filter(v=>v.method==='POST').length,5);clean(f);});
for(const options of [{badConfig:true},{replyConfig:false}])void test('configuration mismatch/timeout has zero network and restores hidden terminal '+JSON.stringify(options),async()=>{const f=harness(options),r=await f.host.run();assert.equal(r.status,'HOST_STOPPED');assert.equal(f.log.length,0);assert.equal(f.statistics.sessionOpen,0);clean(f);});
void test('EOF at hidden bearer intake sends nothing and removes all listeners',async()=>{const f=harness({eofBearer:true}),r=await f.host.run();assert.equal(r.status,'HOST_STOPPED');assert.equal(f.log.length,0);clean(f);});
void test('wrong continuation frame cannot start a second verify window',async()=>{const f=harness({badContinue:true,reviewDelay:10}),r=await f.host.run();assert.equal(r.status,'HOST_STOPPED');assert.equal(f.log.filter(v=>v.action==='verify').length,1);assert.equal(f.log.some(v=>v.action==='audit'),false);clean(f);});
void test('persistent one-use claim prevents key regeneration after a new host object',()=>{
 const dir=fs.mkdtempSync(path.resolve('.sites-runtime/incident-host-claim-fixture-')),file=path.join(dir,'synthetic-once.json'),claim=incidentFileClaim(file),first=claim();first.generated({programCommit,config:{credentialSha256:'a'.repeat(64)}});first.close();assert.throws(()=>claim(),/HOST_GENERATION_ALREADY_RESERVED/);const value=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(value.state,'generated');assert.equal(Object.hasOwn(value,'applicationToken'),false);
});
void test('v19 same-process lifecycle uses one resume, exact version21/cursor288 checkpoint, unchanged deadline and no upload',async()=>{
 const f=harness({mode:'version19',reviewDelay:10}),r=await f.host.run();assert.equal(r.status,'HOST_VERIFY_AUDIT_SEALED');assert.equal(f.statistics.sessionOpen,1);assert.equal(f.statistics.sessionClose,1);
 assert.equal(f.log.filter(x=>x.action==='v19-resume'&&x.method==='POST').length,1);assert.equal(f.log.some(x=>x.action.startsWith('incident-')||['register','batch','reconcile-existing','copy','restore','activate'].includes(x.action)),false);
 const p=f.lines.find(x=>x.status==='HOST_AWAITING_VERIFY_REVIEW').checkpoint;assert.equal(p.version,21);assert.equal(p.verifiedCursor,288);assert.equal(p.writeExpiresAt,f.config.grant.issuedAt+14400000);assert.equal(f.log.filter(x=>x.action==='verify').length,71);clean(f);
});
for(const options of [{lostMaintenanceAck:true},{lostAck:true},{expireReview:true},{badContinue:true}])void test('v19 fail-closed host '+JSON.stringify(options),async()=>{
 const f=harness({mode:'version19',...options}),r=await f.host.run();assert.equal(r.status,'HOST_STOPPED');assert.equal(f.log.filter(x=>x.action==='v19-resume').length,1);assert.equal(f.log.filter(x=>x.action==='verify').length,options.lostMaintenanceAck?0:1);assert.equal(f.log.some(x=>x.action==='audit'),false);assert.ok(f.log.filter(x=>['request-status','budget-status'].includes(x.action)).length<=2);clean(f);
});
