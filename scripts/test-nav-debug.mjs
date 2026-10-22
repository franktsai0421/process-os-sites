import requireIsolatedTarget_20261010 from './require-isolated-test-target.cjs';
const isolatedTestTarget_20261010=requireIsolatedTarget_20261010();
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, channel:'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto((isolatedTestTarget_20261010+"/process/?system=quality&view=data&dataTab=quality-routine-equipment"));
await page.waitForTimeout(500);

if (await page.locator('[data-quick-login="admin"]').isVisible()) {
  await page.locator('[data-quick-login="admin"]').click();
  await page.waitForTimeout(1000);
}

const parentInfo = await page.evaluate(() => {
  let el = document.querySelector('#main-nav');
  const path = [];
  while (el) {
    const style = window.getComputedStyle(el);
    path.push({
      tag: el.tagName,
      id: el.id,
      className: el.className,
      rect: el.getBoundingClientRect(),
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
    });
    el = el.parentElement;
  }
  return path;
});
console.log('PARENT PATH:', JSON.stringify(parentInfo, null, 2));

await browser.close();
