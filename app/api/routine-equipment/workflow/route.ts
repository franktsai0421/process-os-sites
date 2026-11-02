import {navigationTiming,timingEnabled} from '@/lib/navigation-timing';
import {env} from 'cloudflare:workers';
import {versionedWorkflowRoute} from '@/lib/versioned-shared-workflow';
import {equipmentWorkflowAdapter} from '@/lib/equipment-workflow';
const route=versionedWorkflowRoute(equipmentWorkflowAdapter);
const timedGET=(request:Request)=>route.GET(request);
export const POST=(request:Request)=>route.POST(request);

export const GET=(request:Request)=>navigationTiming(request,timingEnabled(env as typeof env & {PROCESS_NAVIGATION_TIMING?:string;PROCESS_NAVIGATION_TIMING_UNTIL?:string}),()=>timedGET(request));
