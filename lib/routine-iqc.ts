import type { State } from './process-state';
import type { IqcItem, IqcRule, IqcVersion } from './iqc';
import type { IqcWorkflowControl } from './iqc-workflow';
import { approvedVersion, approvedVersions } from './approved-history';
import type { CalendarTimelineEntry } from './routine-fqc-calendar';
import { companyDate, type Frequency, type Source } from './routine-fqc';
import { cloneDraft, DraftConflict } from './shared-draft';

export type IqcRoutineSource = Source & {
  iqc: { partId: string; categoryId: string; supplierIds: string[]; itemId: string; ruleId: string;
    rule: IqcRule; partSpecification: string; method?: string; inspectionSpecification?: string; tool: string; equipment: IqcItem['equipmentSnapshot'] };
};

export const RI_KEY = 'routineIqcControl';
export const routineIqcEndpoint = '/api/routine-iqc';
const frequencies = new Map<string, Frequency>([
  ['week', 'weekly'], ['month', 'monthly'], ['quarter', 'quarterly'],
  ['half_year', 'semiannual'], ['year', 'yearly'],
]);
const readControl = (state: State): IqcWorkflowControl | undefined =>
  state.values.iqcMasterControl ? JSON.parse(state.values.iqcMasterControl) : undefined;
const effective = (state: State) => {
  const control = readControl(state);
  return control?.activeVersionId ? approvedVersion(control, control.activeVersionId, true) || undefined : undefined;
};
type SourceVersion = Pick<IqcVersion,'id'|'number'|'snapshot'|'reviewedAt'|'updatedAt'|'createdAt'> &
  {approvalEvidence?:{approvedAt:string|null}};
function stamp(version: SourceVersion) {
  const value = version.approvalEvidence?.approvedAt || version.reviewedAt || version.updatedAt || version.createdAt;
  if (!value || !Number.isFinite(Date.parse(value))) throw new DraftConflict('SOURCE_TIMELINE_INCOMPLETE', 409);
  return new Date(value).toISOString();
}
function project(version: SourceVersion): IqcRoutineSource[] {
  const { categories, parts, errors, items } = version.snapshot;
  const byPart = new Map(parts.filter(part => !part.isDeleted && part.isEnabled !== false).map(part => [part.code, part]));
  const byError = new Map(errors.filter(error => !error.isDeleted).map(error => [error.id, error]));
  const byCategory = new Map(categories.map(category => [category.id, category.nameVi]));
  const effectiveDate = companyDate(new Date(stamp(version)));
  return items.flatMap(item => {
    const part = byPart.get(item.partCode), error = byError.get(item.errorId);
    if (!item.isEnabled || item.isDeleted || !part || error?.partCode !== part.code) return [];
    const scheduled = item.rules.filter(rule => rule.cadence === 'time' && frequencies.has(rule.kind) && typeof rule.value === 'string' && !rule.value.trim());
    // Identical time frequencies on one item describe the same calendar duty.
    // Prefer a stable rule ID so a reorder does not introduce another duty.
    const unique = new Map<string, typeof scheduled[number]>();
    for (const rule of scheduled.slice().sort((a,b) => b.id.localeCompare(a.id))) unique.set(rule.kind, rule);
    return [...unique.values()].map(rule => ({
      id: JSON.stringify([item.id, rule.id]),
      name: item.nameVi, code: item.checkNo, line: '',
      category: byCategory.get(part.categoryId) || '',
      errorCode: error.code, description: [item.methodVi, item.inspectionSpecVi].filter(Boolean).join('\n'),
      versionId: version.id, version: String(version.number), effectiveDate,
      frequency: frequencies.get(rule.kind)!, frequencyText: rule.kind,
      products: [{ code: part.code, name: part.nameVi }],
      iqc: { partId: part.id, categoryId: part.categoryId, supplierIds: [...part.supplierIds],
        itemId: item.id, ruleId: rule.id, rule: cloneDraft(rule), partSpecification: part.specificationVi,
        method: item.methodVi, inspectionSpecification: item.inspectionSpecVi,
        tool: item.toolVi, equipment: cloneDraft(item.equipmentSnapshot || null) },
    }));
  });
}
export function routineIqcSources(state: State) {
  const version = effective(state);
  return version ? project(version) : [];
}
export function routineIqcTimeline(state: State): CalendarTimelineEntry[] {
  const control = readControl(state);
  if (!control) return [];
  // The IQC writer labels both retired drafts and older approvals superseded.
  // Only use authoritative approval snapshots, plus a proven earlier formal
  // baseline identified by an actual approved case's immutable base pointer.
  const reviewed = approvedVersions(control, true)
    .filter(version => version.status === 'superseded' || version.id === control.activeVersionId)
    .map(version => approvedVersion(control, version.id, true)!);
  const bases = new Set(reviewed.filter(version=>version.approvalEvidence.kind==='approved-case').map(version=>version.baseVersionId));
  const known = new Set(reviewed.map(version=>version.id));
  const baselines = control.versions.filter(version => bases.has(version.id) && !known.has(version.id) &&
    version.status==='superseded' && !version.id.startsWith('shared-') &&
    !(control.workflow?.cases || []).some(review=>review.id===version.id));
  return [...reviewed,...baselines].map(version => {
    const at = stamp(version);
    return {id: version.id, at, day: companyDate(new Date(at)), sources: project(version)};
  });
}
export function routineIqcCatalog(state: State) {
  const version = effective(state);
  return {versionId: version?.id || null, version: version ? String(version.number) : null, lines: [],
    categories: (version?.snapshot.categories || []).map(category => ({id: category.id, name: category.nameVi, line: ''})),
    suppliers: (version?.snapshot.suppliers || []).map(supplier => ({id: supplier.id, name: supplier.nameVi})),
    items: routineIqcSources(state).map(source => ({id: source.id, code: source.code, name: source.name,
      line: '', category: source.category, enabled: true, productCodes: source.products.map(part => part.code),
      cadence: 'time', frequency: source.frequency}))};
}
