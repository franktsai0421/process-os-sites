import { cloneDraft, DraftConflict, type DraftPatch, stableDraftJSON } from './shared-draft';
import {
  assertMasterOwnedCommand, assertMasterOwnedContent, masterDocumentDescriptors,
  previewMasterDocumentSplit, type MasterDocumentPreviewRoot, type MasterSplitSourceVector,
} from './master-document-boundary';

// Review-only successor to the four split-v1 document projections. A real page
// owns a draft; AB/C filters inside the line page do not own separate drafts.
// No route, storage adapter, environment flag or adoption writer imports this.
export type MasterPage = 'AB' | 'C' | 'LINES' | 'PROCESS';
type Snapshot = Record<string, unknown>;
type Row = Record<string, unknown>;
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
function fail(code: string, status = 422): never { throw new DraftConflict(code, status); }
const catalog = (scope: 'AB' | 'C') => masterDocumentDescriptors.find(d => d.businessScope === scope && d.area === 'catalog')!;
const topology = (scope: 'AB' | 'C') => masterDocumentDescriptors.find(d => d.businessScope === scope && d.area === 'lines')!;

export const masterPageDescriptors = Object.freeze([
  Object.freeze({ page: 'AB', scope: 'master:AB.catalog', permissionModule: 'ab' }),
  Object.freeze({ page: 'C', scope: 'master:C.catalog', permissionModule: 'c' }),
  Object.freeze({ page: 'LINES', scope: 'master:LINES', permissionModule: 'lines' }),
  Object.freeze({ page: 'PROCESS', scope: 'master:PROCESS', permissionModule: 'templates' }),
] as const);

export function assertMasterPageContent(page: Exclude<MasterPage, 'PROCESS'>, content: Snapshot): void {
  if (page === 'AB' || page === 'C') { assertMasterOwnedContent(content, catalog(page)); return; }
  if (page !== 'LINES' || !object(content) || Object.keys(content).length !== 2 ||
    !Object.hasOwn(content, 'AB') || !Object.hasOwn(content, 'C')) fail('MASTER_PAGE_OWNERSHIP_VIOLATION');
  for (const scope of ['AB', 'C'] as const) {
    if (!object(content[scope])) fail('MASTER_PAGE_OWNERSHIP_VIOLATION');
    assertMasterOwnedContent(content[scope] as Snapshot, topology(scope));
  }
}

type Command = { action: string; patches?: DraftPatch[]; moduleAction?: string; input?: Record<string, unknown> };
// Additional ownership proof only. It does not grant permissions or replace the
// kernel's guards, exact receipt identity, pending/generation/reference checks.
export function assertMasterPageSave(page: Exclude<MasterPage, 'PROCESS'>, command: Command): void {
  if (command.action !== 'save' || command.moduleAction !== 'save-local-v1') fail('MASTER_PAGE_EXPLICIT_SAVE_REQUIRED');
  if (page === 'AB' || page === 'C') { assertMasterOwnedCommand(command, catalog(page)); return; }
  if (page !== 'LINES') fail('SCOPE_INVALID');
  const input = command.input;
  if (!object(input) || Object.keys(input).some(key => key !== 'batches') ||
    !Array.isArray(input.batches) || input.batches.length > 256 || !Array.isArray(command.patches)) fail('INVALID_LOCAL_SAVE');
  const batches = input.batches as Row[];
  const ownedPatch = (value: unknown): value is DraftPatch => {
    if (!object(value) || !Array.isArray(value.path) || !['AB', 'C'].includes(String(value.path[0])))
      fail('MASTER_PAGE_OWNERSHIP_VIOLATION');
    const partition = value.path[0] as 'AB' | 'C';
    // Delegate structural/path/collection restrictions to the existing guard.
    assertMasterOwnedCommand({ action: 'apply', patches: [{ ...value, path: value.path.slice(1) } as DraftPatch] }, topology(partition));
    return true;
  };
  for (const patch of command.patches) ownedPatch(patch);
  for (const batch of batches) {
    if (!object(batch) || Object.keys(batch).some(key => !['patches', 'guards'].includes(key)) ||
      !Array.isArray(batch.patches) || !Array.isArray(batch.guards) || batch.guards.length > 256) fail('INVALID_LOCAL_SAVE');
    if ((batch.patches as unknown[]).length > 256) fail('INVALID_LOCAL_SAVE');
    for (const patch of batch.patches as unknown[]) ownedPatch(patch);
    for (const guard of batch.guards as unknown[]) {
      if (!object(guard) || Object.keys(guard).some(key => !['path', 'value'].includes(key)) ||
        !Object.hasOwn(guard, 'value') || !Array.isArray(guard.path) || guard.path.length < 2 ||
        guard.path.length > 33 || !['AB', 'C'].includes(String(guard.path[0])) || guard.path[1] !== 'lines')
        fail('MASTER_PAGE_OWNERSHIP_VIOLATION');
    }
  }
  if (command.patches.length > 256 || stableDraftJSON(command.patches) !==
    stableDraftJSON(batches.flatMap(batch => batch.patches as DraftPatch[]))) fail('INVALID_LOCAL_SAVE');
}

