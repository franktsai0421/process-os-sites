import {navigationTiming,timingEnabled} from '@/lib/navigation-timing';
import {env} from 'cloudflare:workers';
import {fqcWorkflowAdapter} from '@/lib/fqc-workflow';
import {versionedWorkflowRoute} from '@/lib/versioned-shared-workflow';
const timedGET=(request:Request)=>versionedWorkflowRoute(fqcWorkflowAdapter()).GET(request);
export const POST=(request:Request)=>versionedWorkflowRoute(fqcWorkflowAdapter()).POST(request);

export const GET=(request:Request)=>navigationTiming(request,timingEnabled(env as typeof env & {PROCESS_NAVIGATION_TIMING?:string;PROCESS_NAVIGATION_TIMING_UNTIL?:string}),()=>timedGET(request));
