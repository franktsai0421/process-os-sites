import {versionedWorkflowRoute} from '@/lib/versioned-shared-workflow';
import {abWorkflowAdapter} from '@/lib/ipqc-ab-workflow';
import {abModuleWorkflowAdapter} from '@/lib/ipqc-ab-module-workflow';
const route=(request:Request)=>new URL(request.url).searchParams.get('module')==='1'?versionedWorkflowRoute(abModuleWorkflowAdapter()):versionedWorkflowRoute(abWorkflowAdapter(new URL(request.url).searchParams.get('scope')||''));
export async function GET(request:Request){if(new URL(request.url).pathname!=='/api/ipqc-ab/workflow')return Response.json({error:'NOT_FOUND'},{status:404});return route(request).GET(request);}
export async function POST(request:Request){if(new URL(request.url).pathname!=='/api/ipqc-ab/workflow')return Response.json({error:'NOT_FOUND'},{status:404});return route(request).POST(request);}
