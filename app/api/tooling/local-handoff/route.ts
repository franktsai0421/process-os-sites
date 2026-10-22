import {env} from 'cloudflare:workers';
import {readState,identity,sameOrigin,encodeValues,responseHeaders} from '@/lib/process-state';
import {parseTooling,type ToolingControl} from '@/lib/tooling-workflow';
import {checkTooling,same} from '@/lib/tooling';
import {DraftConflict,stableDraftJSON} from '@/lib/shared-draft';
const digest=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableDraftJSON(value)))),b=>b.toString(16).padStart(2,'0')).join('');
const local=(request:Request)=>(env as unknown as {PROCESS_LOCAL_IMAGES?:string}).PROCESS_LOCAL_IMAGES==='true'&&['127.0.0.1','localhost'].includes(new URL(request.url).hostname);
export async function GET(request:Request){
 if(!local(request))return Response.json({error:'LOCAL_ONLY'},{status:403});
 const state=await readState({modelKey:'toolingMasterControl',deferHistory:false}),actor=await identity(request,state);if(!actor||actor.role!=='admin')return Response.json({error:'FORBIDDEN'},{status:403});
 if(!state.values.toolingMasterControl)return Response.json({revision:state.revision,control:null,sourceDigest:null},{headers:responseHeaders});
 const control=parseTooling(state.values.toolingMasterControl,state.recordStorage?.models.get('toolingMasterControl'));
 return Response.json({revision:state.revision,control,sourceDigest:await digest(control)},{headers:responseHeaders});
}
export async function POST(request:Request){
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:responseHeaders});
 if(!local(request)||!sameOrigin(request))return reply({error:'LOCAL_ONLY'},403);
 try{
  const body=await request.json() as {preview?:boolean;control:ToolingControl;sourceDigest:string;expectedTargetDigest?:string;targetRevision:number;operationId:string};
  const state=await readState({modelKey:'toolingMasterControl',deferHistory:false}),actor=await identity(request,state);if(!actor||actor.role!=='admin')return reply({error:'FORBIDDEN'},403);
  if(state.values.maintenanceMode==='1')return reply({error:'MAINTENANCE'},503);
  const source=parseTooling(JSON.stringify(body.control)),flow=source.workflow;
  if(!flow||flow.scope!=='tooling'||flow.pendingId||!source.activeVersionId||flow.active.id!==source.activeVersionId||!same(flow.working,flow.active.content)||source.versions.some(v=>v.status==='draft'||v.status==='pending'))throw new DraftConflict('HANDOFF_REQUIRES_FINAL_APPROVED_MODULE');
  if(source.versions.find(v=>v.id===source.activeVersionId)?.status!=='approved')throw new DraftConflict('HANDOFF_ACTIVE_NOT_APPROVED');
  const sourceDigest=await digest(source);if(body.sourceDigest!==sourceDigest)throw new DraftConflict('HANDOFF_SOURCE_DIGEST_MISMATCH');
  const snapshots=[...source.versions.map(v=>v.snapshot),flow.active.content,flow.working,...flow.saves.map(s=>s.content),...flow.cases.flatMap(c=>[c.before,c.content])];
  for(const snapshot of snapshots)checkTooling(snapshot);
  for(const c of flow.cases)if(!source.versions.some(v=>v.id===c.id)||!c.actor?.id||!c.at||c.status==='pending'||!c.result?.actor?.id||!c.result.at)throw new DraftConflict('HANDOFF_HISTORY_INVALID');
  const photoIds=[...new Set(snapshots.flatMap(s=>s.tools.flatMap(t=>t.photos.map(p=>p.id))))];
  const target=state.values.toolingMasterControl?parseTooling(state.values.toolingMasterControl,state.recordStorage?.models.get('toolingMasterControl')):null;
  if(target){
   const targetDigest=await digest(target);
   if(targetDigest===sourceDigest)return reply({unchanged:true,sourceDigest,revision:state.revision,activeVersionId:source.activeVersionId});
   if(!body.expectedTargetDigest||body.expectedTargetDigest!==targetDigest)throw new DraftConflict('HANDOFF_TARGET_HAS_EXISTING_DATA',409,{activeVersionId:target.activeVersionId,pendingId:target.workflow?.pendingId,versions:target.versions.length});
   const previous=target.workflow;
   if(!previous||previous.pendingId||previous.saved||!same(previous.working,previous.active.content)||target.versions.some(v=>v.status==='draft'||v.status==='pending'))throw new DraftConflict('HANDOFF_TARGET_NOT_CLOSED');
   // A subsequent Local handoff must extend the exact inspected target. Only
   // its former approved version may become superseded; no history is replaced.
   const retainedVersions=target.versions.every(old=>{const next=source.versions.find(v=>v.id===old.id);return !!next&&same({...old,status:old.id===target.activeVersionId&&old.status==='approved'?'superseded':old.status},next);});
   const retainedRows=(old:unknown[],next:unknown[])=>old.every(row=>next.some(value=>same(row,value)));
   const retainedMap=(old:Record<string,unknown>,next:Record<string,unknown>)=>Object.entries(old).every(([key,value])=>same(value,next[key]));
   if(source.importSource!==target.importSource||!retainedVersions||
      !retainedRows(previous.cases,flow.cases)||!retainedRows(previous.saves,flow.saves)||!retainedRows(previous.tombstones,flow.tombstones)||
      !retainedMap(previous.receipts,flow.receipts)||!retainedMap(target.transferApprovals||{},source.transferApprovals||{})||
      !Object.entries(previous.sequences).every(([key,value])=>(flow.sequences[key]??-1)>=value)||
      !Object.entries(target.reservedCodes).every(([key,codes])=>codes.every(code=>source.reservedCodes[key]?.includes(code))))throw new DraftConflict('HANDOFF_HISTORY_DIVERGED');
  }
  if(state.revision!==body.targetRevision)throw new DraftConflict('HANDOFF_TARGET_REVISION_CHANGED');
  if(typeof body.operationId!=='string'||!body.operationId)throw new DraftConflict('OPERATION_ID_REQUIRED',422);
  const missingPhotos=[];for(const id of photoIds)if(!await env.STATE_ARCHIVE.head('tooling/photos/'+id))missingPhotos.push(id);
  const summary={sourceDigest,targetRevision:state.revision,activeVersionId:source.activeVersionId,versions:source.versions.length,cases:flow.cases.length,tools:flow.active.content.tools.length,photos:photoIds.length,missingPhotos};
  if(body.preview)return reply(summary);
  if(missingPhotos.length)throw new DraftConflict('HANDOFF_PHOTOS_MISSING',422,{missingPhotos});
  const backupId=crypto.randomUUID();
  const backup=await env.DB.prepare('INSERT INTO state_backups(id,revision,"values",reason,actor,created_at) SELECT ?,revision,"values",?,?,? FROM shared_state WHERE id=1 AND revision=?').bind(backupId,'tooling Local handoff '+body.operationId,actor.id,new Date().toISOString(),state.revision).run();
  if(backup.meta.changes!==1)throw new DraftConflict('HANDOFF_TARGET_REVISION_CHANGED');
  const at=new Date().toISOString(),prepared=state.recordStorage?new Map([['toolingMasterControl',source]]):undefined;
  const values={...state.values,toolingMasterControl:prepared?'null':JSON.stringify(source)};
  const write=await env.DB.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1 AND revision=?').bind(state.revision+1,await encodeValues(values,state,prepared),at,state.revision).run();
  if(write.meta.changes!==1)throw new DraftConflict('HANDOFF_TARGET_REVISION_CHANGED');
  return reply({...summary,revision:state.revision+1,actor:actor.id,at,operationId:body.operationId,backupId});
 }catch(error){if(error instanceof DraftConflict)return reply({error:error.code,details:error.details},error.status);return reply({error:'HANDOFF_FAILED'},422);}
}
