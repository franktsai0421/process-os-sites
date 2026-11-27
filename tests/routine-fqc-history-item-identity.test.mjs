import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { createABCFixture } from './ab-c-native-fixture.mjs';
import {
  buildSearchIndex,
  createHistorySearch,
  querySearch,
  sourceKey,
} from '../public/process/routine-fqc-search.mjs';

const day = '2026-10-01';
const at = day + 'T00:00:00Z';
const owner = { id: 'frank', name: 'Synthetic reviewer' };
const source = (id, code, name, line = 'A', category = 'Gauge') => ({
  id,
  code,
  name,
  line,
  category,
  errorCode: 'E',
  description: '',
  versionId: 'v1',
  version: '1',
  effectiveDate: day,
  frequency: 'monthly',
  frequencyText: 'Monthly',
  products: [],
});
const original = source('same', 'OLD-01', 'Old gauge');
const current = source('same', 'NEW-07', 'Current gauge');
const other = source('different', 'OLD-01', 'Old gauge');
const job = (id, src) => ({
  id,
  itemId: src.id,
  source: src,
  period: 'monthly:' + day,
  start: day,
  end: '2026-10-31',
  planId: null,
  completion: null,
  createdAt: at,
});

function seed(values, load) {
  const routine = load('lib/routine-fqc.ts').emptyRoutine();
  const { createSharedDraft } = load('lib/shared-draft.ts');
  routine.jobs = [job('old-job', original), job('other-job', other)];
  routine.documents = routine.jobs.map((entry, i) => {
    const id = 'report-' + entry.id;
    const content = {
      title: 'Synthetic report ' + i,
      date: day,
      notes: '',
      reason: '',
      disposition: '',
      evidence: [],
      lines: [
        {
          id: 'line-' + entry.id,
          jobId: entry.id,
          source: entry.source,
          results: [],
        },
      ],
    };
    return {
      id,
      number: 'FQC-RPT-20261001-000' + (i + 1),
      kind: 'report',
      planId: null,
      caseId: null,
      correctionOf: null,
      createdAt: at,
      owner,
      flow: createSharedDraft(
        'routine-fqc:' + id,
        content,
        'approved-' + id,
        'gen-' + id,
      ),
    };
  });
  values.routineFqcEnabled = '1';
  values.routineFqcControl = JSON.stringify(routine);
  const items = [current, other].map((s) => ({
    id: s.id,
    checkNo: s.code,
    name: s.name,
    category: s.category,
    line: s.line,
    description: '',
    errorId: 'error',
    isEnabled: true,
    isDeleted: false,
    productCodes: [],
    mediaItems: [],
    rule: { cadence: 'time', timeFrequency: 'monthly' },
  }));
  values.qualityMasterControl = JSON.stringify({
    schemaVersion: 1,
    libraries: {
      fqc: {
        activeVersionId: 'v2',
        versions: [
          {
            id: 'v2',
            number: 2,
            status: 'approved',
            reviewedAt: at,
            snapshot: {
              errors: [
                {
                  id: 'error',
                  code: 'E',
                  name: 'Error',
                  line: 'A',
                  category: 'Gauge',
                },
              ],
              items,
            },
          },
        ],
      },
    },
  });
}

