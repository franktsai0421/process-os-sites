import { normalizeMasterSnapshot } from './master-workflow';
import { DraftConflict, stableDraftJSON } from './shared-draft';
import { isImmutableRecordBody } from './state-records';

type Row = Record<string, unknown>;
type CatalogRoot = {
  active?: Record<string, Row>;
  versions?: Row[];
  workflowScopes?: Record<string, { active: { id: string } }>;
};
const scope = 'AB';
export class MasterCatalogLegacyFallback extends Error {}
const existing = (raw: string | undefined): CatalogRoot => {
  if (!raw) throw new DraftConflict('MASTER_INITIALIZATION_REQUIRED', 422);
  const root = JSON.parse(raw) as CatalogRoot;
  if (!root.active?.[scope] || !Array.isArray(root.versions))
    throw new DraftConflict('MASTER_EXISTING_DATA_INVALID', 422);
  return root;
};

// Read-only projection before immutable body hydration. Match the decoder's
// existing adopted-history rule: approved references different from active
// remain deferred and cannot become newly eligible matching candidates. Legacy
// roots retain all approved candidates for the same first-matching fallback.
// No working/history body substitutes for active; never use as a write baseline.
export function projectMasterCatalog(key: string, raw: string): string | undefined {
  if (key !== 'masterDataControl') return undefined;
  const root = existing(raw), versions = root.versions!.filter(v => v.scope === scope);
  if (!root.workflowScopes?.[scope]) throw new MasterCatalogLegacyFallback();
  const activeId = root.workflowScopes?.[scope]?.active.id;
  const adopted = !!root.workflowScopes?.[scope], activeBody = root.active!.AB;
  const candidates = new Set(versions.filter(v => v.status === 'approved' && (!adopted ||
    !isImmutableRecordBody(v.snapshot) || isImmutableRecordBody(activeBody) &&
    v.snapshot.__immutableBody.sha256 === activeBody.__immutableBody.sha256)));
  return JSON.stringify({
    active: { AB: root.active!.AB },
    versions: versions.map(v => ({
      id: v.id, number: v.number, scope, status: v.status,
      ...(candidates.has(v) ? { snapshot: v.snapshot } : {}),
    })),
    ...(activeId === undefined ? {} : { workflowScopes: { AB: { active: { id: activeId } } } }),
  });
}

export function masterCatalog(raw: string | undefined) {
  const root = existing(raw), versions = root.versions!.filter(v => v.scope === scope);
  const matching = (v: Row) => v.status === 'approved' &&
    stableDraftJSON(v.snapshot) === stableDraftJSON(root.active!.AB);
  const active = versions.find(v => v.id === root.workflowScopes?.[scope]?.active.id && matching(v)) ||
    versions.find(matching);
  if (!active) throw new DraftConflict('MASTER_EFFECTIVE_BASELINE_CONFLICT', 409);
  const ids = versions.map(v => v.id);
  // The FQC reader already refuses duplicate active IDs. Do not make a
  // projected one-row response accidentally turn that invalid root into success.
  if (typeof active.id !== 'string' || !active.id || ids.filter(id => id === active.id).length !== 1)
    throw new DraftConflict('MASTER_EFFECTIVE_BASELINE_CONFLICT', 409);
  return {
    activeVersionId: active.id,
    versions: [{ id: active.id, number: active.number, status: 'approved',
      snapshot: normalizeMasterSnapshot(active.snapshot as Row, scope) }],
  };
}
