import {
  applyDraftCommand, cloneDraft, createSharedDraft, DraftConflict, sameDraftValue,
  stableDraftJSON, type DraftContext, type DraftPermission,
} from './shared-draft';
import { assertMasterPageContent } from './master-page-boundary';
import { saveMasterPageNames } from './master-page-name-save';
import { assertBeginBasis, parseBeginIdentity, recordBegin, replayBegin, type BeginIdentity } from './workflow-begin';
import { effectiveVersion, openedVersion, projectSharedVersion, type ModuleDraftCommand, type VersionedControl } from './versioned-shared-workflow';

type Snapshot = Record<string, unknown>;
export type MasterLinePageControl = VersionedControl<Snapshot> & { scope: 'master:LINES' };
type Access = Pick<DraftContext<Snapshot>, 'actor' | 'allowed'>;
export type MasterLinePageContext = Omit<DraftContext<Snapshot>, 'commandFingerprint'>;
const actions = new Set(['save', 'submit', 'withdraw', 'return', 'approve']);
function assertContent(content: Snapshot): void {
  assertMasterPageContent('LINES', content);
  const row = (value: unknown): value is { id: string } => !!value && typeof value === 'object' &&
    !Array.isArray(value) && typeof (value as { id?: unknown }).id === 'string' && !!(value as { id: string }).id;
  for (const partition of ['AB', 'C']) {
    const lines = (content[partition] as { lines: unknown[] }).lines;
    if (!lines.every(row) || new Set(lines.map(line => (line as { id: string }).id)).size !== lines.length)
      throw new DraftConflict('MASTER_LINE_PAGE_CONTENT_INVALID', 422);
    for (const line of lines) {
      const stages = (line as { stages?: unknown }).stages;
      if (!Array.isArray(stages) || !stages.every(row) || new Set(stages.map(stage => stage.id)).size !== stages.length)
        throw new DraftConflict('MASTER_LINE_PAGE_CONTENT_INVALID', 422);
    }
  }
}

