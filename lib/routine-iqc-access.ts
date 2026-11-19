import { can, identity, readState, type State } from './process-state';
import { DraftConflict } from './shared-draft';
export const routineIqcAuthorityKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode','routineFqcEnabled'];
export async function routineIqcAccess(request:Request,state:State){
  const actor=await identity(request,state);
  if(!actor)throw new DraftConflict('LOGIN_REQUIRED',401);
  if(!await can(request,state,'routine.view')||!await can(request,state,'iqc.view'))throw new DraftConflict('FORBIDDEN',403);
  if(state.values.routineFqcEnabled!=='1')throw new DraftConflict('NOT_FOUND',404);
  const [edit,save,submit,withdraw,approve,returned,create,remove,settings]=await Promise.all(
    ['edit','save','submit','withdraw','approve','return','create','delete','settings'].map(action=>can(request,state,'routine.'+action)));
  const review=await can(request,state,'approval.view');
  return {actor,permissions:{view:true,edit,save,submit,withdraw,
    approve:review&&approve&&await can(request,state,'approval.approve'),
    return:review&&returned&&await can(request,state,'approval.return'),
    create,delete:remove,settings,history:true}};
}
export const readRoutineIqcAuthority=()=>readState({keys:routineIqcAuthorityKeys});
