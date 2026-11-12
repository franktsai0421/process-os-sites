import {companyReader,type State} from './process-state';

// C module submission/withdrawal grants never authorize final platform review.
// Read existing effective cells directly: legacy approval aliases are scoped by
// the caller URL and would otherwise resolve back to ipqc-c.approve/return.
export async function ipqcCFinalReviewAllowed(request:Request,state:State,operation:'approve'|'return') {
  const reader=await companyReader(request,state);
  return !!reader&&reader.canRead('ipqc-c.view')&&reader.canRead('approval.view')&&reader.canRead('approval.'+operation);
}
