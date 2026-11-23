import {assertNotResetRetired} from './routine-reset-ledger';
import {DraftConflict} from './shared-draft';

// The monotonically increasing *module* revision is the reset generation floor.
// Never use the global shared-state revision: another module must stay writable.
// Check the original command on every CAS retry, before replay or mutation.
export function assertRoutineResetFence(control:{revision:number;resetGenerationRevision?:number},expectedRevision:unknown,operationId?:string){
  if(operationId)assertNotResetRetired(control,operationId);
  if(!Object.hasOwn(control,'resetGenerationRevision'))return;
  const floor=control.resetGenerationRevision;
  if(!Number.isSafeInteger(floor)||floor!<=0||!Number.isSafeInteger(control.revision)||floor!>control.revision)
    throw new DraftConflict('RESET_FENCE_INVALID',409);
  if(!Number.isSafeInteger(expectedRevision)||(Number(expectedRevision)<floor!||Number(expectedRevision)>control.revision))
    throw new DraftConflict('RESET_GENERATION_CHANGED',409);
}
