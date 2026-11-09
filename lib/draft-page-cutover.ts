import { cloneDraft, DraftConflict, sameDraftValue, stableDraftJSON } from './shared-draft';
import { previewMasterPageSplit, type MasterPagePins } from './master-page-boundary';
import { emptyRoutine, parseRoutine, type Document } from './routine-fqc';
import { confirmedDraftBoundaryPolicy, draftPageBoundaries, privateDraftBoundaries } from './draft-page-boundaries';

type Row = Record<string, unknown>;
export type DraftCutoverSource = { revision: number; masterRaw: string; routineRaw: string | null };
export type DraftCutoverPins = MasterPagePins & { routineRawDigest: string };
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const hash = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(stableDraftJSON(value)))), byte => byte.toString(16).padStart(2, '0')).join('');
function hydrated(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Object.hasOwn(value, '__immutableBody') || Object.hasOwn(value, '__liveContent'))
    throw new DraftConflict('DRAFT_CUTOVER_SOURCE_NOT_HYDRATED', 409);
  for (const entry of Object.values(value)) hydrated(entry);
}
function uniqueOwners(entries: unknown[]) {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!object(entry) || typeof entry.id !== 'string' || !entry.id)
      throw new DraftConflict('DRAFT_CUTOVER_SOURCE_INVALID', 422);
    if (ids.has(entry.id)) throw new DraftConflict('DRAFT_CUTOVER_OWNER_AMBIGUOUS', 409);
    ids.add(entry.id);
  }
}
function flowInventory(flow: unknown, expectedScope: string) {
  if (!object(flow) || flow.scope !== expectedScope || !object(flow.active) || !object(flow.active.content) || !object(flow.working) ||
    !Array.isArray(flow.saves) || !Array.isArray(flow.cases) || !object(flow.receipts) ||
    flow.pendingId !== null && (typeof flow.pendingId !== 'string' || !flow.pendingId))
    throw new DraftConflict('DRAFT_CUTOVER_SOURCE_INVALID', 422);
  uniqueOwners(flow.saves); uniqueOwners(flow.cases);
  const cases = flow.cases as Row[];
  if (cases.some(entry => !object(entry))) throw new DraftConflict('DRAFT_CUTOVER_SOURCE_INVALID', 422);
  const pending = cases.filter(entry => entry.status === 'pending' || entry.status === 'pending-test').map(entry => entry.id);
  if (flow.pendingId && !pending.includes(flow.pendingId)) pending.push(flow.pendingId);
  return { scope: expectedScope, pending, approvedCases: cases.filter(entry => entry.status === 'approved').length,
    cases: cases.length, saves: flow.saves.length, receipts: Object.keys(flow.receipts).length,
    hasApprovedSource: !!flow.active.id, workingDiffers: stableDraftJSON(flow.working) !== stableDraftJSON(flow.active.content), hasSaved: !!flow.saved };
}
function routineDocument(doc: Document) {
  if (!doc || typeof doc.id !== 'string' || !doc.id) throw new DraftConflict('DRAFT_CUTOVER_SOURCE_INVALID', 422);
  if ('routine-fqc:' + doc.id === 'routine-fqc:page') throw new DraftConflict('DRAFT_CUTOVER_SCOPE_COLLISION', 409);
  const inventory = flowInventory(doc.flow, 'routine-fqc:' + doc.id);
  if (doc.flow.active.id) {
    const approved = doc.flow.cases.find(review => review.id === doc.flow.active.id && review.status === 'approved');
    const saved = approved && doc.flow.saves.find(save => save.id === approved.savedId);
    if (!approved || !saved || !sameDraftValue(approved.content, doc.flow.active.content) || !sameDraftValue(saved.content, approved.content))
      throw new DraftConflict('DRAFT_CUTOVER_APPROVED_ROUTINE_SOURCE_INVALID', 409);
  }
  return inventory;
}

