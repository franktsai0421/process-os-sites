import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createProcessMasterFixture } from './process-master-cloud-fixture.mjs';
const report = {
  phase: process.env.MEASUREMENT_PHASE || 'final-candidate',
  commit: process.env.PROCESS_PROGRAM_COMMIT,
  buildDirectory: process.env.PROCESS_TEST_BUILD_DIR || 'dist',
  boundaries: 'Action completion asserted, shared command idle, then two frames. Readiness and images are checked separately.',
  conditions: {
    network: 'local loopback, no throttling',
    viewport: [1365, 900],
  },
  samples: [],
  requests: [],
  apiTimings: [],
  errors: [],
};
let f, browser, page, activeOperation;
const requestOperations=new WeakMap();
const timed = async (name, fn) => {
  const at = performance.now();
  activeOperation=name;
  try {
    await fn();
    await page.waitForFunction(() => window.MasterDataWorkflow?.shared && !MasterDataWorkflow.shared.busy());
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    report.samples.push({
      name,
      status: 'PASS',
      ms: Math.round(performance.now() - at),
    });
  } catch (e) {
    report.samples.push({
      name,
      status: 'FAIL',
      ms: Math.round(performance.now() - at),
      error: e.message.slice(0, 300),
    });
    throw e;
  } finally { activeOperation=null; }
};
try {
  f = await createProcessMasterFixture();
  report.conditions.data = f.counts;
  report.buildEntrySha256 = f.buildEntrySha256;
  browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-background-networking'],
  });
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    serviceWorkers: 'block',
  });
  const origin = f.url.origin;
  await context.route('**/*', (r) =>
    new URL(r.request().url()).origin === origin ? r.continue() : r.abort(),
  );
  page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/'))
      report.requests.push({
        path: u.pathname,
        query: u.search,
        status: r.status(),
      });
  });
  page.on('request', request=>requestOperations.set(request,activeOperation||'background'));
  page.on('requestfinished', (request) => {
    const url = new URL(request.url()),
      timing = request.timing();
    if (!url.pathname.startsWith('/api/') || timing.responseEnd < 0) return;
    let action = '';
    try {
      const body = request.postDataJSON();
      action = body?.command?.action || body?.action || '';
    } catch {}
    report.apiTimings.push({
      operation:requestOperations.get(request),
      path: url.pathname,
      method: request.method(),
      action,
      ms: Math.round(timing.responseEnd),
    });
  });
  report.conditions = {
    ...report.conditions,
    cache: 'HTTP cache disabled by Playwright routing; OS cache not cleared',
    browser: browser.version(),
    realData: false,
    measuredAt: new Date().toISOString(),
  };
  page.on('dialog', (d) =>
    d.accept(d.type() === 'prompt' ? '隔離驗收' : undefined),
  );
  const entryReady = async () => {
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-master-name]').length === 15 &&
        [...document.querySelectorAll('[data-master-name]')].some(
          (input) => input.value === '隔離流程 9',
        ) &&
        document.querySelectorAll('#equipment-panel tbody tr').length === 40 &&
        document.querySelector('#process-master-new-draft')?.disabled === false,
      null,
      { timeout: 60000 },
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  };
  await page.goto(origin + '/login?view=data&dataTab=process-master');
  await page.locator('#id').fill('frank');
  await page.locator('#password').fill(f.password);
  await timed('first-entry', async () => {
    await page.locator('.site-entry-submit').click();
    await entryReady();
  });
  await page.screenshot({
    path: '.sites-runtime/process-master-' + report.phase + '.png',
    fullPage: true,
  });
  await timed('tab-switch', async () => {
    await page.locator('[data-tab=line-admin]').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-tab=line-admin].active'),
    );
    await page.locator('[data-tab=process-master]').click();
    await entryReady();
  });
  for (let i = 0; i < 3; i++)
    await timed('warm-entry', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await entryReady();
    });
  await timed('begin', async () => {
    await page.locator('#process-master-new-draft').click();
    await page.locator('#add-master-template').waitFor({ timeout: 15000 });
    assert.equal(
      await page.locator('[data-master-name]').first().isEnabled(),
      true,
    );
  });
  await timed('equipment-list', async () => {
    await page.locator('[data-equipment-open]').click();
    await page.locator('#equipment-panel').waitFor();
    assert.equal(await page.locator('#equipment-panel tbody tr').count(), 40);
  });
  await timed('search', async () => {
    await page.locator('#equipment-search').fill('Máy thử nghiệm 19');
    await page.waitForFunction(
      () => document.querySelectorAll('#equipment-panel tbody tr').length === 2,
      null,
      { timeout: 3000 },
    );
  });
  await timed('edit-equipment', async () => {
    await page
      .locator(
        '#equipment-panel tr[data-equipment-id="A-CUT-EQ-19"] [data-equipment-edit]',
      )
      .first()
      .click();
    await page.waitForFunction(() => {
      const field=document.querySelector('#equipment-editor-dialog[open] [data-equipment-field="name"]');
      return field?.value==='隔離機器 19' && !field.disabled;
    });
  });
  await page.locator('[data-equipment-field="name"]').fill('隔離修改設備');
  await timed('apply-equipment', async () => {
    await page.locator('[data-equipment-save]').click();
    await page
      .locator('#equipment-editor-dialog')
      .waitFor({ state: 'detached' });
  });
  await timed('save', async () => {
    await page.locator('#save-master-data').click();
    await page.waitForFunction(() =>
      Object.values(
        MasterDataWorkflow.shared.flow('PROCESS').saved?.content || {},
      )
        .flat()
        .some((t) => t.equipment?.some((e) => e.name === '隔離修改設備')),
    );
  });
  await timed('reload-readback', async () => {
    await page.reload();
    await page.waitForFunction(() =>
      Object.values(
        window.MasterDataWorkflow?.shared.flow('PROCESS')?.saved?.content || {},
      )
        .flat()
        .some((t) => t.equipment?.some((e) => e.name === '隔離修改設備')),
    );
  });
  async function confirmDialog(reason) {
    const d = page.locator('.vd-confirm[open]');
    await d.waitFor();
    await d.locator('textarea').fill(reason);
    const self = d.locator('input[type=checkbox]');
    if (await self.count()) await self.check();
    await d.locator('button[type=submit]').click();
  }
  async function submit() {
    await page.locator('#process-master-submit').click();
    await confirmDialog('隔離送審');
    await page.waitForFunction(
      () => !!window.MasterDataWorkflow?.shared.flow('PROCESS')?.pendingId,
    );
  }
  await timed('name-input', async () => {
    await page.locator('[data-master-name]').first().fill('隔離名稱確認');
    await page.waitForFunction(() =>
      Object.values(MasterDataWorkflow.shared.flow('PROCESS').working)
        .flat()
        .some((t) => t.name === '隔離名稱確認'),
    );
  });
  const photo = (await import('./photo-fixtures.mjs')).pngFixture({
    width: 320,
    height: 160,
    alpha: true,
  });
  await timed('photo-upload', async () => {
    await page
      .locator('.master-template-upload input')
      .first()
      .setInputFiles([
        { name: 'synthetic-a.png', mimeType: 'image/png', buffer: photo },
        { name: 'synthetic-b.png', mimeType: 'image/png', buffer: photo },
      ]);
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '.photo-template:first-child .master-template-media-grid img',
        ).length === 2 &&
        [
          ...document.querySelectorAll(
            '.photo-template:first-child .master-template-media-grid img',
          ),
        ].every((i) => i.complete && i.naturalWidth === 320),
    );
  });
  if (report.phase !== 'baseline') {
    await page.locator('.process-template-preview').first().click();
    await page.locator('#media-lightbox[open]').waitFor({ timeout: 5000 });
    await page.locator('.media-lightbox-close').click();
  }
  await timed('save-photos', async () => {
    await page.locator('#save-master-data').click();
    await page.waitForFunction(() =>
      Object.values(
        MasterDataWorkflow.shared.flow('PROCESS').saved?.content || {},
      )
        .flat()
        .some((t) => t.mediaItems?.length === 2),
    );
  });
  await timed('submit', submit);
  await timed('withdraw', async () => {
    await page.locator('#process-master-withdraw').click();
    await confirmDialog('隔離撤回');
    await page.waitForFunction(
      () => !MasterDataWorkflow.shared.flow('PROCESS').pendingId,
    );
  });
  await timed('resubmit-withdrawn', submit);
  await timed('review-entry', async () => {
    await page.locator('#process-master-review').click();
    await page.locator('[data-review-action="return"]').waitFor();
  });
  await timed('review-fixed-detail', async () => {
    await page.locator('#master-case-diff').click();
    await page.waitForFunction(() => document.querySelector('.master-diff-scroll')?.textContent.includes('隔離名稱確認'));
    assert.equal(await page.locator('[data-review-action="return"]').isEnabled(), true);
  });
  await timed('return', async () => {
    await page.locator('[data-review-action="return"]').click();
    await confirmDialog('隔離退回');
    await page.waitForFunction(
      () => !MasterDataWorkflow.shared.flow('PROCESS').pendingId,
    );
  });
  await page.goto(origin + '/process/?view=data&dataTab=process-master');
  await page.locator('#process-master-submit').waitFor();
  await timed('resubmit-returned', submit);
  await page.locator('#process-master-review').click();
  await page.locator('[data-review-action="approve"]').waitFor();
  await timed('approve', async () => {
    await page.locator('[data-review-action="approve"]').click();
    await confirmDialog('隔離核准');
    await page.waitForFunction(
      () => !MasterDataWorkflow.shared.flow('PROCESS').pendingId,
    );
  });
  await timed('review-history', async () => {
    await page.locator('[data-review-mode="history"]').click();
    await page.locator('.master-review-list .master-status.approved').first().waitFor();
    await page.locator('.master-review-detail header .master-status.approved').waitFor();
  });
  await timed('history-audit', async () => {
    await page.locator('.master-review-audit summary').click();
    assert.match(await page.locator('.master-review-audit').innerText(), /隔離核准/);
  });
  await timed('history-fixed-detail', async () => {
    await page.locator('#master-case-diff').click();
    await page.waitForFunction(() => document.querySelector('.master-diff-scroll')?.textContent.includes('隔離名稱確認'));
  });
  await timed('effective-readback', async () => {
    await page.goto(origin + '/process/?view=data&dataTab=process-master');
    await page.locator('#process-master-new-draft').waitFor();
    assert.equal(
      await page.locator('[data-master-name]').first().inputValue(),
      '隔離名稱確認',
    );
    assert.equal(
      await page
        .locator('.photo-template:first-child .master-template-media-grid img')
        .count(),
      2,
    );
  });
  await timed('effective-image-decode', async () => {
    const images=page.locator('.photo-template:first-child .master-template-media-grid img');
    assert.equal(await images.count(),2);
    await images.evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
    assert.deepEqual(await images.evaluateAll(images=>images.map(i=>[i.naturalWidth,i.naturalHeight])),[[320,160],[320,160]]);
  });
  report.status = report.samples.every(row=>row.status==='PASS') && !report.errors.length ? 'PASS' : 'FAIL';
} catch (e) {
  report.status = 'FAIL';
  report.failure = e.message;
  if (page) {
    report.screenText = (
      await page
        .locator('body')
        .innerText()
        .catch(() => '')
    ).slice(0, 7000);
    await page
      .screenshot({
        path: '.sites-runtime/process-master-' + report.phase + '-failure.png',
        fullPage: true,
      })
      .catch(() => {});
  }
} finally {
  await browser?.close();
  await f?.close();
  fs.writeFileSync(
    process.env.PERF_OUTPUT || '.sites-runtime/process-master-' + report.phase + '.json',
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      samples: report.samples,
      errors: report.errors,
      failure: report.failure,
    }),
  );
}
process.exitCode = report.status === 'PASS' ? 0 : 1;
