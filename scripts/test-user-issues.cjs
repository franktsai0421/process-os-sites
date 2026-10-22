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
    console.log('Dialog:', dialog.type(), dialog.message());
    await dialog.accept();
  });

  // Step 1: Login
  console.log('1. Logging in as admin...');
  await page.goto(`${base}/process/`);
  await page.locator('[data-quick-login="admin"]').waitFor();
  await page.locator('[data-quick-login="admin"]').click();
  await page.locator('#main-nav').waitFor();

  // Step 2: Open Routine Equipment
  console.log('2. Opening routine equipment...');
  await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-routine-equipment`);
  await page.locator('.routine-count').waitFor();

  // Step 3: Test Issue 1 - View modal photo overflow
  console.log('3. Testing Issue 1: View info photo containment...');
  await page.locator('[data-node-select="category"]').first().click();
  await page.locator('[data-node-select="subcategory"]').first().click();
  await page.locator('[data-node-select="group"]').first().click();
  await page.locator('.routine-equipment-card [data-equipment-view]').first().click();
  await page.locator('#routine-view-modal-backdrop').waitFor();

  const layout = await page.evaluate(() => {
    const photoContainer = document.querySelector('.routine-view-photo');
    const img = document.querySelector('.routine-view-photo img');
    const grid = document.querySelector('.routine-view-grid');
    const pBox = photoContainer.getBoundingClientRect();
    const iBox = img.getBoundingClientRect();
    const gBox = grid.getBoundingClientRect();
    return {
      photoBottom: pBox.bottom,
      imgBottom: iBox.bottom,
      gridTop: gBox.top,
      overlaps: iBox.bottom > gBox.top
    };
  });
  console.log('Photo layout check:', layout);
  assert.equal(layout.overlaps, false, 'Image must NOT overlap the grid text below it');
  assert.ok(layout.imgBottom <= layout.photoBottom + 1, 'Image must be contained inside photo container');
  await page.screenshot({ path: path.join(artifactDir, 'fixed-view-photo-no-overlap.png') });
  await page.locator('#routine-view-close').click();
  await page.locator('#routine-view-modal-backdrop').waitFor({ state: 'detached' });

  // Step 4: Test Issue 2 - Left sidebar nav items after save/submit
  console.log('4. Testing Issue 2: Sidebar nav buttons after save/submit...');
  const navCountBefore = await page.locator('#main-nav .nav-item:not([hidden])').count();
  console.log('Nav buttons before save:', navCountBefore);
  assert.ok(navCountBefore >= 5, 'Sidebar must have nav buttons');

  // Click Save Draft
  await page.locator('#routine-save').click();
  await page.locator('.routine-message').filter({ hasText: /後端已保存|Máy chủ đã lưu/ }).waitFor();

  const navCountAfter = await page.locator('#main-nav .nav-item:not([hidden])').count();
  console.log('Nav buttons after save:', navCountAfter);
  assert.equal(navCountAfter, navCountBefore, 'Nav buttons must NOT disappear after save');
  assert.equal(await page.locator('#main-nav').isVisible(), true, 'Sidebar nav must remain visible');

  // Step 5: Test Issue 3 - Clicking "+新增檢具" when group not clicked yet
  console.log('5. Testing Issue 3: Clicking +新增檢具 with auto-selected group...');
  // Select Category C07 (or first category)
  await page.locator('[data-node-select="category"]').first().click();
  // Select Subcategory
  await page.locator('[data-node-select="subcategory"]').first().click();

  // Without explicitly clicking group, click "+新增檢具"
  await page.locator('#routine-add').click();
  // It should open #routine-add-modal immediately!
  await page.locator('#routine-add-modal').waitFor();
  console.log('Add Equipment modal opened successfully!');
  assert.equal(await page.locator('#routine-add-modal').isVisible(), true, 'Add equipment modal must open');

  // Verify group is selected in the drawer
  const selectedGrpVal = await page.locator('#routine-add-group-select').inputValue();
  console.log('Auto-selected group in drawer:', selectedGrpVal);
  assert.ok(selectedGrpVal.length > 0, 'Group must be selected in drawer');

  await page.screenshot({ path: path.join(artifactDir, 'fixed-add-equipment-drawer.png') });
  await page.locator('#routine-add-close').click();
  await page.locator('#routine-add-modal').waitFor({ state: 'detached' });

  assert.deepEqual(errors, []);
  console.log('ALL THREE USER ISSUES VERIFIED FIXED SUCCESSFULLY!');
  await browser.close();
})().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