export type MasterPageSource = { revision: number; root: MasterDocumentPreviewRoot };
export type MasterPagePins = { revision: number; rootDigest: string; versions: MasterSplitSourceVector };
const digest = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(stableDraftJSON(value)))), b => b.toString(16).padStart(2, '0')).join('');

function assertHydrated(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Object.hasOwn(value, '__immutableBody') || Object.hasOwn(value, '__liveContent'))
    fail('MASTER_PAGE_SOURCE_NOT_HYDRATED');
  for (const child of Object.values(value)) assertHydrated(child);
}

// Pure internal planning, never a public response or an executable migration.
// Complete retainedSource includes private cases/receipts; no HTTP registration.
// The caller must hydrate and authorize the entire source closure first.
export async function previewMasterPageSplit(source: MasterPageSource, expected: MasterPagePins) {
  if (!object(source) || !Number.isSafeInteger(source.revision) || source.revision < 0 || !object(source.root) ||
    !object(expected) || Object.keys(expected).sort().join(',') !== 'revision,rootDigest,versions' ||
    source.revision !== expected.revision || !/^[a-f0-9]{64}$/.test(expected.rootDigest))
    fail('MASTER_PAGE_SOURCE_CHANGED', 409);
  // Freeze both before asynchronous hashing; caller mutation cannot mix epochs.
  source = cloneDraft(source); expected = cloneDraft(expected);
  assertHydrated(source.root);
  const rootDigest = await digest(source.root);
  if (rootDigest !== expected.rootDigest) fail('MASTER_PAGE_SOURCE_CHANGED', 409);
  const legacy = await previewMasterDocumentSplit(source.root, expected.versions);
  const document = (scope: 'AB' | 'C', area: 'catalog' | 'lines') =>
    legacy.documents.find(d => d.document === scope + '.' + area)!;
  const documents = [
    { page: 'AB' as const, scope: 'master:AB.catalog', content: document('AB', 'catalog').content,
      sources: [document('AB', 'catalog').source] },
    { page: 'C' as const, scope: 'master:C.catalog', content: document('C', 'catalog').content,
      sources: [document('C', 'catalog').source] },
    { page: 'LINES' as const, scope: 'master:LINES', content: {
      AB: document('AB', 'lines').content, C: document('C', 'lines').content,
    }, sources: [document('AB', 'lines').source, document('C', 'lines').source] },
  ];
  for (const entry of documents) assertMasterPageContent(entry.page, entry.content);
  return {
    kind: 'master-page-split-preview-v1' as const,
    activationAvailable: false as const,
    sourcePins: { revision: source.revision, rootDigest, versions: cloneDraft(expected.versions) },
    documents,
    unchangedPages: [{ page: 'PROCESS', scope: 'master:PROCESS', sourceVersionId: expected.versions.PROCESS }],
    // Retention is an in-memory proof only; it is not a verified external backup.
    retainedSource: { digest: rootDigest, content: source.root },
    issues: legacy.issues,
    legacy: legacy.legacy,
    identities: legacy.identities,
    decisionsRequired: ['LEGACY_CUTOFF_POLICY', 'LINES_PARTITION_PERMISSIONS'] as const,
    implementationRequired: ['STORAGE_CODEC_CAS', 'WRITERS_AND_OLD_CLIENT_FENCE', 'REVIEW_HISTORY_RECEIPTS',
      'PROCESS_LINK_AND_APPROVED_PROJECTION', 'UI_LIFECYCLE_AND_BACKUP_RESTORE'] as const,
  };
}
