// Run against a local build only. Each round uses a fresh Chromium context.
// The second circuit revisits each destination in the same document.

import { createHmac, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { createRootEntryFixture } from '../tests/root-entry-native-fixture.mjs';
import { pngFixture } from '../tests/photo-fixtures.mjs';

const require = createRequire(import.meta.url);
const secret = 'synthetic-local-navigation-only';
const fixture = await createRootEntryFixture({
  syntheticBindings: {
    PROCESS_IMPORT_ENABLED: '0',
    PROCESS_SESSION_SECRET: secret,
  },
});
let browser;
try {
  const bucket = await fixture.mf.getR2Bucket('STATE_ARCHIVE');
  const load = require('./ipqc-ab-import-harness.cjs')({
    STATE_ARCHIVE: bucket,
  });
  const image = pngFixture({ width: 16, height: 16 });
  const id = createHash('sha256').update(image).digest('hex');
  const values = {};
  for (const moduleId of [
    'iqc',
    'ipqc-c',
    'ipqc-ab',
    'routine-equipment',
    'fqc',
  ]) {
    const sample = require('./v3-quality-growth-fixture.cjs')(
      moduleId,
      [{ id, bytes: image.length }],
      2,
      40,
    );
    values[sample.key] = sample.values[sample.key].replaceAll(
      '/fixture-photo/' + id,
      '/api/iqc/photo?id=' + id,
    );
    values.masterDataControl = sample.values.masterDataControl;
    await bucket.put(moduleId + '/photos/' + id, image, {
      httpMetadata: { contentType: 'image/png' },
    });
  }
  const master = JSON.parse(values.masterDataControl);
  master.active.PROCESS = {};
  master.versions = Object.entries(master.active).map(([scope, snapshot]) => ({
    scope,
    snapshot,
    id: scope,
    status: 'approved',
    number: 1,
    history: [],
  }));
  values.masterDataControl = JSON.stringify(master);
  Object.assign(values, {
    platformUsers: JSON.stringify([
      {
        id: 'owner',
        name: 'Synthetic',
        role: 'admin',
        primary: true,
        authEpoch: 1,
        enabled: true,
        authMode: 'platform',
      },
    ]),
    routineFqcEnabled: '1',
    maintenanceMode: '0',
    processCustomRoles: '[]',
    processRoleTemplateOverrides: '{}',
    processAccessControl: '{}',
    dispatchBoard: '{"A":[],"B":[],"C":[]}',
    bomOverrides: '{"replaceAll":true,"data":{}}',
    processMasterData: '{}',
  });
  const quality = JSON.parse(values.qualityMasterControl);
  for (const row of quality.libraries.fqc.versions[0].snapshot.items)
    row.rule = { cadence: 'time', timeFrequency: 'monthly' };
  values.qualityMasterControl = JSON.stringify(quality);
  const routine = load('lib/routine-fqc.ts'),
    control = routine.emptyRoutine();
  const sources = routine.routineSources({ values });
  const day = '2026-11-01';
  control.jobs = routine.schedulePreview(control, sources, day, day);
  if (control.jobs.length !== 40) throw Error('Synthetic jobs missing');
  const actor = { id: 'owner', name: 'Synthetic', admin: true };
  const apply = (command) =>
    routine.executeRoutine(
      control,
      {
        operationId: 'synthetic-' + command.action + '-' + control.revision,
        expectedRevision: control.revision,
        ...command,
      },
      sources,
      { actor, at: day + 'T00:00:00Z', today: day, allowed: () => true },
    );
  const plan = apply({ action: 'create-plan', jobIds: [control.jobs[0].id] });
  const document = control.documents.find((row) => row.id === plan.documentId);
  for (const action of ['save', 'submit']) {
    const operationId = 'synthetic-' + action + '-plan';
    apply({
      action: 'draft',
      operationId,
      documentId: document.id,
      command: {
        action,
        operationId,
        generation: document.flow.generation,
        expectedRevision: document.flow.revision,
        clientId: 'synthetic-benchmark',
        sequence: action === 'save' ? 1 : 2,
        ...(action === 'submit'
          ? {
              savedId: document.flow.saved.id,
              reason: 'Synthetic review fixture',
            }
          : {}),
      },
    });
  }
  if (!document.flow.pendingId) throw Error('Synthetic pending plan missing');
  values.routineFqcControl = JSON.stringify(control);
  const raw = await load('lib/state-records.ts').encodeRecordValues(
    bucket,
    values,
  );
  await fixture.db
    .prepare(
      'INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,7,?,?)',
    )
    .bind(raw, 'synthetic')
    .run();
  const origin = fixture.url.origin;
  const payload = Buffer.from(
    JSON.stringify({
      version: 2,
      id: 'owner',
      sessionType: 'platform',
      authEpoch: 1,
      expires: Date.now() + 3600000,
      nonce: 'synthetic',
    }),
  ).toString('base64');
  const cookie =
    payload + '.' + createHmac('sha256', secret).update(payload).digest('hex');
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  const targets = [
    'quality-inspections',
    'approval:routine',
    'approval:quality',
    'approval:process',
    'dispatch',
    'editor',
    'data:quality-mold-equipment',
    'data:bom',
    'data:quality-ipqc-ab',
    'data:quality-fqc',
    'data:process-master',
    'player',
    'data:quality-iqc',
    'data:quality-ipqc-c',
    'data:quality-routine-equipment',
    'data:line-admin',
    'productStatus',
    'data:AB',
    'data:C',
    'dashboard',
  ];
  for (let round = 0; round < Number(process.env.NAV_ROUNDS || 3); round++) {
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      serviceWorkers: 'block',
    });
    try {
      await context.addCookies([
        {
          name: 'process_demo',
          value: cookie,
          url: origin,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);
      const page = await context.newPage();
      page.on('pageerror', (error) => {
        process.exitCode = 1;
        console.error('fixture page', error.message);
      });
      page.on('response', (r) => {
        if (r.status() >= 400) {
          process.exitCode = 1;
          console.error('fixture HTTP', new URL(r.url()).pathname, r.status());
        }
      });
      await page.goto(origin + '/process/index.html?view=dashboard');
      await page
        .waitForFunction(
          () =>
            document.documentElement.dataset.processNavigationStatus ===
            'ready',
          null,
          { timeout: 12000 },
        )
        .catch(async (error) => {
          console.error(
            'fixture entry',
            await page
              .locator('body')
              .innerText()
              .then((t) => t.slice(0, 420)),
          );
          throw error;
        });
      for (const entry of ['first', 'revisit'])
        for (const target of targets) {
          try {
            const result = await page.evaluate(async (target) => {
              const [view, tab] = target.split(':'),
                nav = window.ProcessDeliveryNavigation;
              const dataset = document.documentElement.dataset,
                prior = dataset.processDestinationGeneration;
              const start = performance.now();
              performance.clearResourceTimings();
              if (view === 'approval') void nav.approval(tab);
              else nav.navigate(view, tab);
              // Sample on animation frames, after the selected generation's own ready
              // fence and visible content, then allow that frame to reach the screen.
              while (performance.now() - start < 12000) {
                await new Promise(requestAnimationFrame);
                if (dataset.processNavigationStatus === 'error')
                  throw Error('NAVIGATION_ERROR');
                if (
                  prior === dataset.processDestinationGeneration ||
                  dataset.processDestinationReadyGeneration !==
                    dataset.processDestinationGeneration ||
                  dataset.processNavigationStatus !== 'ready'
                )
                  continue;
                const selected = nav.current();
                if (
                  selected.view !== view ||
                  (view === 'data' && selected.dataTab !== tab) ||
                  (view === 'approval' && selected.approvalTab !== tab)
                )
                  continue;
                const root = document.querySelector(
                  view === 'approval'
                    ? '#approval-panel-' + tab
                    : view === 'data'
                      ? '#data-content'
                      : '#view-root',
                );
                if (!root?.innerText.trim()) continue;
                const visible = (el) => el.getClientRects().length > 0;
                if (
                  [
                    ...root.querySelectorAll(
                      '[role="alert"],[aria-busy="true"],.fqc-loading',
                    ),
                  ].some(
                    (el) =>
                      visible(el) &&
                      (el.matches('[aria-busy="true"],.fqc-loading') ||
                        el.textContent.trim()),
                  )
                )
                  continue;
                if (
                  view === 'quality-inspections' &&
                  !root.querySelector('.rf-tabs button:not(:disabled)')
                )
                  continue;
                if (
                  tab === 'routine' &&
                  !root.querySelector('[data-review-doc]:not(:disabled)')
                )
                  continue;
                if (
                  tab === 'quality' &&
                  [...root.querySelectorAll('[data-overview-count]')].filter(
                    (el) => /^\d+$/.test(el.textContent.trim()),
                  ).length !== 6
                )
                  continue;
                if (
                  tab === 'quality' &&
                  document
                    .querySelector('[data-review-total]')
                    ?.textContent.match(
                      /讀取中|đang kiểm tra|失敗|chưa tải được/i,
                    )
                )
                  continue;
                if (
                  ![
                    ...document.querySelectorAll(
                      '.sidebar button:not(:disabled),[data-dual-view]:not(:disabled)',
                    ),
                  ].some(visible)
                )
                  continue;
                await new Promise(requestAnimationFrame);
                const end = performance.now();
                const intervals = performance
                  .getEntriesByType('resource')
                  .filter(
                    (e) =>
                      e.startTime >= start &&
                      e.responseEnd <= end &&
                      new URL(e.name).pathname.startsWith('/api/'),
                  )
                  .sort((a, b) => a.startTime - b.startTime);
                let cursor = start,
                  apiMs = 0;
                for (const row of intervals) {
                  apiMs += Math.max(
                    0,
                    row.responseEnd - Math.max(cursor, row.startTime),
                  );
                  cursor = Math.max(cursor, row.responseEnd);
                }
                return {
                  ms: Math.round(end - start),
                  apiMs: Math.round(apiMs),
                  requests: intervals.length,
                  rootChars: root.innerText.length,
                };
              }
              throw Error('READINESS_TIMEOUT');
            }, target);
            console.log(JSON.stringify({ round, entry, target, ...result }));
          } catch (error) {
            process.exitCode = 1;
            console.log(
              JSON.stringify({
                round,
                entry,
                target,
                error: String(error.message).split('\n')[0],
              }),
            );
          }
        }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await fixture.close();
}
