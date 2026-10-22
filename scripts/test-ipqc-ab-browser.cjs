/* Read-only browser acceptance for the chosen Local IPQC-AB server. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtime = require('./browser-test-runtime.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || runtime.playwrightModule);
const url = process.env.IPQCAB_TEST_URL || 'http://127.0.0.1:3002';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || runtime.browserExecutable,
    headless: true });
  const output = path.resolve('.wrangler/local-only');
  fs.mkdirSync(output,{recursive:true});
  try {
    for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
      const context = await browser.newContext({viewport});
      const page = await context.newPage();
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`${url}/process/?system=quality&view=data&dataTab=quality-ipqc-ab`);
      const login = page.locator('[data-quick-login="admin"]');
      await login.waitFor({timeout:20000});
      await login.click();
      await page.locator('[data-dual-view="data"]').waitFor({timeout:20000});
      if (viewport.width<600) await page.locator('#menu-toggle').click();
      await page.locator('[data-dual-view="data"]').click();
      await page.locator('[data-quality-tab="quality-ipqc-ab"]').click();
      await page.locator('.ipqcab-version h2').waitFor({timeout:20000});
      assert.match(await page.locator('#ipqcab-page').innerText(),/IPQC-AB/);
      assert.ok(await page.locator('#ipqcab-save').isVisible(),'Draft save action visible');
      assert.ok(await page.locator('.ipqcab-error').count()>0,'Imported errors visible');
      await page.locator('.ipqcab-error [data-ab-error]').first().click();
      assert.ok(await page.locator('.ipqcab-item').count()>0,'Imported check items visible');
      const startCode=await page.locator('.ipqcab-item b').first().innerText();
      await page.locator('#ipqcab-line').selectOption('B');
      await page.locator('#ipqcab-line').selectOption('A');
      assert.match(await page.locator('#ipqcab-page').innerText(),/IPQC-AB/);
      await page.locator('.top-actions .language-switch').click();
      assert.match(await page.locator('#ipqcab-page').innerText(),/IPQC-AB/);
      await page.locator('.top-actions .language-switch').click();
      const layout=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
      assert.ok(layout.scroll<=layout.width+1,JSON.stringify(layout));
      await page.screenshot({path:path.join(output,`ipqc-ab-${viewport.width}.png`),fullPage:true});
      await page.reload();
      await page.locator('.ipqcab-version h2').waitFor({timeout:20000});
      assert.ok(await page.locator('.ipqcab-error').count()>0,'Reload retains draft');
      await page.locator('[data-quality-tab="quality-fqc"]').click();
      await page.locator('#fqc-page').waitFor({timeout:20000});
      await page.locator('[data-quality-tab="quality-iqc"]').click();
      await page.locator('#iqc-page').waitFor({timeout:20000});
      await page.locator('[data-quality-tab="quality-ipqc-ab"]').click();
      await page.locator('.ipqcab-version h2').waitFor({timeout:20000});
      if (viewport.width<600) await page.locator('#menu-toggle').click();
      await page.locator('[data-dual-view="approval"]').click();
      await page.locator('[data-review-tab="quality"]').click();
      await page.locator('.ipqcab-review').waitFor({timeout:20000});
      assert.equal(errors.length,0,errors.join('\n'));
      console.log(`PASS IPQC-AB ${viewport.width}: imported page, selectors, language, reload, no overflow; example ${startCode}`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
