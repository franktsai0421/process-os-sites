import {fqcWorkflowAdapter} from '@/lib/fqc-workflow';
import {versionedWorkflowRoute} from '@/lib/versioned-shared-workflow';
export const GET=(request:Request)=>versionedWorkflowRoute(fqcWorkflowAdapter()).GET(request);
export const POST=(request:Request)=>versionedWorkflowRoute(fqcWorkflowAdapter()).POST(request);
