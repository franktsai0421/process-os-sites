const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Local IQC review acceptance; always leaves imported data unapproved. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = (isolatedTestTarget_20261010+"/process/?system=quality&view=data&dataTab=quality-iqc");

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.IQC_CHROME_PATH?{executablePath:process.env.IQC_CHROME_PATH}:{channel:'chrome'}) });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto((isolatedTestTarget_20261010+"/process/"));
    await page.locator('[data-quick-login=admin]').click();
    await page.waitForURL('**/process/?**');
    await page.goto(url);
    await page.locator('#iqc-submit').waitFor();
    const prior = await page.evaluate(async () => (await (await fetch('/api/iqc')).json()));
    assert.equal(prior.control.activeVersionId, null);
    await page.locator('#iqc-submit').click();
    await page.locator('#iqc-withdraw').waitFor({ timeout: 30000 });
    const submitted = await page.evaluate(async () => (await (await fetch('/api/iqc')).json()));
    const pending = submitted.control.versions.find(version => version.status === 'pending');
    assert.ok(pending?.submittedAt && pending.submittedBy);
    assert.equal(submitted.control.activeVersionId, null);
    await page.locator('#iqc-to-review').click();
    await page.locator('[data-iqc-review]').first().waitFor({ timeout: 30000 });
    await page.locator('[data-iqc-review]').first().click();
    if (!await page.locator('#iqc-review-note').count()) console.error(JSON.stringify(await page.evaluate(() => ({
      role: window.ProcessSync?.identity?.role, canApprove: window.hasPermission?.('approval.approve'),
      review: document.querySelector('.iqc-review')?.innerText?.slice(0, 1200),
      html: document.querySelector('.iqc-review')?.outerHTML?.slice(0, 2000),
    }))));
    await page.locator('#iqc-review-note').fill('Local IQC 驗收測試：發回核對資料');
    await page.locator('#iqc-review-reject').click();
    await page.waitForFunction(() => !document.querySelector('[data-iqc-review]'), null, { timeout: 30000 });
    await page.goto(url);
    await page.locator('#iqc-submit').waitFor();
    const returned = await page.evaluate(async () => (await (await fetch('/api/iqc')).json()));
    const draft = returned.control.versions.find(version => version.id === pending.id);
    assert.equal(draft.status, 'draft');
    assert.ok(draft.reviewedAt && draft.reviewedBy && draft.reviewComment);
    assert.equal(returned.control.activeVersionId, null);
    assert.equal(draft.snapshot.parts.length, 187);
    assert.equal(draft.snapshot.items.length, 538);
    console.log(JSON.stringify({ localSubmit: true, qualityReviewCase: true,
      localReject: true, draftRetained: true, dataUnapproved: true }));
  } finally {
    try {
      const latest = await page.evaluate(async () => (await (await fetch('/api/iqc')).json()));
      const pending = latest.control.versions.find(version => version.status === 'pending');
      if (pending) await page.evaluate(async revision => fetch('/api/iqc', { method: 'POST',
        headers: window.ProcessSync.platformHeaders(),
        body: JSON.stringify({ action: 'withdraw', baseRevision: revision }) }), latest.revision);
    } catch { /* Reported by the main test if cleanup cannot access Local. */ }
    await context.close(); await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
