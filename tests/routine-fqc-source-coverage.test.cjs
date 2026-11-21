const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('../scripts/ipqc-ab-import-harness.cjs')();
const { emptyRoutine, routineSources, routineSourceTimeline } = load('lib/routine-fqc.ts');
const { reconcileCalendar } = load('lib/routine-fqc-calendar.ts');

void test('approved FQC rules reconcile to exact product and calendar periods alongside a committed legacy period', () => {
  const rule = (id, timeFrequency, productCodes, fields = {}) => ({
    id, name: 'Synthetic lookalike', line: 'L1', category: 'SYN', productCodes, isEnabled: true,
    rule: { cadence: 'time', timeFrequency }, ...fields
  });
  const approvedRules = [
    rule('weekly-A', 'weekly', ['P01', 'P02']), rule('weekly-B', 'weekly', ['P02']),
    rule('monthly', 'monthly', ['P01']), rule('quarter', 'quarterly', ['P01', 'P02']),
    rule('half', 'half_yearly', ['P02']), rule('annual', 'yearly', ['P01']),
    rule('disabled', 'weekly', ['P01'], { isEnabled: false }), rule('deleted', 'monthly', ['P02'], { isDeleted: true }),
    rule('no-product', 'weekly', []), rule('unsupported', 'fortnightly', ['P02']),
    rule('event', '', ['P01'], { rule: { cadence: 'batch' } }),
    rule('timing-only', '', ['P01'], { rule: { cadence: 'time' } }),
    rule('frequency-only', '', ['P01'], { rule: { timeFrequency: 'monthly' } }),
    rule('batch-with-leftover-frequency', '', ['P01'], { rule: { cadence: 'batch', batchKind: 'fixed_count', fixedCount: 2, timeFrequency: 'weekly' } }),
    rule('legacy-monthly-flag', '', ['P01'], { rule: undefined, isMonthly: true }),
    rule('legacy-ambiguous-flags', '', ['P01'], { rule: undefined, isMonthly: true, isQuarterly: true }),
    rule('legacy-custom-text', '', ['P01'], { rule: { cadence: 'time', timeFrequency: 'custom', customTimeText: 'Every 10 days' } })
  ];
  const version = (id, status, items, reviewedAt) => ({
    id, number: 1, status, snapshot: { items, errors: [] }, reviewedAt
  });
  const library = { activeVersionId: 'approved', versions: [
    version('approved', 'approved', approvedRules, '2026-10-01T00:00:00.000Z'),
    version('draft', 'draft', [rule('draft-only', 'weekly', ['P02'])], '2026-11-20T00:00:00.000Z')
  ] };
  const state = { revision: 7, values: {
    masterDataControl: JSON.stringify({ active: { AB: { products: [
      { code: 'P01', name: 'Synthetic product 01' }, { code: 'P02', name: 'Synthetic product 02' }
    ] } } }), qualityMasterControl: JSON.stringify({ libraries: { fqc: library } })
  } };
  const sources = routineSources(state), timeline = routineSourceTimeline(state);
  assert.deepEqual(Array.from(timeline, entry => entry.id), ['approved']);
  const control = emptyRoutine(), existing = {
    id: 'legacy-plan-work', itemId: 'weekly-A', planId: 'legacy-plan', completion: null,
    start: '2026-11-16', end: '2026-11-22', period: 'weekly:2026-11-16',
    source: { ...sources.find(item => item.id === 'weekly-A'), products: [{ code: 'P01', name: 'Frozen name' }] }
  };
  const legacyBefore = JSON.stringify(existing);
  control.jobs = [existing];
  control.startDate = '2026-11-21';
  control.calendarPolicy = { version: 2, adoptedAt: '2026-11-20T17:00:00.000Z', scopes: {} };
  // Literal rows deliberately do not use any product period, source, or key helpers.
  const expected = [
    'weekly-A/P01/2026-11-16/2026-11-22', 'weekly-A/P02/2026-11-16/2026-11-22',
    'weekly-B/P02/2026-11-16/2026-11-22', 'monthly/P01/2026-11-01/2026-11-30',
    'quarter/P01/2026-10-01/2026-12-31', 'quarter/P02/2026-10-01/2026-12-31',
    'half/P02/2026-07-01/2026-12-31', 'annual/P01/2026-01-01/2026-12-31'
  ].sort();
  const at = '2026-11-21T12:00:00.000Z';
  assert.equal(reconcileCalendar(control, timeline, '2026-11-21', at), 7);
  function rows() {
    return Array.from(control.jobs, job => {
      assert.equal(job.source.products.length, 1);
      const product = job.source.products[0];
      if (job.id !== existing.id) {
        assert.equal(job.source.versionId, 'approved');
        assert.equal(product.name, product.code === 'P01' ? 'Synthetic product 01' : 'Synthetic product 02');
        assert.equal(job.calendar.productCode, product.code);
      }
      return [job.itemId, product.code, job.start, job.end].join('/');
    }).sort();
  }
  assert.deepEqual(rows(), expected);
  assert.equal(reconcileCalendar(control, timeline, '2026-11-21', at), 0);
  assert.deepEqual(rows(), expected);
  assert.equal(JSON.stringify(control.jobs.find(job => job.id === existing.id)), legacyBefore);
});
