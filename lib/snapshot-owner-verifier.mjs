// Normal owner-session client. No credentials, local files, issuance, upload,
// restore or activation. Caller supplies same-origin authenticated HTTP.
import {sha256} from './snapshot-contract.mjs';
const fail=(v,c)=>{if(!v)throw Error(c);};
export async function createOwnerVerifier({pins,request,signal,onProgress=async(_p)=>{},clock=()=>Date.now()}){
 fail(typeof request==='function'&&new URL(pins.origin).origin===pins.origin&&`${pins.origin}`.startsWith('https:'),'OWNER_VERIFY_CONFIGURATION');
 const id=await sha256(new TextEncoder().encode(JSON.stringify([pins.projectId,pins.targetFingerprint,pins.manifestSha256])));
 let used=false,uncertain=false,last=null,lastAction=null,started=clock();
 const emit=async(stage,extra={})=>onProgress({stage,elapsedMs:Math.max(0,clock()-started),...(last?{verifiedChunks:last.verifiedCursor,totalChunks:last.chunkCount}:{}),...extra});
 async function send(method,params,readback=false){
  fail(readback||!signal?.aborted,'OWNER_VERIFY_STOPPED');const u=new URL('/api/snapshots/import',pins.origin);for(const[k,v]of Object.entries(params))if(v!==undefined)u.searchParams.set(k,String(v));
  const controller=new AbortController();let rejectCancel;const cancelled=new Promise((_,reject)=>{rejectCancel=reject;});const abort=()=>{controller.abort();rejectCancel(Error(method==='POST'?'OWNER_VERIFY_OUTCOME_UNKNOWN':'OWNER_VERIFY_STOPPED'));};if(!readback)signal?.addEventListener('abort',abort,{once:true});let timer;const began=clock();
  try{return await Promise.race([cancelled,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error(method==='POST'?'OWNER_VERIFY_OUTCOME_UNKNOWN':'OWNER_VERIFY_READ_UNAVAILABLE'));},method==='POST'?120000:10000);}), (async()=>{
   let r;try{r=await request(u.href,{method,credentials:'same-origin',redirect:'error',cache:'no-store',headers:{Origin:pins.origin},signal:controller.signal});}catch{throw Error(method==='POST'?'OWNER_VERIFY_OUTCOME_UNKNOWN':'OWNER_VERIFY_READ_UNAVAILABLE');}
   fail(!r.redirected&&r.headers.get('Content-Type')?.split(';')[0]==='application/json','OWNER_VERIFY_RESPONSE');
   const reader=r.body?.getReader();fail(reader,'OWNER_VERIFY_RESPONSE');let n=0;const chunks=[];
   try{for(;;){const p=await reader.read();if(p.done)break;n+=p.value.length;fail(n<=65536,'OWNER_VERIFY_RESPONSE');chunks.push(p.value);}}finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
   const bytes=new Uint8Array(n);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}let v;try{v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('OWNER_VERIFY_RESPONSE');}
   if(!r.ok)throw Error(r.status===401?'LOGIN_REQUIRED':r.status===403?'IMPORT_OWNER_REQUIRED':/^IMPORT_[A-Z0-9_]+$/.test(v?.error||'')?v.error:'OWNER_VERIFY_HTTP_REFUSED');
   fail(v&&typeof v==='object','OWNER_VERIFY_RESPONSE');return{value:v,requestMs:Math.max(0,clock()-began)};
  })()]);}finally{clearTimeout(timer);controller.abort();if(!readback)signal?.removeEventListener('abort',abort);}
 }
 function open(b){fail(b?.state==='open'&&b.inFlight===false,'OWNER_VERIFY_BUDGET_NOT_OPEN');}
 function status(v){fail(v?.id===id&&Number.isSafeInteger(v.version)&&v.version>=0&&Number.isSafeInteger(v.verifiedCursor)&&Number.isSafeInteger(v.chunkCount)&&v.chunkCount>0&&v.verifiedCursor>=0&&v.verifiedCursor<=v.chunkCount&&v.received===v.chunkCount&&['receiving','integrity-verified'].includes(v.phase),'OWNER_VERIFY_TARGET');return v;}
 async function reconcile(){
  const evidence={automaticRetryAllowed:false};
  try{evidence.budget=(await send('GET',{action:'budget-status'},true)).value;}catch{evidence.budgetAvailable=false;}
  try{if(lastAction==='audit'){const a=(await send('GET',{id,action:'activation-status'},true)).value;fail(a.id===id&&['not-audited','auditing','sealed'].includes(a.phase),'OWNER_AUDIT_PHASE');evidence.activation=a;}else{last=status((await send('GET',{id},true)).value);evidence.transfer=last;}}catch{evidence.transferAvailable=false;}
  await emit('stopped',evidence);return evidence;
 }
 return{id,async run(){
  fail(!used,'OWNER_VERIFY_ALREADY_USED');used=true;started=clock();
  try{
   await emit('checking');const c=(await send('GET',{action:'configuration'})).value;
   fail(c.bootstrapClosed===true&&['projectId','origin','ownerId','targetFingerprint','manifestSha256'].every(k=>c.pins?.[k]===pins[k]),'OWNER_VERIFY_CONFIGURATION');open(c.budget);
   last=status((await send('GET',{id})).value);
   while(last.phase==='receiving'){
    await emit('verifying');uncertain=true;lastAction='verify';const r=await send('POST',{id,action:'verify',version:last.version});
    const v=r.value;fail(v.id===id&&v.version===last.version+1&&v.verifiedCursor===Math.min(last.chunkCount,last.verifiedCursor+16)&&v.phase===(v.verifiedCursor===last.chunkCount?'integrity-verified':'receiving'),'OWNER_VERIFY_PROGRESS');open(v.budget);last={...last,...v};uncertain=false;await emit('verifying',{requestMs:r.requestMs,lastSuccessAt:clock()});
   }
   fail(last.verifiedCursor===last.chunkCount,'OWNER_VERIFY_INCOMPLETE');let a=(await send('GET',{id,action:'activation-status'})).value;
   fail(a.id===id&&['not-audited','auditing','sealed'].includes(a.phase),'OWNER_AUDIT_PHASE');
   while(a.phase!=='sealed'){
    await emit('auditing',{auditedResources:a.auditedResources??0,totalResources:a.totalResources??null});uncertain=true;lastAction='audit';
    const r=await send('POST',{id,action:'audit',version:a.version}),v=r.value;
    fail(v.id===id&&['auditing','sealed'].includes(v.phase)&&Number.isSafeInteger(v.version)&&(a.version===undefined||v.version>a.version),'OWNER_AUDIT_PROGRESS');open(v.budget);
    if(v.phase==='auditing')fail(Number.isSafeInteger(v.auditedResources)&&Number.isSafeInteger(v.totalResources)&&v.auditedResources>=(a.auditedResources??0)&&v.auditedResources<=v.totalResources,'OWNER_AUDIT_PROGRESS');
    a=v;uncertain=false;await emit('auditing',{auditedResources:a.auditedResources??null,totalResources:a.totalResources??null,requestMs:r.requestMs,lastSuccessAt:clock()});
   }
   await emit('sealed');return{status:'sealed',verifiedChunks:last.chunkCount,dataReady:false,businessTrafficEnabled:false};
  }catch(e){const code=/^(OWNER_|IMPORT_|LOGIN_)[A-Z0-9_]+$/.test(e?.message||'')?e.message:'OWNER_VERIFY_FAILED';if(uncertain)await reconcile();else await emit('stopped');return{status:'stopped',code,uncertain,automaticRetryAllowed:false};}
 }};
}
