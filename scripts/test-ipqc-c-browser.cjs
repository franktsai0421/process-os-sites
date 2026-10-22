/* oxlint-disable typescript/no-require-imports -- Repository browser fixtures use CommonJS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtime = require('./browser-test-runtime.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || runtime.playwrightModule);
const localUrl = process.env.IPQC_TEST_URL || 'http://127.0.0.1:3001';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || runtime.browserExecutable, headless: true });
  const output = path.join(__dirname, '..', '.wrangler', 'local-only');
  fs.mkdirSync(output, { recursive: true });
  const failures = [];
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.on('pageerror', error => failures.push(error.message));
      await page.goto(`${localUrl}/process/?system=quality&view=data&dataTab=quality-ipqc-c`);
      await page.waitForTimeout(2000);
      if (!(await page.locator('#ipqcc-page').count())) {
        const admin = page.locator('[data-quick-login="admin"]');
        if (await admin.count()) await admin.click();
      }
      await page.locator('[data-dual-view="data"]').waitFor({ timeout: 15000 });
      if (viewport.width < 600) await page.locator('#menu-toggle').click();
      await page.locator('[data-dual-view="data"]').click();
      await page.locator('[data-quality-tab="quality-ipqc-c"]').click();
      await page.locator('#ipqcc-page').waitFor({ timeout: 15000 });
      if (process.env.IPQC_TEST_INTEGRATION === '1') {
        await page.locator('[data-quality-tab="quality-iqc"]').click();
        await page.locator('.iqc-match-count').waitFor({ timeout: 15000 });
        assert.match(await page.locator('.iqc-match-count').innerText(), /[1-9]\d*\s*\/\s*[1-9]\d*/);
        await page.locator('[data-quality-tab="quality-routine-equipment"]').click();
        await page.locator('#routine-page').waitFor({ timeout: 15000 });
        await page.locator('[data-quality-tab="quality-ipqc-c"]').click();
        await page.locator('#ipqcc-page').waitFor({ timeout: 15000 });
      }
      assert.match(await page.locator('#ipqcc-page').innerText(), /IPQC-C/);
      const expectedProducts = await page.evaluate(async () => (await (await fetch('/api/ipqc-c')).json()).catalog.products.length);
      assert.equal(await page.locator('.ipqcc-product').count(), expectedProducts);
      const sourceCode = await page.locator('.ipqcc-item summary code').first().innerText();
      await page.locator('.ipqcc-item summary').first().click();
      assert.match(await page.locator('.ipqcc-item-body').first().innerText(), /14.50mm/);
      await page.locator('#ipqcc-search').fill('3');
      assert.equal(await page.locator('#ipqcc-search').inputValue(), '3');
      assert.ok(await page.locator('.ipqcc-product').count() > 0);
      await page.locator('#ipqcc-search').fill('');
      await page.locator('.top-actions .language-switch').click();
      assert.equal(await page.locator('.ipqcc-item summary code').first().innerText(), sourceCode);
      await page.locator('.top-actions .language-switch').click();
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      assert.ok(layout.scrollWidth <= layout.clientWidth + 1, JSON.stringify(layout));
      await page.screenshot({ path: path.join(output, `ipqc-c-${viewport.width}.png`), fullPage: true });
      await page.reload();
      await page.locator('#ipqcc-page').waitFor({ timeout: 15000 });
      assert.equal(await page.locator('.ipqcc-product').count(), expectedProducts);
      if (viewport.width < 600) await page.locator('#menu-toggle').click();
      await page.locator('[data-dual-view="approval"]').click();
      await page.locator('[data-review-tab="quality"]').click();
      assert.match(await page.locator('body').innerText(), /IPQC-C/);
      if (viewport.width < 600) {
        const source = await page.evaluate(async () => (await fetch('/api/ipqc-c')).json());
        const active = source.control.versions.find(v => v.id === source.control.activeVersionId);
        const fake = JSON.parse(JSON.stringify(source));
        fake.control.versions = fake.control.versions.filter(v => v.status !== 'pending');
        fake.control.versions.push({ ...JSON.parse(JSON.stringify(active)), id:'fixture-mobile-draft', number:2,
          status:'draft', baseVersionId:active.id, revision:1, history:[] });
        fake.control.versions.at(-1).snapshot.items[0].description='Đầu\n\nCuối';
        fake.control.versions.at(-1).snapshot.items[0].mediaItems=[{id:'0'.repeat(64),name:'fixture.png',note:'Giữa đoạn',afterParagraph:1}];
        await context.route('**/api/ipqc-c/photo?*', route => route.fulfill({status:200,
          contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64')}));
        let attemptedRule = null;
        await context.route('**/api/ipqc-c', route => {
          if (route.request().method() === 'GET') return route.fulfill({ json:fake });
          attemptedRule = JSON.parse(route.request().postData()).snapshot.items[0].rule;
          fake.revision += 1;
          fake.control.versions.at(-1).revision += 1;
          fake.control.versions.at(-1).snapshot.items[0].standard='Server changed standard';
          return route.fulfill({status:409,json:{error:'revision changed',revision:fake.revision}});
        });
        await page.locator('#menu-toggle').click();
        await page.locator('[data-dual-view="data"]').click();
        await page.locator('[data-quality-tab="quality-ipqc-c"]').click();
        await page.locator('#ipqcc-version').selectOption('fixture-mobile-draft');
        await page.locator('.ipqcc-item summary').first().click();
        assert.equal(await page.locator('.ipqcc-instruction .ipqcc-photos img').count(),1);
        const order=await page.locator('.ipqcc-instruction').first().evaluate(el=>[...el.children].map(child=>child.tagName));
        assert.deepEqual(order,['B','P','DIV','P']);
        await page.locator('[data-ipqcc-edit-item]').first().click();
        assert.ok(await page.locator('#ipqcc-insert-photo').isVisible());
        await page.locator('[name="ruleCadence"]').selectOption('batch');
        await page.locator('[name="batchKind"]').selectOption('custom');
        await page.locator('[name="customBatchText"]').fill('Mẫu riêng');
        await page.locator('[name="customBatchValue"]').fill('3 mẫu');
        assert.ok(await page.locator('[data-batch-kind="custom"]').isVisible());
        await page.locator('.ipqcc-dialog textarea[name="description"]').fill('Giữ nguyên tiếng Việt');
        await page.locator('.ipqcc-dialog textarea[name="description"]').evaluate(el=>el.setSelectionRange(4,4));
        const choosing=page.waitForEvent('filechooser');
        await page.locator('#ipqcc-insert-photo').click();
        const chooser=await choosing;
        await chooser.setFiles({name:'cover.png',mimeType:'image/png',
          buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64')});
        assert.match(await page.locator('.ipqcc-dialog textarea[name="description"]').inputValue(), /\n\n/);
        assert.equal(await page.locator('.ipqcc-photo-row').count(),2);
        await page.locator('[data-photo-cover="1"]').click();
        assert.equal(await page.locator('.ipqcc-photo-row img').first().getAttribute('alt'),'cover.png');
        page.once('dialog',dialog=>dialog.accept());
        await page.locator('[data-photo-remove="0"]').click();
        await page.locator('.ipqcc-dialog textarea[name="description"]').fill('Giữ nguyên tiếng Việt');
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('process-language-change', {detail:{language:'zh'}})));
        assert.equal(await page.locator('.ipqcc-dialog textarea[name="description"]').inputValue(), 'Giữ nguyên tiếng Việt');
        const form = await page.locator('.ipqcc-dialog').boundingBox();
        assert.ok(form && form.x >= 0 && form.width <= viewport.width + 1);
        assert.ok(await page.locator('#ipqcc-cancel').isVisible());
        await page.screenshot({ path:path.join(output,'ipqc-c-mobile-form.png'), fullPage:false });
        await page.locator('#ipqcc-editor button[type="submit"]').click();
        await page.locator('#ipqcc-reload').waitFor();
        assert.deepEqual(attemptedRule,{cadence:'batch',batchKind:'custom',customBatchText:'Mẫu riêng',customBatchValue:'3 mẫu'});
        assert.equal(await page.locator('.ipqcc-dialog textarea[name="description"]').inputValue(), 'Giữ nguyên tiếng Việt');
      }
      console.log(`PASS viewport ${viewport.width}: product search, language/source, reload, review panel, no horizontal overflow`);
      await context.close();
    }
    assert.deepEqual(failures, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
