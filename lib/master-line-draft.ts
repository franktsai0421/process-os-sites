import { cloneDraft, DraftConflict, sameDraftValue, stableDraftJSON, type DraftContext, type SharedDraft } from './shared-draft';
import { masterWorkflowAdapter, normalizeMasterSnapshot } from './master-workflow';
import { approvedMasterDocument, approvedMasterSource, assertMasterOwnedCommand, assertMasterOwnedContent, masterDocumentDescriptors, projectMasterOwnedContent, type MasterBusinessScope, type MasterDocumentDescriptor, type MasterDocumentPreviewRoot } from './master-document-boundary';
import { assertBeginBasis, parseBeginIdentity, recordBegin, replayBegin, type BeginIdentity } from './workflow-begin';
import { createSharedDraft } from './shared-draft';
import { restoreEffects } from './draft-restore-access';
import { effectiveVersion, openedVersion, projectSharedVersion, type ModuleDraftCommand, type VersionedControl } from './versioned-shared-workflow';

type Snapshot = Record<string, unknown>;
export type MasterLineControl = VersionedControl<Snapshot>;
type Base = Pick<DraftContext<Snapshot>, 'actor' | 'at' | 'id' | 'allowed'>;
export type MasterLineCandidateContext = Base & {
  // Trusted complete, hydrated reference closure from ONE transaction revision.
  // No endpoint accepts this object. The integration/codec/CAS fence is pending.
  root: MasterDocumentPreviewRoot;
  values: Record<string, string>;
  create: boolean;
  delete: boolean;
  restore: boolean;
};

