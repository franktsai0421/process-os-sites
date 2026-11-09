import { cloneDraft, DraftConflict, sameDraftValue, stableDraftJSON, type DraftPatch } from './shared-draft';

// Preparation only: these descriptors do not create workflows or authorize a
// data-owner cutover. No environment flag or client-supplied marker enables it.
export type MasterBusinessScope = 'AB' | 'C';
export type MasterDocumentArea = 'catalog' | 'lines';
export type MasterDocumentScope = `${MasterBusinessScope}.${MasterDocumentArea}`;
type Collection = 'products' | 'categoryGroups' | 'lines';
type Snapshot = Record<string, unknown>;
type Row = Record<string, unknown>;
export type MasterDocumentDescriptor = Readonly<{
  layout: 'split-v1';
  scope: MasterDocumentScope;
  businessScope: MasterBusinessScope;
  area: MasterDocumentArea;
  permissionModule: 'ab' | 'c';
  collections: readonly Collection[];
}>;

const catalogCollections = Object.freeze(['products', 'categoryGroups'] as const);
const lineCollections = Object.freeze(['lines'] as const);
export const masterDocumentDescriptors: readonly MasterDocumentDescriptor[] = Object.freeze(
  (['AB', 'C'] as const).flatMap(businessScope => (['catalog', 'lines'] as const).map(area => Object.freeze({
    layout: 'split-v1' as const, scope: `${businessScope}.${area}` as MasterDocumentScope,
    businessScope, area, permissionModule: businessScope === 'AB' ? 'ab' as const : 'c' as const,
    collections: area === 'catalog' ? catalogCollections : lineCollections,
  }))),
);

// An absent selector retains the exact legacy route. A partial, duplicated or
// unsupported selector must never fall through to a combined AB/C workflow.
export function parseMasterDocumentSelector(query: URLSearchParams): MasterDocumentDescriptor | null {
  // Page ownership is still a review-only plan. Never ignore a new caller's
  // page marker and accidentally dispatch a combined legacy AB/C mutation.
  if (query.has('page')) throw new DraftConflict('MASTER_DOCUMENT_SELECTOR_INVALID', 422);
  if (!query.has('area') && !query.has('layout')) return null;
  if (['scope', 'area', 'layout'].some(key => query.getAll(key).length !== 1) ||
    query.get('layout') !== 'split-v1') throw new DraftConflict('MASTER_DOCUMENT_SELECTOR_INVALID', 422);
  const descriptor = masterDocumentDescriptors.find(d =>
    d.businessScope === query.get('scope') && d.area === query.get('area'));
  if (!descriptor || query.has('catalog') || query.has('references'))
    throw new DraftConflict('MASTER_DOCUMENT_SELECTOR_INVALID', 422);
  return descriptor;
}

// The runtime admission boundary remains closed until all writers, immutable
// history readers, receipts, permissions and an authorized cutoff are ready.
export function assertMasterDocumentRouteAvailable(query: URLSearchParams): void {
  if (parseMasterDocumentSelector(query)) throw new DraftConflict('MASTER_DOCUMENT_SPLIT_NOT_ENABLED', 409);
}

const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown): string => typeof value === 'string' ? value : '';
const rows = (value: unknown): Row[] => {
  if (!Array.isArray(value) || value.some(row => !object(row)))
    throw new DraftConflict('MASTER_DOCUMENT_CONTENT_INVALID', 422);
  return value;
};
function registered(descriptor: MasterDocumentDescriptor): MasterDocumentDescriptor {
  // Callers use a server-resolved descriptor, not a forged collections list.
  const match = masterDocumentDescriptors.find(d => d === descriptor);
  if (!match) throw new DraftConflict('MASTER_DOCUMENT_SELECTOR_INVALID', 422);
  return match;
}

// Projection is a new owned view, not a replacement for its source. Unknown
// nested fields survive; unowned top-level extensions remain in the old record.
export function projectMasterOwnedContent(snapshot: Snapshot, descriptor: MasterDocumentDescriptor): Snapshot {
  const owner = registered(descriptor);
  if (!object(snapshot)) throw new DraftConflict('MASTER_DOCUMENT_CONTENT_INVALID', 422);
  return Object.fromEntries(owner.collections.map(key => [key,
    cloneDraft(rows(key === 'categoryGroups' && !Object.hasOwn(snapshot, key) ? [] : snapshot[key]))]));
}

