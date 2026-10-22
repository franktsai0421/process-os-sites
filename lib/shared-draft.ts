// V3 transition kernel. Persistence must commit the returned aggregate with CAS;
// never publish its receipt or projections before that transaction succeeds.
export type DraftActor = { id: string; name: string; admin: boolean };
export type DraftPermission = 'view' | 'edit' | 'save' | 'submit' | 'withdraw' | 'approve' | 'return' | 'history';
export type DraftPath = (string | { id: string })[];
export type DraftPatch =
  | { op: 'set'; path: DraftPath; value: unknown }
  | { op: 'insert'; path: DraftPath; value: { id: string; [key: string]: unknown } }
  | { op: 'remove'; path: DraftPath }
  | { op: 'order'; path: DraftPath; ids: string[] };
export type DraftIssue = { kind: 'error' | 'missing' | 'warning'; path: DraftPath; message: string; code?:string };
type Stamp = { actor: DraftActor; at: string };
export type DraftSave<T> = Stamp & { id: string; revision: number; content: T; contributors: Record<string, Stamp>; reason?:string; source?:string };
export type DraftCase<T> = Stamp & {
  id: string; savedId: string; baseId: string | null; content: T; before: T;
  reason: string; status: 'pending' | 'approved' | 'returned' | 'withdrawn';
  contentIssues?: {policy:'process-platform-v1'|'ipqc-completeness-v1'|'tooling-completeness-v1'|'reviewer-completeness-v2';issues:DraftIssue[]};
  result?: Stamp & { reason: string; selfReview: boolean; contentIssuesConfirmed?:boolean };
};
export type SharedDraft<T> = {
  schemaVersion: 3; scope: string; generation: string; revision: number;
  active: { id: string | null; content: T }; baseId: string | null;
  working: T; saved: DraftSave<T> | null; pendingId: string | null;
  contributors: Record<string, Stamp>; saves: DraftSave<T>[]; cases: DraftCase<T>[];
  tombstones: string[]; sequences: Record<string, number>;
  receipts: Record<string, { actorId: string; fingerprint: string; result: DraftReceipt }>;
};
export type DraftReceipt = { operationId: string; generation: string; revision: number; savedId: string | null; caseId: string | null; unchanged: boolean };
export type DraftCommand = {
  operationId: string; generation: string; clientId: string; sequence: number;
  action: 'apply' | 'save' | 'submit' | 'withdraw' | 'approve' | 'return' | 'restore';
  patches?: DraftPatch[]; guards?: { path: DraftPath; value: unknown }[];
  savedId?: string; caseId?: string; reason?: string; selfReviewConfirmed?: boolean;
  restoreSaveId?: string; expectedRevision?: number;
  acknowledgedContentIssues?:DraftIssue[]; source?:string;
};
export type DraftContext<T> = {
  // Trusted routine adapter only. Other modules retain their reason requirements.
  optionalReasonPolicy?: 'routine-fqc';
  allocationIndex?:import('./state-records').AllocationIndex;
  actor: DraftActor; at: string; id: () => string;
  allowed: (permission: DraftPermission) => boolean;
  // Pure structural validation and module-specific coupled-field validation.
  structure: (content: T, previous: T) => void;
  validate: (content: T) => DraftIssue[];
  // Only these explicit business codes may be advisory, only in process:platform.
  advisoryCodes?:readonly string[];
  advisoryPolicy?:'ipqc-completeness-v1'|'tooling-completeness-v1';
  semantic: (content: T) => unknown;
  // Must be freshly obtained in the persistence transaction, not from the client.
  activeId: string | null;
  // Trusted adapter may allocate IDs/codes after receiving a module command.
  commandFingerprint?: string;
  // Retain reserved identities as tombstones when a historic snapshot predates them.
  restoreContent?: (historical: T, current: T) => T;
};
export class DraftConflict extends Error {
  constructor(public code: string, public status = 409, public details?:unknown) { super(code); }
}
export const cloneDraft = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function stableDraftJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableDraftJSON).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableDraftJSON((value as Record<string, unknown>)[key])).join(',') + '}';
}
// JSON value equality without materializing two whole canonical JSON strings.
// This matters for live snapshots containing large photos/long Vietnamese text;
// retain key-order-independent equality and ordered arrays, like stableDraftJSON.
export function sameDraftValue(a:unknown,b:unknown):boolean{
 if(a===b)return true;
 if(typeof a==='number'&&!Number.isFinite(a))a=null;
 if(typeof b==='number'&&!Number.isFinite(b))b=null;
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>sameDraftValue(v,b[i]));
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&sameDraftValue((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));
}
const same = sameDraftValue;
function fail(code: string, status = 409): never { throw new DraftConflict(code, status); }
const safeKey = (key: string) => {
  if (!key || ['__proto__', 'prototype', 'constructor'].includes(key)) fail('INVALID_PATH', 422);
  return key;
};
function child(value: unknown, step: string | { id: string }): unknown {
  if (typeof step === 'string') {
    safeKey(step);
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_PATH', 422);
    return (value as Record<string, unknown>)[step];
  }
  if (!step || typeof step.id !== 'string' || !Array.isArray(value)) fail('INVALID_ENTITY_PATH', 422);
  const matches = value.filter(v => v && v.id === step.id);
  if (matches.length !== 1) fail('ENTITY_REMOVED_OR_AMBIGUOUS');
  return matches[0];
}
function atPath(value: unknown, path: DraftPath): unknown {
  if (!Array.isArray(path) || path.length > 32) fail('INVALID_PATH', 422);
  return path.reduce(child, value);
}
function patchContent<T>(state: SharedDraft<T>, patch: DraftPatch) {
  const path = patch.path;
  if (!Array.isArray(path) || !path.length) fail('ROOT_REPLACEMENT_FORBIDDEN', 422);
  if (patch.op === 'insert' || patch.op === 'order') {
    const list = atPath(state.working, path);
    if (!Array.isArray(list)) fail('INVALID_COLLECTION', 422);
    if (patch.op === 'insert') {
      const item = patch.value;
      if (!item || typeof item.id !== 'string' || !item.id || list.some(v => v.id === item.id) ||
          state.tombstones.includes(stableDraftJSON([...path, { id: item.id }]))) fail('ENTITY_ID_RESERVED');
      list.push(cloneDraft(item));
    } else {
      const ids = patch.ids;
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.length !== list.length ||
          list.some(v => !ids.includes(v.id))) fail('COLLECTION_CHANGED_RECONFIRM');
      const ordered = ids.map(id => list.find(v => v.id === id));
      list.splice(0, list.length, ...ordered);
    }
    return;
  }
  const parent = atPath(state.working, path.slice(0, -1));
  const last = path[path.length - 1];
  if (patch.op === 'remove') {
    if (typeof last === 'string' || !Array.isArray(parent)) fail('REMOVE_REQUIRES_ENTITY_ID', 422);
    child(parent, last);
    parent.splice(parent.findIndex(v => v.id === last.id), 1);
    state.tombstones.push(stableDraftJSON(path));
  } else if (patch.op === 'set') {
    if (typeof last !== 'string' || last === 'id' || !parent || typeof parent !== 'object' || Array.isArray(parent)) fail('INVALID_FIELD', 422);
    safeKey(last);
    if (patch.value === undefined) fail('INVALID_VALUE', 422);
    (parent as Record<string, unknown>)[last] = cloneDraft(patch.value);
  } else fail('INVALID_PATCH', 422);
}
export function createSharedDraft<T>(scope: string, content: T, activeId: string | null, generation: string): SharedDraft<T> {
  return { schemaVersion: 3, scope, generation, revision: 0,
    active: { id: activeId, content: cloneDraft(content) }, baseId: activeId,
    working: cloneDraft(content), saved: null, pendingId: null, contributors: {},
    saves: [], cases: [], tombstones: [], sequences: {}, receipts: {} };
}
export function applyDraftCommand<T>(source: SharedDraft<T>, command: DraftCommand, ctx: DraftContext<T>): { state: SharedDraft<T>; receipt: DraftReceipt } {
  const permission: DraftPermission = command.action === 'apply' || command.action === 'restore' ? 'edit' : command.action;
  if (!ctx.allowed('view') || !ctx.allowed(permission)) fail('FORBIDDEN', 403);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(command.operationId || '') || !/^[a-zA-Z0-9_-]{8,100}$/.test(command.clientId || '') ||
      !Number.isSafeInteger(command.sequence) || command.sequence < 1) fail('INVALID_OPERATION', 422);
  const fingerprint = ctx.commandFingerprint || stableDraftJSON(command);
  const oldReceipt = source.receipts[command.operationId];
  if (oldReceipt) {
    if (oldReceipt.actorId !== ctx.actor.id || oldReceipt.fingerprint !== fingerprint) fail('OPERATION_ID_REUSED');
    return { state: source, receipt: cloneDraft(oldReceipt.result) };
  }
  if (command.generation !== source.generation) fail('STALE_GENERATION');
  if(command.expectedRevision!==undefined&&command.action!=='restore'&&command.expectedRevision!==source.revision)fail('DRAFT_REVISION_CHANGED_RECONFIRM');
  const clientKey = stableDraftJSON([ctx.actor.id, command.clientId]);
  if (command.sequence <= (source.sequences[clientKey] || 0)) fail('STALE_CLIENT_OPERATION');
  // Saved/history content is immutable. Copy only the live draft and mutable
  // indexes, not every historical photo/text snapshot for each small edit.
  const state:SharedDraft<T>={...source,working:cloneDraft(source.working),
    contributors:{...source.contributors},saves:[...source.saves],cases:[...source.cases],
    tombstones:[...source.tombstones],sequences:{...source.sequences},receipts:{...source.receipts}};
  const stamp: Stamp = { actor: cloneDraft(ctx.actor), at: ctx.at };
  let unchanged = false;
  // Completeness belongs to the reviewer; malformed data and structural guards do not.
  const check=(content:T)=>{const issues=ctx.validate(content),advisory=issues.filter(i=>i.kind==='missing'||source.scope==='process:platform'&&ctx.advisoryCodes?.includes(i.message.split(':')[0]));
    const blocking=issues.filter(i=>i.kind!=='warning'&&!advisory.includes(i));if(blocking.length)throw new DraftConflict('VALIDATION_FAILED',422,{issues});return advisory.map(i=>({...cloneDraft(i),kind:'missing' as const}));};
  const review = ['withdraw', 'approve', 'return'].includes(command.action);
  if (state.pendingId && !review) fail('PENDING_LOCKED');
  if (review) {
    const caseIndex=state.cases.findIndex(c=>c.id===command.caseId);
    const reviewCase=caseIndex<0?undefined:{...state.cases[caseIndex]};
    if (!reviewCase || state.pendingId !== reviewCase.id || reviewCase.status !== 'pending') fail('CASE_NOT_PENDING');
    const selfReview = command.action !== 'withdraw' && reviewCase.actor.id === ctx.actor.id;
    if (selfReview && !command.selfReviewConfirmed) fail('SELF_REVIEW_CONFIRM_REQUIRED');
    if (command.action !== 'approve' && !command.reason?.trim() && !(command.action === 'withdraw' && ctx.optionalReasonPolicy === 'routine-fqc' && source.scope.startsWith('routine-fqc:'))) fail('REASON_REQUIRED', 422);
    if (command.action === 'approve') {
      if (ctx.activeId !== reviewCase.baseId) fail('ACTIVE_VERSION_CHANGED');
      const currentIssues=check(reviewCase.content),issues=reviewCase.contentIssues?.issues||currentIssues;
      if(source.scope==='process:platform'&&issues.length){if(!same(command.acknowledgedContentIssues,issues))throw new DraftConflict('CONTENT_ISSUES_CONFIRM_REQUIRED',409,{issues});
        // Legacy cases acquire this explicit review-time record only on review.
        reviewCase.contentIssues ||= {policy:'process-platform-v1',issues:cloneDraft(issues)};
      }
      state.active = { id: reviewCase.id, content: cloneDraft(reviewCase.content) };
      reviewCase.status = 'approved';
    } else reviewCase.status = command.action === 'withdraw' ? 'withdrawn' : 'returned';
    reviewCase.result = { ...stamp, reason: command.reason?.trim() || '', selfReview,...(source.scope==='process:platform'&&command.action==='approve'&&reviewCase.contentIssues?.issues.length?{contentIssuesConfirmed:true}:{}) };
    state.cases[caseIndex]=reviewCase;
    state.pendingId = null;
    state.generation = ctx.id();
    state.working = cloneDraft(reviewCase.content);
    state.contributors = {};
    state.baseId = state.active.id;
    // Returning/withdrawing retains the exact successful saved snapshot for resubmission.
    if (command.action === 'approve') state.saved = null;
  } else if (command.action === 'apply') {
    if (!Array.isArray(command.patches) || command.patches.length > 256) fail('INVALID_PATCHES', 422);
    for (const guard of command.guards || []) if (!same(atPath(state.working, guard.path), guard.value)) throw new DraftConflict('DEPENDENCY_CHANGED_RECONFIRM',409,{path:guard.path});
    for (const patch of command.patches) patchContent(state, patch);
    ctx.structure(state.working, source.working);
    unchanged = same(state.working, source.working);
    if (!unchanged) for (const patch of command.patches) state.contributors[stableDraftJSON(patch.path)] = stamp;
  } else if (command.action === 'restore') {
    if (!ctx.allowed('history')) fail('FORBIDDEN', 403);
    if (command.expectedRevision !== source.revision) fail('RESTORE_RECONFIRM');
    const saved = state.saves.find(s => s.id === command.restoreSaveId);
    if (!saved) fail('SAVE_NOT_FOUND', 404);
    state.working = ctx.restoreContent ? ctx.restoreContent(cloneDraft(saved.content), source.working) : cloneDraft(saved.content);
    ctx.structure(state.working, source.working);
    unchanged = same(state.working, source.working);
    if (!unchanged) state.contributors['[]'] = stamp;
  } else if (command.action === 'save') {
    unchanged = !!state.saved && same(state.working, state.saved.content);
    if (!unchanged) {
      state.saved = { ...stamp, id: ctx.id(), revision: source.revision, content: cloneDraft(state.working), contributors: cloneDraft(state.contributors),...(command.reason?.trim()?{reason:command.reason.trim()}:{}),...(command.source?.trim()?{source:command.source.trim()}:{} ) };
      // Saved records are immutable; subsequent commands replace saved, never
      // mutate it. Share the request-local body instead of copying every photo.
      state.saves.push(state.saved);
      state.contributors = {};
    }
  } else if (command.action === 'submit') {
    if (!state.saved) fail('SUCCESSFUL_SAVE_REQUIRED');
    if (command.savedId !== state.saved.id) fail('SAVED_VERSION_CHANGED_RECONFIRM');
    if (!command.reason?.trim() && !(ctx.optionalReasonPolicy === 'routine-fqc' && source.scope.startsWith('routine-fqc:'))) fail('REASON_REQUIRED', 422);
    if (ctx.activeId !== state.baseId) fail('ACTIVE_VERSION_CHANGED');
    const issues=check(state.saved.content);
    if(state.active.id&&same(ctx.semantic(state.saved.content),ctx.semantic(state.active.content)))issues.push({kind:'missing',code:'NO_SUBSTANTIVE_CHANGE',path:[],message:'NO_SUBSTANTIVE_CHANGE'});
    const reviewCase: DraftCase<T> = { ...stamp, id: ctx.id(), savedId: state.saved.id,
      baseId: state.baseId, before: cloneDraft(state.active.content), content: cloneDraft(state.saved.content),
      reason: command.reason?.trim() || '', status: 'pending',contentIssues:{policy:source.scope==='process:platform'?'process-platform-v1' as const:'reviewer-completeness-v2' as const,issues} };
    state.cases.push(reviewCase); state.pendingId = reviewCase.id;
  } else fail('INVALID_ACTION', 422);
  state.sequences[clientKey] = command.sequence;
  if (!unchanged) state.revision += 1;
  const receipt: DraftReceipt = { operationId: command.operationId, generation: state.generation,
    revision: state.revision, savedId: state.saved?.id || null, caseId: state.pendingId, unchanged };
  state.receipts[command.operationId] = { actorId: ctx.actor.id, fingerprint, result: cloneDraft(receipt) };
  return { state, receipt };
}
