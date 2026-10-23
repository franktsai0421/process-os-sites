// Explicitly unknown capacity is an operator-approved finite attempt, never a
// claim about provider quota. No secret or client-supplied budget is accepted.
const fail=(v,c)=>{if(!v)throw Error(c);};
export const boundedAttemptSite='appgprj_6ad9abaff47c8191846eb9821034696b';
export const attemptCeilings={writeBytes:17_917_940_289,writeCalls:30_000,requests:60_000,dbBytes:128*1024**2,dbStatements:100_000};
export function validateAttemptPolicy(policy,pins,now=Date.now()){
 fail(policy&&policy.mode==='bounded-attempt'&&policy.capacityKnown===false,'IMPORT_ATTEMPT_CONFIGURATION');
 const fields=['mode','capacityKnown','approvalId','projectId','origin','ownerId','targetFingerprint','manifestSha256','issuedAt','expiresAt',...Object.keys(attemptCeilings)];
 fail(Object.keys(policy).length===fields.length&&Object.keys(policy).every(k=>fields.includes(k)),'IMPORT_ATTEMPT_CONFIGURATION');
 fail(pins.projectId===boundedAttemptSite&&pins.ownerId==='frank'&&/^https:\/\//.test(pins.origin)&&policy.projectId===pins.projectId&&['origin','ownerId','targetFingerprint','manifestSha256'].every(k=>policy[k]===pins[k])&&/^[a-f0-9]{64}$/.test(pins.targetFingerprint)&&/^[a-f0-9]{64}$/.test(pins.manifestSha256),'IMPORT_ATTEMPT_TARGET');
 fail(typeof policy.approvalId==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(policy.approvalId),'IMPORT_ATTEMPT_CONFIGURATION');
 const issued=Date.parse(policy.issuedAt),expires=Date.parse(policy.expiresAt);
 fail(Number.isFinite(issued)&&Number.isFinite(expires)&&issued<=now&&expires>now&&expires>issued&&expires-issued<=7*24*3600_000,'IMPORT_ATTEMPT_EXPIRED');
 for(const [key,ceiling]of Object.entries(attemptCeilings))fail(Number.isSafeInteger(policy[key])&&policy[key]>0&&policy[key]<=ceiling,'IMPORT_ATTEMPT_LIMIT');
 return Object.fromEntries(fields.map(k=>[k,policy[k]]));
}
export function assertAttemptPlan(plan,policy,now=Date.now()){
 validateAttemptPolicy(policy,{...plan.target,...plan.pins},now);
 fail(plan.summary.r2PeakLowerBoundBytes<=policy.writeBytes&&plan.summary.chunks+plan.summary.resources+1<=policy.writeCalls,'IMPORT_ATTEMPT_PLAN_LIMIT');
}