export function assertMasterOwnedContent(snapshot: Snapshot, descriptor: MasterDocumentDescriptor): void {
  const owner = registered(descriptor);
  if (!object(snapshot) || Object.keys(snapshot).length !== owner.collections.length ||
    Object.keys(snapshot).some(key => !owner.collections.includes(key as Collection)))
    throw new DraftConflict('MASTER_DOCUMENT_OWNERSHIP_VIOLATION', 422);
  // Writes must provide every owned collection as an actual array. The legacy
  // reader's absent-categoryGroups compatibility is not write admission.
  for (const key of owner.collections) rows(snapshot[key]);
}

type OwnedCommand = { action: string; patches?: DraftPatch[]; moduleAction?: string; input?: Record<string, unknown> };
// This is an extra admission guard, never a substitute for the normal kernel's
// field/identity guards, permission checks, reference validation or CAS.
export function assertMasterOwnedCommand(command: OwnedCommand, descriptor: MasterDocumentDescriptor): void {
  const owner = registered(descriptor);
  const check = (patches: unknown) => {
    if (!Array.isArray(patches) || patches.length > 256) throw new DraftConflict('INVALID_LOCAL_SAVE', 422);
    for (const patch of patches) {
      if (!object(patch) || !['set', 'insert', 'remove', 'order'].includes(String(patch.op)) ||
        !Array.isArray(patch.path) || !patch.path.length || patch.path.length > 32 ||
        !owner.collections.includes(patch.path[0] as Collection))
        throw new DraftConflict('MASTER_DOCUMENT_OWNERSHIP_VIOLATION', 422);
      // Collection set/removal could smuggle a full snapshot or erase children.
      if (patch.path.length === 1 && ['set', 'remove'].includes(String(patch.op)))
        throw new DraftConflict('COLLECTION_REPLACEMENT_FORBIDDEN', 422);
    }
  };
  check(command.patches ?? []);
  if (command.moduleAction === undefined) {
    if (command.input !== undefined) throw new DraftConflict('INVALID_MODULE_ACTION', 422);
    return;
  }
  if (command.action !== 'save' || command.moduleAction !== 'save-local-v1' || !object(command.input) ||
    Object.keys(command.input).some(key => key !== 'batches') || !Array.isArray(command.input.batches) ||
    command.input.batches.length > 256) throw new DraftConflict('INVALID_MODULE_ACTION', 422);
  const batches = command.input.batches;
  for (const batch of batches) {
    if (!object(batch) || Object.keys(batch).some(key => !['patches', 'guards'].includes(key)) ||
      !Array.isArray(batch.guards)) throw new DraftConflict('INVALID_LOCAL_SAVE', 422);
    check(batch.patches);
  }
  if (stableDraftJSON(batches.flatMap(batch => (batch as { patches: DraftPatch[] }).patches)) !==
    stableDraftJSON(command.patches ?? [])) throw new DraftConflict('INVALID_LOCAL_SAVE', 422);
}

type LegacyVersion = Row & { id: string; scope: string; status: string; snapshot: Snapshot };
export type MasterDocumentPreviewRoot = {
  active: Record<string, Snapshot>;
  versions: LegacyVersion[];
  workflowScopes?: Record<string, Row>;
  [key: string]: unknown;
};

// Read approved effective content only. A working/saved/pending proposal is
// never substituted, even when it has newer rows or a matching display code.
export function approvedMasterSource(root: MasterDocumentPreviewRoot, scope: 'AB' | 'C' | 'PROCESS') {
  if (!['AB', 'C', 'PROCESS'].includes(scope)) throw new DraftConflict('SCOPE_INVALID', 422);
  if (!object(root) || !object(root.active) || !object(root.active[scope]) || !Array.isArray(root.versions))
    throw new DraftConflict('MASTER_EXISTING_DATA_INVALID', 422);
  if (Object.hasOwn(root.active[scope], '__immutableBody'))
    throw new DraftConflict('MASTER_DOCUMENT_SOURCE_NOT_HYDRATED', 422);
  if (root.versions.some(v => !object(v))) throw new DraftConflict('MASTER_EXISTING_DATA_INVALID', 422);
  const versions = root.versions.filter(v => v.scope === scope);
  const activePointer = root.workflowScopes?.[scope]?.active;
  const matching = (version: LegacyVersion) => version.status === 'approved' &&
    object(version.snapshot) && sameDraftValue(version.snapshot, root.active[scope]);
  const active = versions.find(v => object(activePointer) && v.id === activePointer.id && matching(v)) ||
    versions.find(matching);
  if (!active || typeof active.id !== 'string' || !active.id ||
    root.versions.filter(v => v.id === active.id).length !== 1)
    throw new DraftConflict('MASTER_EFFECTIVE_BASELINE_CONFLICT', 409);
  return { versionId: active.id, snapshot: cloneDraft(active.snapshot) };
}