// Isolated reducer only. There is deliberately no storage key, HTTP registration,
// data-adoption constructor, environment switch or legacy-baseline conversion.
function owner(scope: MasterBusinessScope): MasterDocumentDescriptor {
  const descriptor = masterDocumentDescriptors.find(d => d.businessScope === scope && d.area === 'lines');
  if (!descriptor) throw new DraftConflict('SCOPE_INVALID', 422);
  return descriptor;
}
function assertControl(control: MasterLineControl, descriptor: MasterDocumentDescriptor) {
  if (!control || !Array.isArray(control.versions)) throw new DraftConflict('MASTER_LINE_BASELINE_REQUIRED', 409);
  const active = effectiveVersion(control);
  if (!active || active.status !== 'approved' || control.versions.filter(v => v.id === active.id).length !== 1)
    throw new DraftConflict('MASTER_LINE_BASELINE_REQUIRED', 409);
  for (const version of control.versions) assertMasterOwnedContent(version.snapshot, descriptor);
  const flow = control.workflow;
  if (!flow) return;
  if (flow.scope !== 'master:' + descriptor.scope || flow.active.id !== active.id || !sameDraftValue(flow.active.content, active.snapshot))
    throw new DraftConflict('MASTER_LINE_OWNER_MISMATCH', 409);
  for (const snapshot of [flow.active.content, flow.working, ...(flow.saved ? [flow.saved.content] : []),
    ...flow.saves.map(s => s.content), ...flow.cases.flatMap(c => [c.before, c.content])])
    assertMasterOwnedContent(snapshot, descriptor);
}
function splitFlows(root: MasterDocumentPreviewRoot, descriptor: MasterDocumentDescriptor, control: MasterLineControl) {
  for (const entry of masterDocumentDescriptors) {
    const raw = root.workflowScopes?.[entry.scope];
    if (!raw) continue;
    const flow = raw as unknown as SharedDraft<Snapshot>;
    if (flow.scope !== 'master:' + entry.scope || !flow.active || !Array.isArray(flow.saves) || !Array.isArray(flow.cases))
      throw new DraftConflict('MASTER_LINE_DEPENDENCY_INVALID', 422);
    for (const content of [flow.active.content, flow.working, ...(flow.saved ? [flow.saved.content] : []),
      ...flow.saves.map(save => save.content), ...flow.cases.flatMap(review => [review.before, review.content])])
      assertMasterOwnedContent(content, entry);
    const approved = normalizeMasterSnapshot(approvedMasterSource(root, entry.businessScope).snapshot, entry.businessScope);
    if (!sameDraftValue(flow.active.content, projectMasterOwnedContent(approved, entry)))
      throw new DraftConflict('MASTER_LINE_DEPENDENCY_SOURCE_CHANGED', 409);
    if (entry === descriptor && !sameDraftValue(raw, control.workflow))
      throw new DraftConflict('MASTER_LINE_DEPENDENCY_SOURCE_CHANGED', 409);
  }
  if (control.workflow) root.workflowScopes = { ...root.workflowScopes,
    [descriptor.scope]: cloneDraft(control.workflow) as unknown as Record<string, unknown> };
}
function assertOtherSplitReservations(root: MasterDocumentPreviewRoot, descriptor: MasterDocumentDescriptor, content: Snapshot) {
  const other = masterDocumentDescriptors.find(d => d.area === 'lines' && d.businessScope !== descriptor.businessScope)!;
  const flow = root.workflowScopes?.[other.scope] as unknown as SharedDraft<Snapshot> | undefined;
  if (!flow) return;
  const snapshots = [flow.working, ...(flow.saved ? [flow.saved.content] : []),
    ...flow.cases.filter(c => c.status === 'pending').map(c => c.content)];
  type Line = { code: string; stages: { code: string }[] };
  const reserved = snapshots.flatMap(snapshot => snapshot.lines as Line[]);
  const lines = content.lines as Line[];
  if (lines.some(line => reserved.some(otherLine => line.code === otherLine.code ||
    line.stages.some(stage => otherLine.stages.some(otherStage => stage.code === otherStage.code)))))
    throw new DraftConflict('LINE_STAGE_USED_IN_OTHER_SCOPE', 409);
}
function prepare(control: MasterLineControl, scope: MasterBusinessScope, supplied: MasterLineCandidateContext) {
  const descriptor = owner(scope);
  assertControl(control, descriptor);
  // All mutations, including linked PROCESS changes and version projections, are
  // staged in private copies. Exceptions must leave both inputs byte-identical.
  const next = cloneDraft(control), root = cloneDraft(supplied.root);
  const approved = approvedMasterSource(root, scope);
  approvedMasterSource(root, scope === 'AB' ? 'C' : 'AB');
  approvedMasterSource(root, 'PROCESS');
  splitFlows(root, descriptor, next);
  const full = normalizeMasterSnapshot(approved.snapshot, scope);
  if (!sameDraftValue(effectiveVersion(next)!.snapshot, projectMasterOwnedContent(full, descriptor)))
    throw new DraftConflict('MASTER_LINE_EFFECTIVE_SOURCE_CHANGED', 409);
  const compose = (owned: Snapshot): Snapshot => { assertMasterOwnedContent(owned, descriptor); return { ...cloneDraft(full), ...cloneDraft(owned) }; };
  const adapter = masterWorkflowAdapter(scope);
  const virtual = adapter.parse(JSON.stringify(root), root);
  const toFull = (flow: SharedDraft<Snapshot>): SharedDraft<Snapshot> => ({ ...cloneDraft(flow),
    active: { ...flow.active, content: compose(flow.active.content) }, working: compose(flow.working),
    saved: flow.saved ? { ...cloneDraft(flow.saved), content: compose(flow.saved.content) } : null,
    saves: flow.saves.map(s => ({ ...cloneDraft(s), content: compose(s.content) })),
    cases: flow.cases.map(c => ({ ...cloneDraft(c), before: compose(c.before), content: compose(c.content) })),
  });
  const toOwned = (flow: SharedDraft<Snapshot>): SharedDraft<Snapshot> => ({ ...flow,
    active: { ...flow.active, content: projectMasterOwnedContent(flow.active.content, descriptor) },
    working: projectMasterOwnedContent(flow.working, descriptor),
    saved: flow.saved ? { ...flow.saved, content: projectMasterOwnedContent(flow.saved.content, descriptor) } : null,
    saves: flow.saves.map(s => ({ ...s, content: projectMasterOwnedContent(s.content, descriptor) })),
    cases: flow.cases.map(c => ({ ...c, before: projectMasterOwnedContent(c.before, descriptor), content: projectMasterOwnedContent(c.content, descriptor) })),
  });
  // The legacy adapter is used only as a validator/link planner on composed
  // request-local views. Its full AB/C serializer is never invoked.
  virtual.activeVersionId = next.activeVersionId;
  if (next.workflow) virtual.workflow = toFull(next.workflow);
  const state = { revision: 0, values: { ...supplied.values, masterDataControl: JSON.stringify(root) } };
  const base = { actor: supplied.actor, at: supplied.at, id: supplied.id,
    allowed: (permission: Parameters<Base['allowed']>[0]) => permission === 'save'
      ? supplied.allowed('save') || supplied.allowed('edit') : supplied.allowed(permission) };
  const context = adapter.context(virtual, state as Parameters<typeof adapter.context>[1], base);
  const structure = context.structure;
  context.structure = (content, previous) => {
    // The kernel has already selected this exact pending case before validate.
    // Hide only its own lock during structural recheck; the legacy link planner
    // separately verifies that case's immutable PROCESS pin. Every other lock
    // remains in the same complete closure, and the pointer is always restored.
    const own = root.workflowScopes?.[descriptor.scope];
    const pendingId = own?.pendingId;
    const ownCase = !!pendingId && pendingId === virtual.workflow?.pendingId;
    try {
      if (ownCase) own!.pendingId = null;
      structure(content, previous);
      assertOtherSplitReservations(root, descriptor, content);
    } finally { if (ownCase) own!.pendingId = pendingId; }
  };
  const validate = context.validate;
  context.validate = content => {
    // Submit AND approval revalidate against today's approved catalog/history,
    // including routes added while this line document was awaiting review.
    context.structure(content, full);
    return validate(content).filter(issue => issue.path[0] === 'lines');
  };
  return { next, root, descriptor, adapter, virtual, context, toOwned, base };
}

