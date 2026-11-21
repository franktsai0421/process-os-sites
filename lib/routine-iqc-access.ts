import { isRoutineScheduleOwner } from '@/lib/routine-schedule-owner';
import { can, identity, readState, type State } from './process-state';
import { DraftConflict } from './shared-draft';
export const routineIqcAuthorityKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','routineFqcEnabled'];
export async function routineIqcAccess(request:Request,state:State,phase?:{actor:Awaited<ReturnType<typeof identity>>;allowed:(key:string)=>boolean}){
  const actor=phase?phase.actor:await identity(request,state);
  const check=(key:string)=>phase?Promise.resolve(phase.allowed(key)):can(request,state,key);
  if(!actor)throw new DraftConflict('LOGIN_REQUIRED',401);
  if(!await check('routine.view')||!await check('iqc.view'))throw new DraftConflict('FORBIDDEN',403);
  if(state.values.routineFqcEnabled!=='1')throw new DraftConflict('NOT_FOUND',404);
  const [edit,save,submit,withdraw,approve,returned,create,remove,settings]=await Promise.all(
    ['edit','save','submit','withdraw','approve','return','create','delete','settings'].map(action=>check('routine.'+action)));
  const review=await check('approval.view');
  return {actor,permissions:{view:true,edit,save,submit,withdraw,
    approve:review&&approve&&await check('approval.approve'),
    return:review&&returned&&await check('approval.return'),
    create,delete:remove,settings:settings&&isRoutineScheduleOwner(actor),history:true}};
}
export const readRoutineIqcAuthority=()=>readState({keys:routineIqcAuthorityKeys});
