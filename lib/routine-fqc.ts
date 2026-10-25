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
export type Outcome = '' | 'pass' | 'fail' | 'unable' | 'undetermined';
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
};
export type Job = {
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
  title: string;
  date: string;
  notes: string;
  lines: Line[];
  reason: string;
  disposition: string;
  evidence: string[];
};
export type Document = {
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
export type Case = {
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
    products = (master.active?.AB?.products || []) as {
      code: string;
      name: string;
    }[];
  return (version.snapshot?.items || [])
    .filter((i: Record<string, unknown>) => !i.isDeleted && i.isEnabled)
    .map((i: RoutineSourceItem) => {
      const err = version.snapshot.errors?.find(
          (e: { id: string }) => e.id === i.errorId,
        ),
        rawFrequency = i.rule?.cadence === 'time' ? i.rule.timeFrequency : null,
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
        id: i.id,
        name: i.name || '',
        code: i.checkNo || '',
        line: i.line || '',
        category: i.category || '',
        errorCode: err?.code || '',
        description: i.description || '',
        versionId: version.id,
        version: String(version.number),
        effectiveDate: companyDate(
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
          name: products.find((p) => p.code === code)?.name || code,
        })),
      };
    })
    .filter((s: Source) => s.frequencyText);
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
    active = master.active?.AB || {},
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
  return docContent(plan).lines.map((line) => ({
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
        if (!r.outcome) add([...p, 'outcome'], 'RESULT_REQUIRED');
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
        'evidence',
      ].includes(k),
    ),
    'CONTENT_INVALID',
  );
  for (const k of ['title', 'date', 'notes', 'reason', 'disposition'] as const)
    demand(
      typeof content[k] === 'string' && content[k].length <= 20000,
      'TEXT_INVALID',
    );
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
          ['id', 'samples', 'outcome', 'value', 'notes', 'photos'].includes(k),
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
        ['', 'pass', 'fail', 'unable', 'undetermined'].includes(r.outcome),
        'RESULT_INVALID',
      );
      demand(
        r.outcome !== 'unable' || r.samples.length === 0,
        'UNABLE_MUST_NOT_HAVE_SAMPLES',
      );
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
  actor: DraftActor;
  at: string;
  today: string;
  allowed: (p: DraftPermission) => boolean;
  settings: boolean;
  revoke: boolean;
  revise: boolean;
};
export type RoutineCommand = {
  action: string;
  operationId: string;
  expectedRevision?: number;
  documentId?: string;
  caseId?: string;
  jobIds?: string[];
  startDate?: string;
  reason?: string;
  notes?: string;
  photos?: string[];
  kind?: Document['kind'];
  command?: DraftCommand;
  selfReviewConfirmed?: boolean;
};
function addDocument(
  c: RoutineFqc,
  kind: Document['kind'],
  jobs: Job[],
  ctx: Context,
  extra: Partial<Document> = {},
) {
  const id = crypto.randomUUID(),
    number =
      (kind === 'plan'
        ? 'FQC-PLN'
        : kind === 'report'
          ? extra.caseId ? 'FQC-RTS' : extra.correctionOf ? 'FQC-COR' : 'FQC-RPT'
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
  const flow = createSharedDraft(
    'routine-fqc:' + id,
    content,
    null,
    crypto.randomUUID(),
  );
  flow.active.content = { ...cloneDraft(content), lines: [] };
  const doc: Document = {
    id,
    number,
    kind,
    planId: null,
    caseId: null,
    correctionOf: null,
    createdAt: ctx.at,
    owner: ctx.actor,
    flow,
    ...extra,
  };
  c.documents.push(doc);
  return doc;
}
function linkedCase(c: RoutineFqc, doc: Document, jobId: string) {
  if (doc.caseId)
    return c.cases.find((a) => a.id === doc.caseId && a.jobId === jobId);
  if (doc.correctionOf)
    return c.cases.find(
      (a) => a.jobId === jobId && a.reportIds.includes(doc.correctionOf!),
    );
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

function validateCaseLink(c: RoutineFqc, doc: Document) {
  if (doc.kind === 'waiver' || doc.kind === 'disposal')
    demand(doc.caseId, 'CASE_LINK_REQUIRED');
  if (doc.caseId) {
    const item = c.cases.find((a) => a.id === doc.caseId);
    demand(
      item && doc.flow.working.lines.every((l) => l.jobId === item.jobId),
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

function approveEffects(c: RoutineFqc, doc: Document, ctx: Context) {
  validateCaseLink(c, doc);
  const content = doc.flow.active.content;
  if (doc.correctionOf) {
    const old = c.documents.find((d) => d.id === doc.correctionOf)!;
    old.impact ||= [];
    old.impact.push({
      id: doc.id,
      reason: content.reason || content.notes || 'Correction / 更正',
    });
  }
  if (doc.kind === 'plan') {
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
    item.status = doc.kind === 'waiver' ? 'waived' : 'disposed';
    if (doc.kind === 'disposal') item.result = 'fail';
    const job = c.jobs.find((j) => j.id === item.jobId)!;
    job.completion = { kind: doc.kind, reportId: doc.id, at: ctx.at };
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
    const job = c.jobs.find((j) => j.id === l.jobId)!;
    const unresolved = l.results.some((r) =>
      ['unable', 'undetermined'].includes(r.outcome),
    );
    const result = l.results.some((r) => r.outcome === 'fail')
      ? 'fail'
      : l.results.some((r) => r.outcome === 'undetermined')
        ? 'undetermined'
        : l.results.some((r) => r.outcome === 'unable')
          ? 'unable'
          : 'pass';
    if (!unresolved)
      job.completion = { kind: result, reportId: doc.id, at: ctx.at };
    else job.completion = null;
    let item =
      linkedCase(c, doc, job.id) ||
      c.cases.find(
        (a) =>
          a.jobId === job.id &&
          !['closed', 'disposed', 'waived'].includes(a.status),
      );
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
      const measured = new Set(l.results.flatMap((r) => r.samples));
      item.requiredSamples = [
        ...new Set([
          ...item.requiredSamples.filter((sample) => !measured.has(sample)),
          ...l.results
            .filter((r) => r.outcome !== 'pass')
            .flatMap((r) => r.samples),
        ]),
      ];
      item.status = result === 'pass' ? 'ready-close' : 'open';
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
  if (doc?.cancelled && cmd.action !== 'restore-document') throw new DraftConflict('DOCUMENT_CANCELLED', 409);
  switch (cmd.action) {
    case 'configure':
      edit();
      demand(ctx.settings, 'FORBIDDEN', 403);
      guard();
      demand(dateOK(cmd.startDate), 'DATE_INVALID');
      demand(
        !c.documents.length && c.jobs.every((j) => !j.planId && !j.completion),
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
      c.startDate = cmd.startDate;
      c.jobs = [];
      break;
    case 'generate':
      edit();
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
        const d = addDocument(c, 'plan', jobs as Job[], ctx);
        for (const j of jobs) j!.planId = d.id;
        result = { documentId: d.id };
      }
      break;
    case 'create-report':
      edit();
      guard();
      demand(
        doc?.kind === 'plan' && docStatus(doc) === 'approved',
        'APPROVED_PLAN_REQUIRED',
        409,
      );
      {
        const selected =
          cmd.jobIds || doc.flow.active.content.lines.map((l) => l.jobId);
        demand(
          selected.length &&
            new Set(selected).size === selected.length &&
            selected.every((id) =>
              doc.flow.active.content.lines.some((l) => l.jobId === id),
            ),
          'PLAN_ITEM_INVALID',
        );
        const occupied = reportAvailability(c, doc).filter((a) => selected.includes(a.jobId) && a.reportIds.length);
        demand(reportAvailability(c, doc).filter((a) => selected.includes(a.jobId)).every((a) => a.assigned), 'PLAN_NOT_CURRENTLY_ASSIGNED', 409);
        if (occupied.length) throw new DraftConflict('REPORT_ALREADY_EXISTS', 409, { documentIds: [...new Set(occupied.flatMap((a) => a.reportIds))] });
        result = {
          documentId: addDocument(
            c,
            'report',
            selected.map((id) => c.jobs.find((j) => j.id === id)!),
            ctx,
            { planId: doc.id, caseId: doc.caseId },
          ).id,
        };
      }
      break;
    case 'draft':
      demand(doc, 'DOCUMENT_NOT_FOUND', 404);
      demand(cmd.command, 'COMMAND_REQUIRED');
      {
        const command = cmd.command;
        if (['submit', 'approve'].includes(command.action))
          validateCaseLink(c, doc);
        demand(
          command.operationId === cmd.operationId,
          'OPERATION_ID_MISMATCH',
        );
        demand(docStatus(doc) !== 'approved', 'FORMAL_DOCUMENT_IMMUTABLE', 409);
        if (command.action === 'apply') {
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
                    'evidence',
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
        if (['approve', 'return'].includes(command.action)) {
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
        const applied = applyDraftCommand(doc.flow, command, {
          actor: ctx.actor,
          optionalReasonPolicy: 'routine-fqc',
          at: ctx.at,
          id: () => crypto.randomUUID(),
          allowed: ctx.allowed,
          activeId: doc.flow.active.id,
          semantic: (x) => x,
          structure: (content, previous) => {
            structure(content,previous);
            if (doc.kind === 'report') for (const line of content.lines) {
              const required = linkedCase(c,doc,line.jobId)?.requiredSamples || [];
              if (!required.length) continue;
              for (const row of line.results) {
                const oldRow = previous.lines.find(l => l.id === line.id)?.results.find(r => r.id === row.id);
                demand(row.samples.every(sample => required.includes(sample)) || (oldRow && stableDraftJSON(oldRow.samples) === stableDraftJSON(row.samples)), 'RETEST_SAMPLE_FIXED');
              }
            }
          },
          validate: (content) => {
            const issues = reportIssues(content, doc.kind);
            if (doc.kind === 'report')
              for (const line of content.lines) {
                const a = linkedCase(c, doc, line.jobId);
                if (!a) continue;
                if (a.requiredSamples.length && line.results.some(row => row.samples.some(sample => !a.requiredSamples.includes(sample))))
                  issues.push({kind:'error',path:['lines',{id:line.id},'samples'],message:'RETEST_SAMPLE_FIXED'});
                if (
                  !line.results.some((r) => r.outcome === 'unable') &&
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
          },
        });
        doc.flow = applied.state;
        result = applied.receipt;
        if (command.action === 'approve') {
          doc.reopened = false;
          approveEffects(c, doc, ctx);
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
      guard();
      demand(ctx.revoke, 'FORBIDDEN', 403);
      demand(
        doc?.kind === 'plan' && docStatus(doc) === 'approved',
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
        d.flow.working = cloneDraft(doc.flow.active.content);
        d.flow.working.reason = cmd.reason!;
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
