import {assertNotResetRetired} from './routine-reset-ledger';
import {assertRoutineResetFence} from './routine-reset-fence';
import {periodItemCode,reconcileCalendar,type CalendarTimelineEntry,generateCalendar,calendarCanArrange,validatePlanDates,validCalendarDate,calendarNextSelection,type CalendarPolicy,type CalendarWork} from './routine-fqc-calendar';
import {approvedMasterPageCatalog} from './master-approved-pages';
import {legacyJsonValueText,type JsonValue} from './legacy-login-json';
import type {FqcSnapshot} from './fqc-workflow';
import {
  createSharedDraft,
  applyDraftCommand,
  isSavedCaseResubmission,
  cloneDraft,
  stableDraftJSON,
  DraftConflict,
  type SharedDraft,
  type DraftCommand,
  type DraftActor,
  type DraftIssue,
  type DraftPermission,
  type DraftContext,
} from './shared-draft';
import type { State } from './process-state';

type RoutineSourceItem = Pick<FqcSnapshot['items'][number], 'id'|'name'|'checkNo'|'line'|'category'|'errorId'|'productCodes'|'isEnabled'> & {
  isDeleted?:boolean;description?:string;rule?:{cadence?:string;timeFrequency?:string;customTimeText?:string};
};

export const RF_KEY = 'routineFqcControl';
export type Frequency =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'yearly';
export type Outcome = '' | 'pass' | 'fail' | 'abnormal' | 'dispose' | 'unable' | 'undetermined';
export type Source = {
  id: string;
  name: string;
  code: string;
  line: string;
  category: string;
  errorCode: string;
  description: string;
  versionId: string;
  version: string;
  effectiveDate: string;
  frequency: Frequency | null;
  frequencyText: string;
  products: { code: string; name: string }[];
  standardSnapshot?: FqcSnapshot["items"][number];
};
export type Job = {
  calendar?: CalendarWork;
  id: string;
  itemId: string;
  period: string;
  start: string;
  end: string;
  source: Source;
  planId: string | null;
  completion: null | { kind: string; reportId: string; at: string };
  createdAt: string;
};
export type ResultRow = {
  id: string;
  samples: string[];
  outcome: Outcome;
  value: string;
  notes: string;
  disposalReason?: string;
  photos: string[];
};
export type Line = {
  id: string;
  jobId: string;
  source: Source;
  requiredSamples?: string[];
  results: ResultRow[];
};
export type Content = {
  planStart?: string; planEnd?: string; overdueReason?: string; nextDate?: string; skipReason?: string; dispositionResult?: string;
  title: string;
  date: string;
  notes: string;
  lines: Line[];
  reason: string;
  disposition: string;
  evidence: string[];
};
export type Document = {
  disposalPolicy?: 'skip-period';
  calendarLegacy?: {adoptedAt:string;unrecordedPlanDates:boolean};
  waiverRetests?: {jobIds:string[]; documents:{id:string;revision:number;activeId:string|null;jobIds:string[]}[]};
  nextWork?: {targetId:string;skipIds:string[];sourceVersionId:string};
  retestApplicationCaseId?: string; calendarVersion?: 2; requestKind?: 'skip'|'retest'|'void'; targetPlanId?: string; cancelledJobIds?: string[]; submissionLog?: {at:string;reason:string;caseId:string|null}[];
  id: string;
  number: string;
  kind: 'plan' | 'report' | 'waiver' | 'disposal';
  planId: string | null;
  caseId: string | null;
  correctionOf: string | null;
  createdAt: string;
  owner: DraftActor;
  flow: SharedDraft<Content>;
  reopened?: boolean;
  cancelled?: { at: string; actor: DraftActor; status: string; caseStatus?: Case['status'] };
  lifecycle?: { action: string; at: string; actor: DraftActor }[];
  impact?: {
    id: string;
    reason: string;
    resolvedAt?: string;
    resolvedBy?: string;
  }[];
};
export type RoutineDocumentMetadata = Omit<Document, 'flow'>;
export type RoutineBusinessState = Omit<RoutineFqc, 'documents'> & { documents: RoutineDocumentMetadata[] };
export type RoutineDocumentLinks = Partial<Pick<RoutineDocumentMetadata, 'planId' | 'caseId' | 'correctionOf'>>;

export type Case = {
  lineageJobIds?: string[];
  id: string;
  number: string;
  jobId: string;
  planId: string;
  originReportId: string;
  reportIds: string[];
  status: 'open' | 'retest' | 'ready-close' | 'closed' | 'disposed' | 'waived';
  result: Outcome;
  requiredSamples: string[];
  improvements: {
    id: string;
    notes: string;
    photos: string[];
    actor: DraftActor;
    at: string;
  }[];
  events: {
    action: string;
    actor: DraftActor;
    at: string;
    reason: string;
    documentId?: string;
  }[];
};
export type RoutineFqc = {
  draftStops?:{actorId:string;operationId:string;documentId:string;generation:string;action:string;at:string}[];
  resetGenerationRevision?: number;
  calendarPolicy?: CalendarPolicy;
  schemaVersion: 1;
  revision: number;
  startDate: string | null;
  jobs: Job[];
  documents: Document[];
  cases: Case[];
  receipts: Record<
    string,
    { actorId: string; fingerprint: string; result: unknown }
  >;
  events: { action: string; actor: DraftActor; at: string; reason: string }[];
};
export const emptyRoutine = (): RoutineFqc => ({
  schemaVersion: 1,
  revision: 0,
  startDate: null,
  jobs: [],
  documents: [],
  cases: [],
  receipts: {},
  events: [],
});
export function parseRoutine(raw?: string): RoutineFqc {
  if (!raw) return emptyRoutine();
  const c = JSON.parse(raw);
  if (
    c?.schemaVersion !== 1 ||
    !Array.isArray(c.jobs) ||
    !Array.isArray(c.documents) ||
    !Array.isArray(c.cases)
  )
    throw new DraftConflict('FQC_DATA_INVALID', 422);
  return c;
}
function demand(ok: unknown, code: string, status = 422): asserts ok {
  if (!ok) throw new DraftConflict(code, status);
}
export const companyDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
const dateOK = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s + 'T00:00:00Z')) &&
  new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const nextDate = (s: string) =>
  iso(new Date(Date.parse(s + 'T00:00:00Z') + 86400000));
export function periodAt(day: string, frequency: Frequency) {
  const d = new Date(day + 'T00:00:00Z'),
    y = d.getUTCFullYear(),
    m = d.getUTCMonth();
  let start: Date, end: Date;
  if (frequency === 'weekly') {
    start = new Date(d);
    start.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
  } else {
    const step = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 }[
        frequency
      ],
      month = Math.floor(m / step) * step;
    start = new Date(Date.UTC(y, month, 1));
    end = new Date(Date.UTC(y, month + step, 0));
  }
  return {
    start: iso(start),
    end: iso(end),
    period: frequency + ':' + iso(start),
  };
}
export function routineSources(state: State): Source[] {
  const quality = JSON.parse(
      state.values.qualityMasterControl || '{"libraries":{}}',
    ),
    lib = quality.libraries?.fqc,
    version = lib?.versions?.find(
      (v: { id: string; status: string }) =>
        v.id === lib.activeVersionId && v.status === 'approved',
    );
  if (!version) return [];
  const master = JSON.parse(state.values.masterDataControl || '{}'),
    products = ((master.pageDraftLayout==='page-v1'?approvedMasterPageCatalog(master,'AB').content:master.active?.AB)?.products || []) as {
      code: string;
      name: string;
    }[];
  // Preserve the first matching record used by legacy catalogs with duplicate keys.
  const productNames = new Map<string, string>();
  for (const product of products) {
    if (!productNames.has(product.code)) productNames.set(product.code, product.name);
  }
  const errorCodes = new Map<string, string>();
  for (const error of version.snapshot?.errors || []) {
    if (!errorCodes.has(error.id)) errorCodes.set(error.id, error.code);
  }
  let effectiveDate: string | undefined;
  return (version.snapshot?.items || [])
    .filter((i: Record<string, unknown>) => !i.isDeleted && i.isEnabled)
    .map((i: RoutineSourceItem) => {
      const rawFrequency = i.rule?.cadence === 'time' ? i.rule.timeFrequency : null,
        f = rawFrequency === 'half_yearly' ? 'semiannual' : rawFrequency;
      const frequency = typeof f === 'string' && [
        'weekly',
        'monthly',
        'quarterly',
        'semiannual',
        'yearly',
      ].includes(f)
        ? f as Frequency
        : null;
      return {
        standardSnapshot: cloneDraft(i) as FqcSnapshot["items"][number],
        id: i.id,
        name: i.name || '',
        code: i.checkNo || '',
        line: i.line || '',
        category: i.category || '',
        errorCode: errorCodes.get(i.errorId) || '',
        description: i.description || '',
        versionId: version.id,
        version: String(version.number),
        effectiveDate: effectiveDate ??= companyDate(
          new Date(
            version.reviewedAt ||
              version.updatedAt ||
              version.createdAt ||
              Date.now(),
          ),
        ),
        frequency,
        frequencyText:
          i.rule?.cadence === 'time'
            ? i.rule.customTimeText || f || ''
            : i.rule?.cadence === 'pending_confirmation'
              ? 'pending_confirmation'
              : '',
        products: (i.productCodes || []).map((code: string) => ({
          code,
          name: productNames.get(code) || code,
        })),
      };
    })
    .filter((s: Source) => s.frequencyText);
}
/** Read-only timeline of approved source versions; never changes approval status in storage. */
export function routineSourceTimeline(state:State):CalendarTimelineEntry[]{
 const quality=JSON.parse(state.values.qualityMasterControl||'{"libraries":{}}'),library=quality.libraries?.fqc;
 if(!library)return [];
 return library.versions.filter((v:{status:string})=>['approved','superseded'].includes(v.status)).map((version:{id:string;reviewedAt?:string;updatedAt?:string;createdAt:string;snapshot:FqcSnapshot})=>{
  const at=version.reviewedAt||version.updatedAt||version.createdAt;
  demand(at&&Number.isFinite(Date.parse(at))&&Array.isArray(version.snapshot?.items),'SOURCE_TIMELINE_INCOMPLETE',409);
  const projected={...quality,libraries:{...quality.libraries,fqc:{...library,activeVersionId:version.id,versions:[{...version,status:'approved'}]}}};
  return {id:version.id,at,day:companyDate(new Date(at)),sources:routineSources({...state,values:{...state.values,qualityMasterControl:JSON.stringify(projected)}})};
 });
}
// The FQC backend browses the effective AB category catalog (including empty
// categories), while scheduling uses only the effective enabled time rules.
export function routineCatalog(state: State) {
  const quality = JSON.parse(
      state.values.qualityMasterControl || '{"libraries":{}}',
    ),
    lib = quality.libraries?.fqc,
    version = lib?.versions?.find(
      (v: { id: string; status: string }) =>
        v.id === lib.activeVersionId && v.status === 'approved',
    ),
    master = JSON.parse(state.values.masterDataControl || '{}'),
    active = (master.pageDraftLayout==='page-v1'?approvedMasterPageCatalog(master,'AB').content:master.active?.AB) || {},
    categories = new Map<string, { name: string; line: string }>();
  const add = (name: string, line: string) => {
    if (name)
      categories.set(line + '\u0000' + name, { name, line: line || '' });
  };
  for (const group of active.categoryGroups || []) add(group.name, group.line);
  for (const product of active.products || []) {
    if (
      product.category &&
      ![...categories.values()].some((c) => c.name === product.category)
    )
      add(product.category, product.line);
  }
  for (const row of [
    ...(version?.snapshot.errors || []),
    ...(version?.snapshot.items || []),
  ]) {
    if (!row.isDeleted) add(row.category, row.line);
  }
  const items = (version?.snapshot.items || [])
    .filter((i: Record<string, unknown>) => !i.isDeleted)
    .map((i: RoutineSourceItem) => ({
      id: i.id,
      name: i.name || '',
      code: i.checkNo || '',
      line: i.line || '',
      category: i.category || '',
      enabled: !!i.isEnabled,
      productCodes: [...(i.productCodes || [])],
      cadence: i.rule?.cadence || '',
      frequency: i.rule?.timeFrequency || '',
    }));
  return {
    versionId: version?.id || null,
    version: version ? String(version.number) : null,
    // Matches the existing FQC backend line selector; retain additional identities.
    lines: [
      ...new Set([
        'A',
        'B',
        'C',
        ...[...categories.values()].map((c) => c.line),
        ...items.map((i: { line: string }) => i.line),
      ]),
    ]
      .filter(Boolean)
      .sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; }),
    categories: [...categories.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.line.localeCompare(b.line),
    ),
    items,
  };
}
export function schedulePreview(
  c: RoutineFqc,
  sources: Source[],
  startDate: string,
  today: string,
) {
  demand(dateOK(startDate) && dateOK(today), 'DATE_INVALID');
  const jobs: Job[] = [];
  for (const source of sources) {
    if (!source.frequency) continue;
    const old = c.jobs
      .filter((j) => j.itemId === source.id)
      .sort((a, b) => a.end.localeCompare(b.end));
    const previous = old.at(-1);
    let cursor = previous
      ? nextDate(previous.end)
      : [
          startDate,
          dateOK(source.effectiveDate) ? source.effectiveDate : startDate,
        ]
          .sort()
          .at(-1)!;
    // A frequency change starts after the last generated deadline. A transition
    // interval is clipped at that boundary, then aligns to calendar periods.
    let guard = 0;
    while (cursor <= today && guard++ < 600) {
      const p = periodAt(cursor, source.frequency);
      const start =
        previous || jobs.some((j) => j.itemId === source.id) ? cursor : p.start;
      const id = source.id + '@' + start + '@' + p.end;
      if (!c.jobs.some((j) => j.id === id))
        jobs.push({
          id,
          itemId: source.id,
          period: p.period,
          start,
          end: p.end,
          source: cloneDraft(source),
          planId: null,
          completion: null,
          createdAt: '',
        });
      cursor = nextDate(p.end);
    }
    demand(guard < 600, 'SCHEDULE_RANGE_TOO_LARGE');
  }
  return jobs;
}
export const docContent = (d: Document) =>
  d.flow.pendingId
    ? d.flow.cases.find((c) => c.id === d.flow.pendingId)!.content
    : d.flow.active.id && !d.reopened
      ? d.flow.active.content
      : d.flow.working;
