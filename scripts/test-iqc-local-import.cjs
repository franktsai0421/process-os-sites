const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Local-only IQC acceptance check. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = isolatedTestTarget_20261010;
const target = `${base}/process/?system=quality&view=data&dataTab=quality-iqc`;

async function login(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/process/`);
  await page.locator('[data-quick-login=admin]').click();
  await page.waitForURL('**/process/?**');
  await page.goto(target);
  try { await page.locator('#iqc-page').waitFor({ timeout: 15000 }); }
  catch (error) {
    console.error(JSON.stringify({ url: page.url(), title: await page.title(),
      pageText: (await page.locator('body').innerText()).slice(0, 800),
      iqcStatus: await page.evaluate(async () => { const response = await fetch('/api/iqc');
        return { status: response.status, text: (await response.text()).slice(0, 300) }; }) }));
    throw error;
  }
  return { context, page };
}

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.IQC_CHROME_PATH?{executablePath:process.env.IQC_CHROME_PATH}:{channel:'chrome'}) });
  try {
    const first = await login(browser);
    const before = await first.page.evaluate(async () => (await (await fetch('/api/iqc')).json()).control);
    if (!before.versions.length) {
      await first.page.locator('#iqc-preview').click();
      await first.page.locator('#iqc-import').waitFor();
      first.page.once('dialog', dialog => dialog.accept());
      await first.page.locator('#iqc-import').click();
      await first.page.waitForFunction(() => document.querySelectorAll('#iqc-page .iqc-part').length === 187,
        null, { timeout: 180000 });
    }
    const one = await first.page.evaluate(async () => (await (await fetch('/api/iqc')).json()));
    assert.equal(one.control.versions.length, 1);
    assert.equal(one.control.versions[0].status, 'draft');
    assert.equal(one.control.versions[0].snapshot.parts.length, 187);
    assert.equal(one.control.versions[0].snapshot.errors.length, 538);
    assert.equal(one.control.versions[0].snapshot.items.length, 538);
    assert.equal(one.control.versions[0].snapshot.categories.length, 8);
    assert.ok(one.control.versions[0].snapshot.parts.every(part => !!part.categoryId));
    assert.ok(one.control.versions[0].snapshot.items.every(item => !item.toolVi.includes('__LOCAL_IQC_DRAFT_TEST__')));
    const photoParts = one.control.versions[0].snapshot.parts;
    assert.equal(photoParts.reduce((n, part) => n + part.photos.length, 0), 185);
    const firstPhoto = photoParts.find(part => part.photos.length).photos[0];
    assert.equal(await first.page.evaluate(async src => (await fetch(src)).status, firstPhoto.src), 200);
    for (const code of ['3030912', '3040117'])
      assert.equal(photoParts.find(part => part.code === code).photos.length, 0);
    await first.page.reload();
    await first.page.locator('#iqc-page .iqc-part').first().waitFor();
    assert.equal(await first.page.locator('#iqc-page .iqc-part').count(), 187);
    await first.context.close();
    await browser.close();
    const reopenedBrowser = await chromium.launch({ headless: true,
      ...(process.env.IQC_CHROME_PATH?{executablePath:process.env.IQC_CHROME_PATH}:{channel:'chrome'}) });
    try {
      const second = await login(reopenedBrowser);
      await second.page.locator('#iqc-page .iqc-part').first().waitFor();
      assert.equal(await second.page.locator('#iqc-page .iqc-part').count(), 187);
      const repeated = await second.page.evaluate(async revision => {
        const source = await (await fetch('/process/iqc-source.json')).json();
        const response = await fetch('/api/iqc', { method: 'POST',
          headers: window.ProcessSync.platformHeaders(),
          body: JSON.stringify({ action: 'import', baseRevision: revision, source }) });
        return { status: response.status, body: await response.json() };
      }, one.revision);
      assert.equal(repeated.status, 200);
      assert.equal(repeated.body.unchanged, true);
      const two = await second.page.evaluate(async () => (await (await fetch('/api/iqc')).json()));
      assert.equal(two.control.versions.length, 1);
      assert.equal(two.revision, one.revision);
      await second.context.close();
    } finally { await reopenedBrowser.close(); }
    console.log(JSON.stringify({ localImport: true, parts: 187, categories: 8, errors: 538,
      items: 538, photos: 185, refreshed: true, independentBrowser: true, repeatedImportNoDuplicate: true }));
  } finally { if (browser.isConnected()) await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
