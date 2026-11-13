import {can,companyReader,type State} from './process-state';

// Final approval is platform-only; returning for correction follows the same
// module policy as withdrawal. Never resolve final approval through URL aliases.
export async function ipqcCFinalReviewAllowed(request:Request,state:State,operation:'approve'|'return') {
  if(operation==='return')return await can(request,state,'ipqc-c.view')&&await can(request,state,'ipqc-c.return');
  const reader=await companyReader(request,state);
  return !!reader&&reader.canRead('ipqc-c.view')&&reader.canRead('approval.view')&&reader.canRead('approval.'+operation);
}
