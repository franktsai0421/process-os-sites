import {versionedWorkflowRoute} from '@/lib/versioned-shared-workflow';
import {toolingWorkflowAdapter} from '@/lib/tooling-workflow';
const route=versionedWorkflowRoute(toolingWorkflowAdapter);
export const GET=(request:Request)=>route.GET(request);
export const POST=(request:Request)=>route.POST(request);
