import {env} from 'cloudflare:workers';
import { identity, sameOrigin, readState, stateRevisionIsCurrent, responseHeaders } from '@/lib/process-state';
import { readPhotoUpload, photoUploadFailure } from '@/lib/photo-upload.mjs';
import { RI_KEY } from '@/lib/routine-iqc';
import { readRoutineIqcAuthority, routineIqcAccess, routineIqcAuthorityKeys } from '@/lib/routine-iqc-access';
import { iqcContentPhotos, readRoutineIqc } from '@/lib/routine-iqc-workflow';
import { DraftConflict } from '@/lib/shared-draft';

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:responseHeaders});
const photoKey=(id:string)=>'routine-iqc/photos/'+id;
const failed=(error:unknown)=>error instanceof DraftConflict?reply({error:error.code},error.status):
  photoUploadFailure(error)||reply({error:'IQC_PHOTO_FAILED'},503);
export async function GET(request:Request){
  const id=new URL(request.url).searchParams.get('id')||'';
  if(!/^[a-f0-9]{64}$/.test(id))return reply({error:'NOT_FOUND'},404);
  try{
    const state=await readState({keys:[...routineIqcAuthorityKeys,RI_KEY],deferHistory:false});
    const {actor}=await routineIqcAccess(request,state);
    const control=readRoutineIqc(state);
    if(!control.documents.some(doc=>[doc.flow.working,doc.flow.active.content,...doc.flow.saves.map(save=>save.content),
      ...doc.flow.cases.map(review=>review.content)].some(content=>iqcContentPhotos(content).includes(id))))return reply({error:'NOT_FOUND'},404);
    const image=await env.STATE_ARCHIVE.get(photoKey(id));
    if(!image)return reply({error:'NOT_FOUND'},404);
    if(!await stateRevisionIsCurrent(state))return reply({error:'REVISION_CONFLICT'},409);
    if((await identity(request,state))?.id!==actor.id)return reply({error:'LOGIN_REQUIRED'},401);
    return new Response(image.body,{headers:{...responseHeaders,'Content-Type':image.httpMetadata?.contentType||'application/octet-stream','X-Content-Type-Options':'nosniff'}});
  }catch(error){return failed(error);}
}
export async function PUT(request:Request){
  if(!sameOrigin(request))return reply({error:'ORIGIN_FORBIDDEN'},403);
  try{
    const state=await readRoutineIqcAuthority(),{actor,permissions}=await routineIqcAccess(request,state);
    if(!permissions.edit)return reply({error:'FORBIDDEN'},403);
    if(state.values.maintenanceMode==='1')return reply({error:'MAINTENANCE'},503);
    const type=request.headers.get('content-type')?.split(';')[0], data=await readPhotoUpload(request,25_000_000), bytes=new Uint8Array(data);
    const header=new TextDecoder().decode(bytes.slice(0,12));
    const valid=type==='image/png'?bytes[0]===137&&header.slice(1,4)==='PNG':type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
      type==='image/gif'?/^GIF8[79]a/.test(header):type==='image/webp'?header.startsWith('RIFF')&&header.slice(8)==='WEBP':false;
    if(!valid)return reply({error:'IMAGE_SIGNATURE_INVALID'},415);
    const id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
    if(!await stateRevisionIsCurrent(state))return reply({error:'REVISION_CONFLICT'},409);
    if((await identity(request,state))?.id!==actor.id)return reply({error:'LOGIN_REQUIRED'},401);
    if(!await env.STATE_ARCHIVE.head(photoKey(id)))await env.STATE_ARCHIVE.put(photoKey(id),data,{httpMetadata:{contentType:type}});
    return reply({id,url:'/api/routine-iqc/photo?id='+id});
  }catch(error){return failed(error);}
}
