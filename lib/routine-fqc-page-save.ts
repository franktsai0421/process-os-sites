import {
  applyDraftCommand, cloneDraft, DraftConflict, sameDraftValue, stableDraftJSON,
  type DraftContext, type DraftPatch, type SharedDraft,
} from './shared-draft';
import { docStatus, validateRoutineContentEdit, type Content, type RoutineFqc } from './routine-fqc';
import type { ModuleDraftCommand } from './versioned-shared-workflow';

export type RoutinePageContent = { documents: { id: string; content: Content }[] };
type Batch = { patches: DraftPatch[]; guards: { path: DraftPatch['path']; value: unknown }[] };
const fields = ['title', 'date', 'notes', 'reason', 'disposition', 'evidence'];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const selector = (value: unknown): value is { id: string } => object(value) && Reflect.ownKeys(value).length === 1 &&
  Object.hasOwn(value, 'id') && typeof value.id === 'string' && value.id.length > 0;
function fail(code: string): never { throw new DraftConflict(code, 422); }
function hydrated(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Object.hasOwn(value, '__immutableBody') || Object.hasOwn(value, '__liveContent'))
    throw new DraftConflict('ROUTINE_PAGE_SOURCE_NOT_HYDRATED', 409);
  for (const child of Object.values(value)) hydrated(child);
}
function content(value: RoutinePageContent, domain: RoutineFqc): void {
  if (!object(value) || Object.keys(value).join(',') !== 'documents' || !Array.isArray(value.documents) ||
    value.documents.some(doc => !object(doc) || Object.keys(doc).sort().join(',') !== 'content,id' ||
      typeof doc.id !== 'string' || !object(doc.content) || !domain.documents.some(source => source.id === doc.id)) ||
    new Set(value.documents.map(doc => doc.id)).size !== value.documents.length) fail('ROUTINE_PAGE_CONTENT_INVALID');
}
function commandBatches(command: ModuleDraftCommand): Batch[] {
  if (command.action !== 'save' || command.moduleAction !== 'save-local-v1') fail('ROUTINE_PAGE_EXPLICIT_SAVE_REQUIRED');
  if (!object(command.input) || Object.keys(command.input).join(',') !== 'batches' || !Array.isArray(command.input.batches) ||
    command.input.batches.length > 256 || !Array.isArray(command.patches) || command.patches.length > 256) fail('INVALID_LOCAL_SAVE');
  const batches = command.input.batches as Batch[];
  for (const batch of batches) {
    if (!object(batch) || Object.keys(batch).sort().join(',') !== 'guards,patches' || !Array.isArray(batch.patches) ||
      !Array.isArray(batch.guards) || batch.patches.length > 256 || batch.guards.length > 256) fail('INVALID_LOCAL_SAVE');
    for (const patch of batch.patches) {
      if (!object(patch)) fail('ROUTINE_PAGE_PATCH_NOT_ALLOWED');
      const path = patch.path;
      if (patch.op !== 'set' || !Array.isArray(path) || path[0] !== 'documents' || !selector(path[1]) || path[2] !== 'content' ||
        !(path.length === 4 && typeof path[3] === 'string' && fields.includes(path[3]) || path.length === 6 && path[3] === 'lines' && selector(path[4]) && path[5] === 'results'))
        fail('ROUTINE_PAGE_PATCH_NOT_ALLOWED');
      if (!batch.guards.some(guard => object(guard) && sameDraftValue(guard.path, path))) fail('DEPENDENCY_GUARD_REQUIRED');
    }
    for (const guard of batch.guards) if (!object(guard) || Object.keys(guard).sort().join(',') !== 'path,value' ||
      !Array.isArray(guard.path) || guard.path[0] !== 'documents' || guard.path.length > 6 ||
      guard.path.some(step => typeof step !== 'string' && !selector(step))) fail('ROUTINE_PAGE_GUARD_INVALID');
  }
  if (!sameDraftValue(command.patches, batches.flatMap(batch => batch.patches))) fail('INVALID_LOCAL_SAVE');
  return batches;
}
function editableProjection(value: Content) {
  const fixed = cloneDraft(value);
  for (const field of fields) delete (fixed as unknown as Record<string, unknown>)[field];
  if (!Array.isArray(fixed.lines)) fail('ROUTINE_PAGE_CONTENT_INVALID');
  for (const line of fixed.lines) delete (line as unknown as Record<string, unknown>).results;
  return fixed;
}
function validateWorkingSource(domain: RoutineFqc, working: RoutinePageContent) {
  // Check the complete page even when only another document changes, or when
  // Save has no patches. Historical snapshots remain bound to their old source.
  for (const doc of working.documents) {
    const targets = domain.documents.filter(row => row.id === doc.id);
    if (targets.length !== 1) fail('ROUTINE_PAGE_CONTENT_INVALID');
    const target = targets[0];
    if (!sameDraftValue(editableProjection(doc.content), editableProjection(target.flow.working)))
      throw new DraftConflict('ROUTINE_PAGE_REFERENCE_CHANGED', 409);
    validateRoutineContentEdit(domain, target, doc.content, doc.content);
  }
}
function validateChanges(domain: RoutineFqc, after: RoutinePageContent, before: RoutinePageContent) {
  content(after, domain); content(before, domain);
  if (!sameDraftValue(after.documents.map(doc => doc.id), before.documents.map(doc => doc.id))) fail('ROUTINE_PAGE_DOCUMENT_MEMBERSHIP_FIXED');
  for (const doc of after.documents) {
    const old = before.documents.find(row => row.id === doc.id)!;
    if (sameDraftValue(doc.content, old.content)) continue;
    if (!sameDraftValue(editableProjection(doc.content), editableProjection(old.content))) fail('ROUTINE_PAGE_SOURCE_FIXED');
    // Reuse actual routine document/source/retest rules without creating a
    // legacy Apply, document receipt, event, sequence or approval side effect.
    const target = domain.documents.find(row => row.id === doc.id)!;
    if (!sameDraftValue(editableProjection(old.content), editableProjection(target.flow.working)))
      throw new DraftConflict('ROUTINE_PAGE_REFERENCE_CHANGED', 409);
    if (target.cancelled) throw new DraftConflict('DOCUMENT_CANCELLED', 409);
    if (target.flow.pendingId || target.flow.cases.some(review => review.status === 'pending'))
      throw new DraftConflict('LEGACY_PENDING_REQUIRES_REVIEW', 409);
    if (docStatus(target) === 'approved') throw new DraftConflict('FORMAL_DOCUMENT_IMMUTABLE', 409);
    validateRoutineContentEdit(domain, target, doc.content, old.content);
  }
}

