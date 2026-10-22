const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtime = require('./browser-test-runtime.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || runtime.playwrightModule);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || runtime.browserExecutable, headless: true });
  const canonical = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/canonical/quality/fqc.json'), 'utf8'));
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db/seed.json'), 'utf8'));
  let revision = seed.revision || 20;
  const values = { ...seed.values, canonicalQuality: JSON.stringify({ fqc: canonical.records, iqc: [], ipqc: [] }) };
  const user = { id: 'admin', role: 'admin', name: 'Fixture Admin' };
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  await context.route('**/api/**', async route => {
    const request = route.request(), url = request.url();
    if (url.includes('/platform-login')) return route.fulfill({ json: { user } });
    if (!url.includes('/shared-state')) return route.fulfill({ json: { ok: true } });
    if (request.method() === 'GET') return route.fulfill({ json: { revision, values, identity: user, serverProtected: true, demoEnabled: true } });
    const body = request.postDataJSON();
    if (body.baseRevision !== revision) return route.fulfill({ status: 409, json: { revision, values } });
    Object.assign(values, body.updates); revision += 1;
    return route.fulfill({ json: { revision, values } });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${runtime.localUrl()}/process/?system=quality&view=data&dataTab=quality-fqc`);
  try { await page.locator('#fqc-page').waitFor({ timeout: 10000 }); } catch (error) { console.error({ url: page.url(), body: (await page.locator('body').innerText()).slice(0, 1200), errors }); throw error; }
  assert.match(await page.locator('#fqc-page').innerText(), /FQC - V1/);
  await page.locator('#fqc-begin').click();
  await page.locator('#fqc-save').waitFor();
  assert.match(await page.locator('#fqc-page').innerText(), /FQC - V2/);
  await page.locator('#fqc-category').selectOption('BORUAXE1021');
  const firstItem = page.locator('[data-edit-item]').first();
  await firstItem.click();
  const checkNo = await page.locator('.fqc-item-form input[readonly]').inputValue();
  await page.locator('.fqc-item-form textarea[name="description"]').fill('fixture-description');
  assert.equal(await page.locator('.fqc-item-form textarea[name="reason"]').count(), 0, 'Reason field removed from item modal');
  await page.locator('.fqc-item-form input[name="photos"]').setInputFiles(path.join(__dirname, '..', 'KD/ui-reference/01_fqc_main_layout.png'));
  await page.locator('.fqc-item-form button[type="submit"]').click();
  await page.locator('.fqc-modal-overlay').waitFor({ state: 'detached' });
  let control = JSON.parse(values.qualityMasterControl);
  let draft = control.libraries.fqc.versions.find(version => version.status === 'draft');
  let saved = draft.snapshot.items.find(item => item.checkNo === checkNo);
  assert.equal(saved.description, 'fixture-description');
  assert.equal(saved.mediaItems.length, 1);

  const matrixCell = page.locator(`[data-matrix-item="${saved.id}"]`).filter({ hasText: '—' }).first();
  if (await matrixCell.count()) {
    const productCode = await matrixCell.getAttribute('data-matrix-product');
    const before = JSON.stringify(saved.productCodes);
    await matrixCell.click();
    assert.equal(await page.locator('.fqc-item-form input[readonly]').inputValue(), checkNo);
    assert.equal(await page.locator(`input[name="product"][value="${productCode}"]`).isChecked(), true);
    await page.locator('.fqc-item-form [data-close]').last().click();
    control = JSON.parse(values.qualityMasterControl); draft = control.libraries.fqc.versions.find(version => version.status === 'draft'); saved = draft.snapshot.items.find(item => item.checkNo === checkNo);
    assert.equal(JSON.stringify(saved.productCodes), before, 'cancel must not save matrix preselection');
  }

  await page.reload();
  await page.locator('#fqc-save').waitFor();
  await page.locator('#fqc-category').selectOption('BORUAXE1021');
  await page.locator('[data-edit-item]').first().click();
  assert.equal(await page.locator('.fqc-item-form textarea[name="description"]').inputValue(), 'fixture-description');
  assert.equal(await page.locator('.fqc-item-form textarea[name="reason"]').count(), 0, 'Reason field removed on edit modal');
  assert.equal(await page.locator('.fqc-photo-list img').count(), 1);
  await page.locator('.fqc-item-form [data-close]').last().click();

  await page.evaluate(() => { XLSX.writeFile = (workbook, fileName) => { window.__fqcExport = { fileName, sheetNames: workbook.SheetNames, bytes: XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }).byteLength, imageJson: workbook.Sheets['檢查項目']['O2']?.v || '' }; }; });
  await page.locator('#fqc-export').click();
  await page.waitForTimeout(200);
  const exported = await page.evaluate(() => window.__fqcExport);
  assert.ok(exported, `export handler failed: ${errors.join(' | ')}`);
  assert.ok(exported.bytes > 1000);
  assert.deepEqual(exported.sheetNames, ['FQC格式說明', '錯誤代碼', '檢查項目', '照片資料', '適用產品', '操作紀錄']);
  const exportPath = path.join(__dirname, '..', 'data-import/FQC/FQC標準 FQC-C TRIL 1.xlsx');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#fqc-import-input').setInputFiles(exportPath);
  await page.waitForTimeout(200);
  await page.locator('#fqc-save').waitFor();
  control = JSON.parse(values.qualityMasterControl); draft = control.libraries.fqc.versions.find(version => version.status === 'draft');
  assert.equal(draft.snapshot.items.length, 508);
  assert.equal(draft.snapshot.errors.length, 164);

  await page.locator('#fqc-submit').click();
  await page.locator('.fqc-status.pending').waitFor();
  await page.locator('#fqc-approval').click();
  await page.locator('[data-review-tab="quality"]').click();
  await page.locator('[data-quality-review]').click();
  await page.locator('#quality-review-note').fill('fixture return');
  await page.locator('#quality-reject').click();
  await page.locator('[data-dual-view="data"]').click();
  await page.locator('[data-quality-tab="quality-fqc"]').click();
  await page.locator('#fqc-save').waitFor();
  await page.locator('#fqc-submit').click();
  await page.locator('#fqc-approval').click();
  await page.locator('[data-review-tab="quality"]').click();
  await page.locator('[data-quality-review]').click();
  await page.locator('#quality-review-note').fill('fixture approve');
  await page.locator('#quality-approve').click();
  control = JSON.parse(values.qualityMasterControl);
  assert.equal(control.libraries.fqc.versions.find(version => version.number === 'V2').status, 'approved');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#menu-toggle').click();
  await page.locator('[data-dual-view="data"]').click();
  await page.locator('[data-quality-tab="quality-fqc"]').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: FQC UI, draft save/reload, image persistence, matrix cancel, Excel export/reimport, reject/resubmit/approve, mobile overflow');
})().catch(error => { console.error(error); process.exitCode = 1; });
