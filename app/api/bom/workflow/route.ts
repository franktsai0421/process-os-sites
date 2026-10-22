import {versionedWorkflowRoute} from '@/lib/versioned-shared-workflow';
import {bomWorkflowAdapter} from '@/lib/bom-workflow';
const route=versionedWorkflowRoute(bomWorkflowAdapter);
export const GET=(request:Request)=>route.GET(request);
export const POST=(request:Request)=>route.POST(request);