export function beginMasterLineCandidate(control: MasterLineControl, scope: MasterBusinessScope, begin: BeginIdentity, supplied: MasterLineCandidateContext) {
  parseBeginIdentity({ action: 'begin-v1', begin });
  const prepared = prepare(control, scope, supplied), { next, base } = prepared;
  if (!base.allowed('view') || !base.allowed('edit')) throw new DraftConflict('FORBIDDEN', 403);
  const replay = replayBegin(next, begin, base.actor.id);
  if (replay) return { control: next, receipt: cloneDraft(replay), replayed: true };
  assertBeginBasis(next, begin);
  const open = openedVersion(next);
  if (open && open.status !== 'draft') throw new DraftConflict('PENDING_LOCKED', 409);
  const alreadyOpen = !!next.workflow && !!open;
  if (!alreadyOpen) {
    if (!next.workflow) next.workflow = createSharedDraft('master:' + prepared.descriptor.scope,
      effectiveVersion(next)!.snapshot, next.activeVersionId, base.id());
    projectSharedVersion(next, base.actor, base.at);
  }
  return { control: next, receipt: recordBegin(next, begin, base.actor.id, alreadyOpen), replayed: false };
}

export function commandMasterLineCandidate(control: MasterLineControl, scope: MasterBusinessScope, command: ModuleDraftCommand, supplied: MasterLineCandidateContext) {
  const { next, root, descriptor, adapter, virtual, context, toOwned } = prepare(control, scope, supplied);
  assertMasterOwnedCommand(command, descriptor);
  // Local edits cannot call shared Apply. Explicit Save carries all ordered
  // guarded batches and persists one result in the eventual enclosing CAS.
  if (command.action === 'apply') throw new DraftConflict('MASTER_LINE_EXPLICIT_SAVE_REQUIRED', 422);
  if (command.action === 'save' && command.moduleAction !== 'save-local-v1')
    throw new DraftConflict('MASTER_LINE_EXPLICIT_SAVE_REQUIRED', 422);
  if (!next.workflow || !virtual.workflow) throw new DraftConflict('BEGIN_REQUIRED', 409);
  if (!openedVersion(next) && !next.workflow.receipts[command.operationId]) throw new DraftConflict('BEGIN_REQUIRED', 409);
  if (!context.allowed('view')) throw new DraftConflict('FORBIDDEN', 403);
  // Current restore access applies to old receipt replay as well as new input,
  // matching the existing route and the receipt-read API.
  if (command.action === 'restore' && !supplied.restore) throw new DraftConflict('RESTORE_PERMISSION_REQUIRED', 403);
  const replay = !!next.workflow.receipts[command.operationId];
  if (!replay) {
    if (command.patches?.some(p => p.op === 'insert') && !supplied.create) throw new DraftConflict('FORBIDDEN', 403);
    if (command.action !== 'restore' && adapter.requiresDelete?.(virtual, command) && !supplied.delete || command.patches?.some(p => p.op === 'remove') && !supplied.delete)
      throw new DraftConflict('FORBIDDEN', 403);
    if (command.action === 'restore') {
      const saved = next.workflow.saves.find(s => s.id === command.restoreSaveId);
      if (saved) {
        const effects = restoreEffects(next.workflow.working, saved.content);
        if (effects.create && !supplied.create) throw new DraftConflict('RESTORE_CREATE_PERMISSION_REQUIRED', 403);
        if (effects.delete && !supplied.delete) throw new DraftConflict('RESTORE_DELETE_PERMISSION_REQUIRED', 403);
      }
      // Preserve shared-kernel admission ordering before the local policy.
      if (!context.allowed('edit')) throw new DraftConflict('FORBIDDEN', 403);
      if (!/^[a-zA-Z0-9_-]{8,100}$/.test(command.operationId || '') || !/^[a-zA-Z0-9_-]{8,100}$/.test(command.clientId || '') ||
          !Number.isSafeInteger(command.sequence) || command.sequence < 1) throw new DraftConflict('INVALID_OPERATION', 422);
      // This unregistered candidate owns its no-new-restore policy. It cannot
      // depend on a separate, unpublished shared-kernel policy change.
      // Existing receipts still reach the original exact-identity replay below.
      throw new DraftConflict('RESTORE_DISABLED', 409);
    }
  }
  context.commandFingerprint = stableDraftJSON(command);
  const result = adapter.apply(virtual, command, context);
  // masterWorkflowAdapter's reducer is synchronous; keep that requirement
  // explicit so a future async validator cannot accidentally bypass admission.
  if (result instanceof Promise) throw new DraftConflict('MASTER_LINE_ASYNC_ADAPTER_UNSUPPORTED', 503);
  next.workflow = toOwned(result.state);
  if (!replay) projectSharedVersion(next, supplied.actor, supplied.at, command.action === 'approve');
  return { control: next, receipt: cloneDraft(result.receipt), replayed: replay,
    // Staged linked-process effects ONLY; nothing is written or made effective.
    process: { active: root.active.PROCESS, versions: root.versions.filter(v => v.scope === 'PROCESS'),
      workflow: root.workflowScopes?.PROCESS }, activationAvailable: false as const };
}

