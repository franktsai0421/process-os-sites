// One POST only. An uncertain response permits one status GET, never replay.
export async function recoverOwnerCopy({origin,request,signal}){
 const send=async(method,action,readback=false)=>{
  if(!readback&&signal?.aborted)throw Error('OWNER_COPY_RECOVERY_STOPPED');
  const c=new AbortController();let timer,rejectStop;const stopped=new Promise((_,reject)=>{rejectStop=reject;}),abort=()=>{c.abort();rejectStop(Error('OWNER_COPY_RECOVERY_UNKNOWN'));};
  if(!readback)signal?.addEventListener('abort',abort,{once:true});
  try{return await Promise.race([stopped,new Promise((_,reject)=>{timer=setTimeout(()=>{c.abort();reject(Error('OWNER_COPY_RECOVERY_UNKNOWN'));},method==='POST'?45000:10000);}), (async()=>{
   const r=await request(new URL('/api/snapshots/import?action='+action,origin).href,{method,credentials:'same-origin',redirect:'error',cache:'no-store',headers:{Origin:origin},signal:c.signal});
   if(r.redirected||!r.headers.get('Content-Type')?.startsWith('application/json'))throw Error('OWNER_COPY_RECOVERY_UNKNOWN');
   const reader=r.body?.getReader();if(!reader)throw Error('OWNER_COPY_RECOVERY_UNKNOWN');const parts=[];let length=0;
   try{for(;;){const n=await reader.read();if(n.done)break;length+=n.value.length;if(length>4096)throw Error('OWNER_COPY_RECOVERY_UNKNOWN');parts.push(n.value);}}finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
   const bytes=new Uint8Array(length);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(!r.ok)throw Error(/^IMPORT_[A-Z0-9_]+$/.test(value?.error||'')?value.error:r.status===401?'LOGIN_REQUIRED':'OWNER_COPY_RECOVERY_REFUSED');return value;
  })()]);}finally{clearTimeout(timer);c.abort();if(!readback)signal?.removeEventListener('abort',abort);}
 };
 try{const value=await send('POST','copy-recover');if(value.state!=='recovered'||value.version!==1420||value.copyCursor!==161||value.evidence?.source!=='matched'||!['absent','matched'].includes(value.evidence?.target))throw Error('OWNER_COPY_RECOVERY_UNKNOWN');return{status:'recovered'};}
 catch(e){let receipt;try{receipt=await send('GET','copy-recovery-status',true);}catch{/* unknown remains stopped */}return{status:'stopped',code:/^(IMPORT_|OWNER_|LOGIN_)[A-Z0-9_]+$/.test(e?.message||'')?e.message:'OWNER_COPY_RECOVERY_UNKNOWN',receiptState:receipt?.state,automaticRetryAllowed:false};}
}