export function approvedMasterDocument(root: MasterDocumentPreviewRoot, descriptor: MasterDocumentDescriptor) {
  const owner = registered(descriptor), source = approvedMasterSource(root, owner.businessScope);
  return { document: owner.scope, layout: owner.layout,
    source: { kind: 'legacy-approved-full-v1' as const, scope: owner.businessScope, versionId: source.versionId },
    content: projectMasterOwnedContent(source.snapshot, owner) };
}

export type MasterSplitSourceVector = { AB: string; C: string; PROCESS: string };
type PreviewIssue = { code: string; scope: string; path?: string };
const digest = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(stableDraftJSON(value)))), b => b.toString(16).padStart(2, '0')).join('');

// Pure, explicitly pinned preparation, with no generated workflow/version/save
// IDs or actor/timestamp claims. Caller must authorize and hydrate the complete
// source first. A preview is never an executable adoption plan or proof of ACL,
// reference-history, writer-inventory, receipt or live-data readiness.
export async function previewMasterDocumentSplit(root: MasterDocumentPreviewRoot, expected: MasterSplitSourceVector) {
  if (!object(root)) throw new DraftConflict('MASTER_EXISTING_DATA_INVALID', 422);
  if (!object(expected)) throw new DraftConflict('MASTER_DOCUMENT_SOURCE_CHANGED', 409);
  // Capture both complete inputs before the first asynchronous digest. A caller
  // advancing its in-memory model cannot mix new document bodies into old pins.
  root = cloneDraft(root);
  expected = cloneDraft(expected);
  const sources = { AB: approvedMasterSource(root, 'AB'), C: approvedMasterSource(root, 'C'),
    PROCESS: approvedMasterSource(root, 'PROCESS') };
  if (!object(expected) || Object.keys(expected).length !== 3 ||
    (['AB', 'C', 'PROCESS'] as const).some(scope => expected[scope] !== sources[scope].versionId))
    throw new DraftConflict('MASTER_DOCUMENT_SOURCE_CHANGED', 409);
  const issues: PreviewIssue[] = [], archives: Row[] = [], identities: Row[] = [];
  const lineCodes = new Set<string>(), stageCodes = new Set<string>(), productCodes = new Set<string>();
  for (const scope of ['AB', 'C'] as const) {
    const snapshot = sources[scope].snapshot;
    const groups = rows(Object.hasOwn(snapshot, 'categoryGroups') ? snapshot.categoryGroups : []),
      products = rows(snapshot.products), lines = rows(snapshot.lines);
    const checkIds = (list: Row[], path: string, fallback: (row: Row) => string) => {
      const ids = new Set<string>();
      for (const row of list) {
        const id = row.id === undefined || row.id === null || row.id === '' ? fallback(row) : row.id;
        if (typeof id !== 'string' || !id || ids.has(id)) issues.push({ code: 'CATALOG_IDENTITY_INVALID', scope, path });
        if (typeof id === 'string') ids.add(id);
        if (!row.id) identities.push({ scope, path, code: row.code ?? null, id, kind: 'existing-deterministic-id' });
      }
    };
    const checkCodes = (list: Row[], codes: Set<string>, path: string) => {
      for (const row of list) {
        if (typeof row.code !== 'string' || !row.code || codes.has(row.code))
          issues.push({ code: 'CATALOG_CODE_COLLISION_OR_INVALID', scope, path });
        codes.add(String(row.code));
      }
    };
    checkIds(products, 'products', row => 'products:' + str(row.code));
    checkIds(groups, 'categoryGroups', row => 'categoryGroups:' + JSON.stringify([row.line, row.name]));
    checkIds(lines, 'lines', row => 'lines:' + str(row.code));
    checkCodes(products, productCodes, 'products'); checkCodes(lines, lineCodes, 'lines');
    for (const line of lines) {
      const stages = rows(line.stages), path = 'lines/' + String(line.id || line.code) + '/stages';
      // Stage identity is nested under its line; do not invent global ID uniqueness.
      checkIds(stages, path, row => 'stage:' + str(row.code)); checkCodes(stages, stageCodes, path);
    }
    for (const product of products) {
      const line = lines.find(l => l.code === product.line);
      if (!line || !Array.isArray(product.stages) || new Set(product.stages).size !== product.stages.length ||
        product.stages.some(code => !rows(line.stages).some(s => s.code === code)))
        issues.push({ code: 'PRODUCT_ROUTE_INVALID', scope, path: 'products/' + String(product.id || product.code) });
    }
    const categoryKeys = new Set<string>();
    for (const group of groups) {
      const line = lines.find(l => l.code === group.line), key = JSON.stringify([group.line, group.name]);
      if (!line || typeof group.name !== 'string' || categoryKeys.has(key))
        issues.push({ code: 'CATEGORY_INVALID', scope, path: 'categoryGroups' });
      categoryKeys.add(key);
      if (group.defaultStages !== undefined && group.defaultStages !== null && (!Array.isArray(group.defaultStages) ||
        new Set(group.defaultStages).size !== group.defaultStages.length ||
        group.defaultStages.some(code => !line || !rows(line.stages).some(s => s.code === code))))
        issues.push({ code: 'GROUP_ROUTE_INVALID', scope, path: 'categoryGroups' });
    }
    for (const product of products) {
      const group = groups.find(g => g.line === product.line && g.name === product.category);
      if (product.routeMode !== undefined && !['group', 'exception'].includes(str(product.routeMode)) ||
        Array.isArray(group?.defaultStages) && product.routeMode === undefined ||
        product.routeMode === 'group' && (!Array.isArray(group?.defaultStages) || !sameDraftValue(product.stages, group.defaultStages)))
        issues.push({ code: 'PRODUCT_GROUP_ROUTE_INVALID', scope, path: 'products/' + String(product.id || product.code) });
    }
  }
  // Report all existing workflows, including unknown extensions. None is erased,
  // converted to a new Save, or relabeled as reviewed by producing this preview.
  for (const [scope, flow] of Object.entries(root.workflowScopes ?? {})) {
    if (!object(flow) || !Array.isArray(flow.cases) || !object(flow.receipts) || !Array.isArray(flow.saves))
      throw new DraftConflict('MASTER_EXISTING_DATA_INVALID', 422);
    const pending = flow.cases.filter(c => object(c) && c.status === 'pending');
    if (flow.pendingId || pending.length || root.versions.some(v => v.scope === scope && v.status === 'pending'))
      issues.push({ code: 'OPEN_REVIEW_CASE', scope });
    if (flow.pendingId && !pending.some(c => object(c) && c.id === flow.pendingId))
      issues.push({ code: 'ORPHAN_PENDING_ID', scope });
    if (pending.some(c => object(c) && c.linkedProcess)) issues.push({ code: 'LINKED_PROCESS_CASE_PENDING', scope });
    const source = sources[scope as keyof typeof sources];
    const workingChanged = !!source && !sameDraftValue(flow.working, source.snapshot);
    if (workingChanged) issues.push({ code: 'LEGACY_WORKING_REQUIRES_EXPLICIT_CUTOFF_DECISION', scope });
    if (flow.saved) issues.push({ code: 'LEGACY_SAVED_REQUIRES_RETENTION_PLAN', scope });
    archives.push({ scope, generation: flow.generation ?? null, pendingId: flow.pendingId ?? null,
      savedId: object(flow.saved) ? flow.saved.id ?? null : null, workingChanged,
      saves: flow.saves.length, cases: flow.cases.length, receipts: Object.keys(flow.receipts).length,
      extensionKeys: Object.keys(flow).filter(key => !['schemaVersion', 'scope', 'generation', 'revision', 'active', 'baseId',
        'working', 'saved', 'pendingId', 'contributors', 'saves', 'cases', 'tombstones', 'sequences', 'receipts'].includes(key)).sort() });
  }
  for (const version of root.versions) if (version.status === 'pending' &&
    !root.workflowScopes?.[version.scope]) issues.push({ code: 'OPEN_REVIEW_CASE', scope: version.scope });
  return { kind: 'master-document-split-preview-v1' as const, activationAvailable: false as const,
    sourceVector: cloneDraft(expected), rootDigest: await digest(root),
    sources: await Promise.all((['AB', 'C', 'PROCESS'] as const).map(async scope => ({ scope,
      versionId: sources[scope].versionId, digest: await digest(sources[scope].snapshot),
      extensionKeys: scope === 'PROCESS' ? [] : Object.keys(sources[scope].snapshot)
        .filter(key => !['products', 'lines', 'categoryGroups'].includes(key)).sort() }))),
    documents: masterDocumentDescriptors.map(descriptor => approvedMasterDocument(root, descriptor)),
    legacy: { workflows: archives, versions: root.versions.length,
      rootExtensionKeys: Object.keys(root).filter(key => !['active', 'versions', 'workflowScopes'].includes(key)).sort() },
    identities, issues,
  };
}
