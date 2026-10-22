const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const base = isolatedTestTarget_20261010;
const artifactDir = require('./local-evidence-paths.cjs').configuredPath('PROCESS_ROUTINE_EVIDENCE_ROOT',"");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel:'chrome'
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('dialog', async dialog => {
    console.log('Dialog opened:', dialog.type(), dialog.message());
    await dialog.accept();
  });

  console.log('1. Logging in as admin...');
  await page.goto(`${base}/process/`);
  await page.locator('[data-quick-login="admin"]').waitFor();
  await page.locator('[data-quick-login="admin"]').click();
  await page.locator('#main-nav').waitFor();

  console.log('2. Navigating to routine equipment on real backend...');
  await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-routine-equipment`);
  await page.locator('.routine-count').waitFor();
  const countText = await page.locator('.routine-count').innerText();
  console.log('Real backend equipment count:', countText);
  assert.match(countText, /\d+ 筆設備/);

  // Check left nav remains visible
  assert.equal(await page.locator('#main-nav').isVisible(), true, 'Left navigation must remain visible');

  console.log('3. Checking section order...');
  const sections = await page.evaluate(() => {
    const p = document.querySelector('#routine-page');
    return Array.from(p.children).map(c => c.className);
  });
  console.log('Sections on real backend:', sections);

  console.log('4. Testing Category and Subcategory selection...');
  await page.locator('[data-node-select="category"]').first().click();
  await page.locator('[data-node-select="subcategory"]').first().waitFor();
  await page.locator('[data-node-select="subcategory"]').first().click();
  await page.locator('[data-node-select="group"]').first().waitFor();

  console.log('5. Testing View Info modal on real equipment...');
  await page.locator('[data-node-select="group"]').first().click();
  await page.locator('.routine-equipment-card [data-equipment-view]').first().click();
  await page.locator('#routine-view-modal-backdrop').waitFor();
  const viewTitle = await page.locator('.routine-view-dialog h3').innerText();
  console.log('View Info modal title:', viewTitle);
  assert.ok(viewTitle.includes('檢具詳細資訊'));
  await page.screenshot({ path: path.join(artifactDir, 'real-view-info-equipment.png') });
  await page.locator('#routine-view-close').click();
  await page.locator('#routine-view-modal-backdrop').waitFor({ state: 'detached' });

  console.log('6. Testing calibration switch in real edit drawer...');
  await page.locator('.routine-equipment-card [data-equipment-edit]').first().click();
  await page.locator('#routine-editor').waitFor();

  // Measure scroll
  await page.evaluate(() => {
    document.querySelector('#routine-editor .routine-modal-body').scrollTop = 280;
  });
  const beforeScroll = await page.evaluate(() => document.querySelector('#routine-editor .routine-modal-body').scrollTop);

  // Switch to none
  await page.locator('#routine-edit-calibration-method').selectOption('none');
  const afterScroll = await page.evaluate(() => document.querySelector('#routine-editor .routine-modal-body').scrollTop);
  assert.equal(beforeScroll, afterScroll, 'Scroll must not change on calibration method switch');

  // Cancel edit
  await page.locator('#routine-close').click();
  await page.locator('#routine-editor').waitFor({ state: 'detached' });

  // Final screenshot of full page
  await page.screenshot({ path: path.join(artifactDir, 'real-routine-equipment-page.png'), fullPage: false });

  assert.deepEqual(errors, []);
  console.log('REAL BACKEND VERIFICATION PASSED!');
  await browser.close();
})().catch(err => {
  console.error('REAL BACKEND TEST FAILED:', err);
  process.exit(1);
});
