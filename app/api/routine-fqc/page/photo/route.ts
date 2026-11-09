import {env} from 'cloudflare:workers';
import {readState,identity,can,sameOrigin,stateRevisionIsCurrent,responseHeaders} from '@/lib/process-state';
import {readPhotoUpload,photoUploadFailure} from '@/lib/photo-upload.mjs';
const key=(id:string)=>'routine-fqc/photos/'+id;
async function authorize(request:Request,write=false){
 const state=await readState({keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','routineFqcEnabled','routineFqcControl'],deferHistory:true,deferDependencyHistory:true,projectValue:(key,raw)=>{if(key!=='routineFqcControl')return raw;const root=JSON.parse(raw);return JSON.stringify({schemaVersion:root.schemaVersion,pageDraftLayout:root.pageDraftLayout,page:{workflow:{scope:root.page?.workflow?.scope,pendingId:root.page?.workflow?.pendingId}}});}});
 const actor=await identity(request,state);if(!actor)return{error:Response.json({error:'LOGIN_REQUIRED'},{status:401,headers:responseHeaders})};
 if(!await can(request,state,'routine.view')||write&&(!await can(request,state,'routine.edit')||!await can(request,state,'routine.save')))return{error:Response.json({error:'FORBIDDEN'},{status:403,headers:responseHeaders})};
 if(state.values.routineFqcEnabled!=='1'&&!(['localhost','127.0.0.1'].includes(new URL(request.url).hostname)&&new URL(request.url).port==='3040'))return{error:Response.json({error:'FQC_NOT_ENABLED'},{status:404,headers:responseHeaders})};
 const root=JSON.parse(state.values.routineFqcControl||'{}');if(root.schemaVersion!==1||root.pageDraftLayout!=='page-v1'||root.page?.workflow?.scope!=='routine-fqc:page')return{error:Response.json({error:'ROUTINE_PAGE_CUTOVER_REQUIRED'},{status:409,headers:responseHeaders})};
 if(write&&root.page.workflow.pendingId)return{error:Response.json({error:'PENDING_LOCKED'},{status:409,headers:responseHeaders})};
 if(write&&state.values.maintenanceMode==='1')return{error:Response.json({error:'MAINTENANCE'},{status:503,headers:responseHeaders})};return{state};
}
export async function GET(request:Request){try{
 const query=new URL(request.url).searchParams,id=query.get('id')||'';if([...query.keys()].some(key=>key!=='id')||query.getAll('id').length!==1||!/^[a-f0-9]{64}$/.test(id))return new Response('Not found',{status:404});
 const access=await authorize(request);if(access.error)return access.error;const image=await env.STATE_ARCHIVE.get(key(id));if(!image)return new Response('Not found',{status:404});
 if(!await identity(request,access.state!))return new Response('Forbidden',{status:401});if(!await stateRevisionIsCurrent(access.state!))return new Response('Changed',{status:409});return new Response(image.body,{headers:{...responseHeaders,'Content-Type':image.httpMetadata?.contentType||'application/octet-stream','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response('Unavailable',{status:503});}}
export async function PUT(request:Request){if(!sameOrigin(request))return Response.json({error:'ORIGIN_FORBIDDEN'},{status:403});if(new URL(request.url).search)return Response.json({error:'SELECTOR_INVALID'},{status:422});try{
 const access=await authorize(request,true);if(access.error)return access.error;const type=request.headers.get('content-type')?.split(';')[0]||'';if(!['image/png','image/jpeg','image/webp','image/gif'].includes(type))return Response.json({error:'IMAGE_TYPE_INVALID'},{status:415});
 const bytes=await readPhotoUpload(request,25_000_000),b=new Uint8Array(bytes),text=(start:number,end:number)=>new TextDecoder().decode(b.slice(start,end));
 const signature=type==='image/png'?b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71:type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:type==='image/gif'?/^GIF8[79]a$/.test(text(0,6)):text(0,4)==='RIFF'&&text(8,12)==='WEBP';if(!signature||!bytes.byteLength)return Response.json({error:'IMAGE_SIGNATURE_INVALID'},{status:415});
 const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
 if(!await identity(request,access.state!))return Response.json({error:'LOGIN_REQUIRED'},{status:401});if(!await stateRevisionIsCurrent(access.state!))return Response.json({error:'CONCURRENT_CHANGE_RETRY'},{status:409});
 if(!await env.STATE_ARCHIVE.head(key(id)))await env.STATE_ARCHIVE.put(key(id),bytes,{httpMetadata:{contentType:type}});
 if(!await identity(request,access.state!))return Response.json({error:'LOGIN_REQUIRED'},{status:401});if(!await stateRevisionIsCurrent(access.state!))return Response.json({error:'CONCURRENT_CHANGE_RETRY'},{status:409});return Response.json({id,url:'/api/routine-fqc/page/photo?id='+id},{headers:responseHeaders});
 }catch(error){return photoUploadFailure(error)||Response.json({error:'PHOTO_UPLOAD_FAILED'},{status:503});}}
