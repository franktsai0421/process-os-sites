import {env} from 'cloudflare:workers';
import {readState,identity,can,sameOrigin,encodeValues,responseHeaders} from '@/lib/process-state';
import {archivedPieces,catalog,readLedger,effective,transition,stateFor} from '@/lib/piece-calibration.mjs';
import {resetIntent,resetToken,applyReset,ResetConflict} from '@/lib/piece-calibration-reset.mjs';
import {blockingEquipmentStandards,ledgerKey} from '@/lib/piece-calibration-master';
import {calibrationCode,vietnamToday} from '@/lib/routine-equipment';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:responseHeaders});
const masterKey='routineEquipmentControl';
const rights:Record<string,string[]>={newPlan:['routine.create','routine.save'],save:['routine.edit','routine.save'],discard:['routine.edit','routine.save'],branch:['routine.create'],submit:['routine.submit'],withdraw:['routine.withdraw'],approve:['approval.view','routine.approve'],return:['approval.view','routine.return'],resetPreview:['routine.settings','routine.delete'],reset:['routine.settings','routine.delete']};
async function handle(request:Request,write:boolean){
 const flags=env as unknown as Record<string,string>;
 if(flags.PIECE_CALIBRATION_ENABLED!=='1')return reply({error:'DISABLED'},404);
 if(write&&!sameOrigin(request))return reply({error:'ORIGIN'},403);
 try{
  const state=await readState(),v=state.values,actor=await identity(request,state);
  if(!actor||!await can(request,state,'routine.view')||!await can(request,state,'equipment.view'))return reply({error:'FORBIDDEN'},403);
  async function allowed(action:string){
   if(!Object.hasOwn(rights,action))return false;
   if(action.startsWith('reset')&&(actor?.role!=='admin'||flags.PIECE_CALIBRATION_RESET_ENABLED!=='1'))return false;
   for(const key of rights[action])if(!await can(request,state,key))return false;
   return true;
  }
  const revision=state.revision,now=new Date().toISOString(),today=vietnamToday();
  const ledger=readLedger(v[ledgerKey]),master=effective(v[masterKey],calibrationCode);
  if(!write){
   if(new URL(request.url).searchParams.get('pending-count')==='1'){
    if(!await can(request,state,'approval.view'))return reply({error:'FORBIDDEN'},403);
    return reply({identityId:actor.id,revision,pendingCount:ledger.docs.filter((d:{status:string})=>d.status==='pending').length});
   }
   const actions=[];for(const action of Object.keys(rights))if(await allowed(action))actions.push(action);
   const items=catalog(ledger,master,today);
   return reply({revision,actions,items,docs:ledger.docs,archive:archivedPieces(ledger,master,items),today,photoUploadAllowed:actions.includes('save')});
  }
  if(v.maintenanceMode==='1')return reply({error:'MAINTENANCE'},503);
  const cmd=await request.json() as {action:string;id?:string|null;planId?:string;doc?:string;revision?:number;confirm?:string;token?:string};
  if(!cmd||typeof cmd.action!=='string')return reply({error:'ACTION'},400);
  if(!await allowed(cmd.action))return reply({error:'FORBIDDEN'},403);
  const all=cmd.id===null&&cmd.planId===undefined;
  if(cmd.action==='reset'&&!all&&(typeof cmd.planId!=='string'||!cmd.planId||cmd.id!==undefined))return reply({error:'SCOPE'},400);
  if(cmd.action==='reset'&&cmd.confirm===(all?'RESET all':'RESET round')&&typeof cmd.token==='string'){
   const prior=ledger.audit.find((a:{intentDigest:string;action:string;actorId:string;baseRevision:number;planId:string|null;scope:string})=>a.action==='calibration-reset'&&a.intentDigest===cmd.token&&a.actorId===actor.id&&a.baseRevision===cmd.revision&&a.scope===(all?'all':'round')&&a.planId===(all?null:cmd.planId));
   if(prior)return reply({revision,resetAppliedAtRevision:prior.resultRevision});
  }
  if(cmd.revision!==revision)return reply({error:'REVISION'},409);
  let next,doc;
  if(cmd.action.startsWith('reset')){
   if(!master)return reply({error:'EMPTY'},422);
   const intent=resetIntent({master:JSON.parse(v[masterKey]),ledger,revision},cmd.id,today,cmd.planId);
   const token=await resetToken(intent.preview);
   if(cmd.action==='resetPreview')return reply({...intent.preview,token});
   if(cmd.confirm!==(all?'RESET all':'RESET round')||token!==cmd.token)return reply({error:'CONFIRM'},400);
   next=applyReset(intent,{actorId:actor.id,at:now,token});
  }else{
   next=transition(ledger,master,cmd,{actor,now,today,uid:()=>crypto.randomUUID()});
   const target=next.docs.find((d:{id:string})=>d.id===cmd.doc);
   if(cmd.action==='newPlan')doc=next.docs.at(-1)?.id;
   if(target&&['save','submit','approve'].includes(cmd.action)){
    for(const id of new Set<string>(target.rows.flatMap((r:{photos:string[]})=>r.photos)))if(ledger.revokedPhotos?.includes(id)||!await env.STATE_ARCHIVE.head('piece-calibration/photos/'+id))return reply({error:'PHOTO_MISSING'},422);
    if(cmd.action==='approve'&&target.kind==='scrapRequest'){
     const modules=blockingEquipmentStandards(v,target.ids[0]);
     if(modules.length)return reply({error:'EQUIPMENT_STILL_REFERENCED',modules},409);
    }
   }
  }
  const full=JSON.parse(v[masterKey]),blocked=new Set<string>(next.retired.map((r:{id:string})=>r.id));
  for(const row of master?.equipment||[])if(['failed','suspended','retired'].includes(stateFor(next,row,today).status))blocked.add(row.id);
  const index=[...blocked].sort(),values:Record<string,string>={...v,[ledgerKey]:JSON.stringify(next)};
  if(JSON.stringify(full.calibrationUnavailable||[])!==JSON.stringify(index)){
   if(index.length)full.calibrationUnavailable=index;else delete full.calibrationUnavailable;
   values[masterKey]=JSON.stringify(full);
  }
  const encoded=await encodeValues(values,state);
  if(!await allowed(cmd.action))return reply({error:'FORBIDDEN'},403);
  const result=await env.DB.prepare('UPDATE shared_state SET revision=?, "values"=?, updated_at=? WHERE id=1 AND revision=?').bind(revision+1,encoded,now,revision).run();
  return result.meta.changes===1?reply({revision:revision+1,...(doc?{doc}:{}),...(cmd.action==='reset'?{resetAppliedAtRevision:revision+1}:{})}):reply({error:'REVISION'},409);
 }catch(e){
  if(e instanceof ResetConflict)return reply({error:e.message,blockers:e.blockers},409);
  const code=e instanceof Error?e.message:'';
  return /^[A-Z_]{2,40}$/.test(code)?reply({error:code},422):reply({error:'CALIBRATION_UNAVAILABLE'},503);
 }
}
export const GET=(r:Request)=>handle(r,false);
export const POST=(r:Request)=>handle(r,true);