export function approvedMasterLineOptions(root: MasterDocumentPreviewRoot, scope: MasterBusinessScope) {
  return approvedMasterDocument(root, owner(scope));
}

// Recovery reads the original owner-scoped receipt, with current corresponding
// access. Missing remains unknown; it never invokes Begin, Save or a retry.
export function masterLineCandidateReceipt(control: MasterLineControl, scope: MasterBusinessScope, operationId: string, access: Base & { restore: boolean }) {
  assertControl(control, owner(scope));
  if (!access.allowed('view')) throw new DraftConflict('FORBIDDEN', 403);
  const receipt = control.workflow?.receipts[operationId];
  if (!receipt) throw new DraftConflict('OPERATION_NOT_FOUND', 404);
  const action = (JSON.parse(receipt.fingerprint) as { action: string }).action;
  const permission = action === 'begin-v1' || action === 'restore' ? 'edit' : action;
  const allowed = permission === 'save' ? access.allowed('save') || access.allowed('edit')
    : access.allowed(permission as Parameters<Base['allowed']>[0]);
  if (receipt.actorId !== access.actor.id || !allowed || action === 'restore' && !access.restore) throw new DraftConflict('FORBIDDEN', 403);
  return cloneDraft(receipt.result);
}

// Extra catalog admission proof for a future split writer. It validates the
// entire proposed catalog against the approved topology read in that transaction,
// never against this editor's line working/saved/pending content. It neither
// authorizes a catalog write nor substitutes for that writer's own guards/CAS.
export function assertMasterCatalogApprovedTopology(catalog: Snapshot, scope: MasterBusinessScope, supplied: MasterLineCandidateContext) {
  const descriptor = masterDocumentDescriptors.find(d => d.businessScope === scope && d.area === 'catalog');
  if (!descriptor) throw new DraftConflict('SCOPE_INVALID', 422);
  assertMasterOwnedContent(catalog, descriptor);
  const root = cloneDraft(supplied.root), source = approvedMasterSource(root, scope);
  const full = normalizeMasterSnapshot(source.snapshot, scope);
  const adapter = masterWorkflowAdapter(scope), control = adapter.parse(JSON.stringify(root), root);
  const state = { revision: 0, values: { ...supplied.values, masterDataControl: JSON.stringify(root) } };
  const context = adapter.context(control, state, supplied);
  context.structure({ ...full, ...cloneDraft(catalog) }, full);
  return { topologyVersionId: source.versionId, source: 'approved' as const };
}
