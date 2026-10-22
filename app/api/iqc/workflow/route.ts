import { versionedWorkflowRoute } from '@/lib/versioned-shared-workflow';
import { iqcWorkflowAdapter } from '@/lib/iqc-workflow';
const route=versionedWorkflowRoute(iqcWorkflowAdapter);
export const GET=(request:Request)=>route.GET(request);
export const POST=(request:Request)=>route.POST(request);
