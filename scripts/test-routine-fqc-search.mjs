// Isolated search fixtures; no database, network or business-record writes.
import assert from 'node:assert/strict';
import {
  buildSearchIndex,
  querySearch,
  sourceKey,
  normalize,
  searchKind,
  searchNumber,
} from '../public/process/routine-fqc-search.mjs';
const source = (id, line = 'A', category = 'Valve') => ({
  id,
  name: '尺寸 Độ kín ' + id,
  code: 'CHECK-' + id,
  errorCode: 'ERR-' + id,
  line,
  category,
  products: [
    { code: 'P1', name: '原樣品' },
    { code: 'P2', name: 'Mẫu mới' },
  ],
});
const job = (
  id,
  start = '2026-10-01',
  end = '2026-10-31',
  src = source(id),
) => ({ id, itemId: src.id, start, end, source: src, completion: null });
const row = (sample, outcome) => ({
  samples: sample ? [sample] : [],
  outcome,
  value: '12',
  notes: 'QA',
  photos: [],
});
const line = (j, results) => ({
  id: 'line-' + j.id,
  jobId: j.id,
  source: j.source,
  results,
});
let serial = 0;
const doc = (
  id,
  kind,
  lines,
  { approved = true, date = '2026-10-13', ...extra } = {},
) => {
  const content = { title: id, date, lines };
  const at = date + 'T12:' + String(serial++).padStart(2, '0') + ':00Z';
  return {
    id,
    kind,
    number: `FQC-${kind === 'plan' ? 'PLN' : 'RPT'}-${date.replaceAll('-', '')}-${String(serial).padStart(4, '0')}`,
    createdAt: at,
    flow: {
      active: { id: approved ? 'case-' + id : null, content },
      working: content,
      pendingId: null,
      cases: approved
        ? [{ id: 'case-' + id, at, result: { at }, content }]
        : [],
    },
    ...extra,
  };
};
const a = job('a'),
  b = job('b', '2026-09-01', '2026-09-30', source('b', 'B', 'Pump'));
const initial = doc('initial', 'report', [
  line(a, [row('P1', 'fail'), row('P2', 'undetermined')]),
]);
const retest = doc('retest', 'report', [line(a, [row('P1', 'pass')])], {
  caseId: 'case-a',
  date: '2026-11-02',
});
const pending = doc('pending', 'report', [line(a, [row('P2', 'pass')])], {
  approved: false,
  caseId: 'case-a',
});
pending.flow.pendingId = 'pending-case';
pending.flow.cases = [{ id: 'pending-case', content: pending.flow.working }];
const multi = doc('multi', 'plan', [line(a, []), line(b, [])]);
multi.flow.active.content.lines[0].source = {
  ...a.source,
  products: [{ code: 'P1', name: 'original' }],
};
multi.flow.active.content.lines[1].source = {
  ...b.source,
  products: [{ code: 'P2', name: 'new' }],
};
const old = doc('old', 'report', [line(b, [row('P2', 'fail')])], {
  date: '2026-09-02',
});
const corrected = doc('corrected', 'report', [line(b, [row('P2', 'pass')])], {
  correctionOf: old.id,
  date: '2026-10-03',
});
const cancelled = doc('cancelled', 'report', [line(a, [row('P1', 'fail')])], {
  cancelled: { at: '2026-10-13' },
});
const data = {
  today: '2026-10-13',
  control: {
    revision: 1,
    jobs: [a, b],
    documents: [initial, retest, pending, multi, old, corrected, cancelled],
    cases: [{ id: 'case-a', jobId: a.id, status: 'open' }],
  },
  sources: [source('new')],
  catalog: { items: [] },
};
const state = {
  periodMode: 'current',
  query: '',
  line: '',
  category: '',
  item: '',
  productMode: 'covered',
  active: 'jobs',
  cancelled: false,
};
let index = buildSearchIndex(data),
  result = querySearch(index, state);
