const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Local IQC persistence acceptance check. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = (isolatedTestTarget_20261010+"/process/?system=quality&view=data&dataTab=quality-iqc");
const marker = '__LOCAL_IQC_DRAFT_TEST__';

async function editTool(page, index, value) {
  const detail = page.locator('.iqc-detail [data-item-details]').nth(index);
  if (await detail.getAttribute('open') === null) await detail.locator('summary').click();
  await detail.locator('[data-edit-item]').click();
  await page.locator('#iqc-item-form [name=toolVi]').fill(value);
  await page.locator('#iqc-item-form button[type=submit]').click();
  await page.locator('.iqc-dialog-overlay').waitFor({ state: 'detached' });
}

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.IQC_CHROME_PATH?{executablePath:process.env.IQC_CHROME_PATH}:{channel:'chrome'}) });
  let context, originals;
  try {
    context = await browser.newContext();
    const page = await context.newPage();
    await page.goto((isolatedTestTarget_20261010+"/process/"));
    await page.locator('[data-quick-login=admin]').click();
    await page.waitForURL('**/process/?**');
    await page.goto(url);
    await page.locator('[data-select-part]').first().click();
    try { await page.locator('.iqc-detail [data-item-details]').first().waitFor({ timeout: 10000 }); }
    catch (error) { console.error(JSON.stringify({ url: page.url(), text: (await page.locator('body').innerText()).slice(0, 1000) })); throw error; }
    const initial = await page.evaluate(async () => (await (await fetch('/api/iqc')).json()));
    const draft = initial.control.versions.find(version => version.status === 'draft');
    assert.ok(draft, 'Real imported IQC version remains a draft');
    originals = draft.snapshot.items.slice(0, 2).map(item => ({ id: item.id, toolVi: item.toolVi }));
    assert.equal(originals.length, 2);
    try {
      await editTool(page, 0, `${originals[0].toolVi}${marker}`);
      await editTool(page, 1, `${originals[1].toolVi}${marker}`);
      await page.reload();
      await page.locator('[data-select-part]').first().click();
      await page.locator('.iqc-detail [data-item-details]').first().waitFor();
      const stored = await page.evaluate(async () => (await (await fetch('/api/iqc')).json()));
      const saved = stored.control.versions.find(version => version.status === 'draft');
      assert.ok(originals.every(({ id }) => saved.snapshot.items.find(item => item.id === id).toolVi.includes(marker)));
      for (const index of [0, 1]) {
        const detail = page.locator('.iqc-detail [data-item-details]').nth(index);
        await detail.locator('summary').click();
        assert.ok((await detail.innerText()).includes(marker));
        await detail.locator('summary').click();
      }
      console.log(JSON.stringify({ localDraftSave: true, reload: true, twoItemsRetained: true }));
    } finally {
      const restored = await page.evaluate(async ({ originals, marker }) => {
        const latest = await (await fetch('/api/iqc')).json();
        const version = latest.control.versions.find(item => item.status === 'draft');
        if (!version) return false;
        const next = structuredClone(version.snapshot);
        let changed = false;
        for (const original of originals) {
          const item = next.items.find(row => row.id === original.id);
          if (item.toolVi.endsWith(marker)) { item.toolVi = original.toolVi; changed = true; }
        }
        if (!changed) return true;
        const response = await fetch('/api/iqc', { method: 'POST',
          headers: window.ProcessSync.platformHeaders(),
          body: JSON.stringify({ action: 'save', baseRevision: latest.revision,
            versionId: version.id, versionRevision: version.revision, snapshot: next }) });
        return response.ok;
      }, { originals, marker });
      assert.equal(restored, true, 'Temporary test edits must be restored');
    }
  } finally { await context?.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
