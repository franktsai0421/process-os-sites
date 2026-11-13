import {cloneDraft, DraftConflict, stableDraftJSON} from './shared-draft';
import {previewMasterPageSplit} from './master-page-boundary';

// Offline, read-only evidence. No routes, activation constructor, DB/R2 writes,
// generated identities or receipt reassignment. The caller supplies a completely
// hydrated, authorized snapshot and exact pins; real cutover is a separate task.
type Row = Record<string, unknown>;
type Source = Parameters<typeof previewMasterPageSplit>[0];
type Pins = Parameters<typeof previewMasterPageSplit>[1];
export type CatalogOperation = {endpoint: string; actorId: string; operationId: string; generation: string | null};
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const hash = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(stableDraftJSON(value)))), byte => byte.toString(16).padStart(2, '0')).join('');
const targets = (scope: string) => scope === 'AB' ? ['AB.catalog', 'LINES'] : scope === 'C' ? ['C.catalog', 'LINES'] : [scope];

export async function previewMasterCatalogHandoff(source: Source, pins: Pins, outstanding: CatalogOperation[] = []) {
  if (!Array.isArray(outstanding) || outstanding.some(op => !object(op) ||
    Object.keys(op).sort().join(',') !== 'actorId,endpoint,generation,operationId' ||
    (['endpoint', 'actorId', 'operationId'] as const).some(key => typeof op[key] !== 'string' || !op[key]) ||
    op.generation !== null && (typeof op.generation !== 'string' || !op.generation)))
    throw new DraftConflict('MASTER_HANDOFF_OPERATIONS_INVALID', 422);
  source = cloneDraft(source); pins = cloneDraft(pins); outstanding = cloneDraft(outstanding);
  const preview = await previewMasterPageSplit(source, pins), root = source.root;
  const workflows = object(root.workflowScopes) ? root.workflowScopes : {};
  const inventory: {kind: string; owner: string; id: string | null; status: unknown; digest: string; proposedPages: string[]}[] = [];
  const issues = [...preview.issues];
  const retain = async (kind: string, owner: string, id: unknown, status: unknown, value: unknown) => {
    inventory.push({kind, owner, id: typeof id === 'string' ? id : null, status: status ?? null,
      digest: await hash(value), proposedPages: targets(owner)});
  };
  for (const version of root.versions) await retain('version', version.scope, version.id, version.status, version);
  for (const [scope, value] of Object.entries(workflows)) {
    if (!object(value)) throw new DraftConflict('MASTER_EXISTING_DATA_INVALID', 422);
    const flow = value;
    await retain('workflow', scope, flow.generation, flow.pendingId ? 'pending' : 'retained', flow);
    for (const key of ['saves', 'cases'] as const) for (const entry of flow[key] as Row[])
      await retain(key === 'saves' ? 'save' : 'case', scope, entry.id, entry.status, entry);
    for (const [id, receipt] of Object.entries(flow.receipts as Row)) {
      await retain('receipt', scope, id, 'original-owner-only', receipt);
      if (!object(receipt) || !object(receipt.result) || receipt.result.operationId !== id)
        issues.push({code: 'RECEIPT_IDENTITY_REQUIRES_REVIEW', scope});
    }
  }
  const operations = outstanding.map(op => {
    // Preserve the exact original endpoint. Never search another owner by ID,
    // infer a new Begin identity, or turn absence into permission to resend.
    const match = /^\/api\/master\/(workflow|pages)\?scope=(AB|C)(?:&caseMetadata=1)?$/.exec(op.endpoint);
    const scope = match ? match[2] + (match[1] === 'pages' ? '.catalog' : '') : null;
    const flow = scope && workflows[scope], receipt = object(flow) && object(flow.receipts) ? flow.receipts[op.operationId] : null;
    const result = object(receipt) && object(receipt.result) ? receipt.result : null;
    const status = !scope ? 'UNCLASSIFIED_ORIGINAL_ENDPOINT' : !receipt ? 'UNRESOLVED_QUERY_ORIGINAL_RECEIPT' :
      !result || !object(receipt) || receipt.actorId !== op.actorId || result.operationId !== op.operationId ||
      op.generation !== null && result.generation !== op.generation ? 'IDENTITY_MISMATCH' : 'ORIGINAL_RECEIPT_PRESENT';
    return {...op, originalOwner: scope, status, replayAllowed: false as const};
  });
  return {kind: 'master-catalog-handoff-preview-v1' as const, activationAvailable: false as const,
    sourcePins: preview.sourcePins, operationsDigest: await hash(outstanding), inventory, operations, issues,
    baselineSources: preview.documents.map(({page, scope, sources}) => ({page, scope, sources})),
    decisionsRequired: ['LEGACY_WORKING_AND_SAVED_DISPOSITION', 'PENDING_CASES_AT_ORIGINAL_OWNER',
      'OUTSTANDING_ORIGINAL_RECEIPTS', 'APPROVED_BASELINE_AND_ACL_REVIEW', 'SEPARATELY_AUTHORIZED_CUTOVER'],
    // Inventory is evidence for retention, not a migration or external backup.
    retentionDigest: preview.retainedSource.digest};
}
