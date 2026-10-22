import requireIsolatedTarget_20261010 from './require-isolated-test-target.cjs';
const isolatedTestTarget_20261010=requireIsolatedTarget_20261010();
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel:'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto((isolatedTestTarget_20261010+"/process/?system=quality&view=data&dataTab=quality-routine-equipment"));
await page.waitForTimeout(500);
console.log('Initial URL:', page.url());
console.log('Login visible:', await page.locator('#login-root').isVisible());

if (await page.locator('[data-quick-login="admin"]').isVisible()) {
  console.log('Clicking admin quick login...');
  await page.locator('[data-quick-login="admin"]').click();
  await page.waitForTimeout(1000);
}

console.log('After login URL:', page.url());
const stateInfo = await page.evaluate(() => ({
  currentUser: window.currentUser,
  activeSystem: window.ProcessDualSystem?.activeSystem,
  navHtml: document.querySelector('#main-nav')?.innerHTML,
  navChildren: document.querySelector('#main-nav')?.childElementCount,
}));
console.log('State info:', JSON.stringify(stateInfo, null, 2));

// Now click data -> quality-routine-equipment
await page.locator('[data-dual-view="data"], [data-view="data"]').click();
await page.waitForTimeout(500);
await page.locator('[data-quality-tab="quality-routine-equipment"]').click();
await page.waitForTimeout(1000);

const routineInfo = await page.evaluate(() => ({
  navHtml: document.querySelector('#main-nav')?.innerHTML,
  primaryNav: document.querySelector('.system-primary-nav')?.innerHTML,
  sharedNav: document.querySelector('.shared-nav-panel')?.innerHTML,
  routineCount: document.querySelector('.routine-count')?.textContent,
}));
console.log('Routine info:', JSON.stringify(routineInfo, null, 2));

await browser.close();
