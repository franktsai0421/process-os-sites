import requireIsolatedTarget_20261010 from './require-isolated-test-target.cjs';
const isolatedTestTarget_20261010=requireIsolatedTarget_20261010();
import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true, channel:'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on('pageerror', err => { console.log('PAGE ERROR:', err.message); errors.push(err.message); });
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
  });

  page.on('dialog', async dialog => {
    console.log('DIALOG:', dialog.type(), dialog.message());
    if (dialog.type() === 'prompt') await dialog.accept('新測試項目');
    else await dialog.accept();
  });

  // Step 1: Login
  await page.goto((isolatedTestTarget_20261010+"/process/"));
  await page.locator('[data-quick-login="admin"]').waitFor();
  await page.locator('[data-quick-login="admin"]').click();
  await page.locator('#main-nav').waitFor();

  // Step 2: Open Routine Equipment
  await page.goto((isolatedTestTarget_20261010+"/process/?system=quality&view=data&dataTab=quality-routine-equipment"));
  await page.locator('.routine-count').waitFor();
  console.log('Count:', await page.locator('.routine-count').innerText());

  // Step 3: Test Add Category
  console.log('Testing Add Category...');
  const addCat = page.locator('[data-node-add="category"]');
  if (await addCat.isVisible()) {
    await addCat.click();
    await page.waitForTimeout(500);
    console.log('Categories count:', await page.locator('[data-node-select="category"]').count());
  } else {
    console.log('Add Category button NOT visible!');
  }

  // Step 4: Test Select Category -> Subcategory
  console.log('Testing Select Category...');
  const firstCat = page.locator('[data-node-select="category"]').first();
  await firstCat.click();
  await page.waitForTimeout(500);
  console.log('Subcategories count:', await page.locator('[data-node-select="subcategory"]').count());
  console.log('Add Subcategory visible:', await page.locator('[data-node-add="subcategory"]').isVisible());

  // Step 5: Test Select Subcategory -> Group
  console.log('Testing Select Subcategory...');
  const firstSub = page.locator('[data-node-select="subcategory"]').first();
  if (await firstSub.isVisible()) {
    await firstSub.click();
    await page.waitForTimeout(500);
    console.log('Groups count:', await page.locator('[data-node-select="group"]').count());
    console.log('Add Group visible:', await page.locator('[data-node-add="group"]').isVisible());
  }

  // Step 6: Test Select Group -> Equipment
  console.log('Testing Select Group...');
  const firstGroup = page.locator('[data-node-select="group"]').first();
  if (await firstGroup.isVisible()) {
    await firstGroup.click();
    await page.waitForTimeout(500);
    console.log('Equipment in group count:', await page.locator('.routine-equipment-list [data-equipment]').count());
    console.log('Add Equipment enabled:', await page.locator('#routine-add').isEnabled());
  }

  // Step 7: Test Open Equipment Modal & Apply
  console.log('Testing Open Equipment...');
  const firstEq = page.locator('.routine-equipment-list [data-equipment]').first();
  if (await firstEq.isVisible()) {
    await firstEq.click();
    await page.waitForTimeout(500);
    console.log('Editor visible:', await page.locator('#routine-editor').isVisible());
    console.log('Apply button visible:', await page.locator('#routine-form-apply').isVisible());

    // Check modal layout: are buttons sticky/at bottom? Is it scrollable?
    const modalBox = await page.locator('.routine-modal').boundingBox();
    const actionsBox = await page.locator('.routine-editor-actions').boundingBox();
    console.log('Modal box:', modalBox);
    console.log('Actions box:', actionsBox);

    // Click Apply
    await page.locator('#routine-form-apply').click();
    await page.waitForTimeout(500);
    console.log('Editor closed after apply:', !(await page.locator('#routine-editor').isVisible()));
  }

  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
