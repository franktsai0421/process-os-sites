import {env} from 'cloudflare:workers';
import {readState,companyReader,publicState} from '@/lib/process-state';
import {privateHeaders,projectCompanyState} from '@/lib/site-security.mjs';
import {identityKeys,authorizedDeliveryKeys,canonicalReference} from '@/lib/delivery-read-plan.mjs';
import {decodeRecordValues} from '@/lib/state-records';
export async function GET(request:Request) {
  const url=new URL(request.url),id=url.searchParams.get('id') || '',version=url.searchParams.get('version') || '';
  if(!/^[a-f0-9]{64}$/.test(id)||!/^[a-f0-9]{64}$/.test(version))return new Response('Not found',{status:404,headers:privateHeaders});
  try {
    const auth=await readState({keys:[...identityKeys]}),reader=await companyReader(request,auth);
    if(!reader)return new Response('Login required',{status:401,headers:privateHeaders});
    // Bound live allocation to one authorized aggregate. Stop after proving a
    // visible reference; do not reconstruct every module for each image.
    const keys=auth.recordStorage?(await authorizedDeliveryKeys(reader.canRead,Object.keys(auth.recordStorage.envelope.__processRecords.values))).filter(key=>!identityKeys.includes(key)):['legacy'];
    let referenced=false;
    for(const key of keys){
      const decoded=auth.recordStorage?await decodeRecordValues(env.STATE_ARCHIVE,auth.recordStorage.envelope,{keys:[key],deferHistory:true,deferDependencyHistory:true}):null;
      const state=decoded?{revision:auth.revision,...decoded,values:{...auth.values,...decoded.values}}:auth;
      const projected=await projectCompanyState(publicState(state,reader.actor.id),reader.actor,reader.canRead);
      if(canonicalReference(projected.values,id,version)){referenced=true;break;}
    }
    if(!referenced)return new Response('Forbidden',{status:403,headers:privateHeaders});
    const object=await env.STATE_ARCHIVE.get('canonical-images/'+id+'/'+version+'.webp');
    if(!object||object.customMetadata?.sourceSha256!==id||object.customMetadata?.webSha256!==version)return new Response('Not found',{status:404,headers:privateHeaders});
    const fresh=await readState({keys:[...identityKeys]}),after=await companyReader(request,fresh);
    if(!after||after.actor.id!==reader.actor.id||fresh.revision!==auth.revision){await object.body.cancel();return new Response('State changed',{status:409,headers:privateHeaders});}
    return new Response(object.body,{headers:{...privateHeaders,'Content-Type':'image/webp','Content-Length':String(object.size)}});
  }catch{return new Response('Image unavailable',{status:503,headers:privateHeaders});}
}
