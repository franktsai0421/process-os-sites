import fs from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createProcessMasterFixture } from './process-master-cloud-fixture.mjs';
const runs = [];
const assetHashes = Object.fromEntries(
  ['index.html', 'bootstrap.js', 'app.js'].map((name) => [
    name,
    createHash('sha256')
      .update(fs.readFileSync('dist/client/process/' + name))
      .digest('hex'),
  ]),
);
const f = await createProcessMasterFixture();
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-background-networking'],
});
try {
  for (
    let round = 0;
    round < Number(process.env.PROFILE_ROUNDS || 5);
    round++
  ) {
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      serviceWorkers: 'block',
    });
    await context.route('**/*', (r) =>
      new URL(r.request().url()).origin === f.url.origin
        ? r.continue()
        : r.abort(),
    );
    await context.addInitScript(() => {
      window.__entryProfile = { longTasks: [] };
      new PerformanceObserver((list) =>
        window.__entryProfile.longTasks.push(
          ...list
            .getEntries()
            .map((e) => ({ start: e.startTime, duration: e.duration })),
        ),
      ).observe({ type: 'longtask', buffered: true });
    });
    const page = await context.newPage(),
      errors = [],
      http = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith('/api/'))
        http.push({
          path,
          status: response.status(),
          request: response.request(),
        });
    });
    await page.goto(f.url.origin + '/login?view=data&dataTab=process-master');
    await page.locator('#id').fill('frank');
    await page.locator('#password').fill(f.password);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    if (process.env.PROFILE_TRACE)
      await cdp.send('Tracing.start', {
        categories:
          'devtools.timeline,v8.execute,disabled-by-default-devtools.timeline',
        transferMode: 'ReturnAsStream',
      });
    const requests = [],
      ids = new Map();
    await cdp.send('Network.enable');
    cdp.on('Network.requestWillBeSent', (e) => {
      if (!e.request.url.startsWith(f.url.origin)) return;
      const row = {
        path: new URL(e.request.url).pathname,
        start: e.wallTime * 1000,
        monotonic: e.timestamp * 1000,
        type: e.type,
      };
      requests.push(row);
      ids.set(e.requestId, row);
    });
    cdp.on('Network.responseReceived', (e) => {
      const row = ids.get(e.requestId);
      if (row) {
        row.response = e.timestamp * 1000 - row.monotonic;
        row.status = e.response.status;
      }
    });
    cdp.on('Network.loadingFinished', (e) => {
      const row = ids.get(e.requestId);
      if (row) {
        row.duration = e.timestamp * 1000 - row.monotonic;
        row.bytes = e.encodedDataLength;
      }
    });
    const clickWall = Date.now(),
      at = performance.now();
    await page.locator('.site-entry-submit').click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-master-name]').length === 15 &&
        [...document.querySelectorAll('[data-master-name]')].some(
          (i) => i.value === '隔離流程 9',
        ) &&
        document.querySelectorAll('#equipment-panel tbody tr').length === 40 &&
        document.querySelector('#process-master-new-draft')?.disabled ===
          false &&
        !document.documentElement.hasAttribute('data-process-boot') &&
        document.documentElement.dataset.processNavigationStatus === 'ready',
    );
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const total = Math.round(performance.now() - at),
      completeWall = Date.now();
    assert.equal(await page.locator('.app-shell').isVisible(), true);
    const detail = await page.evaluate(() => ({
      timeOrigin: performance.timeOrigin,
      now: performance.now(),
      navigation: performance
        .getEntriesByType('navigation')
        .map((e) => e.toJSON()),
      resources: performance.getEntriesByType('resource').map((e) => ({
        path: new URL(e.name).pathname,
        type: e.initiatorType,
        start: e.startTime,
        end: e.responseEnd,
        duration: e.duration,
        bytes: e.decodedBodySize,
      })),
      marks: performance
        .getEntriesByType('mark')
        .map((e) => ({ name: e.name, start: e.startTime })),
      dataset: Object.fromEntries(
        Object.entries(document.documentElement.dataset),
      ),
      ...window.__entryProfile,
    }));
    const metrics = (await cdp.send('Performance.getMetrics')).metrics.filter(
      (e) => /Duration|Count/.test(e.name),
    );
    if (process.env.PROFILE_TRACE) {
      const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
      await cdp.send('Tracing.end');
      const { stream } = await done;
      let trace = '';
      while (true) {
        const part = await cdp.send('IO.read', { handle: stream });
        trace += part.data;
        if (part.eof) break;
      }
      await cdp.send('IO.close', { handle: stream });
      fs.writeFileSync(process.env.PROFILE_TRACE, trace);
    }
    assert.deepEqual(errors, []);
    runs.push({
      round,
      total,
      clickWall,
      completeWall,
      detail,
      requests,
      metrics,
      http: http.map(({ path, status, request }) => ({
        path,
        status,
        timing: request.timing(),
      })),
      errors,
    });
    console.log(
      JSON.stringify({ round, total, ready: detail.dataset, metrics }),
    );
    await context.close();
  }
} finally {
  await browser.close();
  await f.close();
}
fs.writeFileSync(
  process.env.PROFILE_OUTPUT || '.sites-runtime/entry-profile.json',
  JSON.stringify(
    {
      commit: process.env.PROCESS_PROGRAM_COMMIT,
      variant: process.env.PROFILE_VARIANT || 'current',
      assetHashes,
      condition:
        'isolated synthetic 2 stages/30 templates/40 equipment; Chromium; HTTP cache disabled; fresh context; no throttling',
      runs,
    },
    null,
    2,
  ),
);
