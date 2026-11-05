import {env} from 'cloudflare:workers';
import {can,sameOrigin,type State} from './process-state';
import {sha256,utf8} from './web-feedback-zip';
import {exportText,exportIds,planProblemExport,validateExportBatch,problemZip,ProblemExportError,type ExportItem} from './problem-export';
type EventRow={id:string;actor_id:string;module:string;action:string;occurred_at:number;received_at:string;status:string;outcome:string;version:number;notes:string};
type ExportRow={id:string;actor_id:string;digest:string;generated_at:string;modules:string;ids:string;count:number;size:number;sha256:string};
type Context={request:Request;state:State;actor:{id:string};action:string;names:Map<string,string>;allowed:(module:string)=>Promise<boolean>;assertFresh:()=>Promise<void>;body:()=>Promise<Record<string,unknown>>};
const key=(id:string)=>'access-events/v1/exports/'+id+'.zip';
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const operation=(value:unknown)=>{if(typeof value!=='string'||! /^[a-zA-Z0-9_-]{12,80}$/.test(value))throw new ProblemExportError('INVALID_OPERATION_ID');return value;};
const summary=(row:ExportRow)=>({id:row.id,status:'generated',generatedAt:row.generated_at,count:row.count,size:row.size});
export async function handleAccessEventExports(context:Context){
 const {request,state,actor,action,names,allowed,assertFresh}=context;
 try{
  if(!await can(request,state,'feedback.exchange'))return reply({error:'FORBIDDEN'},403);
  async function mayRead(row:ExportRow){for(const moduleId of JSON.parse(row.modules) as string[])if(!await allowed(moduleId))return false;return true;}
  const url=new URL(request.url);
  if(request.method==='GET'&&action==='download'){
   const id=url.searchParams.get('id');if(!id||!/^AE-[a-f0-9-]{36}$/.test(id))return reply({error:'NOT_FOUND'},404);
   const row=await env.DB.prepare('SELECT * FROM access_event_exports WHERE id=?').bind(id).first<ExportRow>();if(!row||!await mayRead(row))return reply({error:'NOT_FOUND'},404);await assertFresh();
   const object=await env.STATE_ARCHIVE.get(key(id));if(!object)return reply({error:'ZIP_MISSING'},503);const bytes=new Uint8Array(await object.arrayBuffer());if(bytes.length!==row.size||await sha256(bytes)!==row.sha256)return reply({error:'ZIP_HASH_MISMATCH'},503);await assertFresh();
   return new Response(bytes,{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="AccessEvents_${id}.zip"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(request.method==='GET'&&action==='exports'){
   // A bounded history page. The UI says it is recent, never all exports.
   const rows=await env.DB.prepare('SELECT * FROM access_event_exports ORDER BY generated_at DESC,id DESC LIMIT 100').all<ExportRow>(),exports=[];for(const row of rows.results)if(await mayRead(row))exports.push(summary(row));await assertFresh();return reply({exports,scope:'recent-authorized-exports',limited:rows.results.length===100});
  }
  if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  if(!sameOrigin(request))return reply({error:'ORIGIN_DENIED'},403);if(state.values.maintenanceMode==='1')return reply({error:'MAINTENANCE'},503);
  const body=await context.body();if(Object.keys(body).some(key=>!['ids','versions','imageIds','operationId'].includes(key)))return reply({error:'INVALID_EXPORT_REQUEST'},422);const ids=exportIds(body.ids,'access');
  let operationId='',digest='';
  if(action==='export'){
   operationId=operation(body.operationId);digest=await sha256(utf8(JSON.stringify({ids,versions:body.versions,imageIds:body.imageIds,source:'access'})));
   const old=await env.DB.prepare('SELECT * FROM access_event_exports WHERE actor_id=? AND operation_id=?').bind(actor.id,operationId).first<ExportRow>();
   if(old){if(old.digest!==digest)return reply({error:'OPERATION_PAYLOAD_CHANGED'},409);if(!await mayRead(old))return reply({error:'FORBIDDEN'},403);await assertFresh();return reply({...summary(old),replayed:true});}
  }
  const users=JSON.parse(state.values.platformUsers||'[]') as {password?:string}[],secrets=[...users.map(user=>user.password||''),String(env.PROCESS_SESSION_SECRET||'')],items:ExportItem[]=[],modules=new Set<string>();
  for(const id of ids){const row=await env.DB.prepare('SELECT * FROM access_events WHERE id=?').bind(id).first<EventRow>();if(!row||!await allowed(row.module))return reply({error:'NOT_FOUND'},404);modules.add(row.module);
   const notes=JSON.parse(row.notes) as {authorId:string;text:string;at:string}[];
   items.push({id:row.id,version:row.version,images:[],data:{id:row.id,user:exportText(names.get(row.actor_id)||'Unavailable account',secrets),module:row.module,action:row.action,occurredAt:row.occurred_at,receivedAt:row.received_at,operationStatus:row.outcome,managementStatus:row.status,notes:notes.map(note=>({author:exportText(names.get(note.authorId)||'Unavailable account',secrets),at:note.at,text:exportText(note.text,secrets)}))}});
  }
  await assertFresh();
  if(action==='export-preview')return reply({...planProblemExport(items,'access',new Set()),preview:items.map(item=>({...item.data,version:item.version,reporter:item.data.user,images:[]}))});
  if(action!=='export')return reply({error:'UNKNOWN_ACTION'},404);
  validateExportBatch(body,items,'access');const capacity=await env.DB.prepare('SELECT COUNT(*) AS n FROM access_event_exports').first<{n:number}>();if((capacity?.n||0)>=10000)return reply({error:'EXPORT_CAPACITY_LIMIT'},413);const archive=await problemZip(items,'access',new Set(),async()=>{throw Error('ACCESS_EXPORT_HAS_NO_IMAGES');}),id='AE-'+crypto.randomUUID();await assertFresh();
  await env.STATE_ARCHIVE.put(key(id),archive.bytes,{httpMetadata:{contentType:'application/zip'}});
  const result=await env.DB.prepare('INSERT OR IGNORE INTO access_event_exports(id,actor_id,operation_id,digest,generated_at,modules,ids,count,size,sha256) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=?) AND (SELECT COUNT(*) FROM access_event_exports)<10000').bind(id,actor.id,operationId,digest,archive.generatedAt,JSON.stringify([...modules]),JSON.stringify(ids),ids.length,archive.bytes.length,archive.sha256,state.revision).run();
  if(result.meta.changes!==1){const old=await env.DB.prepare('SELECT * FROM access_event_exports WHERE actor_id=? AND operation_id=?').bind(actor.id,operationId).first<ExportRow>();if(old&&old.digest===digest&&await mayRead(old)){await assertFresh();return reply({...summary(old),replayed:true});}return reply({error:'EXPORT_NOT_ACCEPTED_RETRY_SAME_OPERATION'},409);}
  await assertFresh();return reply({id,status:'generated',count:ids.length,size:archive.bytes.length,generatedAt:archive.generatedAt},201);
 }catch(error){if(error instanceof ProblemExportError)return reply({error:error.message},error.status);const failure=error as {message?:string;status?:number};return reply({error:failure.status&&['LOGIN_REQUIRED','AUTH_CHANGED_RELOAD'].includes(failure.message||'')?failure.message:'ACCESS_EXPORT_UNAVAILABLE'},failure.status||503);}
}
