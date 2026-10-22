import {masterWorkflowAdapter} from '@/lib/master-workflow';
import {versionedWorkflowRoute} from '@/lib/versioned-shared-workflow';
export const GET=(request:Request)=>versionedWorkflowRoute(masterWorkflowAdapter(new URL(request.url).searchParams.get('scope')||'')).GET(request);
export const POST=(request:Request)=>versionedWorkflowRoute(masterWorkflowAdapter(new URL(request.url).searchParams.get('scope')||'')).POST(request);
