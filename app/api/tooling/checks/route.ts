import {versionedWorkflowRoute} from '@/lib/versioned-shared-workflow';
import {toolingWorkflowAdapter} from '@/lib/tooling-workflow';
import {toolingIssues} from '@/lib/tooling';
import {toolingChecksInput} from '@/lib/tooling-checks-input';
import {stateRevisionIsCurrent} from '@/lib/process-state';
import {GET as iqcGET} from '../iqc/route';
import {toolingIqcIssues,type ToolingIqcPart} from '@/lib/tooling-iqc';
const route=versionedWorkflowRoute(toolingWorkflowAdapter);
export async function GET(request:Request){
 const url=new URL(request.url);url.search='?caseMetadata=1';
 const read=async()=>{const response=await route.GET(new Request(url,request));return response.ok?toolingChecksInput(await response.json()):response;};
 const input=await read();if(input instanceof Response)return input;
 const {stateRevision,activeVersionId,savedId,generation,revision,hasWorkflow,hasSaved,working,saved}=input;
 const source=await iqcGET(new Request(url,request));
 const iqc=source.ok?await source.json() as {versionId:string;parts:ToolingIqcPart[]}:null,parts=iqc?.parts;
 // Inspection spans tooling and IQC reads. Never label a mixed revision current.
 if(!await stateRevisionIsCurrent({revision:stateRevision}))return Response.json({error:'TOOLING_CHECKS_STALE_RETRY'},{status:409,headers:{'Cache-Control':'no-store'}});
 const issues=(s:Parameters<typeof toolingIssues>[0])=>[...toolingIssues(s),...(parts?toolingIqcIssues(s,parts):s.tools.filter(t=>t.iqcIds.length).map(t=>({kind:'missing' as const,path:['tools',{id:t.id},'iqcIds'],message:'Không tải được nguồn IQC; giữ liên kết / IQC來源載入失敗；保留引用'})))];
 const workingIssues=hasWorkflow?issues(working!):[],savedIssues=hasSaved?issues(saved!):null;
 return Response.json({stateRevision,activeVersionId,savedId,iqcVersionId:iqc?.versionId||null,sourceAvailable:!!iqc,generation,revision,working:workingIssues,saved:savedIssues},{headers:{'Cache-Control':'no-store'}});
}
