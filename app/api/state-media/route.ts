import {env} from 'cloudflare:workers';
import {readState,companyReader,companyState} from '@/lib/process-state';
import {privateHeaders,visibleMediaReference} from '@/lib/site-security.mjs';
export async function GET(request:Request) {
  const id=new URL(request.url).searchParams.get('id') || '';
  if(!/^[a-f0-9]{64}$/.test(id))return new Response('Not found',{status:404,headers:privateHeaders});
  try {
    const auth=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']});
    if(!await companyReader(request,auth))return new Response('Login required',{status:401,headers:privateHeaders});
    const state=await readState({deferHistory:true,deferDependencyHistory:true}),projected=await companyState(request,state);
    if(!await visibleMediaReference(projected.values,id))return new Response('Forbidden',{status:403,headers:privateHeaders});
    const image=await env.STATE_ARCHIVE.get('delivery/media/'+id);
    if(!image)return new Response('Not found',{status:404,headers:privateHeaders});
    return new Response(image.body,{headers:{...privateHeaders,'Content-Type':image.httpMetadata?.contentType || 'application/octet-stream','Content-Length':String(image.size)}});
  }catch{return new Response('Image unavailable',{status:503,headers:privateHeaders});}
}
