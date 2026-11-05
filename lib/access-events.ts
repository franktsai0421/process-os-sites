import {handleAccessEventExports} from './access-event-export';
import {sha256,utf8} from './web-feedback-zip';
import {env} from 'cloudflare:workers';
import {readState,identity,can,sameOrigin,type State} from './process-state';
import {accessEventSources,minimalAccessObservation} from '../public/process/access-event-protocol.mjs';
import {GET as readFqc} from '../app/api/fqc/workflow/route';
import {GET as readIqc} from '../app/api/iqc/workflow/route';
import {GET as readIpqcC} from '../app/api/ipqc-c/workflow/route';
import {GET as readIpqcAB} from '../app/api/ipqc-ab/workflow/route';
import {GET as readBom} from '../app/api/bom/workflow/route';
import {GET as readTooling} from '../app/api/tooling/workflow/route';
import {GET as readEquipment} from '../app/api/routine-equipment/workflow/route';
import {GET as readMaster} from '../app/api/master/workflow/route';
import {GET as readAuthoring} from '../app/api/process-authoring/workflow/route';

const binding=env as typeof env&{ACCESS_EVENTS_ENABLED?:string};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const authKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'];
type Actor=NonNullable<Awaited<ReturnType<typeof identity>>>;
type Row={id:string;actor_id:string;module:string;operation_id:string;action:string;occurred_at:number;received_at:string;updated_at:string;outcome:'unknown'|'receipt-confirmed';verified_at:string|null;status:'open'|'handled';version:number;notes:string;history:string;update_receipts:string};
const unavailable=(reason:string)=>({available:false,coverage:'not-connected',lastUpdatedAt:null,events:[],reason});
const retention={policy:'retain-management-history-v1',autoDelete:false,recoverable:true} as const;
const enabled=()=>binding.ACCESS_EVENTS_ENABLED==='1';
const source=(module:string)=>accessEventSources[module as keyof typeof accessEventSources];
async function allowed(request:Request,state:State,module:string){return !!source(module)&&await can(request,state,module+'.view');}
class EventFault extends Error {constructor(code:string,public status:number){super(code);}}
async function assertFresh(request:Request,state:State,actor:Actor){const latest=await readState({keys:authKeys}),current=await identity(request,latest);if(!current||current.id!==actor.id)throw new EventFault('LOGIN_REQUIRED',401);if(latest.revision!==state.revision||current.role!==actor.role||current.primary!==actor.primary)throw new EventFault('AUTH_CHANGED_RELOAD',409);}

