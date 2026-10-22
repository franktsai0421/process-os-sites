import {env} from 'cloudflare:workers';
import {readState,identity,can} from './process-state';
import {boundedJson,privateHeaders,privateAssetDecision,validateAssetIndex} from './site-security.mjs';

export async function companyAsset(request:Request) {
  try {
    const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']});
    const actor=await identity(request,state);
    if(!actor)return new Response('Login required',{status:401,headers:privateHeaders});
    const indexObject=await env.STATE_ARCHIVE.get('company-assets/index.json');
    if(!indexObject)return new Response('Asset import required',{status:404,headers:privateHeaders});
    const index=validateAssetIndex(await boundedJson(new Request('https://snapshot.invalid/index',{method:'POST',body:indexObject.body,duplex:'half'} as RequestInit),1_048_576));
    const path=decodeURIComponent(new URL(request.url).pathname);
    const decision=await privateAssetDecision(index,path,actor,(permission:string)=>can(request,state,permission));
    if(decision.status!==200)return new Response(decision.status===404?'Not found':'Forbidden',{status:decision.status,headers:privateHeaders});
    const asset=decision.asset;
    const object=await env.STATE_ARCHIVE.get(asset.key);
    if(!object || object.size!==asset.bytes || object.customMetadata?.sha256!==asset.sha256)return new Response('Asset unavailable',{status:503,headers:privateHeaders});
    return new Response(object.body,{headers:{...privateHeaders,'Content-Type':asset.contentType,'Content-Length':String(asset.bytes),'Content-Security-Policy':"default-src 'none'; sandbox"}});
  }catch{return new Response('Asset unavailable',{status:503,headers:privateHeaders});}
}
