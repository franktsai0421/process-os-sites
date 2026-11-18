// Run against a local build only. Each round uses a fresh Chromium context.
// The second circuit revisits each destination in the same document.

import { createHmac, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { createRootEntryFixture } from '../tests/root-entry-native-fixture.mjs';
import { pngFixture } from '../tests/photo-fixtures.mjs';

const require = createRequire(import.meta.url);
const populated = process.env.NAV_PROFILE === 'populated';
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
  if (populated) {
    const authoring = require('./v3-master-permission-fixture.cjs')(
      'authoring',
    );
    values.processAuthoringControl =
      authoring.values.processAuthoringControl.replaceAll('"XA"', '"PAB"');
    // The isolated build has no template image pack. Use the seeded PNG for
    // each synthetic media reference and let the normal photo API serve it.
    const templates = JSON.parse(authoring.values.processMasterData);
    for (const stage of Object.values(templates)) {
      for (const item of stage) {
        item.media = '/api/iqc/photo?id=' + id;
        for (const media of item.mediaItems) media.src = item.media;
      }
    }
    values.processMasterData = JSON.stringify(templates);
    master.active.PROCESS = JSON.parse(values.processMasterData);
    master.versions.find((row) => row.scope === 'PROCESS').snapshot =
      master.active.PROCESS;
    values.masterDataControl = JSON.stringify(master);
    values.dispatchBoard = JSON.stringify({ A: ['PAB'], B: [], C: ['PC'] });

    const { columns, parseMatrices } =
      await import('../public/process/bom-domain.mjs');
    const data = parseMatrices(
      ['PAB', 'PC'].map((code) => ({
        name: code,
        rows: [
          columns,
          [code, '0', '', '', 'Synthetic root', '', 'PCS', '1', '1', '0'],
          ...Array.from({ length: 40 }, (_, i) => [
            code,
            '.1',
            String(i + 1),
            'PART-' + i,
            'Synthetic part ' + i,
            '',
            'PCS',
            '1',
            '1',
            '0',
          ]),
        ],
      })),
    );
    values.bomOverrides = JSON.stringify({
      __format: 'PROCESS_OS_BOM_OCCURRENCES_V3',
      replaceAll: true,
      data,
    });
    const bomSnapshot = { bom: data, referenceIssues: [] };
    const bomFlow = load('lib/shared-draft.ts').createSharedDraft(
      'bom',
      bomSnapshot,
      'approved',
      'synthetic-bom-generation',
    );
    values.bomMasterControl = JSON.stringify({
      schemaVersion: 1,
      activeVersionId: 'approved',
      workflow: bomFlow,
      versions: [
        {
          id: 'approved',
          number: 1,
          status: 'approved',
          snapshot: bomSnapshot,
          creatorId: 'owner',
          creatorName: 'Synthetic',
          revision: 1,
          history: [],
        },
      ],
    });
    const tools = Array.from({ length: 60 }, (_, i) => ({
      id: 'tool-' + i,
      code: 'DC01-' + String(i).padStart(4, '0'),
      nameVi: 'Synthetic tool ' + i,
      nameZh: '合成模具 ' + i,
      categoryId: 'cat',
      assetCode: 'SYN-' + i,
      quantity: 1,
      unit: 'PCS',
      location: { kind: 'internal', holderId: 'holder' },
      enabled: true,
      archived: false,
      photos: [],
      iqcIds: ['part'],
    }));
    const snapshot = {
      tools,
      categories: [{ id: 'cat', code: 'DC01', nameVi: 'Synthetic' }],
      custodians: [{ id: 'holder', nameVi: 'Synthetic' }],
      suppliers: [],
      manufacturers: [],
      transfers: [],
    };
    values.toolingMasterControl = JSON.stringify({
      schemaVersion: 1,
      activeVersionId: 'v2',
      versions: [1, 2].map((number) => ({
        id: 'v' + number,
        number,
        status: number === 2 ? 'approved' : 'superseded',
        snapshot,
        history: [],
        revision: 1,
      })),
      reservedCodes: {
        categories: ['DC01'],
        tools: tools.map((row) => row.code),
      },
    });
  }
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
      if (process.env.NAV_PROBE === 'tooling-bootstrap') {
        // Separate endpoint timing from the editor departure and tooling paint.
        for (let sample = 0; sample < 25; sample++) {
          const result = await page.evaluate(async () => {
            const start = performance.now();
            const response = await fetch(
              '/api/process-bootstrap?view=data&dataTab=quality-mold-equipment',
              {
                cache: 'no-store',
                headers: { 'X-Process-Media': 'deferred-v1' },
              },
            );
            const headersMs = performance.now() - start;
            const data = await response.json();
            if (
              !response.ok ||
              data.identity?.id !== 'owner' ||
              data.destination?.dataTab !== 'quality-mold-equipment' ||
              !data.deliveryProjection
            )
              throw Error('Unexpected tooling bootstrap response');
            return { ms: performance.now() - start, headersMs };
          });
          console.log(
            JSON.stringify({
              round,
              sample,
              probe: 'tooling-bootstrap',
              ...result,
            }),
          );
        }
        continue;
      }
      if (process.env.NAV_NETWORK === 'constrained') {
        // Isolate transport sensitivity after dashboard startup. Rates in bytes/s.
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 80,
          downloadThroughput: 5000000 / 8,
          uploadThroughput: 1000000 / 8,
        });
      }
      for (const entry of ['first', 'revisit'])
        for (const target of targets) {
          try {
            const result = await page.evaluate(
              async ({ target, populated }) => {
                const [view, tab] = target.split(':'),
                  nav = window.ProcessDeliveryNavigation;
                const dataset = document.documentElement.dataset,
                  prior = dataset.processDestinationGeneration;
                const start = performance.now();
                let previousFrame = start;
                let longestFrameGap = 0;
                const nextFrame = async () => {
                  await new Promise(requestAnimationFrame);
                  const now = performance.now();
                  longestFrameGap = Math.max(
                    longestFrameGap,
                    now - previousFrame,
                  );
                  previousFrame = now;
                };
                performance.clearResourceTimings();
                if (view === 'approval') void nav.approval(tab);
                else nav.navigate(view, tab);
                // Sample on animation frames, after the selected generation's own ready
                // fence and visible content, then allow that frame to reach the screen.
                while (performance.now() - start < 12000) {
                  await nextFrame();
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
                    populated &&
                    ((tab === 'bom' &&
                      !root.querySelector(
                        '.bw-results button[data-code]:enabled',
                      )) ||
                      (tab === 'quality-mold-equipment' &&
                        !root.querySelector('[data-tool-view]:enabled')) ||
                      (view === 'editor' &&
                        !root.querySelector('.pe-card[data-node="row0"]')))
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
                  await nextFrame();
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
                    readyMs: Math.round(Number(dataset.processReadyMs) - start),
                    maxFrameGapMs: Math.round(longestFrameGap),
                    requests: intervals.length,
                    endpoints: intervals.map((row) => ({
                      path: new URL(row.name).pathname,
                      startMs: Math.round(row.startTime - start),
                      ms: Math.round(row.responseEnd - row.startTime),
                      ttfbMs: Math.round(row.responseStart - row.requestStart),
                      bytes: row.decodedBodySize,
                      encodedBytes: row.encodedBodySize,
                    })),
                    rootChars: root.innerText.length,
                  };
                }
                throw Error('READINESS_TIMEOUT');
              },
              { target, populated },
            );
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
