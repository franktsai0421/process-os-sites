import {env} from 'cloudflare:workers';
import {readState,companyReader} from '@/lib/process-state';
import {privateHeaders} from '@/lib/site-security.mjs';
import {identityKeys,canonicalReference} from '@/lib/delivery-read-plan.mjs';
import {visibleAssetReference} from '@/lib/visible-asset-reference';
export async function GET(request:Request) {
  const url=new URL(request.url),id=url.searchParams.get('id') || '',version=url.searchParams.get('version') || '';
  if(!/^[a-f0-9]{64}$/.test(id)||!/^[a-f0-9]{64}$/.test(version))return new Response('Not found',{status:404,headers:privateHeaders});
  let unread:ReadableStream|null=null;
  try {
    const auth=await readState({keys:[...identityKeys]}),reader=await companyReader(request,auth);
    if(!reader)return new Response('Login required',{status:401,headers:privateHeaders});
    const referenced=await visibleAssetReference(auth,reader,values=>canonicalReference(values,id,version));
    if(!referenced)return new Response('Forbidden',{status:403,headers:privateHeaders});
    const object=await env.STATE_ARCHIVE.get('canonical-images/'+id+'/'+version+'.webp');
    unread=object?.body||null;
    if(!object||object.customMetadata?.sourceSha256!==id||object.customMetadata?.webSha256!==version)return new Response('Not found',{status:404,headers:privateHeaders});
    const fresh=await readState({keys:[...identityKeys]}),after=await companyReader(request,fresh);
    if(!after||after.actor.id!==reader.actor.id||fresh.revision!==auth.revision)return new Response('State changed',{status:409,headers:privateHeaders});
    const response=new Response(object.body,{headers:{...privateHeaders,'Content-Type':'image/webp','Content-Length':String(object.size)}});
    unread=null;return response;
  }catch{return new Response('Image unavailable',{status:503,headers:privateHeaders});}
  finally{try{await unread?.cancel();}catch{/* Preserve the fail-closed response even if cleanup fails. */}}
}
