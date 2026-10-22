import requireIsolatedTarget_20261010 from './require-isolated-test-target.cjs';
const isolatedTestTarget_20261010=requireIsolatedTarget_20261010();
import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true, channel:'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('console', msg => console.log('CONSOLE:', msg.text()));

  page.on('dialog', async dialog => {
    console.log('>> DIALOG:', dialog.type(), dialog.message(), 'Default:', dialog.defaultValue());
    await dialog.accept('新類別名稱');
  });

  await page.goto((isolatedTestTarget_20261010+"/process/?system=quality&view=data&dataTab=quality-routine-equipment"));
  if (await page.locator('[data-quick-login="admin"]').isVisible()) {
    await page.locator('[data-quick-login="admin"]').click();
    await page.waitForTimeout(1000);
  }

  await page.goto((isolatedTestTarget_20261010+"/process/?system=quality&view=data&dataTab=quality-routine-equipment"));
  await page.locator('.routine-page .routine-count').waitFor({ timeout: 15000 });
  console.log('Page loaded, routine count:', await page.locator('.routine-page .routine-count').textContent());

  console.log('--- Clicking [data-node-add="category"] ---');
  const addBtn = page.locator('[data-node-add="category"]');
  console.log('addBtn count:', await addBtn.count());
  await addBtn.click();
  await page.waitForTimeout(1000);

  const cats = await page.locator('[data-node-select="category"]').allTextContents();
  console.log('Categories count:', cats.length, cats);

  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