// A code can be reassigned after deletion. Only a unique, stable item ID
// may refresh a saved job from the effective catalog.
export function fqcSourcesById(sources:Source[]) {
  const result = new Map<string,Source>();
  const seen = new Set<string>();
  for (const source of sources) {
    if (typeof source.id !== 'string' || !source.id.trim()) continue;
    if (seen.has(source.id)) result.delete(source.id);
    else result.set(source.id,source);
    seen.add(source.id);
  }
  return result;
}
function matchesJobItem(job:Job, source:Source|undefined):source is Source {
  return !!source && !!job.itemId && job.source.id === job.itemId && source.id === job.itemId;
}
export function fqcPlannerJobs(control:Pick<RoutineFqc,'jobs'|'documents'>, sources:Source[], pageDocuments?:Content[]):Job[] {
  const latest = fqcSourcesById(sources);
  const documented = new Set<string>();
  for (const snapshot of [...control.documents.filter(doc => !doc.cancelled).map(docContent), ...(pageDocuments || [])]) {
    for (const line of snapshot.lines || []) documented.add(line.jobId);
  }
  return control.jobs.map(job => {
    const current = latest.get(job.itemId);
    const approved = matchesJobItem(job,current) ? current : undefined;
    const projected = periodItemCode(job, approved, documented.has(job.id));
    // Whole-page clients seed their local document from this very row.
    return pageDocuments && approved && projected !== job ? {...job,source:renumberedPlanSource(job,approved)} : projected;
  });
}

// Old planners create their document from the saved job. Pin the approved
// revision at creation if its code changed after the period was generated.
export function renumberedPlanSource(job:Job, latest:Source|undefined):Source {
  if (!matchesJobItem(job,latest) || periodItemCode(job,latest,false) === job) return job.source;
  const approved = cloneDraft(latest);
  const products = new Map(approved.products.map(product => [product.code,product]));
  return {...approved, products:job.source.products.map(product => products.get(product.code) || product)};
}

export const docStatus = (d: Document) =>
  d.cancelled ? 'cancelled' : d.flow.pendingId
    ? 'pending'
    : d.flow.active.id && !d.reopened
      ? 'approved'
      : 'draft';
