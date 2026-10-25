import {env} from 'cloudflare:workers';
import {readState,companyReader} from '@/lib/process-state';
import {privateHeaders,visibleMediaReference} from '@/lib/site-security.mjs';
import {identityKeys} from '@/lib/delivery-read-plan.mjs';
import {visibleAssetReference} from '@/lib/visible-asset-reference';
export async function GET(request:Request) {
  const id=new URL(request.url).searchParams.get('id') || '';
  if(!/^[a-f0-9]{64}$/.test(id))return new Response('Not found',{status:404,headers:privateHeaders});
  let unread:ReadableStream|null=null;
  try {
    const auth=await readState({keys:[...identityKeys]}),reader=await companyReader(request,auth);
    if(!reader)return new Response('Login required',{status:401,headers:privateHeaders});
    if(!await visibleAssetReference(auth,reader,values=>visibleMediaReference(values,id),true))return new Response('Forbidden',{status:403,headers:privateHeaders});
    const image=await env.STATE_ARCHIVE.get('delivery/media/'+id);
    unread=image?.body||null;
    if(!image)return new Response('Not found',{status:404,headers:privateHeaders});
    const fresh=await readState({keys:[...identityKeys]}),after=await companyReader(request,fresh);
    if(!after||after.actor.id!==reader.actor.id||fresh.revision!==auth.revision)return new Response('State changed',{status:409,headers:privateHeaders});
    const response=new Response(image.body,{headers:{...privateHeaders,'Content-Type':image.httpMetadata?.contentType || 'application/octet-stream','Content-Length':String(image.size)}});
    unread=null;return response;
  }catch{return new Response('Image unavailable',{status:503,headers:privateHeaders});}
  finally{try{await unread?.cancel();}catch{/* Preserve the fail-closed response even if cleanup fails. */}}
}
