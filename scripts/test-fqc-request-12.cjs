const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Local FQC automated test fixture. */
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
    await page.goto(`${base}/process/`);
    await page.locator('[data-quick-login="admin"]').waitFor();
    await page.locator('[data-quick-login="admin"]').click();
    await page.locator('#main-nav').waitFor();

    // 2. 前往資料後台 -> FQC
    await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-fqc`);
    await page.locator('.fqc-version-bar').waitFor();

    console.log('1. Checking page elements: Excel buttons removed, problems card exists...');
    // 確認 Excel 匯入/匯出按鈕已移除
    const importBtn = await page.$('#fqc-import');
    const exportBtn = await page.$('#fqc-export');
    assert.equal(importBtn, null, 'FQC Excel import button must be removed');
    assert.equal(exportBtn, null, 'FQC Excel export button must be removed');

    // 確認問題與待補卡片存在
    const problemsCard = await page.$('.fqc-problems-card');
    assert.ok(problemsCard, 'Problems card must exist');

    // 3. 開始修改草稿
    const beginBtn = await page.$('#fqc-begin');
    if (beginBtn) {
      await beginBtn.click();
      await page.waitForTimeout(600);
    }
    const saveBtn = await page.$('#fqc-save');
    assert.ok(saveBtn, 'Save draft button must be available in draft mode');

    console.log('2. Checking Error Code Modal (reason removed)...');
    await page.locator('#fqc-add-error').click();
    await page.locator('.fqc-modal').waitFor();
    const reasonInErrorModal = await page.$('[data-field-wrap="reason"]');
    assert.equal(reasonInErrorModal, null, 'Reason field in error code modal must be removed');
    await page.locator('.fqc-modal button[data-close]').first().click();
    await page.waitForTimeout(300);

    console.log('3. Checking Check Item Modal: Standard Status & Inspection Rule Card separated...');
    await page.locator('#fqc-add-item').click();
    await page.locator('.fqc-item-form').waitFor();

    // 確認「標準狀態」獨立存在
    const statusSection = await page.$('.fqc-status-section');
    assert.ok(statusSection, 'Standard status section must exist');

    // 確認「檢查規則卡片」存在且無月季年多選 checkbox
    const ruleCard = await page.$('.fqc-rule-card');
    assert.ok(ruleCard, 'Rule card must exist');
    const monthlyCheck = await page.$('input[name="monthly"]');
    assert.equal(monthlyCheck, null, 'Monthly checkbox must be removed');

    // 測試切換至「按批次」
    await page.locator('#fqc-rule-cadence').selectOption('batch');
    const batchSubwrapVisible = await page.locator('#fqc-batch-subwrap').isVisible();
    assert.equal(batchSubwrapVisible, true, 'Batch subwrap should be visible');

    // 取樣方式：固定件數 -> 驗證單位「件」
    await page.locator('#fqc-batch-kind').selectOption('fixed_count');
    const fixedWrapVisible = await page.locator('#fqc-batch-fixed-wrap').isVisible();
    assert.equal(fixedWrapVisible, true, 'Fixed count wrap should be visible');
    const unitTag = await page.locator('.fqc-unit-tag').first().innerText();
    assert.ok(unitTag.includes('件') || unitTag.includes('cái'), 'Unit tag must display 件 or cái');

    // 測試切換至「按時間」
    await page.locator('#fqc-rule-cadence').selectOption('time');
    const timeSubwrapVisible = await page.locator('#fqc-time-subwrap').isVisible();
    assert.equal(timeSubwrapVisible, true, 'Time subwrap should be visible');

    // 關閉彈窗
    await page.locator('.fqc-item-form button[data-close]').first().click();
    await page.waitForTimeout(300);

    console.log('4. Checking Item Table columns: 檢查規則 and 標準狀態...');
    const tableHeaders = await page.locator('.fqc-item-table th').allInnerTexts();
    assert.ok(tableHeaders.some(h => h.includes('檢查規則') || h.includes('Quy tắc kiểm tra')), 'Table must have 檢查規則 column');
    assert.ok(tableHeaders.some(h => h.includes('標準狀態') || h.includes('Trạng thái')), 'Table must have 標準狀態 column');

    console.log('5. Testing Mobile Viewport (390px)...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const overflow = scrollWidth - clientWidth;
    assert.ok(overflow <= 1, `Mobile overflow must be <= 1px, got ${overflow}px`);

    await page.screenshot({
      path: require('./local-evidence-paths.cjs').configuredPath('PROCESS_ROUTINE_EVIDENCE_ROOT',"/fqc-mobile-verified.png"),
      fullPage: false
    });
    console.log('Saved fqc-mobile-verified.png');

    // 切換回桌面尺寸截圖
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: require('./local-evidence-paths.cjs').configuredPath('PROCESS_ROUTINE_EVIDENCE_ROOT',"/fqc-desktop-verified.png"),
      fullPage: false
    });
    console.log('Saved fqc-desktop-verified.png');

    await context.close();
    console.log('ALL FQC ACCEPTANCE CHECKS PASSED!');
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
