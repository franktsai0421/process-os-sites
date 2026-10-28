// Explicit credentials stay only in this closure. The caller supplies the
// approved platform entry credential AND an independent application capability.
import {nativeRequestHash,credentialDigest,nativePinsText} from './snapshot-native-capability.mjs';
function hasCredentialControl(value){for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code<=32||code===127)return true;}return false;}
const fail=(v,c)=>{if(!v)throw Error(c);};
export async function createNativeCapabilityProvider({pins,capabilityId,applicationToken,siteEntryToken,fetchAuthorized,nonce=()=>crypto.randomUUID()}){
 fail(typeof fetchAuthorized==='function'&&typeof nonce==='function','NATIVE_AUTHORIZED_TRANSPORT_REQUIRED');
 nativePinsText(pins);
 fail(/^ic_[a-f0-9]{32}$/.test(capabilityId||''),'NATIVE_CAPABILITY_ID');await credentialDigest(applicationToken);
 fail(typeof siteEntryToken==='string'&&siteEntryToken.length>0&&siteEntryToken.length<=4096&&!hasCredentialControl(siteEntryToken),'NATIVE_SITE_ENTRY_CREDENTIAL_REQUIRED');
 let app=applicationToken,site=siteEntryToken,last=null,closed=false,registered=false;
 function headers(input){const h=new Headers(input);fail(!['Cookie','Authorization','OAI-Sites-Authorization','X-Process-Import-Nonce','X-Process-Import-Request-SHA256'].some(k=>h.has(k)),'NATIVE_AMBIENT_CREDENTIAL_REFUSED');h.set('Authorization','Bearer '+capabilityId+'.'+app);h.set('OAI-Sites-Authorization','Bearer '+site);h.set('Origin',pins.origin);return h;}
 const send=async(url,options={})=>{
  fail(!closed,'NATIVE_TRANSPORT_CLOSED');fail(!options.signal?.aborted,'NATIVE_CANCELLED');const method=options.method||'GET',hash=await nativeRequestHash({method,url,body:options.body,pins}),h=headers(options.headers);fail(!options.signal?.aborted,'NATIVE_CANCELLED');
  if(method==='POST'){const id=nonce();fail(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id),'NATIVE_NONCE');h.set('X-Process-Import-Nonce',id);h.set('X-Process-Import-Request-SHA256',hash);last={nonce:id,requestSha256:hash,capabilityId,transferId:pins.transferId};}
  try{return await fetchAuthorized(url,{method,headers:h,...(options.body?{body:options.body}:{}),signal:options.signal,redirect:'error',credentials:'omit',cache:'no-store'});}catch{throw Error(method==='GET'?'NATIVE_READ_UNAVAILABLE':'NATIVE_WRITE_OUTCOME_UNCERTAIN');}
 };
 send.submissionMetadata=()=>last?{...last}:null;
 return{send,submissionMetadata:send.submissionMetadata,
  async register({signal,timeoutMs=10000}={}){
   fail(!closed&&!registered,'NATIVE_REGISTRATION_ALREADY_ATTEMPTED');fail(!signal?.aborted,'NATIVE_CANCELLED');fail(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=10000,'NATIVE_TIMEOUT_LIMIT');registered=true;
   const controller=new AbortController();let rejectAbort;const interrupted=new Promise((_resolve,reject)=>{rejectAbort=reject;});
   const stop=()=>{controller.abort();rejectAbort(Error('NATIVE_REGISTRATION_UNCONFIRMED'));};signal?.addEventListener('abort',stop,{once:true});const timer=setTimeout(stop,timeoutMs);
   try{const work=(async()=>{const r=await fetchAuthorized(new URL('/api/snapshots/import?action=register',pins.origin).href,{method:'POST',headers:headers(),signal:controller.signal,redirect:'error',credentials:'omit',cache:'no-store'});fail(r.ok&&r.redirected!==true&&r.status<300&&r.headers.get('Content-Type')?.split(';')[0]==='application/json','NATIVE_REGISTRATION_UNCONFIRMED');
    const reader=r.body?.getReader();fail(reader,'NATIVE_REGISTRATION_UNCONFIRMED');let size=0;const parts=[];try{for(;;){const v=await Promise.race([reader.read(),interrupted]);if(v.done)break;size+=v.value.length;fail(size<=4096,'NATIVE_REGISTRATION_UNCONFIRMED');parts.push(v.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));fail(result.registered===true&&result.capabilityId===capabilityId&&result.scope==='staging','NATIVE_REGISTRATION_UNCONFIRMED');return{registered:true,capabilityId,scope:'staging',writeExpiresAt:result.writeExpiresAt,receiptExpiresAt:result.receiptExpiresAt};})();return await Promise.race([work,interrupted]);
   }catch{throw Error('NATIVE_REGISTRATION_UNCONFIRMED');}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);}
  },
  close(){closed=true;app=null;site=null;},
 };
}