assert.equal(
  result.byMode.jobs.length,
  1,
  'current period belongs to job, not report date',
);
assert.ok(
  result.byMode.retest.some((d) => d.id === retest.id),
  'cross-month retest stays in original job period',
);
assert.equal(result.byMode.pending.length, 1);
assert.equal(
  index.projections.get(a.id).result,
  'undetermined',
  'partial pass does not erase unresolved other sample',
);
assert.equal(result.byMode.ever.length, 1);
assert.equal(result.byMode.open.length, 1, 'open mode counts jobs');
assert.equal(
  querySearch(index, {
    ...state,
    periodMode: 'specific',
    period: JSON.stringify([b.start, b.end]),
  }).byMode.jobs[0].id,
  b.id,
);
assert.equal(
  querySearch(index, {
    ...state,
    periodMode: 'range',
    from: '2026-10-31',
    to: '2026-10-01',
  }).byMode.jobs.length,
  0,
);
assert.equal(
  querySearch(index, {
    ...state,
    periodMode: 'range',
    from: '2026-02-30',
    to: '2026-10-31',
  }).invalidRange,
  true,
);
assert.equal(
  querySearch(index, { ...state, query: 'P2', category: 'Valve' }).byMode.plan
    .length,
  0,
  'different lines cannot combine category and product',
);
assert.equal(
  querySearch(index, { ...state, periodMode: 'all' }).byMode.plan.length,
  1,
  'multi-item document counted once',
);
assert.equal(
  querySearch(index, { ...state, query: 'P1', productMode: 'tested' }).byMode
    .plan.length,
  0,
  'covered plan product is not tested',
);
assert.equal(
  querySearch(index, { ...state, query: 'P1', productMode: 'covered' }).byMode
    .plan.length,
  1,
);
assert.equal(
  querySearch(index, { ...state, query: old.number }).outside,
  true,
  'exact historical number requires explicit scope change',
);
assert.equal(
  querySearch(index, { ...state, query: old.number, periodMode: 'all' }).byMode
    .initial[0].id,
  old.id,
);
assert.equal(
  index.projections.get(b.id).result,
  'pass',
  'approved correction supersedes original outcome',
);
assert.equal(
  index.projections.get(b.id).everFail,
  true,
  'original formal failure remains historical',
);
assert.deepEqual(index.projections.get(b.id).correctedFailures, [old.id]);
assert.equal(
  querySearch(index, { ...state, cancelled: true }).byMode.initial.length,
  result.byMode.initial.length,
);
assert.equal(searchKind(retest), 'retest');
assert.match(searchNumber(retest), /-RTS-/);
assert.equal(
  querySearch(index, { ...state, query: searchNumber(retest) }).byMode.retest[0]
    .id,
  retest.id,
);
assert.notEqual(sourceKey(source('a')), sourceKey(source('different')));
assert.notEqual(sourceKey(source('a')), sourceKey(source('a', 'B')));
assert.equal(normalize('  Độ KÍN  '.normalize('NFD')), normalize('độ kín'));
const passed = doc('passed', 'report', [line(a, [row('P2', 'pass')])], {
  caseId: 'case-a',
  date: '2026-11-03',
});
data.control.documents.push(passed);
index = buildSearchIndex(data);
result = querySearch(index, state);
assert.equal(result.byMode.pass.length, 1);
assert.equal(
  result.byMode.ever.length,
  1,
  'pass and ever-fail are independently discoverable',
);
assert.deepEqual(
  querySearch(index, { ...state, active: 'fail' }).byMode,
  result.byMode,
  'active card never changes other card counts',
);
const before = JSON.stringify(data);
querySearch(index, { ...state, periodMode: 'next' }, [
  { ...a, id: 'future', preview: true, start: '2026-11-01', end: '2026-11-30' },
]);
assert.equal(
  JSON.stringify(data),
  before,
  'preview and search do not mutate records',
);
a.completion = { kind: 'pass', reportId: cancelled.id };
index = buildSearchIndex(data);
assert.equal(
  index.projections.get(a.id).completion,
  null,
  'cancelled document cannot complete a job',
);
const disposal = doc('disposal', 'disposal', [line(a, [])]);
data.control.documents.push(disposal);
a.completion = { kind: 'disposal', reportId: disposal.id };
assert.equal(
  buildSearchIndex(data).projections.get(a.id).result,
  'fail',
  'disposal is not pass',
);
const waiver = doc('waiver', 'waiver', [line(a, [])]);
data.control.documents.push(waiver);
a.completion = { kind: 'waiver', reportId: waiver.id };
assert.equal(
  buildSearchIndex(data).projections.get(a.id).result,
  'unable',
  'waiver preserves untested status',
);
console.log(
  'PASS FQC search: period, same-line counts, products, corrections, unresolved samples, aliases, cancellation, waiver/disposal, independent cards, read-only preview',
);
