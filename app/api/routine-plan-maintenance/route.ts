import hosting from '../../../.openai/hosting.json';
import {reconcileRoutinePlans} from '@/lib/routine-plan-maintenance';

declare const __ROUTINE_BUILD_COMMIT__: string;
function handle(request:Request) {
  return reconcileRoutinePlans(request,hosting.project_id,typeof __ROUTINE_BUILD_COMMIT__==='string'?__ROUTINE_BUILD_COMMIT__:'');
}
export const GET=handle;
export const POST=handle;