// Whole-page existing-document Save core only. No constructor/adoption, route,
// storage/CAS, document creation or approval effects. Domain is a trusted fresh
// complete reference closure; original document flows/history remain untouched.
export function saveRoutineFqcPage(source: SharedDraft<RoutinePageContent>, command: ModuleDraftCommand,
  domain: RoutineFqc, supplied: DraftContext<RoutinePageContent>) {
  if (source.scope !== 'routine-fqc:page') throw new DraftConflict('ROUTINE_PAGE_OWNER_MISMATCH', 409);
  hydrated(source); hydrated(domain);
  for (const value of [source.active.content, source.working, ...(source.saved ? [source.saved.content] : []),
    ...source.saves.map(save => save.content), ...source.cases.flatMap(review => [review.before, review.content])]) content(value, domain);
  const batches = commandBatches(command), intents = new Map<string, { before: unknown; after: unknown }>();
  for (const batch of batches) for (const patch of batch.patches) {
    if (patch.op !== 'set') fail('ROUTINE_PAGE_PATCH_NOT_ALLOWED');
    const key = stableDraftJSON(patch.path), previous = intents.get(key), guard = batch.guards.find(entry => sameDraftValue(entry.path, patch.path))!;
    intents.set(key, { before: previous ? previous.before : guard.value, after: patch.value });
  }
  const ctx: DraftContext<RoutinePageContent> = { ...supplied, commandFingerprint: stableDraftJSON(command),
    allowed: permission => permission === 'save' ? supplied.allowed('save') || supplied.allowed('edit') : supplied.allowed(permission),
    structure(after, before) { validateChanges(domain, after, before); supplied.structure(after, before); } };
  if (source.receipts[command.operationId]) return { ...applyDraftCommand(source, command, ctx), activationAvailable: false as const };
  if (!ctx.allowed('view') || !ctx.allowed('edit') || !ctx.allowed('save')) throw new DraftConflict('FORBIDDEN', 403);
  if (domain.documents.some(doc => doc.flow.pendingId || doc.flow.cases.some(review => review.status === 'pending')))
    throw new DraftConflict('LEGACY_PENDING_REQUIRES_REVIEW', 409);
  validateWorkingSource(domain, source.working);
  let staged = source;
  for (const batch of batches) {
    staged = applyDraftCommand(staged, { ...command, action: 'apply', patches: batch.patches, guards: batch.guards }, ctx).state;
    staged = { ...staged, revision: source.revision, sequences: source.sequences, receipts: source.receipts };
  }
  const contributors = { ...staged.contributors };
  for (const [key, intent] of intents) if (sameDraftValue(intent.before, intent.after)) {
    if (Object.hasOwn(source.contributors, key)) contributors[key] = source.contributors[key]; else delete contributors[key];
  }
  const result = applyDraftCommand({ ...staged, contributors }, command, ctx);
  result.receipt.unchanged = sameDraftValue(source.working, result.state.working) && result.receipt.unchanged;
  if (!result.receipt.unchanged && result.state.revision === source.revision) result.state.revision++;
  result.receipt.revision = result.state.revision;
  result.state.receipts[command.operationId].result = cloneDraft(result.receipt);
  return { ...result, activationAvailable: false as const };
}
