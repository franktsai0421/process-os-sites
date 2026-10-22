const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Local FQC & Routine Equipment integration test fixture. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const base = isolatedTestTarget_20261010;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel:'chrome'
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // 1. 登入 ADMIN
    console.log('1. Logging in as admin...');
    await page.goto(`${base}/process/`);
    await page.locator('[data-quick-login="admin"]').waitFor();
    await page.locator('[data-quick-login="admin"]').click();
    await page.locator('#main-nav').waitFor();

    // 2. 前往資料後台 -> FQC
    console.log('2. Navigating to FQC Master...');
    await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-fqc`);
    await page.locator('.fqc-version-bar').waitFor();

    // 驗證類別數量（包含 39 個 AB 類別）
    const catOptions = await page.locator('#fqc-category option').allInnerTexts();
    console.log(`FQC categories count: ${catOptions.length}`);
    assert.ok(catOptions.length >= 39, 'Should have at least 39 categories from AB lines');

    // 驗證未涵蓋列表簡化為 3 欄緊湊表格，無加入既有項目／新增檢查項目按鈕
    console.log('3. Checking uncovered products table...');
    const uncoveredCard = page.locator('.fqc-uncovered-panel');
    await uncoveredCard.waitFor();
    const uncoveredHeaders = await page.locator('.fqc-uncovered-table th').allInnerTexts();
    console.log('Uncovered headers:', uncoveredHeaders);
    assert.ok(uncoveredHeaders.some(h => h.includes('編號') || h.includes('Mã')), 'Uncovered table must have product code column');
    assert.ok(uncoveredHeaders.some(h => h.includes('名稱') || h.includes('Tên')), 'Uncovered table must have product name column');
    assert.ok(uncoveredHeaders.some(h => h.includes('規格') || h.includes('Quy cách')), 'Uncovered table must have product spec column');
    assert.equal(await page.$('.fqc-uncovered-table button'), null, 'Uncovered table should NOT have action buttons');

    // 開始修改草稿以檢查 Item Modal
    console.log('4. Entering draft mode and opening Check Item Modal...');
    const beginBtn = await page.$('#fqc-begin');
    if (beginBtn) {
      await beginBtn.click();
      await page.waitForTimeout(600);
    }
    await page.locator('#fqc-add-item').click();
    await page.locator('.fqc-item-form').waitFor();

    // 驗證工具選擇器（目視、檢具、其他文字）
    console.log('5. Verifying tool selector in Check Item Modal...');
    const toolRadios = await page.locator('input[name="toolType"]').all();
    assert.equal(toolRadios.length, 3, 'Must have 3 tool radio choices (visual, equipment, custom)');

    // 選擇「檢具設備」
    await page.locator('input[name="toolType"][value="equipment"]').check();
    await page.waitForTimeout(200);

    // 點擊選擇檢具開啟 Picker Modal
    console.log('6. Opening Equipment Picker Modal...');
    await page.locator('#fqc-pick-eq-trigger').click();
    await page.locator('.fqc-eq-picker-modal').waitFor();

    // 驗證 Picker 可以在不退出的情況下切換類別與群組
    const pickerCatSelect = page.locator('#fqc-picker-cat');
    await pickerCatSelect.waitFor();
    const pickerCatOpts = await pickerCatSelect.locator('option').all();
    assert.ok(pickerCatOpts.length > 1, 'Picker should have categories available');

    // 驗證移除「已核對規格與能力」checkbox
    const verifyCheckbox = await page.$('#fqc-verify-ability-chk');
    assert.equal(verifyCheckbox, null, 'Capability/spec verification checkbox must be removed');

    // 選擇第一個可選設備
    const firstEqPickBtn = page.locator('[data-select-eq]').first();
    await firstEqPickBtn.waitFor();
    await firstEqPickBtn.click();
    await page.waitForTimeout(300);

    // 驗證選擇後顯示設備卡片與縮圖，並有「更換」與「清除」按鈕
    console.log('7. Verifying selected equipment card in Item Modal...');
    const selectedEqCard = page.locator('.fqc-eq-selected-card');
    assert.ok(await selectedEqCard.isVisible(), 'Selected equipment card must be visible');
    assert.ok(await page.$('#fqc-change-eq-trigger'), 'Must have change equipment button');
    assert.ok(await page.$('#fqc-clear-eq-trigger'), 'Must have clear equipment button');

    // 關閉 Item Modal
    await page.locator('.fqc-item-form button[data-close]').first().click();
    await page.waitForTimeout(300);

    // 3. 前往常規檢具與測試設備管理
    console.log('8. Navigating to Routine Equipment Management...');
    await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-routine-equipment`);
    await page.locator('.routine-version').waitFor();

    // 驗證卡片上有「替換設備」按鈕
    console.log('9. Checking "替換設備" button on equipment cards...');
    const transferBtns = await page.locator('[data-equipment-transfer]').all();
    assert.ok(transferBtns.length > 0, 'Equipment cards must have 替換設備 button');

    // 開啟「查看資訊」驗證 4 個品質標準反向引用框
    console.log('10. Opening View Dialog and verifying 4 quality standard reference boxes...');
    await page.locator('[data-equipment-view]').first().click();
    await page.locator('.routine-view-dialog').waitFor();
    await page.waitForTimeout(500);

    const refSectionInView = page.locator('.routine-view-dialog .routine-ref-section');
    assert.ok(await refSectionInView.isVisible(), 'View dialog must have routine-ref-section between spec and notes');

    // 驗證四個模組引用框：FQC, IPQC-AB, IPQC-C, IQC
    const refBoxesInView = await page.locator('.routine-view-dialog .routine-ref-box').all();
    assert.equal(refBoxesInView.length, 4, 'Must have 4 reference boxes (FQC, IPQC-AB, IPQC-C, IQC)');

    // 關閉 View Dialog
    await page.locator('#routine-view-close').click();
    await page.waitForTimeout(300);

    // 測試「替換設備／標準移轉」視窗
    console.log('11. Testing Equipment Transfer Dialog...');
    await page.locator('[data-equipment-transfer]').first().click();
    await page.locator('.routine-transfer-dialog').waitFor();

    // 驗證原設備 vs 目標設備 對照網格
    assert.ok(await page.locator('.routine-transfer-compare-grid').isVisible(), 'Transfer compare grid must be visible');
    assert.ok(await page.locator('.routine-transfer-modules').isVisible(), 'Transfer modules list must be visible');

    // 選擇目標設備
    const targetEqSelect = page.locator('#routine-target-eq-select');
    await targetEqSelect.waitFor();
    const targetEqOpts = await targetEqSelect.locator('option').all();
    if (targetEqOpts.length > 1) {
      await targetEqSelect.selectOption({ index: 1 });
      await page.waitForTimeout(300);
      assert.ok(await page.locator('.routine-transfer-eq-card.target-selected').isVisible(), 'Target card should be selected');
    }

    // 關閉移轉視窗
    await page.locator('#routine-transfer-close').click();
    await page.waitForTimeout(300);

    // 截圖存證
    console.log('12. Taking screenshots for desktop and mobile verification...');
    await page.screenshot({
      path: require('./local-evidence-paths.cjs').configuredPath('PROCESS_ROUTINE_EVIDENCE_ROOT',"/routine-equipment-page-verified.png"),
      fullPage: false
    });

    // 手機版檢查
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const overflow = scrollWidth - clientWidth;
    assert.ok(overflow <= 1, `Mobile overflow must be <= 1px, got ${overflow}px`);

    await page.screenshot({
      path: require('./local-evidence-paths.cjs').configuredPath('PROCESS_ROUTINE_EVIDENCE_ROOT',"/routine-equipment-mobile-verified.png"),
      fullPage: false
    });

    await context.close();
    console.log('ALL INTEGRATION ACCEPTANCE CHECKS PASSED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
