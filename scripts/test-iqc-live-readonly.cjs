const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Read-only Local browser smoke. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const url = (isolatedTestTarget_20261010+"/process/?system=quality&view=data&dataTab=quality-iqc");

(async () => {
  const browser = await chromium.launch({ headless: true,
    channel:'chrome' });
  try {
    const results = [];
    for (const [width, height, mobile] of [[1366, 850, false], [390, 844, true]]) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
      const page = await context.newPage();
      await page.goto((isolatedTestTarget_20261010+"/process/"));
      await page.locator('[data-quick-login=admin]').waitFor();
      await page.locator('[data-quick-login=admin]').click();
      await page.waitForURL('**/process/?**');
      await page.goto(url);
      try { await page.locator('#iqc-page .iqc-part').first().waitFor({ timeout: 15000 }); }
      catch (error) { console.error('Local IQC read-only diagnostic', page.url(), (await page.locator('body').innerText()).slice(0, 1000)); throw error; }
      const parts = await page.locator('#iqc-page .iqc-part').count();
      assert.ok(parts >= 187, `Local IQC parts: ${parts}`);
      await page.locator('#iqc-page .iqc-part').first().click();
      assert.equal(await page.locator('#iqc-page .iqc-error-list').count(), 1);
      assert.equal(await page.locator('#iqc-page .iqc-checks').count(), 1);
      assert.equal(await page.locator('#iqc-page .iqc-part-copy small').count(), 0,
        'part list must not show specification');
      assert.equal(await page.locator('#iqc-page').getByText('來源: IQC_CHUAN').count(), 0);
      const before = new URL(page.url()).searchParams.get('dataTab');
      await page.locator('.top-actions .language-switch').click();
      assert.equal(await page.locator('[data-quality-tab="quality-mold-equipment"]').innerText(), 'Thiết bị khuôn');
      assert.equal(await page.locator('[data-quality-tab="quality-routine-equipment"]').innerText(), 'Dưỡng kiểm và thiết bị thử');
      assert.equal(await page.locator('.top-actions .language-switch').getAttribute('aria-label'), '繁體中文');
      assert.equal(new URL(page.url()).searchParams.get('dataTab'), before);
      assert.equal(await page.locator('#data-content').getAttribute('data-active-tab'), before);
      assert.equal(await page.locator('.iqc-part').count(), parts);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      results.push({ width, parts, noOverflow: true, languageKeepsTab: true });
      await context.close();
    }
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
