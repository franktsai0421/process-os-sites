import {versionedWorkflowRoute} from '@/lib/versioned-shared-workflow';
import {abWorkflowAdapter} from '@/lib/ipqc-ab-workflow';
import {abModuleWorkflowAdapter} from '@/lib/ipqc-ab-module-workflow';
const route=(request:Request)=>new URL(request.url).searchParams.get('module')==='1'?versionedWorkflowRoute(abModuleWorkflowAdapter()):versionedWorkflowRoute(abWorkflowAdapter(new URL(request.url).searchParams.get('scope')||''));
export async function GET(request:Request){return route(request).GET(request);}
export async function POST(request:Request){return route(request).POST(request);}
