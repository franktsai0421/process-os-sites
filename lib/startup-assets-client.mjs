// Normal browser session only; no tokens, endpoint override, or automatic retry.
export const startupFiles=Object.freeze([
 {name:'imported-data.js',bytes:1212989,sha256:'9e8a5be4b37dd4d30976515d80672c73251eac04db2ee95bbaede083cae3ff62'},
 {name:'line-process-data.js',bytes:141447,sha256:'fe4569e338372d64b9360eac2be18838c92d05961e6bab3101b85ca45df9d3d7'},
 {name:'line-c-master.js',bytes:32097,sha256:'f494aeb5769d3fbaaa263bede61dc6972d65def4b4cf404b5dba5938421b695d'},
]);
const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('');
export async function completeStartupAssets({files,origin,request=fetch,signal,progress=(_event)=>{},spec=startupFiles,timeoutMs=45000}){
 const endpoint=new URL('/api/setup/startup-assets',origin).href,inputs=new Map(Array.from(files).map(f=>[f.name,f]));
 if(Array.from(files).length!==spec.length||inputs.size!==spec.length||spec.some(s=>inputs.get(s.name)?.size!==s.bytes))throw Error('STARTUP_SOURCE_MISMATCH');
 for(const f of spec){progress({stage:'checking',name:f.name});if(await digest(await inputs.get(f.name).arrayBuffer())!==f.sha256)throw Error('STARTUP_SOURCE_MISMATCH');}
 let mutationAttempted=false;
 async function send(method,suffix='',body,readback=false){const c=new AbortController();let timer,reader,rejectStop;const stopped=new Promise((_,reject)=>{rejectStop=reject;}),abort=()=>{c.abort();rejectStop(Error('STARTUP_RESPONSE_UNKNOWN'));};if(!readback)signal?.addEventListener('abort',abort,{once:true});
  try{if(!readback&&signal?.aborted)throw Error('STARTUP_STOPPED');timer=setTimeout(abort,method==='GET'?10000:timeoutMs);return await Promise.race([stopped,(async()=>{const r=await request(endpoint+suffix,{method,body,credentials:'same-origin',redirect:'error',cache:'no-store',headers:{...(method!=='GET'?{Origin:origin}:{}),...(body?{'Content-Type':'application/octet-stream'}:{})},signal:c.signal});
   if(r.redirected||!r.headers.get('Content-Type')?.startsWith('application/json'))throw Error('STARTUP_RESPONSE_UNKNOWN');reader=r.body?.getReader();if(!reader)throw Error('STARTUP_RESPONSE_UNKNOWN');const parts=[];let size=0;for(;;){const n=await reader.read();if(n.done)break;size+=n.value.length;if(size>8192)throw Error('STARTUP_RESPONSE_UNKNOWN');parts.push(n.value);}const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!r.ok)throw Error(/^STARTUP_[A-Z_]+$/.test(data.error||'')?data.error:'STARTUP_REQUEST_REFUSED');return data;})()]);
  }finally{clearTimeout(timer);c.abort();if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}if(!readback)signal?.removeEventListener('abort',abort);}}
 try{
  const status=await send('GET');if(status.state==='complete')return status;if(status.state!=='ready')throw Error('STARTUP_RECEIPT_HOLD');
  for(const f of spec){const receipt=status.files.find(r=>r.name===f.name);if(receipt?.state==='complete')continue;if(receipt?.state!=='not-started')throw Error('STARTUP_RECEIPT_HOLD');if(signal?.aborted)throw Error('STARTUP_STOPPED');progress({stage:'uploading',name:f.name});mutationAttempted=true;const ack=await send('PUT','?file='+encodeURIComponent(f.name),inputs.get(f.name));if(ack.state!=='complete'||ack.sha256!==f.sha256||ack.bytes!==f.bytes)throw Error('STARTUP_RESPONSE_UNKNOWN');progress({stage:'confirmed',name:f.name,bytes:f.bytes});}
  if(signal?.aborted)throw Error('STARTUP_STOPPED');progress({stage:'publishing'});mutationAttempted=true;const done=await send('POST','?action=publish');if(done.state!=='complete'||done.originalEntriesPreserved!==304&&spec===startupFiles)throw Error('STARTUP_RESPONSE_UNKNOWN');progress({stage:'complete'});return done;
 }catch(e){let receipt;if(mutationAttempted){try{receipt=await send('GET','',undefined,true);}catch{/* retain unknown and never replay */}}return{state:'stopped',code:/^STARTUP_[A-Z_]+$/.test(e?.message||'')?e.message:'STARTUP_RESPONSE_UNKNOWN',receipt,automaticRetryAllowed:false};}
}
