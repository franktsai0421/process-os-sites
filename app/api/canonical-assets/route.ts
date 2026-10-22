import {env} from 'cloudflare:workers';
import {readState,companyReader,companyState} from '@/lib/process-state';
import {privateHeaders} from '@/lib/site-security.mjs';
export async function GET(request:Request) {
  const url=new URL(request.url),id=url.searchParams.get('id') || '',version=url.searchParams.get('version') || '';
  if(!/^[a-f0-9]{64}$/.test(id)||!/^[a-f0-9]{64}$/.test(version))return new Response('Not found',{status:404,headers:privateHeaders});
  try {
    const auth=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']});
    if(!await companyReader(request,auth))return new Response('Login required',{status:401,headers:privateHeaders});
    const state=await readState({deferHistory:true,deferDependencyHistory:true}),projected=await companyState(request,state);
    const referenced=Object.values(projected.values).some(raw=>raw.includes('asset:'+id)||raw.includes('/api/canonical-assets?id='+id+'&version='+version));
    if(!referenced)return new Response('Forbidden',{status:403,headers:privateHeaders});
    const object=await env.STATE_ARCHIVE.get('canonical-images/'+id+'/'+version+'.webp');
    if(!object||object.customMetadata?.sourceSha256!==id||object.customMetadata?.webSha256!==version)return new Response('Not found',{status:404,headers:privateHeaders});
    return new Response(object.body,{headers:{...privateHeaders,'Content-Type':'image/webp','Content-Length':String(object.size)}});
  }catch{return new Response('Image unavailable',{status:503,headers:privateHeaders});}
}
