import {
  applyDraftCommand, cloneDraft, DraftConflict, sameDraftValue, stableDraftJSON,
  type DraftContext, type DraftPatch, type SharedDraft,
} from './shared-draft';
import { assertMasterPageContent, assertMasterPageSave } from './master-page-boundary';
import type { ModuleDraftCommand } from './versioned-shared-workflow';

type Snapshot = Record<string, unknown>;
type Batch = { patches: DraftPatch[]; guards: { path: DraftPatch['path']; value: unknown }[] };
function exactSelector(value: unknown): value is { id: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Reflect.ownKeys(value).length !== 1 || !Object.hasOwn(value, 'id')) return false;
  const id = (value as { id: unknown }).id;
  return typeof id === 'string' && id.length > 0;
}

// Inactive, request-local building block for the ONE line page. No constructor,
// storage/CAS/HTTP registration, cutoff, permission mapping or activation switch.
// This small slice edits existing line/stage names only. Topology/code changes
// require the complete reference/PROCESS planner and are deliberately refused.
export function saveMasterPageNames(source: SharedDraft<Snapshot>, command: ModuleDraftCommand, supplied: DraftContext<Snapshot>) {
  if (source?.scope !== 'master:LINES') throw new DraftConflict('MASTER_PAGE_OWNER_MISMATCH', 409);
  assertMasterPageContent('LINES', source.active.content);
  assertMasterPageContent('LINES', source.working);
  for (const content of [
    ...(source.saved ? [source.saved.content] : []), ...source.saves.map(save => save.content),
    ...source.cases.flatMap(review => [review.before, review.content]),
  ]) assertMasterPageContent('LINES', content);
  assertMasterPageSave('LINES', command);
  const batches = command.input!.batches as Batch[];
  // Kernel lookup uses only selector.id. Keep this new protocol canonical so
  // equivalent entity paths cannot create distinct attribution intent keys.
  // Reject aliases in guards too; the original command/fingerprint stays intact.
  for (const batch of batches) for (const guard of batch.guards) {
    if (guard.path.some(step => typeof step !== 'string' && !exactSelector(step)))
      throw new DraftConflict('MASTER_PAGE_NAME_SELECTOR_INVALID', 422);
  }
  const intents = new Map<string, { before: unknown; after: unknown }>();
  for (const batch of batches) for (const patch of batch.patches) {
    const path = patch.path;
    if (patch.op !== 'set' || ![4, 6].includes(path.length) || path.at(-1) !== 'name' ||
      typeof path[2] !== 'object' || path.length === 6 && (path[3] !== 'stages' || typeof path[4] !== 'object'))
      throw new DraftConflict('MASTER_PAGE_NAME_SAVE_ONLY', 422);
    if (!exactSelector(path[2]) || path.length === 6 && !exactSelector(path[4]))
      throw new DraftConflict('MASTER_PAGE_NAME_SELECTOR_INVALID', 422);
    if (typeof patch.value !== 'string' || !patch.value.trim()) throw new DraftConflict('NAME_REQUIRED', 422);
    const guard = batch.guards.find(entry => sameDraftValue(entry.path, path));
    if (!guard) throw new DraftConflict('DEPENDENCY_GUARD_REQUIRED', 422);
    const key = stableDraftJSON(path), prior = intents.get(key);
    intents.set(key, { before: prior ? prior.before : guard.value, after: patch.value });
  }
  // The future trusted adapter must provide current lines authority and a full
  // transaction-local reference validator; this helper never derives ACL cells.
  const context: DraftContext<Snapshot> = { ...supplied,
    commandFingerprint: stableDraftJSON(command),
    allowed: permission => permission === 'save'
      ? supplied.allowed('save') || supplied.allowed('edit') : supplied.allowed(permission),
    structure(content, previous) {
      assertMasterPageContent('LINES', content);
      supplied.structure(content, previous);
    },
  };
  // Exact committed replay retains the kernel's original identity and current
  // access checks, including after a terminal case changed the generation.
  if (source.receipts[command.operationId]) return { ...applyDraftCommand(source, command, context), activationAvailable: false as const };
  if (!context.allowed('view') || !context.allowed('edit') || !context.allowed('save')) throw new DraftConflict('FORBIDDEN', 403);
  let staged = source;
  for (const batch of batches) {
    staged = applyDraftCommand(staged, { ...command, action: 'apply', patches: batch.patches, guards: batch.guards }, context).state;
    // Intermediate results never escape or acquire separate durable receipts.
    // A later guard/validator failure leaves source and every original receipt intact.
    staged = { ...staged, revision: source.revision, sequences: source.sequences, receipts: source.receipts };
  }
  // Every first guard was checked against source during the ordered staging.
  // A name restored within this request retains its earlier contributor; only
  // net changes belong to this actor in the final immutable Save attribution.
  const contributors = { ...staged.contributors };
  for (const [key, intent] of intents) if (sameDraftValue(intent.before, intent.after)) {
    if (Object.hasOwn(source.contributors, key)) contributors[key] = source.contributors[key];
    else delete contributors[key];
  }
  staged = { ...staged, contributors };
  const result = applyDraftCommand(staged, command, context);
  result.receipt.unchanged = sameDraftValue(source.working, result.state.working) && result.receipt.unchanged;
  if (!result.receipt.unchanged && result.state.revision === source.revision) result.state.revision++;
  result.receipt.revision = result.state.revision;
  result.state.receipts[command.operationId].result = cloneDraft(result.receipt);
  return { ...result, activationAvailable: false as const };
}