for (const language of ['zh', 'vi']) {
  test(
    'FQC History finds the renamed item and keeps the signed report code in ' +
      language,
    async (t) => {
      const fixture = await createABCFixture({ products: 1, decorate: seed });
      t.after(() => fixture.close());
      const browser = await chromium.launch({
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      });
      t.after(() => browser.close());
      const origin = fixture.url.origin;
      const context = await browser.newContext({
        serviceWorkers: 'block',
        viewport:
          language === 'vi'
            ? { width: 390, height: 844 }
            : { width: 1365, height: 900 },
      });
      await context.addInitScript(
        (lang) => localStorage.setItem('processUILanguage', lang),
        language,
      );
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort(),
      );
      await context.addCookies([
        { name: 'process_demo', value: fixture.cookie('frank'), url: origin },
      ]);
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      await page.goto(
        origin + '/process/?system=quality&view=data&dataTab=quality-fqc',
      );
      await page.waitForFunction(
        () =>
          window.ProcessSync?.destination?.view === 'data' &&
          document.documentElement.dataset.processNavigationStatus === 'ready',
      );
      await page.evaluate(() => window.RoutineFQCUI.historyForItem('same'));
      const history = page.locator('#routine-fqc-root .rf-history');
      const select = (name) =>
        history.locator('[data-rfh-filter="' + name + '"]');
      await history.locator('[data-rfh-mode="initial"]').click();
      assert.match(
        await select('item').locator('option:checked').innerText(),
        /NEW-07/,
      );
      const rows = history.locator('[data-rfh-select]');
      assert.deepEqual(
        await rows.evaluateAll((nodes) =>
          nodes.map((n) => n.dataset.rfhSelect),
        ),
        ['report-old-job'],
      );
      await rows.click();
      const text = await history.locator('[data-rfh-detail]').innerText();
      assert.match(text, /OLD-01/);
      assert.doesNotMatch(text, /NEW-07/);
      const search = history.locator('[data-rfh-query]');
      await search.fill('OLD-01');
      assert.equal(await rows.count(), 1);
      await search.fill('NEW-07');
      assert.equal(await rows.count(), 0);
      await search.fill('');
      await select('line').selectOption('A');
      await select('category').selectOption('Gauge');
      await select('item').selectOption(sourceKey(other));
      assert.deepEqual(
        await rows.evaluateAll((nodes) =>
          nodes.map((n) => n.dataset.rfhSelect),
        ),
        ['report-other-job'],
      );
      // An unknown shortcut must never quietly widen to reports for every item.
      await page.evaluate(() => window.RoutineFQCUI.historyForItem('unknown'));
      await history.locator('[data-rfh-mode="initial"]').click();
      await select('item')
        .locator('option[value="unresolved"]:checked')
        .waitFor({ state: 'attached' });
      assert.equal(await rows.count(), 0);
      assert.match(
        await select('item').locator('option:checked').innerText(),
        language === 'vi' ? /Không xác định được/ : /無法辨識此項目/,
      );
      await select('item').selectOption('');
      assert.equal(await rows.count(), 2);
      const exported = await page.request.get(
        origin + '/api/routine-fqc?export=report-old-job',
      );
      assert.equal(exported.status(), 200);
      const { content } = await exported.json();
      assert.equal(content.lines[0].source.id, 'same');
      assert.equal(content.lines[0].source.code, 'OLD-01');
    },
  );
}

test('unidentified, ambiguous and inconsistent legacy snapshots remain available to broad searches', () => {
  const missing = { ...original, id: '' };
  const repeated = { ...original, id: 'duplicate' };
  const otherLine = { ...current, line: 'B' };
  const otherCategory = { ...current, category: 'Other' };
  const jobs = [
    job('valid', original),
    job('other', other),
    job('another-line', otherLine),
    job('another-category', otherCategory),
    job('missing', missing),
    job('duplicate', repeated),
    { ...job('inconsistent', original), itemId: 'different' },
  ];
  const documents = jobs.map((entry) => ({
    id: 'doc-' + entry.id,
    number: 'FQC-RPT-' + entry.id,
    kind: 'report',
    createdAt: at,
    flow: {
      active: {
        id: 'signed',
        content: {
          lines: [
            { id: 'line', jobId: entry.id, source: entry.source, results: [] },
          ],
        },
      },
      cases: [],
    },
  }));
  const data = {
    today: day,
    control: { jobs, documents, cases: [] },
    sources: [current],
    catalog: {
      items: [
        current,
        other,
        repeated,
        { ...repeated, name: 'Ambiguous' },
        otherLine,
        otherCategory,
      ],
    },
  };
  const index = buildSearchIndex(data);
  const find = (item = '', line = '', category = '') =>
    querySearch(index, {
      periodMode: 'all',
      item,
      line,
      category,
      query: '',
      productMode: 'covered',
    }).byMode.initial.map((d) => d.id);
  assert.equal(sourceKey(missing), null);
  assert.equal(sourceKey({ ...missing, id: '  ' }), null);
  assert.equal(sourceKey(original), sourceKey(current));
  assert.deepEqual(find(sourceKey(current)), ['doc-valid']);
  assert.deepEqual(find(sourceKey(current), 'B'), []);
  assert.deepEqual(find(sourceKey(current), 'A', 'Other'), []);
  assert.deepEqual(find(sourceKey(otherLine), 'B'), ['doc-another-line']);
  assert.deepEqual(find(sourceKey(otherCategory), 'A', 'Other'), [
    'doc-another-category',
  ]);
  assert.deepEqual(find(sourceKey(repeated)), []);
  assert.equal(find().length, 7);
  assert.equal(
    index.sources.filter((s) => sourceKey(s) === sourceKey(current)).length,
    1,
  );
  const history = createHistorySearch({ getData: () => data });
  for (const uncertain of [
    undefined,
    '',
    '  ',
    'missing-id',
    'duplicate',
    'same',
  ]) {
    history.openForItem(uncertain);
    assert.ok(
      history.state.item,
      'uncertain shortcuts cannot select all items',
    );
    assert.deepEqual(querySearch(index, history.state).byMode.initial, []);
  }
  history.openForItem('different');
  assert.deepEqual(
    querySearch(index, history.state).byMode.initial.map((d) => d.id),
    ['doc-other'],
  );
});