export function planFamily(c: RoutineFqc, d: Document): string {
  const seen = new Set<string>();
  let current = d;
  while (current.correctionOf && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = c.documents.find((x) => x.id === current.correctionOf && x.kind === current.kind);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}
// One availability rule for both browser and write transaction, including legacy
// plan corrections whose reports still point at an earlier approved version.
export function reportAvailability(c: RoutineFqc, plan: Document) {
  if(plan.requestKind)return [];
  return docContent(plan).lines.filter(line=>!plan.cancelledJobIds?.includes(line.jobId)).map((line) => ({
    jobId: line.jobId,
    assigned: plan.caseId
      ? c.cases.some((a) => a.id === plan.caseId && ['open', 'retest'].includes(a.status))
      : c.documents.some((p) => p.id === c.jobs.find((j) => j.id === line.jobId)?.planId && p.kind === 'plan' && docStatus(p) === 'approved' && planFamily(c, p) === planFamily(c, plan)),
    reportIds: c.documents.filter((d) => !d.cancelled && d.kind === 'report' && !d.correctionOf &&
      (plan.caseId ? d.planId === plan.id : !d.caseId) &&
      d.flow.working.lines.some((l) => l.jobId === line.jobId)).map((d) => d.id),
  }));
}
export function cancellationDependencies(c: RoutineFqc, doc: Document) {
  const family = planFamily(c, doc);
  const familyIds = new Set(c.documents.filter((d) => d.kind === 'plan' && planFamily(c, d) === family).map((d) => d.id));
  return {
    documents: c.documents.filter((d) => !d.cancelled && d.id !== doc.id &&
      ((doc.kind === 'plan' && d.planId && familyIds.has(d.planId)) || d.correctionOf === doc.id)).map((d) => d.id),
    cases: doc.kind === 'plan' ? c.cases.filter((a) => familyIds.has(a.planId)).map((a) => a.id) : [],
  };
}
export function reportIssues(
  content: Content,
  kind: Document['kind'],
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const add = (path: DraftIssue['path'], code: string) =>
    issues.push({ kind: 'error', path, message: code, code });
  if (!content.title.trim()) add(['title'], 'TITLE_REQUIRED');
  if (!dateOK(content.date)) add(['date'], 'DATE_REQUIRED');
  if (!content.lines.length) add(['lines'], 'ITEM_REQUIRED');
  if (kind === 'report')
    for (const line of content.lines) {
      if (!line.results.length)
        add(['lines', { id: line.id }, 'results'], 'RESULT_REQUIRED');
      for (const r of line.results) {
        const p = ['lines', { id: line.id }, 'results', { id: r.id }];
        if (!r.outcome || r.outcome==='dispose') add([...p, 'outcome'], 'RESULT_REQUIRED');
        if (r.outcome !== 'unable' && !r.samples.length)
          add([...p, 'samples'], 'SAMPLES_REQUIRED');
        if (r.samples.length > 1) add([...p,'samples'],'SINGLE_SAMPLE_REQUIRED');
        if (r.samples.some(sample => line.results.some(other => other.id !== r.id && other.samples.includes(sample))))
          add([...p,'samples'],'SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE');
        if (line.requiredSamples?.length && r.samples.some(sample => !line.requiredSamples!.includes(sample)))
          add([...p,'samples'],'RETEST_SAMPLE_FIXED');
        if (r.outcome === 'pass' && !r.value.trim())
          add([...p, 'value'], 'ACTUAL_RESULT_REQUIRED');
        if (
          ['fail', 'unable', 'undetermined'].includes(r.outcome) &&
          !r.notes.trim()
        )
          add([...p, 'notes'], 'EXPLANATION_REQUIRED');
        if (['fail', 'undetermined'].includes(r.outcome) && !r.photos.length)
          add([...p, 'photos'], 'UPLOADED_PHOTO_REQUIRED');
      }
    }
  if (['waiver', 'disposal'].includes(kind) && !content.reason.trim())
    add(['reason'], 'REASON_REQUIRED');
  if (kind === 'disposal') {
    if (!content.disposition.trim())
      add(['disposition'], 'DISPOSITION_REQUIRED');
    if (!content.evidence.length) add(['evidence'], 'EVIDENCE_REQUIRED');
  }
  return issues;
}
export function structure(content: Content, previous: Content) {
  demand(
    Object.keys(content).every((k) =>
      [
        'title',
        'date',
        'notes',
        'lines',
        'reason',
        'disposition',
        'evidence','planStart','planEnd','overdueReason','nextDate','skipReason','dispositionResult',
      ].includes(k),
    ),
    'CONTENT_INVALID',
  );
  for (const k of ['title', 'date', 'notes', 'reason', 'disposition'] as const)
    demand(
      typeof content[k] === 'string' && content[k].length <= 20000,
      'TEXT_INVALID',
    );
  for(const k of ['planStart','planEnd','overdueReason','nextDate','skipReason','dispositionResult'] as const)if(content[k]!==undefined)demand(typeof content[k]==='string'&&content[k]!.length<=20000,'TEXT_INVALID');
  demand(
    Array.isArray(content.evidence) &&
      content.evidence.every((p) => /^[a-f0-9]{64}$/.test(p)),
    'PHOTO_ID_INVALID',
  );
  demand(
    Array.isArray(content.lines) &&
      content.lines.length === previous.lines.length,
    'DOCUMENT_ITEMS_IMMUTABLE',
  );
  const ids = new Set<string>();
  for (const l of content.lines) {
    const old = previous.lines.find((x) => x.id === l.id);
    demand(
      old &&
        old.jobId === l.jobId &&
        stableDraftJSON(l.source) === stableDraftJSON(old.source),
      'SOURCE_SNAPSHOT_IMMUTABLE',
    );
    demand(
      stableDraftJSON(l.requiredSamples || []) ===
        stableDraftJSON(old.requiredSamples || []),
      'RETEST_REQUIREMENT_IMMUTABLE',
    );
    demand(!ids.has(l.id), 'DUPLICATE_LINE');
    ids.add(l.id);
    demand(
      Array.isArray(l.results) && l.results.length <= 100,
      'RESULTS_INVALID',
    );
    const seen = new Set<string>();
    for (const r of l.results) {
      demand(
        r && typeof r.id === 'string' && !seen.has(r.id),
        'RESULT_ID_INVALID',
      );
      seen.add(r.id);
      demand(
        Object.keys(r).every((k) =>
          ['id', 'samples', 'outcome', 'value', 'notes', 'disposalReason', 'photos'].includes(k),
        ),
        'RESULT_INVALID',
      );
      demand(
        Array.isArray(r.samples) &&
          new Set(r.samples).size === r.samples.length &&
          r.samples.every(
            (s) =>
              l.source.products.some((p) => p.code === s),
          ),
        'SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE',
      );
      const oldRow = old.results.find(row => row.id === r.id);
      const sameSamples = oldRow && stableDraftJSON(oldRow.samples) === stableDraftJSON(r.samples);
      demand(r.samples.length <= 1 || sameSamples, 'SINGLE_SAMPLE_REQUIRED');
      demand(!l.requiredSamples?.length || r.samples.every(sample => l.requiredSamples!.includes(sample)) || sameSamples, 'RETEST_SAMPLE_FIXED');
      for (const sample of r.samples) for (const other of l.results.filter(row => row.id !== r.id && row.samples.includes(sample))) {
        const oldOther = old.results.find(row => row.id === other.id);
        demand(sameSamples && oldOther && stableDraftJSON(oldOther.samples) === stableDraftJSON(other.samples), 'SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE');
      }
      demand(
        ['', 'pass', 'fail', 'abnormal', 'dispose', 'unable', 'undetermined'].includes(r.outcome),
        'RESULT_INVALID',
      );
      demand(
        !['unable','abnormal'].includes(r.outcome) || r.samples.length === 0,
        'UNABLE_MUST_NOT_HAVE_SAMPLES',
      );
      demand(r.outcome !== 'dispose' || !r.samples.length, 'DISPOSAL_MUST_NOT_HAVE_SAMPLES');
      demand(r.disposalReason===undefined||typeof r.disposalReason==='string'&&r.disposalReason.length<=20000,'TEXT_INVALID');
      demand(
        typeof r.value === 'string' && typeof r.notes === 'string',
        'TEXT_INVALID',
      );
      demand(
        Array.isArray(r.photos) &&
          r.photos.length <= 30 &&
          r.photos.every((p) => /^[a-f0-9]{64}$/.test(p)),
        'PHOTO_ID_INVALID',
      );
    }
  }
}
export const photoIds = (content: Content) => [
  ...content.evidence,
  ...content.lines.flatMap((l) => l.results.flatMap((r) => r.photos)),
];
type Context = {
  sourceTimeline?:CalendarTimelineEntry[];
  actor: DraftActor;
  at: string;
  today: string;
  allowed: (p: DraftPermission) => boolean;
  settings: boolean;
  revoke: boolean;
  revise: boolean;
};
type PendingDocument={documentId:string;generation:string;action:string;operationId:string};
function ordinaryResources(c:RoutineFqc,id:string,generation:string){
  const d=c.documents.find(v=>v.id===id);
  if(!d||d.calendarVersion!==2||!['report','plan'].includes(d.kind)||d.cancelled||d.caseId||d.correctionOf||
    d.nextWork||d.requestKind||d.targetPlanId||d.disposalPolicy||d.retestApplicationCaseId||d.waiverRetests||
    d.flow.scope!=='routine-fqc:'+id||d.flow.generation!==generation||!d.flow.working.lines.length||
    d.kind==='report'&&!d.planId)return null;
  const keys=new Set(['doc:'+id,'doc:'+(d.planId||id)]);
  for(const line of d.flow.working.lines){
    const job=c.jobs.find(v=>v.id===line.jobId);
    if(!job?.itemId||!job.period||job.planId!==(d.planId||id)||job.calendar?.retestCaseId||
      job.calendar?.originJobId||job.calendar?.requestId)return null;
    keys.add('job:'+job.id);keys.add('period:'+JSON.stringify([job.itemId,job.period]));
  }
  return keys;
}
function assertIndependent(c:RoutineFqc,cmd:RoutineCommand){
  const records=cmd.independentOf;
  demand(Array.isArray(records)&&records.length>0&&records.length<=32&&cmd.action==='draft'&&
    ['save','submit'].includes(cmd.command?.action||'')&&cmd.expectedRevision===c.revision,'FQC_SCOPE_CONFLICT',409);
  const target=ordinaryResources(c,cmd.documentId||'',cmd.command!.generation);
  demand(target,'FQC_SCOPE_CONFLICT',409);
  for(const row of records){
    demand(row&&['apply','save','submit'].includes(row.action)&&row.operationId!==cmd.operationId,'FQC_SCOPE_CONFLICT',409);
    const old=ordinaryResources(c,row.documentId,row.generation);
    demand(old&&![...old].some(key=>target.has(key)),'FQC_SCOPE_CONFLICT',409);
  }
}
function scopedDraftStop(c:RoutineFqc,cmd:RoutineCommand,ctx:Context){
  demand(Object.keys(cmd).sort().join(',')==='action,documentId,expectedRevision,operationId,reviewedDocumentRevision,reviewedGeneration,stop'&&
    !Object.hasOwn(c.receipts,cmd.operationId),'INVALID_DRAFT_STOP',422);
  const target=cmd.stop, doc=c.documents.find(d=>d.id===cmd.documentId);
  demand(target&&Object.keys(target).sort().join(',')==='action,documentId,generation,operationId'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(target.operationId)&&
    target.documentId===cmd.documentId&&typeof target.generation==='string'&&target.generation.length>0&&target.generation.length<=200&&
    ['save','submit','apply'].includes(target.action),'INVALID_DRAFT_STOP',422);
  const permission=target.action==='apply'?'edit':target.action==='submit'?'submit':'save';
  demand(ctx.allowed(permission)&&ctx.allowed('edit'),'FORBIDDEN',403);
  demand(doc&&doc.flow.scope==='routine-fqc:'+target.documentId,'DOCUMENT_NOT_FOUND',404);
  assertNotResetRetired(c,target.operationId);
  const aggregate=c.receipts[target.operationId];
  const inner=doc.flow.receipts[target.operationId];
  if(aggregate||inner){
    const receipt=aggregate||inner;
    demand(receipt.actorId===ctx.actor.id,'FORBIDDEN',403);
    const fingerprint=JSON.parse(receipt.fingerprint);
    const command=aggregate?fingerprint.command:fingerprint;
    demand((!aggregate||fingerprint.documentId===doc.id&&fingerprint.action==='draft')&&command?.action===target.action&&
      command?.generation===target.generation,'DRAFT_STOP_MISMATCH',409);
    return {status:'committed',actorId:ctx.actor.id,...target,result:receipt.result};
  }
  const stops=c.draftStops||[], existing=stops.find(f=>f.actorId===ctx.actor.id&&f.operationId===target.operationId);
  if(existing){
    demand(existing.documentId===target.documentId&&existing.action===target.action&&existing.generation===target.generation,'DRAFT_STOP_MISMATCH',409);
  }else{
    demand(cmd.expectedRevision===c.revision&&cmd.reviewedDocumentRevision===doc.flow.revision&&
      cmd.reviewedGeneration===doc.flow.generation,'DRAFT_STOP_RECONFIRM',409);
    demand(stops.length<2048&&stops.filter(row=>row.actorId===ctx.actor.id).length<256,'DRAFT_STOP_CAPACITY',409);
    c.draftStops=[...stops,{actorId:ctx.actor.id,operationId:target.operationId,documentId:doc.id,action:target.action,generation:target.generation,at:ctx.at}];
    c.events.push({action:'reconcile-draft',actor:ctx.actor,at:ctx.at,reason:doc.id});
    c.revision++;
  }
  return {status:'fenced',priorOutcome:'unknown',actorId:ctx.actor.id,...target};
}
export type RoutineCommand = {
  independentOf?:PendingDocument[];
  stop?:PendingDocument;
  reviewedDocumentRevision?:number;
  reviewedGeneration?:string;
  action: string;
  operationId: string;
  expectedRevision?: number;
  documentId?: string;
  caseId?: string;
  jobIds?: string[];
  startDate?: string;
  calendarVersion?: 2;
  endDate?: string;
  requestKind?: 'skip'|'retest'|'void'|'waiver'|'disposal';
  retestPlan?: boolean;
  reason?: string;
  notes?: string;
  photos?: string[];
  kind?: Document['kind'];
  command?: DraftCommand & { moduleAction?: 'save-local-v1' };
  selfReviewConfirmed?: boolean;
};
export function buildRoutineDocumentDraft(
  c: Pick<RoutineFqc, 'cases'> & { documents: Pick<Document, 'kind'>[] },
  kind: Document['kind'],
  jobs: Job[],
  ctx: Pick<Context, 'actor' | 'at' | 'today'>,
  extra: RoutineDocumentLinks = {},
) {
  demand(Object.keys(extra).every(key => ['planId', 'caseId', 'correctionOf'].includes(key)) &&
    Object.values(extra).every(value => value === null || typeof value === 'string'), 'DOCUMENT_LINKS_INVALID');
  const id = crypto.randomUUID(),
    number =
      (kind === 'plan'
        ? jobs.some(j=>j.calendar?.retestCaseId) ? 'FQC-RPL' : 'FQC-PLN'
        : kind === 'report'
          ? extra.correctionOf ? 'FQC-COR' : extra.caseId || jobs.some(j=>j.calendar?.retestCaseId) ? 'FQC-RTS' : 'FQC-RPT'
          : kind === 'waiver'
            ? 'FQC-WVR'
            : 'FQC-DSP') +
      '-' +
      ctx.today.replaceAll('-', '') +
      '-' +
      String(c.documents.filter((d) => d.kind === kind).length + 1).padStart(
        4,
        '0',
      );
  const content: Content = {
    title: number,
    date: ctx.today,
    notes: '',
    reason: '',
    disposition: '',
    evidence: [],
    lines: jobs.map((j) => ({
      id: crypto.randomUUID(),
      jobId: j.id,
      source: cloneDraft(j.source),
      requiredSamples: cloneDraft(
        extra.caseId
          ? c.cases.find((a) => a.id === extra.caseId)?.requiredSamples || []
          : [],
      ),
      results: kind === 'report' ? (extra.caseId && c.cases.find(a => a.id === extra.caseId)?.requiredSamples.length
        ? c.cases.find(a => a.id === extra.caseId)!.requiredSamples.map(sample => ({
            id: crypto.randomUUID(), samples: [sample], outcome: '' as Outcome, value: '', notes: '', photos: [],
          }))
        : [{id:crypto.randomUUID(),samples:[],outcome:'' as Outcome,value:'',notes:'',photos:[]}]) : [],
    })),
  };
  const metadata: RoutineDocumentMetadata = {
    id, number, kind, planId: null, caseId: null, correctionOf: null,
    createdAt: ctx.at, owner: cloneDraft(ctx.actor), ...extra,
  };
  return {metadata, content};
}
// Legacy dispatch alone creates its historical per-document flow. The page
// path can use the builder above without fabricating a flow, Save or review.
function addDocument(c: RoutineFqc, kind: Document['kind'], jobs: Job[], ctx: Context, extra: RoutineDocumentLinks = {}) {
  const {metadata, content} = buildRoutineDocumentDraft(c, kind, jobs, ctx, extra);
  const flow = createSharedDraft('routine-fqc:' + metadata.id, content, null, crypto.randomUUID());
  flow.active.content = { ...cloneDraft(content), lines: [] };
  const doc: Document = {...metadata, flow};
  c.documents.push(doc);
  return doc;
}
function linkedCase(c: Pick<RoutineFqc, 'cases'>, doc: Pick<RoutineDocumentMetadata, 'caseId' | 'correctionOf'>, jobId: string) {
  const lineage=c.cases.find(a=>a.lineageJobIds?.includes(jobId));if(lineage)return lineage;
  if (doc.caseId)
    return c.cases.find((a) => a.id === doc.caseId && a.jobId === jobId);
  if (doc.correctionOf)
    return c.cases.find(
      (a) => a.jobId === jobId && a.reportIds.includes(doc.correctionOf!),
    );
}

/** Route only recorded approved results, including legacy and repeat reports. */
export function routineCaseOutcome(c: RoutineFqc, item: Case): Outcome | null {
  const lineage = new Set([item.jobId, ...(item.lineageJobIds || []),
    ...c.jobs.filter(j => j.calendar?.retestCaseId === item.id).map(j => j.id)]);
  const ids = new Set([item.originReportId, ...item.reportIds]);
  const reports = c.documents.filter(d => d.kind === 'report' && !d.cancelled && d.flow?.active.id &&
    (ids.has(d.id) || d.caseId === item.id) &&
    d.flow.active.content.lines.some(line => lineage.has(line.jobId)&&!d.cancelledJobIds?.includes(line.jobId)));
  const time = (d: Document) => d.flow.cases?.find(review => review.id === d.flow.active.id)?.result?.at ||
    [...item.events].reverse().find(event => event.documentId === d.id)?.at || d.createdAt || '';
  reports.sort((a,b) => time(a).localeCompare(time(b)));
  const report = reports.at(-1);
  if (!report) return null;
  const results = new Set(report.flow.active.content.lines
    .filter(line => lineage.has(line.jobId)&&!report.cancelledJobIds?.includes(line.jobId)).flatMap(line => line.results.map(row => row.outcome)));
  const outcome = results.values().next().value;
  return results.size === 1 && outcome && ['pass','fail','abnormal','unable','dispose'].includes(outcome) ? outcome : null;
}

function legacyCalendarFollowup(d: Document) {
  return d.kind === 'waiver' || d.kind === 'disposal' && d.disposalPolicy !== 'skip-period';
}

function assertCalendarFollowupKind(c: RoutineFqc, item: Case, kind: string) {
  const outcome = routineCaseOutcome(c,item);
  const abnormal = outcome === 'abnormal' || outcome === 'unable';
  demand(outcome === 'fail' || abnormal, 'FOLLOWUP_APPROVED_RESULT_REQUIRED',409);
  demand(kind === 'retest' || kind === 'disposal' && abnormal, 'FOLLOWUP_KIND_UNAVAILABLE',409);
}

function assertNoCalendarFollowup(c: RoutineFqc, item: Case, documentId?: string) {
  demand(!c.documents.some(d => d.id !== documentId && !d.cancelled && (d.caseId === item.id || d.retestApplicationCaseId === item.id) &&
      docStatus(d) !== 'approved' && (!legacyCalendarFollowup(d) || !!d.flow.pendingId)) &&
    !c.jobs.some(j => j.calendar?.retestCaseId === item.id && j.planId !== documentId && !j.completion && !j.calendar.stopped),
    'FOLLOWUP_OPEN', 409);
}

export function unresolvedFailureSamples(c: RoutineFqc, item: Case) {
  const unresolved = new Set<string>();
  for (const reportId of item.reportIds) {
    const report = c.documents.find((d) => d.id === reportId);
    for (const line of report?.flow.active.content.lines || []) {
      if (line.jobId !== item.jobId) continue;
      // Repeated attempts in one formal report have no implicit time order.
      // Any failure wins; only all-pass attempts for a sample resolve a prior failure.
      const measured = new Set(line.results.flatMap((row) => row.samples));
      for (const sample of measured) {
        const attempts = line.results.filter((row) => row.samples.includes(sample));
        if (attempts.some((row) => row.outcome === 'fail')) unresolved.add(sample);
        else if (attempts.every((row) => row.outcome === 'pass')) unresolved.delete(sample);
      }
    }
  }
  return [...unresolved];
}

export function validateRoutineCaseLink(c: Pick<RoutineFqc, 'cases'>, doc: RoutineDocumentMetadata, content: Content) {
  if (doc.kind === 'waiver' || doc.kind === 'disposal')
    demand(doc.caseId, 'CASE_LINK_REQUIRED');
  if (doc.caseId) {
    const item = c.cases.find((a) => a.id === doc.caseId);
    demand(
      item && content.lines.every((l) => l.jobId === item.jobId),
      'CASE_LINK_INVALID',
    );
    if (!doc.correctionOf) demand(['open', 'retest'].includes(item.status), 'CASE_CHANGED_USE_CURRENT_FLOW', 409);
    if (doc.correctionOf && ['waiver', 'disposal'].includes(doc.kind)) {
      demand(
        item.status === (doc.kind === 'waiver' ? 'waived' : 'disposed'),
        'CASE_CHANGED_USE_CURRENT_FLOW',
        409,
      );
    }
  }
}

function validateCaseLink(c: RoutineFqc, doc: Document) {
  validateRoutineCaseLink(c, doc, doc.flow.working);
}

// Shared structural rule for document edits and the unregistered whole-page
// Save core. Read-only: no receipts, revisions, approvals or business effects.
export function validateRoutineContentEdit(c: Pick<RoutineFqc, 'cases'>, doc: RoutineDocumentMetadata, content: Content, previous: Content) {
  structure(content, previous);
  for(const id of doc.cancelledJobIds||[])demand(stableDraftJSON(content.lines.find(l=>l.jobId===id))===stableDraftJSON(previous.lines.find(l=>l.jobId===id)),'STOPPED_ITEM_READ_ONLY',409);
  if (doc.kind === 'report') for (const line of content.lines) {
    const earlier = previous.lines.find(l=>l.id===line.id)?.results||[];
    const disposing = line.results.some(r=>r.outcome==='dispose');
    demand(doc.calendarVersion===2||!line.results.some(r=>['abnormal','dispose'].includes(r.outcome)),'RESULT_INVALID');
    demand(!line.results.some(r=>r.outcome==='dispose'&&!earlier.some(old=>old.id===r.id&&old.outcome==='dispose')),
      'LEGACY_INLINE_DISPOSAL_KEEP_EXISTING',409);
    if(doc.calendarVersion===2&&doc.correctionOf)
      demand(disposing===earlier.some(r=>r.outcome==='dispose'),'DISPOSAL_CORRECTION_RULE_REQUIRED',409);
    if(doc.calendarVersion===2)
      demand(!line.results.some(row=>row.outcome==='unable'&&!earlier.some(old=>old.id===row.id&&old.outcome==='unable')),
        'LEGACY_UNABLE_KEEP_EXISTING',409);
    const required = linkedCase(c, doc, line.jobId)?.requiredSamples || [];
    if (!required.length) continue;
    for (const row of line.results) {
      const oldRow = previous.lines.find(l => l.id === line.id)?.results.find(r => r.id === row.id);
      demand(row.samples.every(sample => required.includes(sample)) || (oldRow && stableDraftJSON(oldRow.samples) === stableDraftJSON(row.samples)), 'RETEST_SAMPLE_FIXED');
    }
  }
}

// Submission rules accept explicit metadata/content, without a per-document flow.
export function routineDocumentReviewIssues(c: Pick<RoutineFqc, 'cases'>, doc: RoutineDocumentMetadata, content: Content): DraftIssue[] {
  const reviewed=doc.calendarVersion===2&&doc.cancelledJobIds?.length?{...content,lines:content.lines.filter(l=>!doc.cancelledJobIds!.includes(l.jobId))}:content;
  const issues = doc.calendarVersion===2 ? calendarReviewIssues(doc,reviewed) : reportIssues(content, doc.kind);
  if (doc.kind === 'report')
    for (const line of reviewed.lines) {
      const a = linkedCase(c, doc, line.jobId);
      if (!a) continue;
      if (a.requiredSamples.length && line.results.some(row => row.samples.some(sample => !a.requiredSamples.includes(sample))))
        issues.push({kind:'error',path:['lines',{id:line.id},'samples'],message:'RETEST_SAMPLE_FIXED'});
      if (
        !line.results.some((r) => ['abnormal','unable','dispose'].includes(r.outcome)) &&
        a.requiredSamples.some(
          (s) => !line.results.flatMap((r) => r.samples).includes(s),
        )
      )
        issues.push({
          kind: 'error',
          path: ['lines', { id: line.id }],
          message: 'RETEST_REQUIRED_SAMPLES',
        });
    }
  return issues;
}

// Staged business effects only. No permissions, flow, Save, receipt, revision
// or idempotence is created here. The authenticated transaction must first
// approve its fixed case once and invoke only its server-derived changed set.
export function applyRoutineDocumentApprovalEffects(c: RoutineBusinessState, doc: RoutineDocumentMetadata,
  content: Content, ctx: Pick<Context, 'actor' | 'at'>) {
  validateRoutineCaseLink(c, doc, content);
  if(doc.calendarVersion===2&&calendarApproval(c,doc,content,ctx))return;
  if (doc.correctionOf) {
    const old = c.documents.find((d) => d.id === doc.correctionOf)!;
    old.impact ||= [];
    old.impact.push({
      id: doc.id,
      reason: content.reason || content.notes || 'Correction / 更正',
    });
  }
  if (doc.kind === 'plan') {
    if(doc.retestApplicationCaseId){const item=c.cases.find(a=>a.id===doc.retestApplicationCaseId)!;item.status='retest';item.events.push({action:'retest-plan-approved',actor:ctx.actor,at:ctx.at,reason:content.reason,documentId:doc.id});}
    if (doc.caseId) {
      c.cases
        .find((a) => a.id === doc.caseId)!
        .events.push({
          action: 'retest-plan-approved',
          actor: ctx.actor,
          at: ctx.at,
          reason: content.notes,
          documentId: doc.id,
        });
    } else
      for (const l of content.lines) {
        const j = c.jobs.find((j) => j.id === l.jobId)!;
        j.planId = doc.id;
      }
    return;
  }
  if (doc.kind === 'waiver' || doc.kind === 'disposal') {
    const item = c.cases.find((a) => a.id === doc.caseId)!;
    if(doc.kind==='waiver')stopWaivedRetests(c,doc,ctx);
    item.status = doc.kind === 'waiver' ? 'waived' : 'disposed';
    if (doc.kind === 'disposal' && doc.disposalPolicy !== 'skip-period') item.result = 'fail';
    const job = c.jobs.find((j) => j.id === item.jobId)!;
    job.completion = { kind: doc.disposalPolicy === 'skip-period' ? 'skip' : doc.kind, reportId: doc.id, at: ctx.at };
    if (doc.disposalPolicy === 'skip-period') {
      const latestReportId = item.reportIds.at(-1);
      for (const retest of c.jobs.filter(j => j.calendar?.retestCaseId === item.id &&
        j.completion?.kind === 'abnormal' && j.completion.reportId === latestReportId))
        retest.completion = { ...job.completion };
    }
    item.events.push({
      action: doc.kind,
      actor: ctx.actor,
      at: ctx.at,
      reason: content.reason,
      documentId: doc.id,
    });
    return;
  }
  for (const l of content.lines) {
    if(doc.calendarVersion===2&&doc.cancelledJobIds?.includes(l.jobId))continue;
    const job = c.jobs.find((j) => j.id === l.jobId)!;
    const unresolved = l.results.some((r) =>
      ['abnormal', 'unable', 'undetermined'].includes(r.outcome),
    );
    const disposal=doc.calendarVersion===2&&l.results.length===1&&l.results[0].outcome==='dispose'?l.results[0]:null;
    const result = disposal ? 'dispose' : l.results.some((r) => r.outcome === 'fail')
      ? 'fail'
      : l.results.some((r) => r.outcome === 'abnormal')
        ? 'abnormal'
        : l.results.some((r) => r.outcome === 'undetermined')
        ? 'undetermined'
        : l.results.some((r) => r.outcome === 'unable')
          ? 'unable'
          : 'pass';
    if (!unresolved || doc.calendarVersion===2)
      job.completion = { kind: disposal ? 'skip' : result, reportId: doc.id, at: ctx.at };
    else job.completion = null;
    let item =
      linkedCase(c, doc, job.id) ||
      c.cases.find(
        (a) =>
          a.jobId === job.id &&
          !['closed', 'disposed', 'waived'].includes(a.status),
      );
    if(disposal&&job.calendar?.retestCaseId)
      demand(item?.id===job.calendar.retestCaseId,'CASE_LINK_INVALID',409);
    if (result !== 'pass' && !item) {
      item = {
        id: crypto.randomUUID(),
        number: 'FQC-CA-' + String(c.cases.length + 1).padStart(5, '0'),
        jobId: job.id,
        planId: doc.planId!,
        originReportId: doc.id,
        reportIds: [],
        status: 'open',
        result,
        requiredSamples: [],
        improvements: [],
        events: [],
      };
      c.cases.push(item);
    }
    if (item) {
      if (
        doc.correctionOf &&
        ['closed', 'disposed', 'waived'].includes(item.status)
      )
        item.events.push({
          action: 'correction-reopened',
          actor: ctx.actor,
          at: ctx.at,
          reason: content.reason,
          documentId: doc.id,
        });
      if (!item.reportIds.includes(doc.id)) item.reportIds.push(doc.id);
      item.result = result;
      if(disposal){
        const origin=c.jobs.find(j=>j.id===item.jobId);
        demand(origin,'CASE_LINK_INVALID',409);
        origin.completion={kind:'skip',reportId:doc.id,at:ctx.at};
        item.status='disposed';
        item.events.push({action:'dispose',actor:ctx.actor,at:ctx.at,
          reason:disposal.disposalReason||'',documentId:doc.id});
        continue;
      }
      const measured = new Set(l.results.flatMap((r) => r.samples));
      item.requiredSamples = [
        ...new Set([
          ...item.requiredSamples.filter((sample) => !measured.has(sample)),
          ...l.results
            .filter((r) => r.outcome !== 'pass')
            .flatMap((r) => r.samples),
        ]),
      ];
      item.status = result === 'pass' ? doc.calendarVersion===2?'closed':'ready-close' : 'open';
      if(doc.calendarVersion===2&&result==='pass'&&doc.correctionOf)cancelErroneousRetests(c,item,doc,ctx);
      item.events.push({
        action: result,
        actor: ctx.actor,
        at: ctx.at,
        reason: l.results
          .map((r) => r.notes)
          .filter(Boolean)
          .join(' / '),
        documentId: doc.id,
      });
    }
  }
}
/** Ordinary calendar plans freeze after their period if no live submission remains. */
export function routinePlanExpired(c: Pick<RoutineFqc,'jobs'>,doc: Document,today:string) {
  if(doc.kind!=='plan'||doc.calendarVersion!==2||doc.retestApplicationCaseId||doc.requestKind||doc.flow.pendingId||doc.flow.active.id&&!doc.reopened)return false;
  return doc.flow.working.lines.some(line=>{const job=c.jobs.find(j=>j.id===line.jobId);return !!job?.calendar&&!job.calendar.retestCaseId&&!job.calendar.stopped&&!job.completion&&job.end<today;});
}

export function executeRoutine(
  c: RoutineFqc,
  cmd: RoutineCommand,
  sources: Source[],
  ctx: Context,
) {
  demand(
    /^[a-zA-Z0-9_-]{8,100}$/.test(cmd.operationId || ''),
    'OPERATION_ID_REQUIRED',
  );
  demand(ctx.allowed('view'), 'FORBIDDEN', 403);
  assertRoutineResetFence(c,cmd.expectedRevision,cmd.operationId);
  if(cmd.action==='reconcile-draft')return scopedDraftStop(c,cmd,ctx);
  if(cmd.action==='draft'&&c.draftStops?.some(f=>f.actorId===ctx.actor.id&&f.operationId===cmd.operationId))
    throw new DraftConflict('DRAFT_OPERATION_FENCED',409);
  const fingerprint = stableDraftJSON(cmd),
    old = c.receipts[cmd.operationId];
  if (old) {
    const permission =
      cmd.action === 'draft'
        ? (
            {
              apply: 'edit',
              save: 'save',
              submit: 'submit',
              approve: 'approve',
              return: 'return',
              withdraw: 'withdraw',
            } as const
          )[
            cmd.command?.action as
              | 'apply'
              | 'save'
              | 'submit'
              | 'approve'
              | 'return'
              | 'withdraw'
          ]
        : ['close', 'resolve-impact'].includes(cmd.action)
          ? 'approve'
          : 'edit';
    demand(permission && ctx.allowed(permission), 'FORBIDDEN', 403);
    if (cmd.command?.moduleAction === 'save-local-v1' && cmd.command.patches?.length) demand(ctx.allowed('edit'), 'FORBIDDEN', 403);
    if (cmd.action === 'configure') demand(ctx.settings, 'FORBIDDEN', 403);
    if (['revoke-plan', 'delete-plan'].includes(cmd.action)) demand(ctx.revoke, 'FORBIDDEN', 403);
    if (cmd.action === 'restore-document' && c.documents.find((d) => d.id === cmd.documentId)?.flow.active.id) demand(ctx.revoke, 'FORBIDDEN', 403);
    if (cmd.action === 'correct') demand(ctx.revise, 'FORBIDDEN', 403);
    demand(
      old.actorId === ctx.actor.id && old.fingerprint === fingerprint,
      'OPERATION_ID_REUSED',
      409,
    );
    return old.result;
  }
  demand(ctx.allowed('view'), 'FORBIDDEN', 403);
  if(cmd.independentOf!==undefined)assertIndependent(c,cmd);
  if(c.calendarPolicy&&ctx.sourceTimeline){
    const before=cmd.independentOf?JSON.stringify([c.jobs,c.calendarPolicy]):null;
    reconcileCalendar(c,ctx.sourceTimeline,ctx.today,ctx.at);
    if(before!==null)demand(before===JSON.stringify([c.jobs,c.calendarPolicy]),'FQC_SCOPE_CONFLICT',409);
  }
  const doc = c.documents.find((d) => d.id === cmd.documentId),
    item = c.cases.find((a) => a.id === cmd.caseId);
  let result: unknown = { ok: true };
  const guard = () =>
    demand(
      Number.isSafeInteger(cmd.expectedRevision) &&
        cmd.expectedRevision === c.revision,
      'REVISION_CONFLICT',
      409,
    );
  const edit = () => demand(ctx.allowed('edit'), 'FORBIDDEN', 403);
  if(doc&&routinePlanExpired(c,doc,ctx.today))throw new DraftConflict('EXPIRED_PLAN_READ_ONLY',409);
  assertWaiverConversionUnlocked(c,doc,cmd.jobIds||[],item?.id);
  if (doc?.cancelled && cmd.action !== 'restore-document') throw new DraftConflict('DOCUMENT_CANCELLED', 409);
  switch (cmd.action) {
    case 'queue':
      edit();guard();demand(c.calendarPolicy,'CALENDAR_POLICY_REQUIRED',409);
      demand(Array.isArray(cmd.jobIds)&&cmd.jobIds.length&&new Set(cmd.jobIds).size===cmd.jobIds.length,'ITEM_REQUIRED');
      for(const id of cmd.jobIds!){const j=c.jobs.find(j=>j.id===id);demand(j&&calendarCanArrange(j,ctx.today),'JOB_NOT_ARRANGEABLE',409);j.calendar!.queuedAt||=ctx.at;}
      break;
    case 'request': {
      edit();guard();demand(c.calendarPolicy,'CALENDAR_POLICY_REQUIRED',409);
      demand(['skip','retest','void','waiver','disposal'].includes(cmd.requestKind||''),'KIND_INVALID');
      let jobs:Job[]=[];
      if(cmd.requestKind==='skip'){demand(cmd.jobIds?.length&&new Set(cmd.jobIds).size===cmd.jobIds.length,'ITEM_REQUIRED');jobs=cmd.jobIds!.map(id=>c.jobs.find(j=>j.id===id)!);demand(jobs.every(j=>j?.calendar&&j.start<=ctx.today&&!j.planId&&!j.completion&&!j.calendar.requestId&&calendarSkipAllowed(c,j)),'JOB_ALREADY_ASSIGNED',409);}
      else if(cmd.requestKind==='void'){demand(doc?.kind==='plan'&&docStatus(doc)==='approved'&&!doc.requestKind,'APPROVED_PLAN_REQUIRED');jobs=doc.flow.active.content.lines.map(l=>c.jobs.find(j=>j.id===l.jobId)!);}
      else {
        demand(item&&!['closed','disposed','waived'].includes(item.status),'CASE_CLOSED',409);
        assertCalendarFollowupKind(c,item,cmd.requestKind!);
        assertNoCalendarFollowup(c,item);
        jobs=[c.jobs.find(j=>j.id===item.jobId)!];
      }
      demand(jobs.every(Boolean),'ITEM_REQUIRED');
      const kind=['waiver','disposal'].includes(cmd.requestKind!)?cmd.requestKind as 'waiver'|'disposal':'plan';
      const d=addDocument(c,kind,jobs,ctx,{caseId:item?.id||null,planId:cmd.requestKind==='void'?doc!.id:null});d.calendarVersion=2;
      if(kind==='disposal')d.disposalPolicy='skip-period';
      if(['skip','retest','void'].includes(cmd.requestKind!))d.requestKind=cmd.requestKind as Document['requestKind'];
      if(d.requestKind==='void'){d.targetPlanId=doc!.id;validateVoidTarget(c,d);}
      if(item){const original=c.documents.find(x=>x.id===item.originReportId)?.flow.active.content.lines.find(l=>l.jobId===item.jobId);if(original)d.flow.working.lines[0].source=cloneDraft(original.source);}
      if(cmd.requestKind==='retest'&&cmd.retestPlan){
        const origin=jobs[0],key='retest:'+d.id,source=cloneDraft(d.flow.working.lines[0].source);
        const job:Job={...cloneDraft(origin),id:key,source,createdAt:ctx.at,planId:d.id,completion:null,calendar:{scope:origin.calendar?.scope||JSON.stringify([source.line,source.products[0]?.code,source.id]),productCode:source.products[0]?.code||'',frequency:source.frequency!,queuedAt:ctx.at,retestCaseId:item!.id,originJobId:origin.id}};
        c.jobs.push(job);item!.lineageJobIds||=[];item!.lineageJobIds.push(key);
        d.retestApplicationCaseId=item!.id;d.caseId=null;delete d.requestKind;
        d.flow.working.lines[0].jobId=key;d.flow.working.planStart='';d.flow.working.planEnd='';
        d.flow.working.notes=cmd.notes||'';
        item!.events.push({action:'retest-plan-prepared',actor:ctx.actor,at:ctx.at,reason:cmd.reason||'',documentId:d.id});
      }
      d.flow.working.reason=cmd.reason||'';d.flow.working.nextDate='';d.flow.working.skipReason='';d.flow.working.dispositionResult='';d.flow.active.content=cloneDraft({...d.flow.working,lines:[]});result={documentId:d.id};break;
    }
    case 'configure':
      edit();
      demand(ctx.settings, 'FORBIDDEN', 403);
      guard();
      demand(dateOK(cmd.startDate), 'DATE_INVALID');
      demand(
        !c.documents.length && !c.cases.length && (!c.calendarPolicy || !c.startDate) && c.jobs.every((j) => !j.planId && !j.completion),
        'START_DATE_LOCKED',
        409,
      );
      if (c.startDate && c.startDate !== cmd.startDate)
        c.events.push({
          action: 'start-date-changed',
          actor: ctx.actor,
          at: ctx.at,
          reason: c.startDate + ' → ' + cmd.startDate,
        });
      // Existing legacy schedules keep their layout and business records.
      if (cmd.calendarVersion===2 && !c.startDate && !c.jobs.length && !c.cases.length)
        c.calendarPolicy={version:2,adoptedAt:new Date(cmd.startDate+'T00:00:00+07:00').toISOString(),scopes:{}};
      c.startDate = cmd.startDate;
      c.jobs = [];
      break;
    case 'generate':
      edit();
      if(c.calendarPolicy){result={generated:generateCalendar(c,sources,ctx.today,ctx.at)};break;}
      if (c.startDate) {
        const next = schedulePreview(c, sources, c.startDate, ctx.today);
        c.jobs.push(...next.map((j) => ({ ...j, createdAt: ctx.at })));
        result = { generated: next.length };
      }
      break;
    case 'create-plan':
      edit();
      guard();
      demand(
        Array.isArray(cmd.jobIds) &&
          cmd.jobIds.length &&
          new Set(cmd.jobIds).size === cmd.jobIds.length,
        'ITEM_REQUIRED',
      );
      {
        const jobs = cmd.jobIds.map((id) => c.jobs.find((j) => j.id === id));
        demand(
          jobs.every((j) => j && !j.planId && !j.completion),
          'JOB_ALREADY_ASSIGNED',
          409,
        );
        const byItem = fqcSourcesById(sources);
        if(c.calendarPolicy){
          demand(new Set(jobs.map(j=>!!j!.calendar?.retestCaseId)).size===1,'MIXED_INITIAL_RETEST_PLAN',422);
          validatePlanDates(jobs as Job[],cmd.startDate||'',cmd.endDate||'',ctx.today);
          for(const j of jobs as Job[]){if(j.calendar?.retestCaseId)continue;const latest=byItem.get(j.itemId);demand(matchesJobItem(j,latest)&&latest.line===j.source.line&&latest.products.some(p=>p.code===j.calendar?.productCode)&&latest.frequency===j.calendar?.frequency,'SOURCE_CHANGED_RELOAD',409);j.source={...cloneDraft(latest),products:latest.products.filter(p=>p.code===j.calendar?.productCode)};}
        }
        if (!c.calendarPolicy) {
          for (const job of jobs as Job[]) job.source = renumberedPlanSource(job,byItem.get(job.itemId));
        }
        const d = addDocument(c, 'plan', jobs as Job[], ctx);
        if(c.calendarPolicy){d.calendarVersion=2;d.flow.working.planStart=cmd.startDate;d.flow.working.planEnd=cmd.endDate;d.flow.active.content=cloneDraft({...d.flow.working,lines:[]});}
        for (const j of jobs) j!.planId = d.id;
        result = { documentId: d.id };
      }
      break;
    case 'create-report':
      edit();
      guard();
      demand(!c.calendarPolicy || doc?.calendarVersion === 2, 'LEGACY_DOCUMENT_MAPPING_REQUIRED', 409);
      demand(
        doc?.kind === 'plan' && !doc.requestKind && docStatus(doc) === 'approved',
        'APPROVED_PLAN_REQUIRED',
        409,
      );
      {
        const selected =
          cmd.jobIds || doc.flow.active.content.lines.filter(l=>!doc.cancelledJobIds?.includes(l.jobId)).map((l) => l.jobId);
        demand(
          selected.length &&
            new Set(selected).size === selected.length &&
            selected.every((id) =>
              doc.flow.active.content.lines.some((l) => l.jobId === id)&&!doc.cancelledJobIds?.includes(id),
            ),
          'PLAN_ITEM_INVALID',
        );
        const occupied = reportAvailability(c, doc).filter((a) => selected.includes(a.jobId) && a.reportIds.length);
        demand(reportAvailability(c, doc).filter((a) => selected.includes(a.jobId)).every((a) => a.assigned), 'PLAN_NOT_CURRENTLY_ASSIGNED', 409);
        if (occupied.length) throw new DraftConflict('REPORT_ALREADY_EXISTS', 409, { documentIds: [...new Set(occupied.flatMap((a) => a.reportIds))] });
        const report = addDocument(
            c,
            'report',
            selected.map((id) => c.jobs.find((j) => j.id === id)!),
            ctx,
            { planId: doc.id, caseId: doc.caseId },
          );
        if(doc.calendarVersion===2){demand(selected.length===doc.flow.active.content.lines.filter(l=>!doc.cancelledJobIds?.includes(l.jobId)).length,'WHOLE_PLAN_REPORT_REQUIRED');report.calendarVersion=2;if(doc.calendarLegacy)report.calendarLegacy=cloneDraft(doc.calendarLegacy);report.flow.working.planStart=doc.flow.active.content.planStart;report.flow.working.planEnd=doc.flow.active.content.planEnd;report.flow.working.overdueReason='';for(const l of report.flow.working.lines){l.source=cloneDraft(doc.flow.active.content.lines.find(x=>x.jobId===l.jobId)!.source);l.results=[{id:crypto.randomUUID(),samples:l.source.products.map(p=>p.code),outcome:'',value:'',notes:'',photos:[]}];}report.flow.active.content=cloneDraft({...report.flow.working,lines:[]});}
        result={documentId:report.id};
      }
      break;
    case 'draft':
      demand(doc, 'DOCUMENT_NOT_FOUND', 404);
      demand(cmd.command, 'COMMAND_REQUIRED');
      {
        const command = cmd.command;
        if(c.calendarPolicy&&doc.calendarVersion!==2&&command.action==='submit')throw new DraftConflict('LEGACY_DOCUMENT_MAPPING_REQUIRED',409);
        let nextSelection:ReturnType<typeof calendarNextSelection>|undefined;
        if(doc.calendarVersion===2&&command.action==='submit'){
          const value=doc.flow.saved?.content;
          if(doc.kind==='report'&&value)
            demand(!value.lines.some(line=>!doc.cancelledJobIds?.includes(line.jobId)&&line.results.some(row=>row.outcome==='unable')),
              'LEGACY_UNABLE_KEEP_EXISTING',409);
          if(doc.kind==='report'&&value&&!doc.correctionOf)
            demand(!value.lines.some(line=>!doc.cancelledJobIds?.includes(line.jobId)&&line.results.some(row=>row.outcome==='dispose')),
              'LEGACY_INLINE_DISPOSAL_KEEP_EXISTING',409);
          if(doc.kind==='report'&&value?.planEnd&&ctx.today>value.planEnd)demand(value.overdueReason?.trim(),'OVERDUE_REASON_REQUIRED');
          if(doc.requestKind==='skip')for(const l of value?.lines||[]){const j=c.jobs.find(x=>x.id===l.jobId);demand(j&&j.start<=ctx.today&&!j.planId&&!j.completion&&!j.calendar?.requestId&&calendarSkipAllowed(c,j),'JOB_ALREADY_ASSIGNED',409);}
          if(doc.requestKind==='void')validateVoidTarget(c,doc);
          if(doc.caseId&&!doc.correctionOf&&(doc.requestKind==='retest'||['waiver','disposal'].includes(doc.kind))){
            const target=c.cases.find(a=>a.id===doc.caseId);
            demand(target,'CASE_LINK_INVALID',422);
            demand(!legacyCalendarFollowup(doc),'FOLLOWUP_KIND_UNAVAILABLE',409);
            assertCalendarFollowupKind(c,target,doc.requestKind||doc.kind);
            assertNoCalendarFollowup(c,target,doc.id);
          }
          if(['waiver','disposal'].includes(doc.kind)&&doc.disposalPolicy!=='skip-period'&&value){
            const origin=c.jobs.find(j=>j.id===c.cases.find(a=>a.id===doc.caseId)?.jobId);demand(origin,'CASE_LINK_INVALID');
            nextSelection=calendarNextSelection(c,origin,value.nextDate||'',ctx.at);
            if(nextSelection.skipped.length)demand(value.skipReason?.trim(),'SKIP_REASON_REQUIRED');
            demand(nextSelection.skipped.every(j=>!j.calendar?.requestId),'SKIP_REVIEW_CONFLICT',409);
          }
        }
        if(doc.retestApplicationCaseId&&['submit','approve'].includes(command.action)){
          const target=c.cases.find(a=>a.id===doc.retestApplicationCaseId);demand(target,'CASE_LINK_INVALID',422);
          assertCalendarFollowupKind(c,target,'retest');assertNoCalendarFollowup(c,target,doc.id);
        }
        if(doc.calendarVersion===2&&doc.kind==='waiver'&&['submit','approve'].includes(command.action))validateWaiverRetests(c,doc);
        if(doc.calendarVersion===2&&command.action==='approve'&&doc.requestKind==='void')validateVoidTarget(c,doc);
        if (['submit', 'approve'].includes(command.action))
          validateCaseLink(c, doc);
        if(doc.calendarVersion===2&&command.action==='approve'&&doc.flow.pendingId&&
          (doc.disposalPolicy==='skip-period'||doc.requestKind==='retest')){
          const target=c.cases.find(a=>a.id===doc.caseId);
          demand(target,'CASE_LINK_INVALID',422);
          assertCalendarFollowupKind(c,target,doc.requestKind||'disposal');
          assertNoCalendarFollowup(c,target,doc.id);
        }
        demand(
          command.operationId === cmd.operationId,
          'OPERATION_ID_MISMATCH',
        );
        demand(docStatus(doc) !== 'approved', 'FORMAL_DOCUMENT_IMMUTABLE', 409);
        const localSave = command.action === 'save' && command.moduleAction === 'save-local-v1';
        demand(command.moduleAction === undefined || localSave, 'PATCH_NOT_ALLOWED');
        if (localSave) demand(Number.isSafeInteger(command.expectedRevision), 'DRAFT_REVISION_REQUIRED', 409);
        if (command.action === 'apply' || localSave) {
          demand(
            command.patches &&
              command.patches.every(
                (p) =>
                  p.op === 'set' &&
                  (([
                    'title',
                    'date',
                    'notes',
                    'reason',
                    'disposition',
                    'evidence',...(doc.retestApplicationCaseId?['planStart','planEnd']:[]),...(doc.calendarVersion===2?['overdueReason','nextDate','skipReason','dispositionResult']:[]),
                  ].includes(legacyJsonValueText((p.path[0]) as JsonValue)) &&
                    p.path.length === 1) ||
                    (p.path.length === 3 &&
                      p.path[0] === 'lines' &&
                      p.path[2] === 'results')),
              ),
            'PATCH_NOT_ALLOWED',
          );
          demand(
            command.patches.every((p) =>
              command.guards?.some(
                (g) => stableDraftJSON(g.path) === stableDraftJSON(p.path),
              ),
            ),
            'DEPENDENCY_GUARD_REQUIRED',
          );
        }
        if (command.action === 'approve') {
          const pending = doc.flow.cases.find((x) => x.id === command.caseId);
          if (pending?.actor.id === ctx.actor.id)
            demand(ctx.actor.admin, 'SELF_REVIEW_ADMIN_ONLY', 403);
        }
        if (command.action === 'submit' && doc.flow.active.id && !isSavedCaseResubmission(doc.flow))
          demand(
            stableDraftJSON(doc.flow.saved?.content) !==
              stableDraftJSON(doc.flow.active.content),
            'NO_SUBSTANTIVE_CHANGE',
            422,
          );
        const draftContext: DraftContext<Content> = {
          actor: ctx.actor,
          optionalReasonPolicy: 'routine-fqc',
          at: ctx.at,
          id: () => crypto.randomUUID(),
          allowed: ctx.allowed,
          activeId: doc.flow.active.id,
          semantic: (x: Content) => x,
          structure: (content: Content, previous: Content) => {
            validateRoutineContentEdit(c, doc, content, previous);
          },
          validate: content => routineDocumentReviewIssues(c, doc, content),
        };
        // Preserve the conflict candidate's atomic per-document Save until
        // the separately guarded whole-page orchestrator replaces this owner.
        let saveSource = doc.flow, workingChanged = false;
        if (localSave && command.patches!.length) {
          demand(ctx.allowed('save'), 'FORBIDDEN', 403);
          const staged = applyDraftCommand(doc.flow, { ...command, action: 'apply' }, draftContext);
          workingChanged = !staged.receipt.unchanged;
          saveSource = { ...doc.flow, working: staged.state.working, contributors: staged.state.contributors };
        }
        const applied = applyDraftCommand(saveSource, command, draftContext);
        // Returning to an existing saved snapshot still changes working. Keep
        // one document revision and the exact full-command receipt in that case.
        if (workingChanged && applied.receipt.unchanged) {
          applied.state.revision = doc.flow.revision + 1;
          applied.state.contributors = {};
          applied.receipt = { ...applied.receipt, revision: applied.state.revision, unchanged: false };
          applied.state.receipts[command.operationId] = { ...applied.state.receipts[command.operationId], result: cloneDraft(applied.receipt) };
        }
        doc.flow = applied.state;
        if(doc.calendarVersion===2){
          if(nextSelection){c.jobs.push(...nextSelection.created);doc.nextWork={targetId:nextSelection.target.id,skipIds:nextSelection.skipped.map(j=>j.id),sourceVersionId:nextSelection.target.source.versionId};for(const j of nextSelection.skipped)j.calendar!.requestId=doc.id;}
          if(command.action==='submit'){doc.submissionLog||=[];doc.submissionLog.push({at:ctx.at,reason:doc.flow.saved?.content.overdueReason||'',caseId:doc.flow.pendingId});if(doc.requestKind==='skip')for(const l of doc.flow.saved?.content.lines||[]){const j=c.jobs.find(j=>j.id===l.jobId);if(j?.calendar)j.calendar.requestId=doc.id;}}
          if(['withdraw','return'].includes(command.action)&&(doc.requestKind==='skip'||doc.nextWork))for(const j of c.jobs)if(j.calendar?.requestId===doc.id)delete j.calendar.requestId;
        }
        result = applied.receipt;
        if (command.action === 'approve') {
          doc.reopened = false;
          applyRoutineDocumentApprovalEffects(c, doc, doc.flow.active.content, ctx);
        }
        break;
      }
    case 'improve':
      edit();
      guard();
      demand(
        item && !['closed', 'disposed', 'waived'].includes(item.status),
        'CASE_CLOSED',
        409,
      );
      demand(cmd.notes?.trim(), 'REASON_REQUIRED');
      item.improvements.push({
        id: crypto.randomUUID(),
        notes: cmd.notes!,
        photos: cmd.photos || [],
        actor: ctx.actor,
        at: ctx.at,
      });
      item.events.push({
        action: 'improvement',
        actor: ctx.actor,
        at: ctx.at,
        reason: cmd.notes!,
      });
      break;
    case 'followup':
      demand(!c.calendarPolicy,'USE_REVIEWED_FOLLOWUP_REQUEST',409);
      edit();
      guard();
      demand(
        item && !['closed', 'disposed', 'waived'].includes(item.status),
        'CASE_CLOSED',
        409,
      );
      demand(
        !c.documents.some(
          (d) => !d.cancelled && d.caseId === item.id && docStatus(d) !== 'approved',
        ),
        'FOLLOWUP_OPEN',
        409,
      );
      {
        let kind = cmd.kind || 'report';
        demand(['report', 'waiver', 'disposal'].includes(kind), 'KIND_INVALID');
        if (kind === 'waiver') {
          demand(item.result === 'unable', 'WAIVER_ONLY_UNABLE');
          demand(
            !unresolvedFailureSamples(c, item).length,
            'OPEN_FAILURE_REQUIRES_RETEST_OR_DISPOSAL',
          );
        }
        if (kind === 'disposal')
          demand(
            item.result === 'fail' || unresolvedFailureSamples(c, item).length,
            'DISPOSAL_ONLY_FAIL',
          );
        const improvementNotes = kind === 'report' ? cmd.notes?.trim() : '';
        if (kind === 'report' && item.result === 'fail')
          demand(
            improvementNotes || item.improvements.some(
              (i) =>
                i.at >=
                [...item.events].reverse().find((e) => e.action === 'fail')!.at,
            ),
            'IMPROVEMENT_REQUIRED',
          );
        // Both changes persist in one CAS write. Existing clients may use
        // a previously recorded improvement without sending new notes.
        if (improvementNotes) {
          item.improvements.push({
            id: crypto.randomUUID(), notes: improvementNotes,
            photos: cmd.photos || [], actor: ctx.actor, at: ctx.at,
          });
          item.events.push({
            action: 'improvement', actor: ctx.actor, at: ctx.at,
            reason: improvementNotes,
          });
        }
        if (kind === 'report' && item.result === 'unable') kind = 'plan';
        const d = addDocument(
          c,
          kind,
          [c.jobs.find((j) => j.id === item.jobId)!],
          ctx,
          { planId: item.planId, caseId: item.id },
        );
        item.events.push({
          action: kind,
          actor: ctx.actor,
          at: ctx.at,
          reason: cmd.reason || '',
          documentId: d.id,
        });
        if (kind === 'report' || kind === 'plan') item.status = 'retest';
        result = { documentId: d.id };
      }
      break;
    case 'close':
      guard();
      demand(ctx.allowed('approve'), 'FORBIDDEN', 403);
      demand(
        item?.status === 'ready-close',
        'APPROVED_PASS_RETEST_REQUIRED',
        409,
      );
      demand(cmd.reason?.trim(), 'REASON_REQUIRED');
      item.status = 'closed';
      item.events.push({
        action: 'close',
        actor: ctx.actor,
        at: ctx.at,
        reason: cmd.reason!,
      });
      break;
    case 'revoke-plan':
      demand(!c.calendarPolicy&&doc?.calendarVersion!==2,'USE_VOID_REQUEST',409);
      guard();
      demand(ctx.revoke, 'FORBIDDEN', 403);
      demand(
        doc?.kind === 'plan' && !doc.requestKind && docStatus(doc) === 'approved',
        'APPROVED_PLAN_REQUIRED',
      );
      demand(
        !c.documents.some((d) => d.planId === doc.id),
        'USE_CORRECTION_WITH_REPORTS',
        409,
      );
      demand(cmd.reason?.trim(), 'REASON_REQUIRED');
      doc.reopened = true;
      doc.flow.generation = crypto.randomUUID();
      doc.flow.revision++;
      doc.flow.saved = null;
      break;
    case 'discard-draft':
    case 'delete-plan': {
      edit();
      guard();
      demand(doc, 'DOCUMENT_NOT_FOUND', 404);
      demand(!doc.flow.pendingId, 'WITHDRAW_BEFORE_DISCARD', 409);
      if (cmd.action === 'delete-plan') {
        demand(!c.calendarPolicy&&doc.calendarVersion!==2,'USE_VOID_REQUEST',409);
        demand(ctx.revoke, 'FORBIDDEN', 403);
        demand(doc.kind === 'plan' && docStatus(doc) === 'approved', 'APPROVED_PLAN_REQUIRED');
      } else {
        demand(docStatus(doc) === 'draft' && (!doc.flow.active.id || doc.reopened), 'DRAFT_ONLY', 409);
        if (doc.flow.active.id) demand(ctx.revoke, 'FORBIDDEN', 403);
      }
      const deps = cancellationDependencies(c, doc);
      if (deps.documents.length || deps.cases.length) throw new DraftConflict('DOCUMENT_HAS_DEPENDENCIES', 409, deps);
      const linked = c.cases.find((a) => a.id === doc.caseId);
      doc.cancelled = { at: ctx.at, actor: ctx.actor, status: docStatus(doc), caseStatus: linked?.status };
      doc.lifecycle ||= [];
      doc.lifecycle.push({ action: cmd.action, at: ctx.at, actor: ctx.actor });
      if (doc.kind === 'plan' && !doc.caseId) for (const j of c.jobs) if (j.planId === doc.id) j.planId = null;
      if(doc.retestApplicationCaseId)for(const j of c.jobs)if(j.calendar?.retestCaseId===doc.retestApplicationCaseId&&j.id==='retest:'+doc.id){j.calendar.stopped={at:ctx.at,reason:'draft-discarded'};delete j.calendar.queuedAt;}
      // Removing an unapproved retest returns the case to its unresolved state.
      if (linked && ['plan', 'report'].includes(doc.kind) && linked.status === 'retest') linked.status = 'open';
      if (linked) linked.events.push({ action: cmd.action, at: ctx.at, actor: ctx.actor, reason: '', documentId: doc.id });
      result = { documentId: doc.id };
      break;
    }
    case 'restore-document':
      edit();
      guard();
      throw new DraftConflict('RESTORE_DISABLED', 409);
    case 'correct':
      edit();
      guard();
      demand(ctx.revise, 'FORBIDDEN', 403);
      demand(doc && docStatus(doc) === 'approved', 'FORMAL_DOCUMENT_REQUIRED');
      validateCaseLink(c, doc);
      demand(cmd.reason?.trim(), 'REASON_REQUIRED');
      demand(
        !c.documents.some(
          (d) => d.correctionOf === doc.id && docStatus(d) !== 'approved',
        ),
        'CORRECTION_OPEN',
        409,
      );
      {
        const d = addDocument(
          c,
          doc.kind,
          doc.flow.active.content.lines.map((l) =>
            c.jobs.find((j) => j.id === l.jobId)!,
          ),
          ctx,
          { planId: doc.planId, caseId: doc.caseId, correctionOf: doc.id },
        );
        if(doc.calendarVersion===2){demand(doc.kind==='report','CORRECTION_REQUIRES_IMPACT_REVIEW',409);d.calendarVersion=2;if(doc.calendarLegacy)d.calendarLegacy=cloneDraft(doc.calendarLegacy);}
        d.flow.working = cloneDraft(doc.flow.active.content);
        d.flow.working.reason = cmd.reason!;
        if(d.calendarVersion===2){const related=c.cases.filter(a=>a.reportIds.includes(doc.id));const downstream=c.documents.filter(other=>other.id!==doc.id&&other.flow.active.id&&related.some(a=>a.reportIds.includes(other.id)||other.caseId===a.id));d.impact=downstream.map(other=>({id:other.id,reason:'APPROVED_DOWNSTREAM_RETAINED'}));}
        d.flow.working.title = d.number;
        d.flow.active.content = { ...cloneDraft(d.flow.working), lines: [] };
        result = { documentId: d.id };
      }
      break;
    case 'resolve-impact':
      guard();
      demand(ctx.allowed('approve'), 'FORBIDDEN', 403);
      demand(doc && cmd.reason?.trim(), 'REASON_REQUIRED');
      demand(
        doc.impact?.some((i) => !i.resolvedAt),
        'NO_OPEN_IMPACT',
      );
      for (const i of doc.impact || [])
        if (!i.resolvedAt) {
          i.resolvedAt = ctx.at;
          i.resolvedBy = ctx.actor.id;
          i.reason += '\n' + cmd.reason;
        }
      break;
    default:
      throw new DraftConflict('ACTION_INVALID', 422);
  }
  c.revision++;
  c.events.push({
    action: cmd.action,
    actor: ctx.actor,
    at: ctx.at,
    reason: cmd.reason || '',
  });
  c.receipts[cmd.operationId] = { actorId: ctx.actor.id, fingerprint, result };
  return result;
}


function calendarReviewIssues(doc:RoutineDocumentMetadata,value:Content):DraftIssue[]{
 const issues:DraftIssue[]=[];const add=(field:string,code:string)=>issues.push({kind:'error',path:[field],message:code,code});
 if(!value.title.trim())add('title','TITLE_REQUIRED');
 if(!value.lines.length)add('lines','ITEM_REQUIRED');
 if(doc.requestKind){if(!value.reason.trim())add('reason','REASON_REQUIRED');return issues;}
 if(doc.kind==='plan'){if(doc.retestApplicationCaseId&&!value.reason.trim())add('reason','REASON_REQUIRED');if(doc.calendarLegacy?.unrecordedPlanDates)return issues;if(!validCalendarDate(value.planStart)||!validCalendarDate(value.planEnd)||value.planStart!>value.planEnd!)add('planStart','PLAN_DATES_REQUIRED');return issues;}
 if(doc.kind==='report'){
  if(!validCalendarDate(value.date))add('date','DATE_REQUIRED');
  for(const l of value.lines){if(l.results.length!==1){add('lines','ONE_RESULT_PER_PRODUCT_REQUIRED');continue;}const r=l.results[0];const path:DraftIssue['path']=['lines',{id:l.id},'results',{id:r.id}];const issue=(field:string,code:string)=>issues.push({kind:'error',path:[...path,field],message:code,code});
   if(!['pass','fail','abnormal','unable','dispose'].includes(r.outcome))issue('outcome','RESULT_REQUIRED');
   if(['pass','fail'].includes(r.outcome)&&(r.samples.length!==1||r.samples[0]!==l.source.products[0]?.code))issue('samples','SAMPLES_REQUIRED');
   if(r.outcome==='fail'&&!r.photos.length)issue('photos','UPLOADED_PHOTO_REQUIRED');
   if(r.outcome==='unable'&&!r.notes.trim())issue('notes','EXPLANATION_REQUIRED');
   if(r.outcome==='dispose'){
    if(!r.disposalReason?.trim())issue('disposalReason','DISPOSAL_REASON_REQUIRED');
    if(!r.notes.trim())issue('notes','DISPOSAL_PROBLEM_REQUIRED');
   }
  }return issues;
 }
 if(!value.reason.trim())add('reason','REASON_REQUIRED');
 if(doc.disposalPolicy!=='skip-period'&&!validCalendarDate(value.nextDate))add('nextDate','NEXT_DATE_REQUIRED');
 if(doc.kind==='disposal'){if(!value.disposition.trim())add('disposition','DISPOSITION_REQUIRED');if(doc.disposalPolicy!=='skip-period'&&!value.dispositionResult?.trim())add('dispositionResult','DISPOSITION_RESULT_REQUIRED');}
 return issues;
}
// Conversion pins original work; no retest data is removed at draft/submission.
export function waiverRetestSnapshot(c:RoutineFqc,caseId:string):NonNullable<Document['waiverRetests']>{
 const jobs=c.jobs.filter(j=>j.calendar?.retestCaseId===caseId&&!j.completion&&!j.calendar.stopped);
 const ids=new Set(jobs.map(j=>j.id)),plans=new Set(jobs.map(j=>j.planId).filter(Boolean));
 const documents=c.documents.filter(d=>!d.cancelled&&!d.requestKind&&(plans.has(d.id)||d.kind==='report'&&plans.has(d.planId)));
 demand(!documents.some(d=>d.flow.pendingId),'WITHDRAW_RETEST_REVIEW_BEFORE_WAIVER',409);
 demand(!documents.some(d=>d.kind==='report'&&d.flow.active.id),'APPROVED_RETEST_CHANGED',409);
 return {jobIds:[...ids].sort(),documents:documents.map(d=>({id:d.id,revision:d.flow.revision,activeId:d.flow.active.id,jobIds:docContent(d).lines.map(l=>l.jobId)})).sort((a,b)=>a.id.localeCompare(b.id))};
}
export function validateWaiverRetests(c:RoutineFqc,doc:Document){
 const current=waiverRetestSnapshot(c,doc.caseId!);
 demand(!doc.waiverRetests?current.jobIds.length===0:JSON.stringify(doc.waiverRetests)===JSON.stringify(current),'WAIVER_RETEST_CHANGED',409);
}
function assertWaiverConversionUnlocked(c:RoutineFqc,doc:Document|undefined,jobIds:string[],caseId?:string){
 for(const waiver of c.documents.filter(d=>!d.cancelled&&d.flow.pendingId&&d.waiverRetests)){
  if(waiver.id===doc?.id)continue;
  demand(!(caseId&&caseId===waiver.caseId)&&!jobIds.some(id=>waiver.waiverRetests!.jobIds.includes(id))&&!waiver.waiverRetests!.documents.some(d=>d.id===doc?.id),'WAIVER_CONVERSION_PENDING',409);
 }
}
function stopWaivedRetests(c:RoutineBusinessState,doc:RoutineDocumentMetadata,ctx:Pick<Context,'actor'|'at'>){
 const targets=doc.waiverRetests;if(!targets)return;
 const jobs=targets.jobIds.map(id=>c.jobs.find(j=>j.id===id));
 demand(jobs.every(j=>j&&j.calendar?.retestCaseId===doc.caseId&&!j.completion&&!j.calendar.stopped),'WAIVER_RETEST_CHANGED',409);
 for(const job of jobs){job!.calendar!.stopped={at:ctx.at,reason:'approved-waiver:'+doc.id};delete job!.calendar!.queuedAt;}
 for(const pin of targets.documents){const target=c.documents.find(d=>d.id===pin.id);demand(target,'WAIVER_RETEST_CHANGED',409);
  target.cancelledJobIds||=[];for(const id of pin.jobIds.filter(id=>targets.jobIds.includes(id)))if(!target.cancelledJobIds.includes(id))target.cancelledJobIds.push(id);
  target.lifecycle||=[];target.lifecycle.push({action:'approved-waiver:'+doc.id,at:ctx.at,actor:ctx.actor});
  if(pin.jobIds.every(id=>target.cancelledJobIds!.includes(id)))target.cancelled={at:ctx.at,actor:ctx.actor,status:pin.activeId?'approved':'draft'};
 }
}
function validateVoidTarget(c:RoutineFqc,doc:Document){
 const target=c.documents.find(d=>d.id===doc.targetPlanId);demand(target&&!target.cancelled&&docStatus(target)==='approved','APPROVED_PLAN_REQUIRED',409);
 const reports=c.documents.filter(d=>!d.cancelled&&d.kind==='report'&&d.planId===target.id);
 demand(!reports.some(d=>d.flow.pendingId),'WITHDRAW_REPORT_BEFORE_VOID',409);demand(!reports.some(d=>d.flow.active.id),'APPROVED_REPORT_USE_CORRECTION',409);
}
function cancelErroneousRetests(c:RoutineBusinessState,item:Case,correction:RoutineDocumentMetadata,ctx:Pick<Context,'actor'|'at'>){
 for(const j of c.jobs)if(j.calendar?.retestCaseId===item.id&&j.completion){correction.impact||=[];if(!correction.impact.some(i=>i.id===j.completion!.reportId))correction.impact.push({id:j.completion.reportId,reason:'APPROVED_DOWNSTREAM_RETAINED'});}
 item.events.push({action:'report-correction-closed',actor:ctx.actor,at:ctx.at,reason:correction.id,documentId:correction.id});
 for(const j of c.jobs)if(j.calendar?.retestCaseId===item.id&&!j.completion){j.calendar.stopped={at:ctx.at,reason:'origin-report-corrected'};delete j.calendar.queuedAt;for(const d of c.documents)if(d.id===j.planId||d.planId===j.planId&&d.kind==='report'){d.cancelledJobIds||=[];if(!d.cancelledJobIds.includes(j.id))d.cancelledJobIds.push(j.id);d.lifecycle||=[];d.lifecycle.push({action:'origin-report-corrected:'+correction.id,at:ctx.at,actor:ctx.actor});}}
}
function calendarSkipAllowed(c:RoutineBusinessState,j:Job){
 return !j.calendar?.retestCaseId&&!j.calendar?.stopped&&!c.cases.some(a=>(a.jobId===j.id||a.lineageJobIds?.includes(j.id))&&!['closed','disposed','waived'].includes(a.status));
}
function calendarApproval(c:RoutineBusinessState,doc:RoutineDocumentMetadata,value:Content,ctx:Pick<Context,'actor'|'at'>){
 if(doc.requestKind==='skip'){for(const l of value.lines){const j=c.jobs.find(j=>j.id===l.jobId)!;demand(!j.planId&&!j.completion&&calendarSkipAllowed(c,j),'JOB_ALREADY_ASSIGNED',409);j.completion={kind:'skip',reportId:doc.id,at:ctx.at};if(j.calendar){delete j.calendar.requestId;delete j.calendar.queuedAt;}}return true;}
 if(doc.requestKind==='void'){
  const target=c.documents.find(d=>d.id===doc.targetPlanId)!;target.cancelled={at:ctx.at,actor:ctx.actor,status:'approved'};target.lifecycle||=[];target.lifecycle.push({action:'approved-void:'+doc.id,at:ctx.at,actor:ctx.actor});
  for(const d of c.documents)if(d.planId===target.id&&d.kind==='report'&&!d.cancelled){d.cancelled={at:ctx.at,actor:ctx.actor,status:'draft'};d.lifecycle||=[];d.lifecycle.push({action:'approved-void:'+doc.id,at:ctx.at,actor:ctx.actor});}
  for(const j of c.jobs)if(j.planId===target.id){j.planId=null;if(j.calendar)j.calendar.queuedAt=ctx.at;}return true;
 }
 if(doc.requestKind==='retest'){
  const item=c.cases.find(a=>a.id===doc.caseId)!;const origin=c.jobs.find(j=>j.id===item.jobId)!;const key='retest:'+doc.id;
  if(!c.jobs.some(j=>j.id===key)){const source=cloneDraft(value.lines[0].source);const job:Job={...cloneDraft(origin),id:key,source,createdAt:ctx.at,planId:null,completion:null,calendar:{scope:origin.calendar?.scope||JSON.stringify([source.line,source.products[0]?.code,source.id]),productCode:source.products[0]?.code||'',frequency:source.frequency!,queuedAt:ctx.at,retestCaseId:item.id,originJobId:origin.id}};c.jobs.push(job);item.lineageJobIds||=[];item.lineageJobIds.push(key);}
  item.status='retest';item.events.push({action:'retest-request-approved',actor:ctx.actor,at:ctx.at,reason:value.reason,documentId:doc.id});return true;
 }
 if(['waiver','disposal'].includes(doc.kind)&&doc.disposalPolicy!=='skip-period'){
  demand(doc.nextWork&&c.jobs.some(j=>j.id===doc.nextWork!.targetId),'NEXT_DATE_REVIEW_PIN_REQUIRED',409);
  const target=c.jobs.find(j=>j.id===doc.nextWork!.targetId)!;demand(!target.calendar?.stopped,'NEXT_DATE_FREQUENCY_CHANGED',409);
  const skipped=doc.nextWork.skipIds.map(id=>c.jobs.find(j=>j.id===id)!);demand(skipped.every(j=>j&&!j.planId&&!j.completion&&!j.calendar?.stopped),'SKIP_REVIEW_CONFLICT',409);
  if(skipped.length)demand(value.skipReason?.trim(),'SKIP_REASON_REQUIRED');
  for(const j of skipped){demand(!j.calendar?.requestId||j.calendar.requestId===doc.id,'SKIP_REVIEW_CONFLICT',409);j.completion={kind:'skip',reportId:doc.id,at:ctx.at};if(j.calendar){delete j.calendar.requestId;delete j.calendar.queuedAt;}}
  // Existing normal approval effects close the abnormality and retain its result.
 }
 return false;
}
