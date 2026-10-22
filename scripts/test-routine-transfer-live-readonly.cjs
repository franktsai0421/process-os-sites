const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Read-only Local preview smoke. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true,
    channel:'chrome' });
  const results = [];
  try {
    for (const [width, height, mobile] of [[1366, 850, false], [390, 844, true]]) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
      const page = await context.newPage();
      await page.goto((isolatedTestTarget_20261010+"/process/"));
      await page.locator('[data-quick-login=admin]').click();
      await page.waitForURL('**/process/?**');
      await page.goto((isolatedTestTarget_20261010+"/process/?system=quality&view=data&dataTab=quality-routine-equipment"));
      try { await page.locator('#routine-search').waitFor({ timeout: 15000 }); }
      catch (error) { console.error('Local routine preview diagnostic', page.url(), (await page.locator('body').innerText()).slice(0, 1200)); throw error; }
      await page.locator('#routine-search').fill('G7T001-1');
      await page.locator('[data-equipment-transfer="xlsx-row-3"]').waitFor();
      await page.locator('[data-equipment-transfer="xlsx-row-3"]').click();
      await page.locator('.routine-transfer-dialog .routine-transfer-module-card').first().waitFor();
      await page.waitForFunction(() => document.querySelector('.routine-transfer-dialog')?.textContent?.includes('3010109-IQC-L2-01'));
      assert.ok((await page.locator('.routine-transfer-dialog').innerText()).includes('BORUAXE1021-FQC-L1-01'));
      assert.ok((await page.locator('.routine-transfer-dialog').innerText()).includes('3010109-IQC-L2-01'));
      await page.locator('#routine-target-eq-select').selectOption('xlsx-row-2');
      const data = await page.evaluate(async () => {
        const response = await fetch('/api/quality-equipment-replacement?sourceId=xlsx-row-3');
        return response.json();
      });
      const fqc = data.modules.find(row => row.moduleId === 'fqc');
      const iqc = data.modules.find(row => row.moduleId === 'iqc');
      assert.ok(fqc?.items?.length >= 3);
      assert.ok(iqc?.items?.some(row => row.id === 'iqc-item:3010109-IQC-L2-01' || row.code === '3010109-IQC-L2-01'));
      assert.ok(fqc.items.every(row => row.activeEquipmentId === 'xlsx-row-3'));
      assert.ok(fqc.items.some(row => row.draftEquipmentId === 'xlsx-row-2'));
      assert.ok(iqc.items.some(row => row.pending?.some(record => record.targetEquipmentId === 'xlsx-row-2' && record.status === 'waiting')));
      const modalOverflow = await page.evaluate(() => {
        const modal = document.querySelector('.routine-transfer-dialog');
        const body = document.querySelector('.routine-transfer-body');
        return { modal: modal.scrollWidth > modal.clientWidth + 1,
          body: body.scrollWidth > body.clientWidth + 1,
          document: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
      });
      assert.deepEqual(modalOverflow, { modal: false, body: false, document: false });
      results.push({ width, source: 'G7T001-1', target: 'G7T001', fqcReferences: fqc.items.length,
        iqcReferences: iqc.items.length, iqcWaitingPersisted: true, activeUnchanged: true, preview: true, noOverflow: true });
      await context.close();
    }
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
