// Native-only guard around an explicitly injected, reviewed authorization provider.
// No ambient fetch/cookies/credentials, retry, lock reset or secret logging.
const fail=(v,c)=>{if(!v)throw Error(c);};
const actions=new Set(['configuration','budget-status','request-status','reconcile-existing','batch','verify','audit']);
export function createNativeTransport({pins,transferId,sendAuthorized,timeoutMs=120000,reconcileTimeoutMs=10000,expectedChunks}){
 fail(typeof sendAuthorized==='function','NATIVE_AUTHORIZED_TRANSPORT_REQUIRED');
 fail(Number.isSafeInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=120000,'NATIVE_TIMEOUT_LIMIT');
 fail(Number.isSafeInteger(reconcileTimeoutMs)&&reconcileTimeoutMs>=1&&reconcileTimeoutMs<=10000,'NATIVE_TIMEOUT_LIMIT');
 fail(/^[a-f0-9]{64}$/.test(transferId||''),'NATIVE_TRANSFER_PIN');
 fail(expectedChunks===undefined||Number.isSafeInteger(expectedChunks)&&expectedChunks>0,'NATIVE_CHUNK_COUNT');
 const origin=new URL(pins.origin);fail(origin.protocol==='https:'&&origin.origin===pins.origin,'NATIVE_ORIGIN_PIN');
 let frozen=false,active=false,last=null,disposed=false,frozenReason=null,interrupt=null;
 function selected(url,options){const u=new URL(url),method=options.method||'GET',action=u.searchParams.get('action');
  fail(u.origin===pins.origin&&!u.username&&!u.password&&!u.hash&&u.pathname==='/api/snapshots/import','NATIVE_DESTINATION_REFUSED');
  fail(['GET','POST'].includes(method)&&(!action||actions.has(action)),'NATIVE_ACTION_REFUSED');
  for(const key of new Set(u.searchParams.keys()))fail(['id','action','version','cursor','nonce'].includes(key)&&u.searchParams.getAll(key).length===1,'NATIVE_QUERY_REFUSED');
  const id=u.searchParams.get('id');fail((method==='GET'&&['configuration','budget-status'].includes(action)&&id===null)||id===transferId,'NATIVE_TRANSFER_PIN');
  const headers=new Headers(options.headers);for(const name of headers.keys())fail(['origin','content-type'].includes(name),'NATIVE_AMBIENT_CREDENTIAL_REFUSED');
  fail(!headers.has('Origin')||headers.get('Origin')===pins.origin,'NATIVE_ORIGIN_PIN');
  fail(method==='GET'?!action||['configuration','budget-status','request-status'].includes(action):['reconcile-existing','batch','verify','audit'].includes(action),'NATIVE_ACTION_REFUSED');
  return{u,method,action};
 }
 async function exchange(url,options={},reconciliation=false,deadline=timeoutMs){
  fail(!disposed,'NATIVE_TRANSPORT_CLOSED');const {u,method,action}=selected(url,options),write=method!=='GET';
  fail(!active,'NATIVE_REQUEST_IN_FLIGHT');fail(!frozen||reconciliation&&!write,'NATIVE_RECONCILIATION_REQUIRED');
  if(options.signal?.aborted){frozen=true;frozenReason='NATIVE_CANCELLED';throw Error(frozenReason);}
  const priorNonce=typeof sendAuthorized.submissionMetadata==='function'?sendAuthorized.submissionMetadata()?.nonce:null;
  active=true;const controller=new AbortController();let reason=null,timer,rejectAbort;
  const interrupted=new Promise((_resolve,reject)=>{rejectAbort=reject;});
  function stop(code){if(reason)return;reason=code;controller.abort();rejectAbort(Error(code));}
  interrupt=()=>stop('NATIVE_TRANSPORT_CLOSED');
  const cancel=()=>stop('NATIVE_CANCELLED');options.signal?.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>stop('NATIVE_REQUEST_TIMEOUT'),deadline);
  if(write)last={method,action,transferId,outcome:'unknown'};
  const operation=(async()=>{
   const response=await sendAuthorized(u.href,{method,headers:options.headers,...(options.body?{body:options.body}:{}),credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal});
   fail(response&&response.redirected!==true&&!(response.status>=300&&response.status<400),'NATIVE_REDIRECT_REFUSED');
   if(!response.ok){await response.body?.cancel().catch(()=>{});return Response.json({error:[401,403].includes(response.status)?'IMPORT_TRANSPORT_AUTH_REQUIRED':[402,429].includes(response.status)?'IMPORT_TRANSPORT_PROVIDER_REFUSED':'IMPORT_TRANSPORT_HTTP_REFUSED'},{status:response.status,headers:{'Cache-Control':'no-store'}});}
   fail(response.headers?.get('Content-Type')?.split(';')[0]==='application/json','NATIVE_RESPONSE_FORMAT');
   const reader=response.body?.getReader();fail(reader,'NATIVE_RESPONSE_FORMAT');const parts=[];let size=0;
   try{for(;;){const r=await Promise.race([reader.read(),interrupted]);if(r.done)break;size+=r.value.length;fail(size<=65536,'NATIVE_RESPONSE_LIMIT');parts.push(r.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
   return new Response(bytes,{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  })();
  try{const response=await Promise.race([operation,interrupted]);
   if(!response.ok){frozen=true;frozenReason=[401,403].includes(response.status)?'NATIVE_AUTH_REQUIRED':[402,429].includes(response.status)?'NATIVE_PROVIDER_REFUSED':'NATIVE_HTTP_REFUSED';if(write)last={...last,outcome:'http-refused',status:response.status};}
   else if(write)last={...last,outcome:'http-response',status:response.status};
   return response;
  }catch(error){frozen=true;const safe=['NATIVE_CANCELLED','NATIVE_REQUEST_TIMEOUT','NATIVE_TRANSPORT_CLOSED','NATIVE_REDIRECT_REFUSED','NATIVE_RESPONSE_FORMAT','NATIVE_RESPONSE_LIMIT'];frozenReason=reason|| (safe.includes(error?.message)?error.message:write?'NATIVE_WRITE_OUTCOME_UNCERTAIN':'NATIVE_READ_UNAVAILABLE');throw Error(frozenReason);}
  finally{if(write&&last&&typeof sendAuthorized.submissionMetadata==='function'){const m=sendAuthorized.submissionMetadata();if(m&&m.nonce!==priorNonce&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(m.nonce)&&/^[a-f0-9]{64}$/.test(m.requestSha256)&&m.transferId===transferId)last={...last,nonce:m.nonce,requestSha256:m.requestSha256};}clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);active=false;interrupt=null;}
 }
 function url(params){const u=new URL('/api/snapshots/import',pins.origin);for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v));return u.href;}
 async function read(params,signal,deadline=timeoutMs){const response=await exchange(url(params),{method:'GET',signal},true,deadline);fail(response.ok,response.status===401||response.status===403?'NATIVE_AUTH_REQUIRED':'NATIVE_RECONCILIATION_UNAVAILABLE');return response.json();}
 return{request:(url,options)=>exchange(url,options),
  status:()=>({frozen,reason:frozenReason,active,last:last?{...last}:null,disposed}),
  async reconcileExisting({maximumPages,signal,onProgress=async()=>{}}){
   fail(Number.isSafeInteger(maximumPages)&&maximumPages>0&&maximumPages<=6251,'NATIVE_BASELINE_LIMIT');let checked=-1,cursor=-1;
   for(let n=0;n<maximumPages;n++){const response=await exchange(url({action:'reconcile-existing',id:transferId}),{method:'POST',headers:{Origin:pins.origin},signal});fail(response.ok,'NATIVE_BASELINE_UNCONFIRMED');const next=await response.json();fail(typeof next.verified==='boolean'&&Number.isSafeInteger(next.cursor)&&next.cursor>=0&&Number.isSafeInteger(next.checked)&&next.checked>=0&&Number.isSafeInteger(next.expected)&&next.checked<=next.expected&&next.cursor>cursor&&next.checked>=checked,'NATIVE_BASELINE_UNCONFIRMED');await onProgress({stage:'verifying-existing',confirmedExistingChunks:next.checked,totalExistingChunks:next.expected});if(next.verified){fail(next.checked===next.expected,'NATIVE_BASELINE_UNCONFIRMED');return next;}checked=next.checked;cursor=next.cursor;}
   throw Error('NATIVE_BASELINE_LIMIT');
  },
  async handshake(signal){try{const c=await read({action:'configuration'},signal);fail(c?.pins&&['projectId','origin','ownerId','targetFingerprint','manifestSha256'].every(k=>c.pins[k]===pins[k])&&(c.pins.transferId===undefined||c.pins.transferId===transferId),'NATIVE_CONFIGURATION_PIN');fail(c.bootstrapClosed===true&&c.writeAvailable!==false&&c.budget?.inFlight!==true&&!['stopped','retirement-required'].includes(c.budget?.state),'NATIVE_TARGET_NOT_READY');return c;}catch(error){frozen=true;frozenReason=/^NATIVE_[A-Z_]+$/.test(error?.message||'')?error.message:'NATIVE_HANDSHAKE_UNAVAILABLE';throw Error(frozenReason);}},
  async reconcile({cursor=0}={}){fail(Number.isSafeInteger(cursor)&&cursor>=0,'NATIVE_RECEIPT_CURSOR');
   const budget=await read({action:'budget-status'},undefined,reconcileTimeoutMs);
   fail(budget===null||budget&&['not-started','open','stopped','complete','retirement-required'].includes(budget.state)&&typeof budget.inFlight==='boolean','NATIVE_RECEIPT_FORMAT');
   if(last?.nonce){const receipt=await read({action:'request-status',id:transferId,nonce:last.nonce},undefined,reconcileTimeoutMs),counts=receipt.counts;fail(receipt.found===true&&receipt.nonce===last.nonce&&receipt.requestSha256===last.requestSha256&&counts&&['planned','pending','succeeded','failed','unknown'].every(k=>Number.isSafeInteger(counts[k])&&counts[k]>=0),'NATIVE_RECEIPT_FORMAT');return{readOnly:true,transferId,budgetState:budget?.state??null,inFlight:budget?.inFlight??null,nativeRequest:receipt,lastMutation:{...last},automaticResumeAllowed:false,exactLastBatchProven:receipt.state==='complete'&&counts.planned===0&&counts.pending===0&&counts.failed===0&&counts.unknown===0&&budget?.state==='open'&&budget.inFlight===false};}
   const transfer=await read({id:transferId,cursor},undefined,reconcileTimeoutMs);
   fail(transfer.id===transferId&&Array.isArray(transfer.missing)&&Number.isSafeInteger(transfer.received)&&transfer.received>=0&&Number.isSafeInteger(transfer.chunkCount)&&transfer.received<=transfer.chunkCount&&transfer.chunkCount>0&&Number.isSafeInteger(transfer.version)&&transfer.version>=0&&['receiving','integrity-verified'].includes(transfer.phase)&&(expectedChunks===undefined||transfer.chunkCount===expectedChunks),'NATIVE_RECEIPT_FORMAT');
   const end=Math.min(cursor+100,transfer.chunkCount),missing=transfer.missing;fail(cursor<=transfer.chunkCount&&transfer.nextCursor===(end<transfer.chunkCount?end:null)&&missing.length<=100&&new Set(missing).size===missing.length&&missing.every(id=>typeof id==='string'&&/^c(?:0|[1-9][0-9]*)$/.test(id)&&Number(id.slice(1))>=cursor&&Number(id.slice(1))<end),'NATIVE_RECEIPT_FORMAT');
   return{readOnly:true,transferId,budgetState:budget?.state??null,inFlight:budget?.inFlight??null,phase:transfer.phase,version:transfer.version,received:transfer.received,chunkCount:transfer.chunkCount,cursor,missing:missing.slice(),nextCursor:transfer.nextCursor,lastMutation:last?{...last}:null,automaticResumeAllowed:false,exactLastBatchProven:false};
  },
  close(){disposed=true;frozen=true;interrupt?.();},
 };
}
