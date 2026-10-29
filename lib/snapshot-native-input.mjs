// Bounded pipe-only input. Never accepts a credential file, argv or environment.
function hasCredentialControl(value){for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code<=32||code===127)return true;}return false;}
const fail=(v,c)=>{if(!v)throw Error(c);};
export async function readNativeCredentials(input,{timeoutMs=30000,signal}={}){
 fail(input&&typeof input.on==='function'&&input.isTTY!==true,'NATIVE_CREDENTIAL_PIPE_REQUIRED');
 fail(!signal?.aborted,'NATIVE_CANCELLED');
 fail(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=30000,'NATIVE_TIMEOUT_LIMIT');
 const bytes=await new Promise((resolve,reject)=>{
  const parts=[];let length=0,done=false;
  const cleanup=()=>{clearTimeout(timer);input.off('data',data);input.off('end',end);input.off('error',error);signal?.removeEventListener('abort',abort);};
  const finish=(reason)=>{if(done)return;done=true;cleanup();if(reason){input.pause?.();reject(Error(reason));return;}const out=new Uint8Array(length);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}resolve(out);};
  const data=p=>{if(!(p instanceof Uint8Array))return finish('NATIVE_CREDENTIAL_INPUT');length+=p.length;if(length>8192)return finish('NATIVE_CREDENTIAL_INPUT_LIMIT');parts.push(p);};
  const end=()=>finish(),error=()=>finish('NATIVE_CREDENTIAL_INPUT'),abort=()=>finish('NATIVE_CANCELLED');
  const timer=setTimeout(()=>finish('NATIVE_CREDENTIAL_INPUT_TIMEOUT'),timeoutMs);
  input.on('data',data);input.once('end',end);input.once('error',error);signal?.addEventListener('abort',abort,{once:true});input.resume?.();
 });
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('NATIVE_CREDENTIAL_INPUT');}finally{bytes.fill(0);}
 fail(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===['applicationToken','capabilityId','siteEntryToken','transferId'].sort().join(),'NATIVE_CREDENTIAL_INPUT');
 fail(/^ic_[a-f0-9]{32}$/.test(value.capabilityId||'')&&/^[A-Za-z0-9_-]{43}$/.test(value.applicationToken||'')&&/^[a-f0-9]{64}$/.test(value.transferId||'')&&typeof value.siteEntryToken==='string'&&value.siteEntryToken.length>0&&value.siteEntryToken.length<=4096&&!hasCredentialControl(value.siteEntryToken),'NATIVE_CREDENTIAL_INPUT');
 return value;
}
