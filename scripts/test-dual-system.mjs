import __esmImport0 from "node:assert/strict";
import __esmImport1 from "node:fs";
import __esmImport2 from "node:path";
import {createRequire as __esmFactory} from 'node:module';
import {fileURLToPath as __esmPath} from 'node:url';
import __esmPathModule from 'node:path';
const __filename=__esmPath(new URL("./test-dual-system.cjs",import.meta.url));
const __dirname=__esmPathModule.dirname(__filename);
const __esmRequire=__esmFactory(__filename);
const assert = __esmImport0;
const fs = __esmImport1;
const path = __esmImport2;
const runtime = __esmRequire('./browser-test-runtime.cjs');
const { chromium } = __esmRequire(process.env.PLAYWRIGHT_MODULE || runtime.playwrightModule);

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || runtime.browserExecutable,
    headless: true,
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.json'), 'utf8'));
    seed.identity = { id: 'admin', role: 'admin', name: 'Fixture Admin' };
    seed.serverProtected = true;
    await context.route('**/api/**', route => {
      if (route.request().url().includes('/shared-state')) return route.fulfill({ json: seed });
      if (route.request().url().includes('/backups')) return route.fulfill({ json: { backups: [], revision: seed.revision, settings: { enabled: false }, coverage: [] } });
      return route.fulfill({ json: { ok: true } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${runtime.localUrl()}/process/?system=quality&view=quality-dashboard`);
    await page.locator('[data-dual-view="quality-dashboard"]').waitFor();

    for (const [view, title] of Object.entries({
      'quality-search': '標準搜尋',
      'quality-reports': '品質報告',
      'quality-inspections': '例行檢查',
      'quality-fpy': 'FPY',
    })) {
      await page.locator(`[data-dual-view="${view}"]`).click();
      assert.equal(await page.locator('.quality-workspace h3').innerText(), title);
      assert.equal(await page.locator('.quality-workspace p').innerText(), '功能建置中');
    }

    await page.locator('[data-dual-view="data"]').click();
    assert.equal(await page.locator('.process-data-tabs .master-tab').count(), 7);
    assert.equal(await page.locator('.quality-data-tabs .master-tab').count(), 4);
    for (const [tab, title] of Object.entries(windowlessQualityTabs())) {
      if (tab === 'quality-fqc') continue; // Covered end-to-end by test-fqc-browser.cjs.
      await page.locator(`[data-quality-tab="${tab}"]`).click();
      assert.equal(await page.locator('.quality-data-workspace h2').innerText(), title);
      assert.equal(await page.locator('.quality-data-workspace p').innerText(), '功能建置中');
    }
    for (const [selector, expected] of [
      ['[data-master-scope="AB"]', '.master-shell'],
      ['[data-master-scope="C"]', '.master-shell'],
      ['[data-tab="bom"]', '.bom-finder'],
      ['[data-tab="line-admin"]', '.master-line-editor'],
      ['[data-tab="process-master"]', '.process-photo-master'],
      ['[data-tab="users"]', '.user-admin'],
      ['#backup-tab', '.backup-console'],
    ]) {
      await page.locator(selector).click();
      await page.locator(expected).waitFor();
    }

    await page.locator('.system-switcher').click();
    assert.equal(await page.locator('[data-dual-view="dashboard"]').isVisible(), true);
    await page.goBack();
    assert.equal(await page.locator('[data-dual-view="data"]').isVisible(), true);

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    assert.deepEqual(errors, []);

    const loginContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const loginSeed = structuredClone(seed);
    delete loginSeed.identity;
    await loginContext.route('**/api/**', route => {
      if (route.request().url().includes('/shared-state')) return route.fulfill({ json: loginSeed });
      return route.fulfill({ json: { ok: true } });
    });
    await loginContext.addInitScript(() => sessionStorage.setItem('process-platform-signed-out', '1'));
    const loginPage = await loginContext.newPage();
    await loginPage.goto(`${runtime.localUrl()}/process/`);
    await loginPage.locator('[data-login-system="process"]').waitFor();
    await loginPage.evaluate(() => {
      platformUsers = [{
        id: 'fixture-login', name: 'Fixture Login', password: 'fixture-password',
        role: 'admin', lines: ['A', 'B', 'C'],
        views: ['dashboard', 'player', 'dispatch', 'productStatus', 'approval', 'editor', 'data'],
      }];
    });
    await loginPage.locator('[data-login-system="quality"]').click();
    assert.equal(await loginPage.locator('#login-submit').innerText(), '登入品質系統');
    await loginPage.locator('#login-id').fill('fixture-login');
    await loginPage.locator('#login-password').fill('fixture-password');
    await loginPage.locator('#login-submit').click();
    await loginPage.locator('[data-dual-view="quality-dashboard"]').waitFor();
    await loginContext.close();
    console.log('PASS: dual-system routing, quality pages, shared data tabs, credential destination, browser back and mobile overflow');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

function windowlessQualityTabs() {
  return {
    'quality-fqc': 'FQC',
    'quality-iqc': 'IQC',
    'quality-ipqc': 'IPQC',
    'quality-routine-reports': '例行報告資料庫',
  };
}
