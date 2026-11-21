import type { identity } from './process-state';

// identity() derives primary from the stored account and verifies the platform session.
export function isRoutineScheduleOwner(actor: Awaited<ReturnType<typeof identity>>) {
  return actor?.primary === true && actor.sessionType === 'platform';
}