async function bodyOf(request:Request):Promise<Record<string,unknown>> {
 const reader=request.body?.getReader();if(!reader)throw Error('INVALID_REQUEST');let size=0,text='';const decoder=new TextDecoder();
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>20000){await reader.cancel();throw Error('REQUEST_TOO_LARGE');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();
 let value:unknown;try{value=JSON.parse(text);}catch{throw new EventFault('INVALID_REQUEST',422);}if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_REQUEST');return value as Record<string,unknown>;
}
async function originalReceipt(request:Request,module:string,operationId:string,action:string) {
 const path=source(module);if(!path)return false;
 const url=new URL(path,new URL(request.url).origin);url.searchParams.set('operationId',operationId);url.searchParams.set('accessEvent','1');
 const original=new Request(url,{headers:request.headers});
 // Invoke the original actor-authorized reader, never impersonate an actor or
 // use a new admin receipt privilege. Failures/404 are unknown, not rejection.
 const readers:Record<string,(request:Request)=>Promise<Response>>={fqc:readFqc,iqc:readIqc,'ipqc-c':readIpqcC,'ipqc-ab':readIpqcAB,bom:readBom,tooling:readTooling,equipment:readEquipment,editor:readAuthoring,ab:readMaster,c:readMaster,templates:readMaster};
 const response=await readers[module](original);
 if(!response.ok)return false;
 const value=await response.json() as {receipt?:{operationId?:string;generation?:string;revision?:number;unchanged?:boolean};operationAction?:string};
 const receipt=value.receipt;return value.operationAction===action&&receipt?.operationId===operationId&&typeof receipt.generation==='string'&&!!receipt.generation&&Number.isSafeInteger(receipt.revision)&&typeof receipt.unchanged==='boolean';
}
function project(row:Row,privateDetails:boolean,names:Map<string,string>){return {id:row.id,reporter:names.get(row.actor_id)||'Unavailable account',module:row.module,action:row.action,occurredAt:row.occurred_at,receivedAt:row.received_at,updatedAt:row.updated_at,outcome:row.outcome,verifiedAt:row.verified_at,status:row.status,...(privateDetails?{version:row.version,notes:JSON.parse(row.notes) as unknown,history:JSON.parse(row.history) as unknown}: {})};}
export async function handleAccessEvents(request:Request) {
 try{
  const state=await readState({keys:authKeys}),actor=await identity(request,state);
  if(!actor||actor.role==='device'||actor.sessionType!=='platform')return reply({error:'LOGIN_REQUIRED'},401);
  const url=new URL(request.url),action=url.searchParams.get('action')||'list';
  const viewer=await can(request,state,'feedback.view'),privateDetails=actor.role==='admin',permissions={edit:await can(request,state,'feedback.edit'),exchange:await can(request,state,'feedback.exchange')};
  const users=JSON.parse(state.values.platformUsers||'[]') as {id:string;name:string}[],names=new Map(users.map(user=>[user.id.toLowerCase(),user.name]));
  if(request.method==='GET'&&action==='capabilities')return reply({enabled:enabled(),reason:enabled()?null:'NOT_ENABLED',retention,modules:enabled()?await Promise.all(Object.keys(accessEventSources).map(async module=>await allowed(request,state,module)?module:null)).then(rows=>rows.filter(Boolean)):[]});
  if(action!=='observe'&&!viewer)return reply({error:'FORBIDDEN'},403);
  if(!enabled()){const reason='NOT_ENABLED';return request.method==='POST'?reply({error:reason},409):reply(unavailable(reason));}
  if(['export-preview','export','exports','download'].includes(action))return handleAccessEventExports({request,state,actor,action,names,allowed:(module:string)=>allowed(request,state,module),assertFresh:()=>assertFresh(request,state,actor),body:()=>bodyOf(request)});
  if(request.method==='GET'&&action==='detail'){
   const id=url.searchParams.get('id');if(!id||!/^[a-f0-9-]{36}$/.test(id))return reply({error:'INVALID_FILTER'},422);
   const row=await env.DB.prepare('SELECT * FROM access_events WHERE id=?').bind(id).first<Row>();if(!row||!await allowed(request,state,row.module))return reply({error:'NOT_FOUND'},404);
   await assertFresh(request,state,actor);return reply({event:project(row,privateDetails,names),permissions,privateDetails});
  }
  if(request.method==='GET'&&action==='list'){
   const status=url.searchParams.get('status')||'open',after=url.searchParams.get('after')||'';
   if(!['open','handled'].includes(status)||after&&!/^[a-f0-9-]{36}$/.test(after))return reply({error:'INVALID_FILTER'},422);
   const modules=(await Promise.all(Object.keys(accessEventSources).map(async module=>await allowed(request,state,module)?module:null))).filter((value):value is string=>!!value);
   if(!modules.length)return reply({available:true,coverage:'received-events-only',lastUpdatedAt:null,events:[],next:null,modules:[],complete:false,permissions,privateDetails});
   const marks=modules.map(()=>'?').join(','),result=await env.DB.prepare(`SELECT * FROM access_events WHERE module IN (${marks}) AND status=? AND id>? ORDER BY id LIMIT 51`).bind(...modules,status,after).all<Row>();
   const last=await env.DB.prepare(`SELECT MAX(updated_at) AS at FROM access_events WHERE module IN (${marks})`).bind(...modules).first<{at:string|null}>();
   await assertFresh(request,state,actor);
   return reply({available:true,coverage:'received-events-only',lastUpdatedAt:last?.at||null,events:result.results.slice(0,50).map(row=>project(row,privateDetails,names)),next:result.results.length>50?result.results[49].id:null,modules,complete:false,permissions,privateDetails});
  }
  if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  if(!sameOrigin(request))return reply({error:'ORIGIN_DENIED'},403);
  if(state.values.maintenanceMode==='1')return reply({error:'MAINTENANCE'},503);
  const body=await bodyOf(request),at=new Date().toISOString();
  if(action==='observe'){
   let event:ReturnType<typeof minimalAccessObservation>;try{event=minimalAccessObservation(body);}catch{return reply({error:'INVALID_ACCESS_EVENT'},422);}if(!await allowed(request,state,event.module))return reply({error:'FORBIDDEN'},403);
   // Only this reader's verified success can promote outcome; browser flags,
   // HTTP error codes and manual handling cannot manufacture a result.
   const confirmed=await originalReceipt(request,event.module,event.operationId,event.action).catch(()=>false);
   await assertFresh(request,state,actor);
   const result=await env.DB.prepare(`INSERT INTO access_events(id,actor_id,module,operation_id,action,occurred_at,received_at,updated_at,outcome,verified_at,status,version,notes,history,update_receipts)
    SELECT ?,?,?,?,?,?,?,?,?,?,'open',1,'[]','[]','[]' WHERE EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=?) AND ((SELECT COUNT(*) FROM access_events)<50000 OR EXISTS(SELECT 1 FROM access_events WHERE actor_id=? AND module=? AND operation_id=?))
    ON CONFLICT(actor_id,module,operation_id) DO UPDATE SET outcome=CASE WHEN excluded.outcome='receipt-confirmed' THEN excluded.outcome ELSE access_events.outcome END,verified_at=COALESCE(excluded.verified_at,access_events.verified_at),updated_at=excluded.updated_at
    WHERE access_events.action=excluded.action AND EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=?)`)
    .bind(crypto.randomUUID(),actor.id,event.module,event.operationId,event.action,event.occurredAt,at,at,confirmed?'receipt-confirmed':'unknown',confirmed?at:null,state.revision,actor.id,event.module,event.operationId,state.revision).run();
   if(result.meta.changes!==1)return reply({error:'EVENT_NOT_ACCEPTED'},409);
   await assertFresh(request,state,actor);
   return reply({received:true,verified:confirmed});
  }
  if(action==='update'){
   if(!await can(request,state,'feedback.edit'))return reply({error:'FORBIDDEN'},403);
   if(Object.keys(body).sort().join()!=='id,note,operationId,status,version'||typeof body.operationId!=='string'||! /^[a-zA-Z0-9_-]{8,100}$/.test(body.operationId)||typeof body.id!=='string'||!Number.isSafeInteger(body.version)||!['open','handled'].includes(String(body.status))||typeof body.note!=='string'||body.note.length>4000)return reply({error:'INVALID_UPDATE'},422);
   const row=await env.DB.prepare('SELECT * FROM access_events WHERE id=?').bind(body.id).first<Row>();
   if(!row||!await allowed(request,state,row.module))return reply({error:'NOT_FOUND'},404);
   const digest=await sha256(utf8(JSON.stringify({id:body.id,note:body.note,status:body.status,version:body.version}))),receipts=JSON.parse(row.update_receipts) as {actorId:string;operationId:string;digest:string}[],previous=receipts.find(item=>item.actorId===actor.id&&item.operationId===body.operationId);
   if(previous){if(previous.digest!==digest)return reply({error:'OPERATION_PAYLOAD_CHANGED'},409);await assertFresh(request,state,actor);return reply({...project(row,true,names),replayed:true});}
   const notes=JSON.parse(row.notes) as {authorId:string;at:string;text:string}[],history=JSON.parse(row.history) as {authorId:string;at:string;status:string}[];
   if(body.note.trim()&&notes.length>=100)return reply({error:'EVENT_HISTORY_CAPACITY'},413);
   if(body.note.trim())notes.push({authorId:actor.id,at,text:body.note});history.push({authorId:actor.id,at,status:String(body.status)});
   await assertFresh(request,state,actor);
   const result=await env.DB.prepare('UPDATE access_events SET status=?,notes=?,history=?,update_receipts=?,version=version+1,updated_at=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM shared_state WHERE id=1 AND revision=?)').bind(body.status,JSON.stringify(notes),JSON.stringify(history),JSON.stringify([...receipts,{actorId:actor.id,operationId:body.operationId,digest}].slice(-32)),at,row.id,body.version,state.revision).run();
   if(result.meta.changes!==1)return reply({error:'EVENT_CHANGED_RELOAD'},409);
   await assertFresh(request,state,actor);const updated=await env.DB.prepare('SELECT * FROM access_events WHERE id=?').bind(row.id).first<Row>();if(!updated)throw Error('EVENT_READBACK_FAILED');return reply(project(updated,true,names));
  }
  return reply({error:'UNKNOWN_ACTION'},404);
 }catch(error){if(error instanceof EventFault)return reply({error:error.message},error.status);return reply({error:error instanceof Error&&['INVALID_ACCESS_EVENT','INVALID_REQUEST','REQUEST_TOO_LARGE'].includes(error.message)?error.message:'ACCESS_EVENTS_UNAVAILABLE'},error instanceof Error&&['INVALID_ACCESS_EVENT','INVALID_REQUEST'].includes(error.message)?422:error instanceof Error&&error.message==='REQUEST_TOO_LARGE'?413:503);}
}