// Business cutover planning only. No HTTP entry, storage key, mutation, SQL,
// backup tool, generated approval, new receipt, writer or activation flag.
// Input must be a complete authorized source read, pinned independently before
// any transformation. It may contain private records; never expose this result
// through a public response or commit its retained source to source control.
export async function planDraftPageCutover(supplied: DraftCutoverSource, expected: DraftCutoverPins) {
  if (!object(supplied) || !Number.isSafeInteger(supplied.revision) || supplied.revision < 0 ||
    typeof supplied.masterRaw !== 'string' || !supplied.masterRaw ||
    supplied.routineRaw !== null && typeof supplied.routineRaw !== 'string' ||
    !object(expected) || Object.keys(expected).sort().join(',') !== 'revision,rootDigest,routineRawDigest,versions' ||
    !/^[a-f0-9]{64}$/.test(expected.routineRawDigest) || supplied.revision !== expected.revision)
    throw new DraftConflict('DRAFT_CUTOVER_SOURCE_CHANGED', 409);
  // Freeze strings, pins and revision before the first asynchronous boundary.
  const source = cloneDraft(supplied), pins = cloneDraft(expected);
  if (await hash(source.routineRaw) !== pins.routineRawDigest) throw new DraftConflict('DRAFT_CUTOVER_SOURCE_CHANGED', 409);
  let root: Row;
  try { root = JSON.parse(source.masterRaw); }
  catch { throw new DraftConflict('DRAFT_CUTOVER_SOURCE_INVALID', 422); }
  if (!object(root)) throw new DraftConflict('DRAFT_CUTOVER_SOURCE_INVALID', 422);
  let routine;
  try { routine = source.routineRaw === null ? emptyRoutine() : parseRoutine(source.routineRaw); }
  catch { throw new DraftConflict('DRAFT_CUTOVER_SOURCE_INVALID', 422); }
  if (!object(routine.receipts) || !Number.isSafeInteger(routine.revision) || routine.revision < 0)
    throw new DraftConflict('DRAFT_CUTOVER_SOURCE_INVALID', 422);
  hydrated(root); hydrated(routine);
  if (!object(root.workflowScopes) && root.workflowScopes !== undefined || !Array.isArray(root.versions))
    throw new DraftConflict('DRAFT_CUTOVER_SOURCE_INVALID', 422);
  if (Object.keys(root.workflowScopes || {}).some(scope => !['AB', 'C', 'PROCESS'].includes(scope)))
    throw new DraftConflict('DRAFT_CUTOVER_UNSUPPORTED_OWNER', 409);
  const masterFlows = Object.entries((root.workflowScopes || {}) as Row).map(([scope, flow]) => flowInventory(flow, 'master:' + scope));
  uniqueOwners(routine.documents);
  const routineFlows = routine.documents.map(routineDocument);
  if ((root.versions as unknown[]).some(version => !object(version))) throw new DraftConflict('DRAFT_CUTOVER_SOURCE_INVALID', 422);
  const pendingVersions = (root.versions as Row[]).filter(version => version.status === 'pending' || version.status === 'pending-test');
  const pending = [...masterFlows, ...routineFlows].flatMap(entry => entry.pending.map(id => ({ owner: entry.scope, id })))
    .concat(pendingVersions.map(version => ({ owner: 'master:' + String(version.scope), id: version.id })));
  if (pending.length) throw new DraftConflict('DRAFT_CUTOVER_PENDING_CASES_REQUIRE_RESOLUTION', 409, { pending });
  const master = await previewMasterPageSplit({ revision: source.revision, root: root as Parameters<typeof previewMasterPageSplit>[0]['root'] },
    { revision: pins.revision, rootDigest: pins.rootDigest, versions: pins.versions });
  // Routine's business document IDs/kinds/links remain documents within ONE
  // future page content. Only already approved document content is projected;
  // unapproved working/saved content stays in the unchanged retained original.
  const routineApproved = routine.documents.filter(doc => !!doc.flow.active.id).map(doc => ({
    document: Object.fromEntries(Object.entries(doc).filter(([key]) => key !== 'flow')),
    content: cloneDraft(doc.flow.active.content), sourceVersionId: doc.flow.active.id,
  }));
  return {
    kind: 'draft-page-cutover-plan-v1' as const,
    activationAvailable: false as const,
    sourcePins: pins,
    policy: confirmedDraftBoundaryPolicy,
    pages: draftPageBoundaries,
    privateDrafts: privateDraftBoundaries,
    masterDocuments: master.documents,
    masterUnchangedPages: master.unchangedPages,
    masterIssues: master.issues,
    routine: { page: 'ROUTINE_FQC', scope: 'routine-fqc:page', approvedDocuments: routineApproved,
      // This is a reference projection, not a new approved page version.
      createsApprovedVersion: false as const, newWorkflowCreated: false as const },
    inventory: { masterFlows, routineFlows, masterVersionCount: root.versions.length,
      routineDocuments: routine.documents.length, routineCases: routine.cases.length, routineReceipts: Object.keys(routine.receipts).length },
    discardableWorking: [...masterFlows.filter(entry => ['master:AB', 'master:C'].includes(entry.scope)), ...routineFlows]
      .filter(entry => !entry.hasApprovedSource || entry.workingDiffers || entry.hasSaved).map(entry => entry.scope),
    // Exact original strings retain history, pending/terminal records, metadata,
    // all receipts and media references. This is not a verified DB/R2 backup.
    retainedSource: { masterRaw: source.masterRaw, routineRaw: source.routineRaw },
    requiresBeforeExecution: ['COMPLETE_LIVE_SOURCE_READ', 'VERIFIED_ORIGINAL_DB_R2_RECOVERY', 'PAGE_WRITERS_CODEC_CAS_AND_LEGACY_FENCES',
      'ROUTINE_ATOMIC_PAGE_SAVE_AND_APPROVAL_EFFECTS', 'UI_PERMISSIONS_AND_MEDIA_ACCEPTANCE', 'EXPLICIT_REAL_CUTOVER_CONFIRMATION'] as const,
  };
}