// Request-local only: no codec, route, ACL mapping, legacy adoption or writer.
// The caller supplies an already established page-owned approved baseline and
// current full-page authority/reference validation from its future transaction.
function hydrated(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Object.hasOwn(value, '__immutableBody') || Object.hasOwn(value, '__liveContent'))
    throw new DraftConflict('MASTER_LINE_PAGE_NOT_HYDRATED', 409);
  for (const child of Object.values(value)) hydrated(child);
}
function assertControl(control: MasterLinePageControl): void {
  if (!control || control.scope !== 'master:LINES' || !Array.isArray(control.versions) ||
    new Set(control.versions.map(v => v.id)).size !== control.versions.length ||
    control.versions.filter(v => ['draft', 'pending', 'pending-test'].includes(v.status)).length > 1)
    throw new DraftConflict('MASTER_LINE_PAGE_OWNER_INVALID', 409);
  hydrated(control);
  const active = effectiveVersion(control);
  if (!active || active.status !== 'approved') throw new DraftConflict('MASTER_LINE_PAGE_BASELINE_REQUIRED', 409);
  for (const version of control.versions) assertContent(version.snapshot);
  const flow = control.workflow;
  if (!flow) {
    if (openedVersion(control)) throw new DraftConflict('MASTER_LINE_PAGE_OWNER_INVALID', 409);
    return;
  }
  if (flow.scope !== 'master:LINES' || !flow.active || !Array.isArray(flow.saves) || !Array.isArray(flow.cases) ||
    flow.active.id !== active.id || !sameDraftValue(flow.active.content, active.snapshot) ||
    new Set(flow.saves.map(save => save.id)).size !== flow.saves.length || new Set(flow.cases.map(review => review.id)).size !== flow.cases.length)
    throw new DraftConflict('MASTER_LINE_PAGE_OWNER_INVALID', 409);
  for (const content of [flow.active.content, flow.working, ...(flow.saved ? [flow.saved.content] : []),
    ...flow.saves.map(save => save.content), ...flow.cases.flatMap(review => [review.before, review.content])])
    assertContent(content);
  // Cases refer to an immutable successful Save, including after return,
  // withdrawal or approval. A matching numeric projection alone is not proof
  // that case content was ever saved. Refuse mixed/drifted records unchanged.
  for (const review of flow.cases) {
    const saved = flow.saves.find(save => save.id === review.savedId);
    if (!saved || !sameDraftValue(review.content, saved.content))
      throw new DraftConflict('MASTER_LINE_PAGE_OWNER_INVALID', 409);
  }
  const open = openedVersion(control), pending = flow.cases.filter(review => review.status === 'pending');
  if (flow.pendingId ? pending.length !== 1 || pending[0].id !== flow.pendingId || open?.id !== flow.pendingId ||
    open.status !== 'pending' || !sameDraftValue(open.snapshot, pending[0].content) ||
    pending[0].savedId !== flow.saved?.id || !sameDraftValue(flow.working, pending[0].content)
    : pending.length > 0 || !!open && (open.status !== 'draft' || open.revision !== flow.revision || !sameDraftValue(open.snapshot, flow.working)))
    throw new DraftConflict('MASTER_LINE_PAGE_OWNER_INVALID', 409);
  if (flow.saved && !flow.saves.some(save => save.id === flow.saved!.id && sameDraftValue(save, flow.saved)))
    throw new DraftConflict('MASTER_LINE_PAGE_OWNER_INVALID', 409);
}
// This slice cannot create/delete/recode topology or generate linked PROCESS
// changes. Fixed-case submission and review must enforce the same restriction
// even when a caller supplies a pre-existing saved/pending body.
function withoutNames(content: Snapshot): Snapshot {
  const result = cloneDraft(content);
  for (const partition of ['AB', 'C']) {
    const lines = (result[partition] as { lines: { name?: unknown; stages: { name?: unknown }[] }[] }).lines;
    for (const line of lines) { delete line.name; for (const stage of line.stages) delete stage.name; }
  }
  return result;
}
function namesOnly(content: Snapshot, before: Snapshot): void {
  assertContent(content); assertContent(before);
  if (!sameDraftValue(withoutNames(content), withoutNames(before)))
    throw new DraftConflict('MASTER_PAGE_NAME_SAVE_ONLY', 422);
}
function context(control: MasterLinePageControl, supplied: MasterLinePageContext): DraftContext<Snapshot> {
  if (supplied.activeId !== control.activeVersionId) throw new DraftConflict('ACTIVE_VERSION_CHANGED', 409);
  return {
    actor: supplied.actor, at: supplied.at, id: supplied.id, activeId: control.activeVersionId,
    allowed: permission => permission === 'save' ? supplied.allowed('save') || supplied.allowed('edit') : supplied.allowed(permission),
    semantic: supplied.semantic,
    structure(content, before) { namesOnly(content, before); supplied.structure(content, before); },
    validate(content) {
      namesOnly(content, effectiveVersion(control)!.snapshot);
      supplied.structure(content, effectiveVersion(control)!.snapshot);
      return supplied.validate(content);
    },
  };
}
export function beginMasterLinePage(source: MasterLinePageControl, begin: BeginIdentity, supplied: MasterLinePageContext) {
  parseBeginIdentity({ action: 'begin-v1', begin }); assertControl(source);
  const next = cloneDraft(source), ctx = context(next, supplied);
  if (!ctx.allowed('view') || !ctx.allowed('edit')) throw new DraftConflict('FORBIDDEN', 403);
  const receipt = replayBegin(next, begin, ctx.actor.id);
  if (receipt) return { control: next, receipt: cloneDraft(receipt), replayed: true, activationAvailable: false as const };
  assertBeginBasis(next, begin);
  const open = openedVersion(next);
  if (open && open.status !== 'draft') throw new DraftConflict('PENDING_LOCKED', 409);
  const unchanged = !!next.workflow && !!open;
  if (!unchanged) {
    next.workflow ||= createSharedDraft('master:LINES', effectiveVersion(next)!.snapshot, next.activeVersionId, ctx.id());
    projectSharedVersion(next, ctx.actor, ctx.at);
  }
  const result = recordBegin(next, begin, ctx.actor.id, unchanged);
  assertControl(next);
  return { control: next, receipt: cloneDraft(result), replayed: false, activationAvailable: false as const };
}
export function commandMasterLinePage(source: MasterLinePageControl, command: ModuleDraftCommand, supplied: MasterLinePageContext) {
  assertControl(source);
  if (!actions.has(command.action)) throw new DraftConflict('MASTER_LINE_PAGE_ACTION_INVALID', 422);
  if (command.action !== 'save' && ['patches', 'guards', 'moduleAction', 'input'].some(key => Object.hasOwn(command, key)))
    throw new DraftConflict('MASTER_LINE_PAGE_LIFECYCLE_PAYLOAD_INVALID', 422);
  const next = cloneDraft(source), ctx = context(next, supplied), flow = next.workflow;
  if (!flow || !openedVersion(next) && !flow.receipts[command.operationId]) throw new DraftConflict('BEGIN_REQUIRED', 409);
  const replayed = Object.hasOwn(flow.receipts, command.operationId);
  if (!replayed && command.action === 'save') namesOnly(flow.working, flow.active.content);
  ctx.commandFingerprint = stableDraftJSON(command);
  const result = command.action === 'save' ? saveMasterPageNames(flow, command, ctx) : applyDraftCommand(flow, command, ctx);
  next.workflow = result.state;
  if (!replayed) projectSharedVersion(next, ctx.actor, ctx.at, command.action === 'approve');
  assertControl(next);
  return { control: next, receipt: cloneDraft(result.receipt), replayed, activationAvailable: false as const };
}
// Original owner + current operation permission only. A missing receipt is
// still unknown; this read does not invoke Begin/Save or recover by resending.
export function masterLinePageReceipt(control: MasterLinePageControl, operationId: string, access: Access) {
  assertControl(control);
  if (!access.allowed('view')) throw new DraftConflict('FORBIDDEN', 403);
  const receipt = control.workflow?.receipts[operationId];
  if (!receipt) throw new DraftConflict('OPERATION_NOT_FOUND', 404);
  const action = (JSON.parse(receipt.fingerprint) as { action: string }).action;
  const permission = action === 'begin-v1' ? 'edit' : action;
  if (receipt.actorId !== access.actor.id || action !== 'begin-v1' && !actions.has(action) ||
    !(permission === 'save' ? access.allowed('save') || access.allowed('edit') : access.allowed(permission as DraftPermission)))
    throw new DraftConflict('FORBIDDEN', 403);
  return cloneDraft(receipt.result);
}
// Current approved reference only; working/saved/pending never supply catalog
// options. A future caller must pin/recheck this version in the same CAS.
export function approvedMasterLinePage(control: MasterLinePageControl, expectedVersionId: string, access: Access) {
  assertControl(control);
  if (!access.allowed('view')) throw new DraftConflict('FORBIDDEN', 403);
  if (expectedVersionId !== control.activeVersionId) throw new DraftConflict('ACTIVE_VERSION_CHANGED', 409);
  return { versionId: control.activeVersionId, content: cloneDraft(effectiveVersion(control)!.snapshot) };
}
