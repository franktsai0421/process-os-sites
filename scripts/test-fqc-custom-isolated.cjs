const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Node CommonJS fixture. */
/* Local UI test with shared-state GET/POST mocked in one browser context. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true,
    channel:'chrome' });
  try {
    const width = Number(process.env.FQC_TEST_WIDTH || 390);
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    await page.goto((isolatedTestTarget_20261010+"/process/"));
    await page.locator('[data-quick-login="admin"]').click();
    await page.locator('#main-nav').waitFor();
    const initial = await page.request.get((isolatedTestTarget_20261010+"/api/shared-state"),
      { headers: { 'X-Process-Media': 'deferred-v1' } });
    assert.equal(initial.status(), 200);
    const server = await initial.json();
    assert.ok(server.identity?.id, 'isolated fixture requires the existing demo login cookie');
    const quality = JSON.parse(server.values.qualityMasterControl);
    for (const version of quality.libraries.fqc.versions) if (version.status === 'pending') version.status = 'draft';
    server.values.qualityMasterControl = JSON.stringify(quality);
    let writes = 0;
    const attempts = [];
    await page.route('**/api/shared-state', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ status: 200,
        contentType: 'application/json', body: JSON.stringify(server) });
      const payload = route.request().postDataJSON();
      attempts.push(payload.baseRevision);
      if (payload.baseRevision !== server.revision) return route.fulfill({ status: 409,
        contentType: 'application/json', body: JSON.stringify({ error: 'conflict' }) });
      Object.assign(server.values, payload.updates);
      server.revision++;
      writes++;
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ revision: server.revision, values: server.values }) });
    });
    await page.goto((isolatedTestTarget_20261010+"/process/?system=quality&view=data&dataTab=quality-fqc"));
    await page.locator('[data-edit-item]').first().waitFor();
    await page.locator('[data-edit-item]').first().click();
    await page.locator('#fqc-rule-cadence').selectOption('batch');
    await page.locator('#fqc-batch-kind').selectOption('custom');
    assert.equal(await page.locator('#fqc-batch-custom').isVisible(), true);
    assert.equal(await page.locator('#fqc-batch-custom-value').isVisible(), true);
    await page.locator('#fqc-batch-custom').fill('Kiểm theo mẫu');
    await page.locator('#fqc-batch-custom-value').fill('3 mẫu hoặc theo văn bản');
    server.revision++; // A routine-equipment API write, without changing the FQC key.
    await page.locator('.fqc-item-form button[type=submit]').click();
    await page.locator('.fqc-item-form').waitFor({ state: 'detached' });
    assert.ok(writes > 0, 'saving must complete a backend-receipted request');
    assert.match(await page.locator('.fqc-page').innerText(), /Kiểm theo mẫu/);
    await page.locator('[data-edit-item]').first().click();
    assert.equal(await page.locator('#fqc-batch-custom').inputValue(), 'Kiểm theo mẫu');
    assert.equal(await page.locator('#fqc-batch-custom-value').inputValue(), '3 mẫu hoặc theo văn bản');
    await page.locator('#fqc-batch-custom-value').fill('追加文字 / văn bản');
    server.revision++; // An IQC API write before another FQC save in this same tab.
    await page.locator('.fqc-item-form button[type=submit]').click();
    await page.locator('.fqc-item-form').waitFor({ state: 'detached' });
    await page.reload();
    await page.locator('[data-edit-item]').first().click();
    assert.equal(await page.locator('#fqc-batch-custom-value').inputValue(), '追加文字 / văn bản');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    console.log(JSON.stringify({ isolated: true, customNameAndTextSaved: true,
      reopenedAfterReload: true, noHorizontalOverflow: true, viewportWidth: width,
      routineThenFqc: true, iqcThenFqc: true, writes, attempts }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
