const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Node CommonJS fixture. */
/* Read-only Local navigation test; never changes user drafts. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true,
    channel:'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
    await page.goto((isolatedTestTarget_20261010+"/process/"));
    await page.locator('[data-quick-login=admin]').click();
    await page.waitForURL('**/process/?**');
    await page.goto((isolatedTestTarget_20261010+"/process/?system=quality&view=data&dataTab=quality-routine-equipment"));
    await page.locator('.routine-page').waitFor();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('process-shared-state-updated')));
    assert.equal(await page.locator('.routine-page').count(), 1,
      'FQC listener must not replace routine equipment after a shared-state update');
    assert.equal(await page.locator('#data-content').getAttribute('data-active-tab'), 'quality-routine-equipment');
    await page.locator('[data-quality-tab=quality-fqc]').click();
    await page.locator('.fqc-page').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('dataTab'), 'quality-fqc');
    await page.locator('[data-quality-tab=quality-routine-equipment]').click();
    await page.locator('.routine-page').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('dataTab'), 'quality-routine-equipment');
    await page.goBack();
    await page.locator('.fqc-page').waitFor();
    assert.equal(await page.locator('#data-content').getAttribute('data-active-tab'), 'quality-fqc');
    const tabs = [
      ['quality-routine-equipment', '.routine-page'],
      ['quality-iqc', '#iqc-page'],
      ['quality-fqc', '.fqc-page'],
      ['quality-ipqc-c', '.ipqcc-page'],
      ['quality-iqc', '#iqc-page'],
    ];
    for (const [tab, selector] of tabs) {
      await page.locator(`[data-quality-tab="${tab}"]`).click();
      await page.locator(`#data-content > ${selector}`).waitFor();
      await page.locator('.top-actions .language-switch').click();
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('process-shared-state-updated'));
        window.dispatchEvent(new CustomEvent('routine-equipment-updated'));
      });
      await page.waitForTimeout(150);
      assert.equal(new URL(page.url()).searchParams.get('dataTab'), tab);
      assert.equal(await page.locator('#data-content').getAttribute('data-active-tab'), tab);
      assert.equal(await page.locator(`#data-content > ${selector}`).count(), 1,
        `${tab} must not be overwritten by a different tab after language toggle`);
      assert.ok((await page.locator(`[data-quality-tab="${tab}"]`).getAttribute('class')).includes('active'));
    }
    console.log(JSON.stringify({ routineNotOverwritten: true, tabAndUrlSynchronized: true,
      browserBack: true, languagePreservesAllQualityTabs: true }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
