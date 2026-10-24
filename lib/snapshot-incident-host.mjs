// Node-only host. It is never imported by the Worker or run on import.
// Synthetic tests inject entropy and claim storage; live creation is NOT used.
import {randomBytes,randomUUID,createHash} from 'node:crypto';import fs from 'node:fs';
import {incident} from '../scripts/verify-recovery-20261023.mjs';
import {openIncidentVerificationSession} from './snapshot-incident-session.mjs';
const errors=new WeakMap(),error=code=>{const e=Error(code);errors.set(e,code);return e;},fail=(v,c)=>{if(!v)throw error(c);};
const sha=v=>createHash('sha256').update(v).digest('hex');
const exact=(v,expected)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===Object.keys(expected).sort().join()&&Object.keys(expected).every(k=>v[k]===expected[k]);
export function incidentFileClaim(file){return()=>{
 let fd;try{fd=fs.openSync(file,'wx');}catch{throw error('HOST_GENERATION_ALREADY_RESERVED');}
 const save=value=>{const b=Buffer.from(JSON.stringify(value)+'\n');fs.ftruncateSync(fd,0);fs.writeSync(fd,b,0,b.length,0);fs.fsyncSync(fd);};
 try{save({format:'PROCESS_OS_INCIDENT_HOST_ONCE_V1',state:'reserved',projectId:incident.projectId,transferId:incident.transferId});}catch{fs.closeSync(fd);throw error('HOST_MARKER_UNAVAILABLE');}
 return{generated(value){save({format:'PROCESS_OS_INCIDENT_HOST_ONCE_V1',state:'generated',...value});},close(){if(fd!==null){fs.closeSync(fd);fd=null;}}};
};}
function hiddenTerminal(input,signal,abort,setTimer,clearTimer){
 fail(input?.isTTY===true&&typeof input.setRawMode==='function','HOST_TERMINAL_REQUIRED');
 let active=null,parts=[],size=0,timer=null,fault=null,closed=false,raw=false;const prior=input.isRaw===true;
 const wipe=()=>{parts.forEach(p=>p.fill(0));parts=[];size=0;},clear=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 function stop(code){if(closed)return;fault??=code;clear();wipe();const p=active;active=null;p?.reject(error(fault));abort();}
 const onAbort=()=>stop('HOST_CANCELLED'),onEnd=()=>stop('HOST_INPUT_EOF'),onError=()=>stop('HOST_TERMINAL_IO');
 function data(chunk){const b=Buffer.from(chunk);try{if(closed)return;if(!active)return stop('HOST_INPUT_OUT_OF_ORDER');if(b.includes(3)||b.includes(4))return stop('HOST_CANCELLED');const n=b.findIndex(v=>v===10||v===13);if(n>=0&&b.subarray(n+1).some(v=>v!==10&&v!==13))return stop('HOST_MULTIPLE_FRAMES');const p=n<0?b:b.subarray(0,n);size+=p.length;if(size>8192)return stop('HOST_INPUT_LIMIT');parts.push(Buffer.from(p));if(n>=0){const value=Buffer.concat(parts,size);wipe();clear();const a=active;active=null;a.resolve(value);}}finally{b.fill(0);}}
 input.on('data',data);input.on('end',onEnd);input.on('error',onError);signal.addEventListener('abort',onAbort);
 try{input.setRawMode(true);raw=true;}catch{input.off('data',data);input.off('end',onEnd);input.off('error',onError);signal.removeEventListener('abort',onAbort);throw error('HOST_TERMINAL_IO');}
 return{healthy(){fail(!closed&&!fault,'HOST_INPUT_OUT_OF_ORDER');},read(ms){fail(!closed&&!fault&&!active,'HOST_INPUT_OUT_OF_ORDER');return new Promise((resolve,reject)=>{active={resolve,reject};timer=setTimer(()=>stop('HOST_INPUT_TIMEOUT'),ms);input.resume();});},close(){if(closed)return true;closed=true;clear();wipe();active?.reject(error('HOST_INPUT_CLOSED'));active=null;let restored=true;try{if(raw)input.setRawMode(prior);}catch{restored=false;}input.pause();input.off('data',data);input.off('end',onEnd);input.off('error',onError);signal.removeEventListener('abort',onAbort);return restored;}};
}
function parse(b){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));}catch{throw error('HOST_FRAME_INVALID');}finally{b.fill(0);}}
function safeReceipt(r){
 if(!r)return null;const out={};
 for(const k of ['stage','budgetState'])if(['registered','held','maintenance','resumed','open','stopped','complete'].includes(r[k]))out[k]=r[k];
 if(typeof r.inFlight==='boolean')out.inFlight=r.inFlight;
 const items=r.nativeRequest?[r.nativeRequest]:Array.isArray(r.receipts)?r.receipts.slice(0,3):r.nonce?[r]:[];
 out.receipts=items.filter(n=>/^[a-f0-9-]{36}$/.test(n.nonce||'')&&/^[a-f0-9]{64}$/.test(n.requestSha256||'')).map(n=>({nonce:n.nonce,requestSha256:n.requestSha256,state:['running','pending','complete','blocked','unknown'].includes(n.state)?n.state:'unknown',...(n.counts?{counts:Object.fromEntries(['planned','pending','succeeded','failed','unknown'].filter(k=>Number.isSafeInteger(n.counts[k])&&n.counts[k]>=0).map(k=>[k,n.counts[k]]))}:{})}));return out;
}
export function createIncidentMemoryHost({programCommit,mode='version18',nonce=randomUUID,input,stdout,stderr,random=randomBytes,now=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout,signal,claimGeneration,openSession=openIncidentVerificationSession,fetchAuthorized=(u,o)=>fetch(u,o),setupTimeoutMs=300000,reviewTimeoutMs=600000}={}){
 let used=false;return{async run(){
  if(used)return{status:'HOST_ALREADY_USED'};used=true;
  const controller=new AbortController(),cancel=()=>controller.abort();signal?.addEventListener('abort',cancel);
  let tty,claim,app,maintenance,raw,frame,session,expiry=null,state='generated',config,result,redactions=[],receiptAttempted=false,lastReceipt;
  const emit=v=>{const line=JSON.stringify(v);fail(!redactions.some(k=>line.includes(k)),'HOST_OUTPUT_REFUSED');stdout.write(line+'\n');};
  try{
   fail(/^[a-f0-9]{40}$/.test(programCommit||'')&&!/^0+$/.test(programCommit)&&typeof claimGeneration==='function'&&['version18','version19'].includes(mode),'HOST_CONFIGURATION');const isV19=mode==='version19',trialVersion=isV19?21:20;
   fail(Number.isSafeInteger(setupTimeoutMs)&&setupTimeoutMs>0&&setupTimeoutMs<=300000&&Number.isSafeInteger(reviewTimeoutMs)&&reviewTimeoutMs>0&&reviewTimeoutMs<=600000,'HOST_WAIT_LIMIT');fail(!signal?.aborted,'HOST_CANCELLED');
   claim=claimGeneration();tty=hiddenTerminal(input,controller.signal,cancel,setTimer,clearTimer);const issuedAt=now();fail(Number.isSafeInteger(issuedAt)&&issuedAt>=0,'HOST_CLOCK');
   function secret(){raw=random(32);fail(raw instanceof Uint8Array&&raw.byteLength===32,'HOST_ENTROPY_UNAVAILABLE');const out=Buffer.from(Buffer.from(raw).toString('base64url'));raw.fill(0);raw=null;redactions.push(out.toString('ascii'));return out;}
   maintenance=secret();app=secret();fail(!maintenance.equals(app),'HOST_ENTROPY_NOT_INDEPENDENT');const md=sha(maintenance),gd=sha(app);
   config={format:'PROCESS_OS_INCIDENT_RECOVERY_V1',programCommit,maintenance:{id:'im_'+md.slice(0,32),credentialSha256:md,issuedAt,expiresAt:issuedAt+600000,receiptExpiresAt:issuedAt+18000000},grant:{id:'ic_'+gd.slice(0,32),credentialSha256:gd,ownerEpoch:0,issuedAt,writeExpiresAt:issuedAt+14400000,receiptExpiresAt:issuedAt+18000000,requestLimit:1000,operationLimit:20000}};
   if(isV19){config.format='PROCESS_OS_V19_RECOVERY_V1';config.nonce=nonce();fail(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(config.nonce),'HOST_CONFIGURATION');}
   const configSha256=sha(JSON.stringify(config));claim.generated({programCommit,config,configSha256});emit({status:'HOST_RECOVERY_CONFIG_GENERATED',projectId:incident.projectId,programCommit,config,configSha256});
   expiry=setTimer(cancel,config.grant.writeExpiresAt-now());state='await-config';let waiting=tty.read(Math.min(setupTimeoutMs,config.maintenance.expiresAt-now()));stderr.write('Ready for nonsecret incident configuration confirmation (input hidden).\n');
   frame=parse(await waiting);tty.healthy();fail(exact(frame,{type:'configured',projectId:incident.projectId,programCommit,configSha256,envRevision:frame?.envRevision})&&Number.isSafeInteger(frame.envRevision)&&frame.envRevision>0,'HOST_CONFIG_MISMATCH');frame=null;
   fail(now()<config.maintenance.expiresAt,'HOST_MAINTENANCE_EXPIRED');state='await-bearer';waiting=tty.read(30000);stderr.write('Ready for Site bearer JSON (input hidden).\n');
   frame=parse(await waiting);tty.healthy();fail(exact(Object.fromEntries(Object.entries(frame||{}).filter(([k])=>k!=='siteEntryToken')),{type:'bearer',maintenanceId:config.maintenance.id,grantId:config.grant.id})&&typeof frame.siteEntryToken==='string'&&frame.siteEntryToken.length>0&&frame.siteEntryToken.length<=4096&&!/[\x00-\x20\x7f]/.test(frame.siteEntryToken),'HOST_BEARER_FRAME');
   redactions.push(frame.siteEntryToken);fail(now()<config.maintenance.expiresAt,'HOST_MAINTENANCE_EXPIRED');
   const guardedFetch=(url,o={})=>{
    const u=new URL(url),method=o.method||'GET',action=u.searchParams.get('action')||'status';
    fail(u.origin===incident.origin&&u.pathname==='/api/snapshots/import'&&!u.username&&!u.password&&!u.hash&&['GET','POST'].includes(method),'HOST_DESTINATION_REFUSED');
    const control=isV19?action.startsWith('v19-'):action.startsWith('incident-');
    if(method==='POST'){fail(!controller.signal.aborted&&now()<config.grant.writeExpiresAt,'HOST_WRITE_EXPIRED');fail(state==='maintenance'?(isV19?action==='v19-resume':['incident-register','incident-hold','incident-maintenance','incident-resume'].includes(action)):state==='trial'||state==='verifying'?action==='verify':state==='auditing'?action==='audit':false,'HOST_ACTION_REFUSED');if(control)fail(now()<config.maintenance.expiresAt,'HOST_MAINTENANCE_EXPIRED');}
    else fail(['maintenance','trial','verifying','auditing','receipt'].includes(state)&&now()<config.grant.receiptExpiresAt&&[...(isV19?['v19-plan','v19-status']:['incident-plan','incident-status']),'configuration','status','budget-status','request-status'].includes(action),'HOST_READ_SCOPE');
    fail(control||['configuration','budget-status'].includes(action)?!u.searchParams.has('id'):u.searchParams.get('id')===incident.transferId,'HOST_TRANSFER_PIN');
    return fetchAuthorized(url,o);
   };
   session=await openSession({config,applicationToken:app.toString('ascii'),maintenanceToken:maintenance.toString('ascii'),siteEntryToken:frame.siteEntryToken,fetchAuthorized:guardedFetch,signal:controller.signal,now});app.fill(0);app=null;maintenance.fill(0);maintenance=null;frame.siteEntryToken=null;frame=null;
   state='maintenance';await session.maintenance();tty.healthy();state='trial';const trial=await session.trial();
   fail(trial.version===trialVersion&&trial.verifiedCursor===288&&trial.receipt?.action==='verify'&&trial.receipt.state==='complete'&&trial.receipt.budgetState==='open'&&trial.receipt.inFlight===false&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(trial.receipt.nonce||'')&&/^[a-f0-9]{64}$/.test(trial.receipt.requestSha256||''),'HOST_TRIAL_RECEIPT');
   const counts=trial.receipt.counts;fail(counts&&['planned','pending','failed','unknown'].every(k=>counts[k]===0)&&Number.isSafeInteger(counts.succeeded)&&counts.succeeded>0,'HOST_TRIAL_RECEIPT');
   const checkpoint={format:'PROCESS_OS_INCIDENT_VERIFY_CHECKPOINT_V1',projectId:incident.projectId,transferId:incident.transferId,manifestSha256:incident.manifestSha256,programCommit,grantId:config.grant.id,version:trialVersion,verifiedCursor:288,receipt:safeReceipt(trial.receipt),writeExpiresAt:config.grant.writeExpiresAt,receiptExpiresAt:config.grant.receiptExpiresAt};
   const checkpointSha256=sha(JSON.stringify(checkpoint));lastReceipt=checkpoint.receipt;state='await-review';waiting=tty.read(Math.min(reviewTimeoutMs,config.grant.writeExpiresAt-now()));emit({status:'HOST_AWAITING_VERIFY_REVIEW',checkpoint,checkpointSha256});stderr.write('Ready for nonsecret reviewed verification continuation (input hidden).\n');
   frame=parse(await waiting);tty.healthy();fail(exact(frame,{type:'continue-verification',grantId:config.grant.id,checkpointSha256,transferId:incident.transferId,manifestSha256:incident.manifestSha256}),'HOST_CONTINUE_MISMATCH');frame=null;fail(!controller.signal.aborted&&now()<config.grant.writeExpiresAt,'HOST_WRITE_EXPIRED');
   state='verifying';const complete=await session.finish(async p=>{tty.healthy();if(p.stage==='auditing')state='auditing';const progress={stage:state};for(const k of ['verifiedCursor','version','auditedResources','totalResources'])if(Number.isSafeInteger(p[k])&&p[k]>=0)progress[k]=p[k];emit({status:'HOST_RECOVERY_PROGRESS',progress});});
   fail(complete.status==='VERIFY_AUDIT_SEALED'&&complete.phase==='sealed'&&complete.verifiedCursor===1401&&complete.receipt?.action==='audit'&&complete.receipt.state==='complete'&&complete.receipt.budgetState==='open'&&complete.receipt.inFlight===false&&['planned','pending','failed','unknown'].every(k=>complete.receipt.counts?.[k]===0)&&complete.receipt.counts?.succeeded>0,'HOST_AUDIT_NOT_SEALED');lastReceipt=safeReceipt(complete.receipt);result={status:'HOST_VERIFY_AUDIT_SEALED',phase:'sealed',verifiedCursor:1401,receipt:lastReceipt,dataReady:false,businessTrafficEnabled:false};
  }catch(e){
   if(session&&!receiptAttempted){receiptAttempted=true;state='receipt';try{lastReceipt=safeReceipt(await session.receipt());}catch{/* bounded receipt unavailable */}}
   result={status:'HOST_STOPPED',stage:state,code:errors.get(e)||'HOST_RUNNER_FAILED',automaticResumeAllowed:false,...(lastReceipt?{receipt:lastReceipt}:{})};try{emit(result);}catch{}
  }finally{
   controller.abort();try{session?.close();}catch{}if(expiry!==null)clearTimer(expiry);raw?.fill(0);app?.fill(0);maintenance?.fill(0);if(frame&&typeof frame==='object')frame.siteEntryToken=null;frame=null;try{claim?.close();}catch{}signal?.removeEventListener('abort',cancel);const restored=tty?.close()??true;if(!restored)result={status:'HOST_STOPPED',stage:'cleanup',code:'HOST_TERMINAL_RESTORE_FAILED',automaticResumeAllowed:false};try{emit({status:'HOST_RECOVERY_CLEANED',terminalRestored:restored,writeExpiresAt:config?.grant.writeExpiresAt??null,receiptExpiresAt:config?.grant.receiptExpiresAt??null});}catch{}
  }
  try{emit(result);}catch{}redactions=[];
  return result;
 }};
}
