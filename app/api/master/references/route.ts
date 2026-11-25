import {boundedJson} from '@/lib/site-security.mjs';
import {readState,identity,can,responseHeaders} from '@/lib/process-state';
import {type MissingEquipmentReference,equipmentReferenceIndex,processMasterReferences,processMasterTargets} from '@/lib/process-master-references';

const accessKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'];
const referenceKeys=[...accessKeys,'masterDataControl','processAuthoringControl','approvalVersions','publishedProcess'];
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:responseHeaders});

async function lookup(request:Request,batch:boolean){
 try{
  const q=new URL(request.url).searchParams,kind=batch?'equipment':q.get('kind'),id=q.get('id');
  const display=batch?'summary':kind==='equipment'&&q.get('view')==='detail'?'detail':null;
  const preflight=await readState({keys:accessKeys});
  if(!await identity(request,preflight)||!await can(request,preflight,'templates.view'))return reply({error:'FORBIDDEN'},403);
  let requested:Set<string>|undefined;
  if(batch){
   if(!await can(request,preflight,'editor.view'))return reply({error:'FORBIDDEN'},403);
   const input=await boundedJson(request,192*1208).catch(()=>null);
   if(!Array.isArray(input?.ids)||!input.ids.length||input.ids.length>192||
    input.ids.some((item:unknown)=>typeof item!=='string'||!item.length||item.length>200))return reply({error:'INVALID_REFERENCE_TARGET'},422);
   requested=new Set<string>(input.ids);
  }else if(!id||!['template','equipment'].includes(kind||'')||id.length>200)return reply({error:'INVALID_REFERENCE_TARGET'},422);
  const state=await readState({...(display?{
   keys:batch?referenceKeys.filter(key=>key!=='publishedProcess'):referenceKeys,includeProcessEditors:!batch,
   projectValue:(key:string,raw:string)=>{
    if(key==='masterDataControl'){
     const root=JSON.parse(raw);
     return JSON.stringify({active:{PROCESS:root.active?.PROCESS},workflowScopes:{PROCESS:{working:root.workflowScopes?.PROCESS?.working}}});
    }
    if(key==='processAuthoringControl'){
     const {workflow}=JSON.parse(raw);
     if(workflow)return JSON.stringify({workflow:{active:workflow.active,
      ...(!batch&&{working:workflow.working,saved:workflow.working==null?workflow.saved:null,
       cases:workflow.cases?.filter((row:{status:string})=>row.status==='pending').map((row:{id:string;status:string;content:unknown})=>({id:row.id,status:row.status,content:row.content}))})}});
    }
    return raw;
   },
  }:{}),deferDependencyHistory:true,deferHistory:true,modelKey:'masterDataControl'});
  if(!await identity(request,state)||!await can(request,state,'templates.view'))return reply({error:'FORBIDDEN'},403);
  const visible=await can(request,state,'editor.view');
  if(display&&!visible)return reply({error:'FORBIDDEN'},403);
  const root=state.recordStorage?.models.get('masterDataControl')??JSON.parse(state.values.masterDataControl||'{}');
  const snapshot=root.workflowScopes?.PROCESS?.working||root.active?.PROCESS||{};
  const catalog=processMasterTargets(snapshot);
  const targets=catalog.filter(t=>t.kind===kind&&(requested?requested.has(t.id):t.id===id||kind==='template'&&Object.values(snapshot).flat().some((x)=>{const row=x as {id:string;catalogKey?:string;presetKey?:string};return row.id===t.id&&(row.catalogKey||row.presetKey||row.id)===id;})));
  if(display){
   const missing=new Map<string,MissingEquipmentReference>();
   const approved=processMasterTargets(root.active?.PROCESS??{});
   const index=equipmentReferenceIndex(state.values,targets,display,approved,batch?missing:undefined);
   if(batch){
    const items=Array.from(index,([id,refs])=>{
     const first=refs.values().next().value;
     const code=first?.number||first?.name||first?.operationId||'';
     const label=first?.stage&&code&&!code.startsWith(first.stage+'-')?first.stage+' · '+code:code;
     return {id,count:refs.size,code:label};
    });
    return reply({revision:state.revision,items,missing:[...missing.values()]});
   }
   if(!targets.length)return reply({error:'REFERENCE_TARGET_NOT_FOUND'},404);
   const refs=[...index.get(id!)!.values()];
   return reply({revision:state.revision,total:refs.length,references:refs.slice(0,100),truncated:refs.length>100,detailsRestricted:false});
  }
  if(!targets.length)return reply({error:'REFERENCE_TARGET_NOT_FOUND'},404);
  const result=processMasterReferences(state.values,targets);
  return reply({...result,revision:state.revision,references:visible?result.references:[],detailsRestricted:!visible&&result.total>0});
 }catch{return reply({error:'REFERENCE_CHECK_FAILED'},503);}
}
export function GET(request:Request){return lookup(request,false);}
export function POST(request:Request){return lookup(request,true);}
