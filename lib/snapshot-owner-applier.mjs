// Normal owner session only. Continue the already-sealed target; never upload,
// verify, audit, change credentials, clear locks or replay an ambiguous POST.
import {sha256} from './snapshot-contract.mjs';
const fail=(value,code)=>{if(!value)throw Error(code);};
const phases=['sealed','copying','restoring','data-ready','active'];
export async function createOwnerApplier({pins,request,signal,onProgress=async(_progress)=>{},clock=()=>Date.now()}){
 fail(typeof request==='function'&&new URL(pins.origin).origin===pins.origin&&/^https:/.test(pins.origin),'OWNER_APPLY_CONFIGURATION');
 const id=await sha256(new TextEncoder().encode(JSON.stringify([pins.projectId,pins.targetFingerprint,pins.manifestSha256])));
 let used=false,uncertain=false,last=null;
 const emit=(stage,extra={})=>onProgress({stage,...(last?{completedObjects:last.completedObjects,totalObjects:last.totalObjects,restoredRows:last.restoredRows,auditedResources:last.auditedResources}:{}),...extra});
 async function send(method,params,readback=false){
  fail(readback||!signal?.aborted,'OWNER_APPLY_STOPPED');const url=new URL('/api/snapshots/import',pins.origin);for(const[k,v]of Object.entries(params))if(v!==undefined)url.searchParams.set(k,String(v));
  const controller=new AbortController();let rejectCancel,timer;const cancelled=new Promise((_,reject)=>{rejectCancel=reject;}),abort=()=>{controller.abort();rejectCancel(Error(method==='POST'?'OWNER_APPLY_OUTCOME_UNKNOWN':'OWNER_APPLY_STOPPED'));};if(!readback)signal?.addEventListener('abort',abort,{once:true});const began=clock();
  try{return await Promise.race([cancelled,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error(method==='POST'?'OWNER_APPLY_OUTCOME_UNKNOWN':'OWNER_APPLY_READ_UNAVAILABLE'));},method==='POST'?120000:10000);}), (async()=>{
   let response;try{response=await request(url.href,{method,credentials:'same-origin',redirect:'error',cache:'no-store',headers:{Origin:pins.origin},signal:controller.signal});}catch{throw Error(method==='POST'?'OWNER_APPLY_OUTCOME_UNKNOWN':'OWNER_APPLY_READ_UNAVAILABLE');}
   fail(!response.redirected&&response.headers.get('Content-Type')?.split(';')[0]==='application/json','OWNER_APPLY_RESPONSE');
   const reader=response.body?.getReader();fail(reader,'OWNER_APPLY_RESPONSE');let size=0;const parts=[];
   try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;fail(size<=65536,'OWNER_APPLY_RESPONSE');parts.push(p.value);}}finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
   const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('OWNER_APPLY_RESPONSE');}
   if(!response.ok)throw Error(response.status===401?'LOGIN_REQUIRED':response.status===403?'IMPORT_OWNER_REQUIRED':/^IMPORT_[A-Z0-9_]+$/.test(value?.error||'')?value.error:'OWNER_APPLY_HTTP_REFUSED');
   fail(value&&typeof value==='object'&&!Array.isArray(value),'OWNER_APPLY_RESPONSE');return{value,requestMs:Math.max(0,clock()-began)};
  })()]);}finally{clearTimeout(timer);controller.abort();if(!readback)signal?.removeEventListener('abort',abort);}
 }
 function budget(value,state='open'){fail(value?.state===state&&value.inFlight===false,'OWNER_APPLY_BUDGET_NOT_READY');}
 function status(value){fail(value?.id===id&&phases.includes(value.phase)&&Number.isSafeInteger(value.version)&&value.version>=0&&['auditedResources','completedObjects','restoredRows'].every(k=>Number.isSafeInteger(value[k])&&value[k]>=0),'OWNER_APPLY_TARGET');return value;}
 async function reconcile(){
  const evidence={automaticRetryAllowed:false};
  try{evidence.budget=(await send('GET',{action:'budget-status'},true)).value;}catch{evidence.budgetAvailable=false;}
  try{evidence.activation=status((await send('GET',{id,action:'activation-status'},true)).value);}catch{evidence.activationAvailable=false;}
  await emit('stopped',evidence);return evidence;
 }
 return{id,async run({allowApply=false,allowActivation=false}={}){
  fail(!used,'OWNER_APPLY_ALREADY_USED');used=true;
  try{
   fail(allowApply===true&&allowActivation===true,'OWNER_APPLY_CONFIRMATION_REQUIRED');await emit('checking');
   const config=(await send('GET',{action:'configuration'})).value;
   fail(config.bootstrapClosed===true&&['projectId','origin','ownerId','targetFingerprint','manifestSha256'].every(k=>config.pins?.[k]===pins[k]),'OWNER_APPLY_CONFIGURATION');
   const transfer=(await send('GET',{id})).value;fail(transfer?.id===id&&transfer.phase==='integrity-verified'&&Number.isSafeInteger(transfer.chunkCount)&&transfer.chunkCount>0&&transfer.verifiedCursor===transfer.chunkCount&&transfer.received===transfer.chunkCount,'OWNER_APPLY_NOT_VERIFIED');
   last=status((await send('GET',{id,action:'activation-status'})).value);
   if(last.phase==='active'){budget(config.budget,'complete');fail(last.businessTrafficEnabled===true,'OWNER_APPLY_NOT_ACTIVE');await emit('active');return{status:'active',businessTrafficEnabled:true,reloginRequired:false,employeeCredentialsMigrated:false};}
   budget(config.budget);
   while(last.phase!=='active'){
    const action=({sealed:'copy',copying:'copy',restoring:'restore','data-ready':'activate'})[last.phase];fail(action,'OWNER_APPLY_PHASE');
    await emit(action==='copy'?'copying':action==='restore'?'restoring':'activating');uncertain=true;
    const r=await send('POST',{id,action,version:last.version}),next=r.value;
    fail(next.id===id,'OWNER_APPLY_TARGET');
    if(action==='activate'&&next.phase==='active'){
     fail(next.dataReady===true&&next.businessTrafficEnabled===true&&next.ownerLoginConfigured===true&&next.employeeCredentialsMigrated===false,'OWNER_APPLY_NOT_ACTIVE');budget(next.budget,'complete');
     last={...last,...next};uncertain=false;await emit('active',{requestMs:r.requestMs});return{status:'active',businessTrafficEnabled:true,reloginRequired:true,employeeCredentialsMigrated:false};
    }
    const allowed=action==='copy'?['copying','restoring']:action==='restore'?['restoring','data-ready']:['data-ready'];
    fail(allowed.includes(next.phase)&&Number.isSafeInteger(next.version)&&next.version>last.version,'OWNER_APPLY_PROGRESS');budget(next.budget);
    if(action==='copy'&&next.phase==='copying')fail(Number.isSafeInteger(next.completedObjects)&&Number.isSafeInteger(next.totalObjects)&&next.completedObjects>=last.completedObjects&&next.completedObjects<=next.totalObjects&&(last.totalObjects===undefined||next.totalObjects===last.totalObjects),'OWNER_APPLY_PROGRESS');
    if(action==='restore')fail(Number.isSafeInteger(next.restoredRows)&&next.restoredRows>=last.restoredRows,'OWNER_APPLY_PROGRESS');
    last={...last,...next};uncertain=false;await emit(last.phase,{requestMs:r.requestMs});
   }
  }catch(error){const code=/^(OWNER_|IMPORT_|LOGIN_)[A-Z0-9_]+$/.test(error?.message||'')?error.message:'OWNER_APPLY_FAILED';if(uncertain)await reconcile();else await emit('stopped');return{status:'stopped',code,uncertain,automaticRetryAllowed:false};}
 }};
}
