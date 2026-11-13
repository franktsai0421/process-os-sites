import {visibleStageReferences} from '@/lib/master-stage-reference-response';
import type {stageReferences} from '@/lib/master-stage-references';
import {masterPageWorkflowAdapter} from '@/lib/master-page-workflow';
import {versionedWorkflowRoute} from '@/lib/versioned-shared-workflow';
import {responseHeaders} from '@/lib/process-state';
function route(request:Request) {
  const query=new URL(request.url).searchParams,scope=query.get('scope');
  if(query.getAll('scope').length!==1||!['AB','C','LINES'].includes(scope||''))return null;
  return versionedWorkflowRoute(masterPageWorkflowAdapter(scope as 'AB'|'C'|'LINES'));
}
const invalid=()=>Response.json({error:'SCOPE_INVALID'},{status:422,headers:responseHeaders});
export const GET=(request:Request)=>route(request)?.GET(request)||invalid();
export const POST=async(request:Request)=>{
  const response=await(route(request)?.POST(request)||invalid());
  if(response.status!==409)return response;
  const body=await response.clone().json() as {error:string;details?:ReturnType<typeof stageReferences>};
  if(body.error!=='STAGE_IN_USE')return response;
  return Response.json({...body,details:await visibleStageReferences(request,body.details,new URL(request.url).searchParams.get('scope')||'')},{status:409,headers:response.headers});
};
