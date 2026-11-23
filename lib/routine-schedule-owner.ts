import type { identity } from './process-state';

// identity() derives primary from the stored account and verifies the platform session.
export function isRoutineScheduleOwner(actor: Awaited<ReturnType<typeof identity>>) {
  return actor?.primary === true && actor.sessionType === 'platform';
}

// Current stored role plus a verified application session; never a client claim.
export function isRoutineAdmin(actor: Awaited<ReturnType<typeof identity>>) {
  return actor?.role === 'admin' && actor.sessionType === 'platform';
}
