// Same-process, fixed-target maintenance then verify/audit. Never registers a
// staging grant, reads local payloads, PUTs chunks or materializes business data.
import {incident} from '../scripts/verify-recovery-20261023.mjs';
import {createNativeCapabilityProvider} from './snapshot-native-provider.mjs';
import {createNativeTransport} from './snapshot-native-transport.mjs';
import {consumeImportBody} from './snapshot-body.mjs';
import {sha256} from './snapshot-contract.mjs';
const fail=(v,c)=>{if(!v)throw Error(c);};
export async function openIncidentVerificationSession({config,applicationToken,maintenanceToken,siteEntryToken,fetchAuthorized,signal,now=()=>Date.now(),nonce=()=>crypto.randomUUID()}){
 const pins=Object.fromEntries(['projectId','origin','ownerId','targetFingerprint','manifestSha256','transferId'].map(k=>[k,incident[k]]));
 const configSha=await sha256(new TextEncoder().encode(JSON.stringify(config)));
 let maintenance=maintenanceToken,gate=siteEntryToken,closed=false,maintenanceDone=false,started=false,reconciled=false,lastReceipt=null,cursor=272,version=19;
 const provider=await createNativeCapabilityProvider({pins,capabilityId:config.grant.id,applicationToken,siteEntryToken,fetchAuthorized,nonce});
 applicationToken=null;maintenanceToken=null;siteEntryToken=null;
 const transport=createNativeTransport({pins,transferId:incident.transferId,sendAuthorized:provider.send,expectedChunks:1401});
 async function control(action,{method='GET',body,readback=false}={}){
  fail(!closed&&maintenance&&gate&&action.startsWith('incident-'),'VERIFY_CONTROL_SCOPE');
  fail(now()>=config.maintenance.issuedAt&&now()<(method==='POST'?config.maintenance.expiresAt:config.maintenance.receiptExpiresAt),'VERIFY_CONTROL_EXPIRED');
  const controller=new AbortController(),cancel=()=>controller.abort();if(!readback)signal?.addEventListener('abort',cancel,{once:true});
  if(!readback&&signal?.aborted)controller.abort();const timeout=readback?10000:60000;let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('VERIFY_CONTROL_TIMEOUT'));},timeout);});
  try{return await Promise.race([deadline,(async()=>{
   const r=await fetchAuthorized(incident.origin+'/api/snapshots/import?action='+action,{method,headers:{Origin:incident.origin,Authorization:'Bearer '+config.maintenance.id+'.'+maintenance,'OAI-Sites-Authorization':'Bearer '+gate,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal,redirect:'error',credentials:'omit',cache:'no-store'});
   fail(r.ok&&!r.redirected&&r.headers.get('Content-Type')?.split(';')[0]==='application/json','VERIFY_CONTROL_UNCONFIRMED');
   const bytes=await consumeImportBody(r.body,65536,{signal:controller.signal,timeoutMs:Math.min(timeout,10000)});return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.bytes));
  })()]);}finally{clearTimeout(timer);if(!readback)signal?.removeEventListener('abort',cancel);controller.abort();}
 }
 async function step(action,planSha256){
  const id=nonce(),hash=await sha256(new TextEncoder().encode(JSON.stringify({action,nonce:id,planSha256,configSha})));
  const v=await control(action,{method:'POST',body:{nonce:id,planSha256}});
  fail(v.receipt?.nonce===id&&v.receipt.requestSha256===hash&&v.receipt.action===action&&v.receipt.state==='complete'&&!v.replayed,'VERIFY_CONTROL_RECEIPT');return v;
 }
 function proven(value,action){
  const m=provider.submissionMetadata(),r=value.receipt,c=r?.counts;
  fail(m&&r?.found===true&&r.nonce===m.nonce&&r.requestSha256===m.requestSha256&&r.action===action&&r.state==='complete','VERIFY_NONCE_RECEIPT');
  fail(c&&['planned','pending','failed','unknown'].every(k=>c[k]===0)&&Number.isSafeInteger(c.succeeded)&&c.succeeded>0&&value.budget?.state==='open'&&value.budget.inFlight===false,'VERIFY_OPERATION_RECEIPT');
  lastReceipt={nonce:r.nonce,requestSha256:r.requestSha256,action,state:r.state,counts:Object.fromEntries(['planned','pending','succeeded','failed','unknown'].map(k=>[k,c[k]])),budgetState:'open',inFlight:false};
  return lastReceipt;
 }
 async function post(action,expected){
  fail(!signal?.aborted&&now()<config.grant.writeExpiresAt,'VERIFY_WRITE_EXPIRED');
  const u=new URL('/api/snapshots/import',incident.origin);u.searchParams.set('id',incident.transferId);u.searchParams.set('action',action);if(expected!==undefined)u.searchParams.set('version',String(expected));
  started=true;const r=await transport.request(u.href,{method:'POST',headers:{Origin:incident.origin},signal});fail(r.ok,'VERIFY_REQUEST_UNCONFIRMED');const v=await r.json();proven(v,action);return v;
 }
 async function verifyWindow(){const v=await post('verify',version),next=Math.min(1401,cursor+16);fail(v.id===incident.transferId&&v.version===version+1&&v.verifiedCursor===next&&v.phase===(next===1401?'integrity-verified':'receiving'),'VERIFY_WINDOW');cursor=next;version=v.version;return v;}
 return{
  async maintenance(){
   const r=await control('incident-register',{method:'POST'});fail(r.stage==='registered'&&!r.alreadyRegistered,'VERIFY_CONTROL_ALREADY_USED');
   let p=await control('incident-plan');fail(p.stage==='registered'&&p.configSha===configSha&&p.programCommit===config.programCommit,'VERIFY_CONTROL_PIN');await step('incident-hold',p.planSha256);
   p=await control('incident-plan');fail(p.stage==='held'&&p.configSha===configSha&&p.programCommit===config.programCommit,'VERIFY_CONTROL_PIN');await step('incident-maintenance',p.planSha256);await step('incident-resume',p.planSha256);
   const s=await control('incident-status');fail(s.stage==='resumed'&&s.inFlight===false&&s.budgetState==='open'&&s.importInFlight===false&&s.version===19&&s.verifiedCursor===272&&s.configSha===configSha,'VERIFY_CONTROL_RECEIPT');maintenanceDone=true;maintenance=null;gate=null;
  },
  async trial(){
   fail(maintenanceDone&&!started,'VERIFY_TRIAL_SCOPE');const c=await transport.handshake(signal);fail(c.nativeScope==='incident-verify-audit-only-v1'&&c.baseline?.verified===false&&c.continuation?.version===19&&c.continuation.cursor===272&&c.continuation.uploadAllowed===false,'VERIFY_SCOPE');
   for(let page=0;page<15;page++){const r=await transport.request(incident.origin+'/api/snapshots/import?id='+incident.transferId+'&cursor='+(page*100),{method:'GET',signal});fail(r.ok,'VERIFY_STATUS');const s=await r.json();fail(s.id===incident.transferId&&s.received===1401&&s.chunkCount===1401&&s.version===19&&s.verifiedCursor===272&&Array.isArray(s.missing)&&s.missing.length===0&&s.nextCursor===(page===14?null:(page+1)*100),'VERIFY_STATUS');}
   await verifyWindow();return{version,verifiedCursor:cursor,receipt:lastReceipt};
  },
  async finish(onProgress=async()=>{}){
   fail(cursor===288&&version===20&&lastReceipt?.action==='verify','VERIFY_CONTINUE_SCOPE');
   while(cursor<1401){await verifyWindow();await onProgress({stage:'verifying',verifiedCursor:cursor,version});}
   let auditVersion,previous=-1;await onProgress({stage:'auditing'});
   for(let i=0;i<1000;i++){const v=await post('audit',auditVersion);fail(v.id===incident.transferId&&Number.isSafeInteger(v.version)&&(auditVersion===undefined||v.version>auditVersion),'VERIFY_AUDIT');auditVersion=v.version;
    if(v.phase==='sealed')return{status:'VERIFY_AUDIT_SEALED',phase:'sealed',verifiedCursor:cursor,receipt:lastReceipt};
    fail(v.phase==='auditing'&&Number.isSafeInteger(v.auditedResources)&&v.auditedResources>=previous&&v.auditedResources<=v.totalResources,'VERIFY_AUDIT');previous=v.auditedResources;await onProgress({stage:'auditing',auditedResources:v.auditedResources,totalResources:v.totalResources});
   }throw Error('VERIFY_AUDIT_LIMIT');
  },
  async receipt(){
   if(reconciled)return lastReceipt;reconciled=true;
   if(started){const r=await transport.reconcile();return{budgetState:r.budgetState,inFlight:r.inFlight,nativeRequest:r.nativeRequest?{nonce:r.nativeRequest.nonce,requestSha256:r.nativeRequest.requestSha256,state:r.nativeRequest.state,counts:r.nativeRequest.counts}:null};}
   if(maintenance&&gate){for(let i=0;i<2;i++)try{const r=await control('incident-status',{readback:true});return{stage:r.stage,inFlight:r.inFlight,receipts:r.receipts};}catch{if(i===1)throw Error('VERIFY_RECEIPT_UNAVAILABLE');}}
   return lastReceipt;
  },
  close(){if(closed)return;closed=true;provider.close();transport.close();maintenance=null;gate=null;},
 };
}
