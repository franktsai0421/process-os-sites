import {readState,can,identity,responseHeaders} from '@/lib/process-state';
import {effectiveAccess} from '@/lib/user-access';
import {ipqcChoices,referencesFor,legacyWorkspace,type ProcessReference} from '@/lib/process-ipqc';
import type {AuthoringControl} from '@/lib/process-authoring-workflow';
import {stableDraftJSON} from '@/lib/shared-draft';
import {env} from 'cloudflare:workers';
import {isImmutableRecordBody,readImmutableRecord} from '@/lib/state-records';

export async function GET(request:Request){
 try{
  const q=new URL(request.url).searchParams,candidates=q.get('mode')==='choices',historyPage=q.get('mode')==='history';
  const keys=['platformUsers','processCustomRoles','processRoleTemplateOverrides',...(candidates?['masterDataControl',q.get('line')==='C'?'ipqcCMasterControl':'ipqcABMasterControl']:[])];
  // Authenticate and compare revision before reading any process snapshot bodies.
  const state=await readState({keys,deferHistory:true,deferDependencyHistory:true,modelKey:candidates?'masterDataControl':undefined}),actor=await identity(request,state);
  if(!actor)return Response.json({error:'LOGIN_REQUIRED'},{status:401,headers:responseHeaders});
  const editor=await can(request,state,'view:editor'),reviewer=await can(request,state,'view:approval'),data=await can(request,state,'view:data');
  if(candidates?!editor:!data&&!editor&&!reviewer)return Response.json({error:'VIEW_FORBIDDEN'},{status:403,headers:responseHeaders});
  const user=JSON.parse(state.values.platformUsers||'[]').find((u:{id:string})=>u.id===actor.id),access=effectiveAccess(user,state.values),allowed=(line:string)=>actor.role==='admin'||access.lines.includes(line);
  if(candidates){const line=q.get('line')||'',category=q.get('category')||'',stage=q.get('stage')||'';
   if(!allowed(line))return Response.json({error:'LINE_VIEW_FORBIDDEN'},{status:403,headers:responseHeaders});
   return Response.json({revision:state.revision,...ipqcChoices(state.values,{line,category},stage,q.getAll('product'),state.recordStorage?.models.get('masterDataControl'))},{headers:responseHeaders});
  }
  const privateView=editor||reviewer,canReadHistory=privateView&&await can(request,state,'approval.compare');
  if(historyPage&&!canReadHistory)return Response.json({error:'HISTORY_FORBIDDEN'},{status:403,headers:responseHeaders});
  if(historyPage&&q.has('revision')&&q.get('revision')!==String(state.revision))return Response.json({error:'REFERENCE_CHANGED'},{status:409,headers:responseHeaders});
  if(!historyPage&&q.get('revision')===String(state.revision))return Response.json({revision:state.revision,unchanged:true,canReadHistory},{headers:responseHeaders});
  const offset=Number(q.get('offset')||0),limit=Number(q.get('limit')||10);
  if(historyPage&&(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>20))return Response.json({error:'INVALID_PAGE'},{status:400,headers:responseHeaders});
  // Read compact records directly: the general decoder also expands legacy/unadopted
  // histories. Only the selected version page is hydrated here, without storage changes.
  const readValue=async(key:string)=>{const ref=state.recordStorage?.envelope.__processRecords.values[key];return ref?await readImmutableRecord(env.STATE_ARCHIVE,ref):state.values[key];};
  const body=async<T,>(value:T):Promise<T>=>isImmutableRecordBody(value)?JSON.parse(await readImmutableRecord(env.STATE_ARCHIVE,value.__immutableBody)):value;
  let nextOffset:number|null=null;
  const page=<T,>(versions:T[]):T[]=>{nextOffset=offset+limit<versions.length?offset+limit:null;return versions.slice(offset,offset+limit);};
  let refs:ProcessReference[]=[];
  const raw=await readValue('processAuthoringControl'),control=(raw?JSON.parse(raw):null) as AuthoringControl|null;
  if(control){
   const current=(v:AuthoringControl['versions'][number])=>v.id===control.activeVersionId||privateView&&v.status==='pending';
   const versions=historyPage?page(control.versions.filter(v=>v.status!=='draft'&&!current(v))):control.versions.filter(v=>v.status!=='draft'&&current(v));
   for(const v of versions){
    const snapshot=await body(v.snapshot);
    refs.push(...referencesFor(snapshot.workspaces,{id:v.id,number:v.number,status:v.status,saved:true}));
   }
   if(!historyPage&&privateView&&control.workflow&&!control.workflow.pendingId&&control.versions.some(v=>v.status==='draft')){
    const f=control.workflow,working=await body(f.working),saved=f.saved?await body(f.saved.content):null;refs.push(...referencesFor(working.workspaces,{id:'shared-'+f.generation,number:control.versions.find(v=>v.status==='draft')?.number||'—',status:'working',saved:!!saved&&stableDraftJSON(saved)===stableDraftJSON(working)}));
   }
  }else{
   const legacyKeys=['approvalVersions',...Object.keys(state.recordStorage?.envelope.__processRecords.values||state.values).filter(k=>k.startsWith('processEditor:'))];
   type LegacyVersion=Parameters<typeof legacyWorkspace>[0]&{id:string;number:number;status:string};
   const versions:LegacyVersion[]=JSON.parse(await readValue('approvalVersions')||'[]');
   const current=(v:LegacyVersion)=>v.status==='approved'||privateView&&['draft','pending'].includes(v.status);
   for(const v of historyPage?page(versions.filter(v=>!current(v)&&v.status!=='draft')):versions.filter(current))refs.push(...referencesFor([legacyWorkspace(v)],{...v,saved:true}));
   // Legacy workspaces are separate stored values, never browser's unapplied state.
   if(!historyPage&&privateView){
    for(const key of legacyKeys)if(key.startsWith('processEditor:')){const w=JSON.parse(await readValue(key)||'null');refs.push(...referencesFor([legacyWorkspace(w)],{id:key,number:'—',status:'working',saved:true}));}
   }
  }
  refs=refs.filter(r=>allowed(r.line)&&(!q.get('source')||r.source===q.get('source'))&&(!q.get('scope')||r.scope===q.get('scope'))&&(!q.get('itemId')||r.itemId===q.get('itemId')));
  return Response.json({revision:state.revision,references:refs,canReadHistory,...(historyPage?{nextOffset}:{})},{headers:responseHeaders});
 }catch{ return Response.json({error:'IPQC_READ_FAILED: Không thể tải / 讀取失敗，請重試'},{status:503,headers:responseHeaders}); }
}
