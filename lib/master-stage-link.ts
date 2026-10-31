import {cloneDraft,DraftConflict,stableDraftJSON,type DraftActor,type SharedDraft} from './shared-draft';
import {masterStageCodes,removedMasterStages,stageReferences} from './master-stage-references';
import {assertStageTemplateAvailable} from './master-process-lock';

type Snapshot=Record<string,unknown>;
type Version={id:string;scope:string;status:string;snapshot:Snapshot;number:number;[key:string]:unknown};
type Root={active:Record<string,Snapshot>;versions:Version[];workflowScopes?:Record<string,SharedDraft<Snapshot>>};
export type StageProcessLink={scope:'PROCESS';baseVersionId:string;added:string[];removed:string[];before:Snapshot;content:Snapshot};
// These are the existing defaultTemplatesForStage presets (20260911-5900), not
// another catalog or a copy of a user's customized template/equipment.
const presets=[['entry','進站','human'],['manual','人工','human'],['manual-inspection','人工檢查','human'],['machine-assembly','機器設定','machine'],['exit','出站','human']];
export function stageDefaultTemplates(code:string){return presets.map(([key,name,mode],index)=>{
 const asset=key+'.png',src='assets/process-templates/'+asset;
 return{id:code+'-FLOW-'+String(index+1).padStart(2,'0'),presetKey:key,presetVersion:'20260911-5900',name,mode,people:1,machineIds:[],media:src,mediaName:asset,mediaType:'image/png',mediaItems:[{src,name:asset,type:'image/png'}],...(key==='machine-assembly'?{equipment:[]}:{})};
});}
export function pendingStageProcessLinks(root:Root){return Object.entries(root.workflowScopes||{}).flatMap(([scope,flow])=>
 (flow.cases as (typeof flow.cases[number]&{linkedProcess?:StageProcessLink})[]).filter(c=>c.status==='pending'&&c.id===flow.pendingId&&c.linkedProcess).map(c=>({scope,id:c.id,link:c.linkedProcess!})));}
export function assertProcessLinkAvailable(root:Root,exceptCaseId?:string){const pending=pendingStageProcessLinks(root).filter(c=>c.id!==exceptCaseId);
 if(pending.length)throw new DraftConflict('LINKED_PROCESS_CASE_PENDING',409,{cases:pending.map(({scope,id})=>({scope,id})),resolveUrl:'/process/?system=process&view=approval'});
}
export function stageProcessLink(root:Root,scope:string,content:Snapshot,values:Record<string,string>,exceptCaseId?:string):StageProcessLink|null{
 const old=new Set(masterStageCodes(root.active[scope])),next=new Set(masterStageCodes(content)),process=root.active.PROCESS||{};
 const added=[...next].filter(code=>!old.has(code)&&!Object.hasOwn(process,code)),removed=[...old].filter(code=>!next.has(code)&&Object.hasOwn(process,code));
 if(!added.length&&!removed.length)return null;
 assertStageTemplateAvailable(root,root.active[scope],content,exceptCaseId);assertProcessLinkAvailable(root,exceptCaseId);
 const impact=stageReferences(values,removedMasterStages(root.active[scope],content),root.active[scope],root);if(impact.total)throw new DraftConflict('STAGE_IN_USE',409,impact);
 const source=root.versions.find(v=>v.scope==='PROCESS'&&v.status==='approved'&&stableDraftJSON(v.snapshot)===stableDraftJSON(process));
 if(!source)throw new DraftConflict('PROCESS_EFFECTIVE_BASELINE_CONFLICT',409);
 const after={...process};for(const code of removed)delete after[code];for(const code of added)after[code]=stageDefaultTemplates(code);
 return{scope:'PROCESS',baseVersionId:source.id,added,removed,before:cloneDraft(process),content:cloneDraft(after)};
}
export function checkPinnedStageProcessLink(root:Root,link:StageProcessLink,caseId:string){
 assertProcessLinkAvailable(root,caseId);
 const source=root.versions.find(v=>v.id===link.baseVersionId&&v.scope==='PROCESS'&&v.status==='approved');
 if(!source||stableDraftJSON(root.active.PROCESS)!==stableDraftJSON(link.before)||stableDraftJSON(source.snapshot)!==stableDraftJSON(link.before))
  throw new DraftConflict('PROCESS_SOURCE_VERSION_CHANGED',409,{baseVersionId:link.baseVersionId,resolveUrl:'/process/?system=process&view=approval'});
}
export function activateStageProcessLink(root:Root,link:StageProcessLink,caseId:string,actor:DraftActor,at:string){
 checkPinnedStageProcessLink(root,link,caseId);
 const id=caseId+'-PROCESS',prior=root.versions.find(v=>v.id===link.baseVersionId)!;prior.status='superseded';
 root.versions.push({id,scope:'PROCESS',number:Math.max(0,...root.versions.filter(v=>v.scope==='PROCESS').map(v=>Number(v.number)))+1,status:'approved',snapshot:cloneDraft(link.content),revision:1,parentVersionId:link.baseVersionId,baseVersionId:link.baseVersionId,linkedCaseId:caseId,creatorId:actor.id,creatorName:actor.name,createdAt:at,updatedAt:at,reviewedBy:actor.name,reviewedAt:at,history:[{action:'approved-linked-stage-change',actorId:actor.id,actorName:actor.name,at,comment:caseId}]});
 root.active.PROCESS=cloneDraft(link.content);
 const idle=root.workflowScopes?.PROCESS;
 if(idle){idle.active={id,content:cloneDraft(link.content)};idle.baseId=id;idle.working=cloneDraft(link.content);idle.generation=crypto.randomUUID();idle.revision+=1;}
}
