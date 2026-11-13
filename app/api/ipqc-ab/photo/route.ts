import {readPhotoUpload,photoUploadFailure} from '@/lib/photo-upload.mjs';
import { env } from 'cloudflare:workers';
import { readState, identity, can, sameOrigin } from '@/lib/process-state';

const key = (id: string) => `ipqc-ab/photos/${id}`;
const uploadPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const uploadKey = (actorId:string,uploadId:string) => `ipqc-ab/photo-uploads/${encodeURIComponent(actorId)}/${uploadId}`;
async function uploadOutcome(actorId:string,uploadId:string) {
  const object=await env.STATE_ARCHIVE.get(uploadKey(actorId,uploadId));
  if(!object)return null;
  const value=JSON.parse(await object.text()) as {uploadId:string;actorId:string;id:string};
  if(value.uploadId!==uploadId||value.actorId!==actorId||!/^[a-f0-9]{64}$/.test(value.id)||!await env.STATE_ARCHIVE.head(key(value.id)))throw Error('PHOTO_OUTCOME_UNAVAILABLE');
  return {uploadId:value.uploadId,id:value.id,url:`/api/ipqc-ab/photo?id=${value.id}`};
}
const formats = new Set(['image/jpeg','image/png','image/webp','image/gif']);
const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
  byte => byte.toString(16).padStart(2,'0')).join('');

export async function GET(request: Request) {
  if(new URL(request.url).pathname!=='/api/ipqc-ab/photo')return Response.json({error:'NOT_FOUND'},{status:404});
  const uploadId=new URL(request.url).searchParams.get('uploadId');
  if(uploadId!==null){
    if(!uploadPattern.test(uploadId))return Response.json({error:'INVALID_UPLOAD_ID'},{status:422});
    try{
      const state=await readState({aggregateReadAhead:true,keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']}),actor=await identity(request,state);
      if(!actor||request.headers.get('X-Process-Expected-Actor')!==actor.id||!await can(request,state,'view:data')||!await can(request,state,'ipqc-ab.edit'))return Response.json({error:'FORBIDDEN'},{status:403});
      const result=await uploadOutcome(actor.id,uploadId);
      return result?Response.json(result,{headers:{'Cache-Control':'no-store'}}):Response.json({error:'UPLOAD_RESULT_UNKNOWN'},{status:404});
    }catch{return Response.json({error:'UPLOAD_RESULT_UNKNOWN'},{status:503});}
  }
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[a-f0-9]{64}$/.test(id)) return new Response('Not found',{status:404});
  try {
    const state = await readState({aggregateReadAhead:true,keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']});
    if (!await identity(request,state) ||
        !(await can(request,state,'view:data')) && !(await can(request,state,'view:approval')))
      return new Response('Forbidden',{status:403});
    const photo = await env.STATE_ARCHIVE.get(key(id));
    if (!photo) return new Response('Not found',{status:404});
    return new Response(photo.body,{headers:{'Content-Type':photo.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch { return new Response('Unavailable',{status:503}); }
}

export async function PUT(request: Request) {
  if(new URL(request.url).pathname!=='/api/ipqc-ab/photo')return Response.json({error:'NOT_FOUND'},{status:404});
  if (!sameOrigin(request)) return Response.json({error:'來源不允許'},{status:403});
  const uploadId=request.headers.get('X-Process-Upload-Id');
  if(uploadId!==null&&!uploadPattern.test(uploadId))return Response.json({error:'INVALID_UPLOAD_ID'},{status:422});
  const rejected=(error:string,status:number)=>Response.json({error,...(uploadId?{uploadId,uploadState:'rejected'}:{})},{status});
  try {
    const state = await readState({aggregateReadAhead:true,keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']});
    const actor=await identity(request,state),expected=request.headers.get('X-Process-Expected-Actor');
    if(actor&&(expected===null||actor.id!==expected))return rejected('ACCOUNT_CHANGED_REOPEN_REQUIRED',403);
    if (!actor || !(await can(request,state,'view:data')) ||
        !(await can(request,state,'ipqc-ab.edit')))
      return rejected('沒有照片上傳權限',403);
    const type = request.headers.get('content-type')?.split(';')[0] || '';
    if (!formats.has(type)) return rejected('僅接受圖片檔',415);
    const bytes = await readPhotoUpload(request,5_000_000);
    const id = await digest(bytes);
    // Image decoding and hashing can outlive the initial authorization snapshot.
    const fresh=await readState({aggregateReadAhead:true,keys:['platformUsers','processCustomRoles','processRoleTemplateOverrides','maintenanceMode']});
    const current=await identity(request,fresh);
    if(!current||current.id!==actor.id||!(await can(request,fresh,'view:data'))||!(await can(request,fresh,'ipqc-ab.edit')))
      return rejected('沒有照片上傳權限',403);
    if (!await env.STATE_ARCHIVE.head(key(id)))
      // First-creation provenance is committed atomically with the immutable bytes.
      // Conditional creation keeps a competing actor from replacing that origin.
      await env.STATE_ARCHIVE.put(key(id),bytes,{httpMetadata:{contentType:type},
        onlyIf:{etagDoesNotMatch:'*'},customMetadata:{provenanceVersion:'1',createdBy:actor.id,createdAt:new Date().toISOString(),sha256:id}});
    if(uploadId){
      const existing=await uploadOutcome(actor.id,uploadId);
      if(existing&&existing.id!==id)return rejected('UPLOAD_ID_REUSED',409);
      if(!existing)await env.STATE_ARCHIVE.put(uploadKey(actor.id,uploadId),JSON.stringify({actorId:actor.id,uploadId,id}),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
      const confirmed=await uploadOutcome(actor.id,uploadId);
      if(!confirmed||confirmed.id!==id)throw Error('PHOTO_OUTCOME_UNAVAILABLE');
      return Response.json(confirmed);
    }
    return Response.json({id,url:`/api/ipqc-ab/photo?id=${id}`});
  } catch (error) {
    const failure=photoUploadFailure(error);if(failure)return uploadId?rejected(error instanceof Error?error.message:'PHOTO_UPLOAD_FAILED',failure.status):failure;
    console.error('[ipqc-ab] photo upload failed',error);
    return Response.json({error:'圖片未保存，請重試'},{status:503});
  }
}
