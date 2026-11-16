import {readState,identity,can,stateRevisionIsCurrent,responseHeaders} from '@/lib/process-state';
import {parseTooling} from '@/lib/tooling-workflow';
import {DraftConflict} from '@/lib/shared-draft';
import {toolingIssues} from '@/lib/tooling';
import {toolingChecksInput} from '@/lib/tooling-checks-input';
import {GET as iqcGET} from '../iqc/route';
import {toolingIqcIssues,type ToolingIqcPart} from '@/lib/tooling-iqc';

const authKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'];
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:responseHeaders});
export async function GET(request:Request){
 // Same permission and selected-state fences as the workflow reader, without
 // evaluating unrelated write buttons or serializing an unused full response.
 let state:Awaited<ReturnType<typeof readState>>,input:ReturnType<typeof toolingChecksInput>,actorId:string;
 try{
  const preflight=await readState({keys:authKeys,aggregateReadAhead:true});
  const before=await identity(request,preflight);
  if(!before||!await can(request,preflight,'tooling.view'))return reply({error:'FORBIDDEN'},403);
  state=preflight.recordStorage?await readState({keys:[...authKeys,'toolingMasterControl'],modelKey:'toolingMasterControl',deferHistory:true,deferDependencyHistory:true,aggregateReadAhead:true}):preflight;
  const actor=await identity(request,state);
  if(!actor||!await can(request,state,'tooling.view'))return reply({error:'FORBIDDEN'},403);
  actorId=actor.id;
  input=toolingChecksInput({revision:state.revision,control:parseTooling(state.values.toolingMasterControl,state.recordStorage?.models.get('toolingMasterControl'))});
 }catch(error){return reply({error:error instanceof DraftConflict?error.code:'WORKFLOW_LOAD_FAILED'},error instanceof DraftConflict?error.status:503);}
 const {stateRevision,activeVersionId,savedId,generation,revision,hasWorkflow,hasSaved,working,saved}=input;
 const url=new URL(request.url);url.search='?caseMetadata=1';
 // Retain the exact IQC authority, historical-source hydration and failure path.
 const source=await iqcGET(new Request(url,request));
 const iqc=source.ok?await source.json() as {versionId:string;parts:ToolingIqcPart[]}:null,parts=iqc?.parts;
 if(!await stateRevisionIsCurrent({revision:stateRevision}))return Response.json({error:'TOOLING_CHECKS_STALE_RETRY'},{status:409,headers:{'Cache-Control':'no-store'}});
 const terminal=await identity(request,state);
 if(!terminal||terminal.id!==actorId)return reply({error:'FORBIDDEN'},403);
 const issues=(s:Parameters<typeof toolingIssues>[0])=>[...toolingIssues(s),...(parts?toolingIqcIssues(s,parts):s.tools.filter(t=>t.iqcIds.length).map(t=>({kind:'missing' as const,path:['tools',{id:t.id},'iqcIds'],message:'Không tải được nguồn IQC; giữ liên kết / IQC來源載入失敗；保留引用'})))];
 const workingIssues=hasWorkflow?issues(working!):[],savedIssues=hasSaved?issues(saved!):null;
 return Response.json({stateRevision,activeVersionId,savedId,iqcVersionId:iqc?.versionId||null,sourceAvailable:!!iqc,generation,revision,working:workingIssues,saved:savedIssues},{headers:{'Cache-Control':'no-store'}});
}
