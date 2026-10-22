/* Read-only check against the isolated port-3002 equipment fixture. */
const assert = require('node:assert/strict');
const runtime = require('./browser-test-runtime.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || runtime.playwrightModule);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || runtime.browserExecutable, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  try {
    await page.goto('http://127.0.0.1:3002/process/?system=quality&view=data&dataTab=quality-routine-equipment');
    await page.locator('[data-quick-login="admin"]').click();
    await page.locator('[data-dual-view="data"]').click();
    await page.locator('[data-quality-tab="quality-routine-equipment"]').click();
    await page.locator('#routine-search').fill('ABTEST001');
    await page.locator('[data-equipment-view]').first().click();
    const box = page.locator('.routine-ref-box').filter({ hasText: 'IPQC-AB' });
    await box.locator('.routine-ref-count').filter({ hasText: '1' }).waitFor();
    await box.locator('summary').click();
    const link = box.locator('[data-std-module="ipqc-ab"]').first();
    assert.match(await link.innerText(), /A-XETUOICAY/);
    await link.click();
    await page.locator('.ipqcab-overlay #ab-standard').waitFor();
    assert.match(page.url(), /quality-ipqc-ab/);
    assert.equal(await page.locator('#ab-standard').inputValue(), 'Tiêu chuẩn kiểm tra thử');
    console.log('PASS equipment reverse reference opens the exact IPQC-AB item and version');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
