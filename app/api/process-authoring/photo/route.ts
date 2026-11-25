import {env} from 'cloudflare:workers';
import {canvasPhotoIds,photoPrefix,photoURL,validId,validLine} from '@/lib/canvas-photos';
import {processAuthoringAdapter,type Workspace} from '@/lib/process-authoring-workflow';
import {readState,companyReader,sameOrigin,stateRevisionIsCurrent,readPlatformUsers,type State} from '@/lib/process-state';
import {identityKeys} from '@/lib/delivery-read-plan.mjs';
import {privateHeaders} from '@/lib/site-security.mjs';
import {effectiveAccess} from '@/lib/user-access';
import {readPhotoBytes,photoTypeMatches,photoUploadFailure} from '@/public/process/photo-policy.mjs';
import {isImmutableRecordBody,readImmutableRecord} from '@/lib/state-records';

const keys=[...identityKeys,'processAccessControl'];
const deny=(status:number)=>new Response(null,{status,headers:privateHeaders});
function hasLine(state:State,actor:{id:string;role:string},line:string){
 const user=readPlatformUsers(state.values.platformUsers).find(u=>u.id===actor.id);
 return !!user&&(actor.role==='admin'||effectiveAccess(user,state.values).lines.includes(line));
}
export async function PUT(request:Request){
 const line=new URL(request.url).searchParams.get('line')||'';
 if(!sameOrigin(request)||!validLine.test(line))return deny(403);
 try{
  const state=await readState({keys}),reader=await companyReader(request,state);
  if(!reader||reader.actor.id!==request.headers.get('X-Process-Expected-Actor')||
   !hasLine(state,reader.actor,line)||!['editor.view','editor.edit','editor.save'].every(reader.canRead))return deny(403);
  const type=request.headers.get('content-type')?.split(';')[0]||'';
  if(!/^image\/[a-z0-9.+-]+$/.test(type))return deny(415);
  const bytes=await readPhotoBytes(request,25_000_000);
  if(['image/png','image/jpeg','image/webp','image/gif'].includes(type)&&!photoTypeMatches(bytes,type))return deny(415);
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  const id=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
  const key=photoPrefix+line+'/'+id;
  if(!await stateRevisionIsCurrent(state))return deny(409);
  if(!await env.STATE_ARCHIVE.head(key))await env.STATE_ARCHIVE.put(key,bytes,{httpMetadata:{contentType:type}});
  return Response.json({url:photoURL(line,id)},{headers:privateHeaders});
 }catch(error){return photoUploadFailure(error)||deny(503);}
}

export async function GET(request:Request){
 const query=new URL(request.url).searchParams,line=query.get('line')||'',id=query.get('id')||'';
 if(!validLine.test(line)||!validId.test(id))return deny(404);
 let unread:ReadableStream|null=null;
 try{
  const auth=await readState({keys}),reader=await companyReader(request,auth);
  if(!reader)return deny(401);
  const editor=reader.canRead('editor.view');
  if(!hasLine(auth,reader.actor,line)||!editor&&!['approval.view','player.view','dispatch.view','status.view'].some(reader.canRead))return deny(403);
  const ref=line+'/'+id;
  if(!await env.STATE_ARCHIVE.head(photoPrefix+ref))return deny(403);
  const state=await readState({keys:['processAuthoringControl'],modelKey:'processAuthoringControl',deferHistory:true});
  if(state.revision!==auth.revision)return deny(409);
  const control=processAuthoringAdapter().parse(state.values.processAuthoringControl,state.recordStorage?.models.get('processAuthoringControl'));
  const flow=control.workflow!;
  const snapshots=editor?[flow.working,flow.saved?.content,...control.versions.map(v=>v.snapshot),...flow.cases.map(c=>c.content),
   ...(reader.canRead('editor.restore')?flow.saves.map(s=>s.content):[])]:
   control.versions.filter(v=>v.id===control.activeVersionId).map(v=>v.snapshot);
  const seen=new Set<string>();let visible=false;
  for(let snapshot of snapshots){
   if(!snapshot)continue;
   if(isImmutableRecordBody(snapshot)){
    const r=snapshot.__immutableBody;if(seen.has(r.key))continue;seen.add(r.key);
    snapshot=JSON.parse(await readImmutableRecord(env.STATE_ARCHIVE,r)) as {workspaces:Workspace[]};
   }
   if(canvasPhotoIds(snapshot).includes(ref)){visible=true;break;}
  }
  if(!visible)return deny(403);
  const image=await env.STATE_ARCHIVE.get(photoPrefix+ref);if(!image)return deny(404);
  unread=image.body;
  const fresh=await readState({keys}),after=await companyReader(request,fresh);
  if(!after||after.actor.id!==reader.actor.id||fresh.revision!==auth.revision||!await stateRevisionIsCurrent(fresh))return deny(409);
  const result=new Response(unread,{headers:{...privateHeaders,'Content-Security-Policy':"sandbox; default-src 'none'; style-src 'unsafe-inline'",
   'Content-Type':image.httpMetadata?.contentType||'application/octet-stream','Content-Length':String(image.size)}});
  unread=null;return result;
 }catch{return deny(503);}finally{await unread?.cancel().catch(()=>{});}
}
