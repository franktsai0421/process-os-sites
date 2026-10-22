import {versionedWorkflowRoute} from '@/lib/versioned-shared-workflow';
import {equipmentWorkflowAdapter} from '@/lib/equipment-workflow';
const route=versionedWorkflowRoute(equipmentWorkflowAdapter);
export const GET=(request:Request)=>route.GET(request);
export const POST=(request:Request)=>route.POST(request);
