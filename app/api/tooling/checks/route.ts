import {versionedWorkflowRoute} from '@/lib/versioned-shared-workflow';
import {toolingWorkflowAdapter} from '@/lib/tooling-workflow';
import {toolingIssues} from '@/lib/tooling';
import {GET as iqcGET} from '../iqc/route';
import {toolingIqcIssues,type ToolingIqcPart} from '@/lib/tooling-iqc';
const route=versionedWorkflowRoute(toolingWorkflowAdapter);
export async function GET(request:Request){const url=new URL(request.url);url.search='?caseMetadata=1';const response=await route.GET(new Request(url,request));if(!response.ok)return response;const {control}=await response.json() as {control:ReturnType<typeof toolingWorkflowAdapter.parse>};const flow=control.workflow,source=await iqcGET(new Request(url,request)),parts=source.ok?(await source.json() as {parts:ToolingIqcPart[]}).parts:null;const issues=(s:Parameters<typeof toolingIssues>[0])=>[...toolingIssues(s),...(parts?toolingIqcIssues(s,parts):s.tools.filter(t=>t.iqcIds.length).map(t=>({kind:'missing' as const,path:['tools',{id:t.id},'iqcIds'],message:'Không tải được nguồn IQC; giữ liên kết / IQC來源載入失敗；保留引用'})))];return Response.json({generation:flow?.generation,revision:flow?.revision,working:flow?issues(flow.working):[],saved:flow?.saved?issues(flow.saved.content):null},{headers:{'Cache-Control':'no-store'}});}
