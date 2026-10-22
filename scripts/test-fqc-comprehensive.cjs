const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtime = require('./browser-test-runtime.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || runtime.playwrightModule);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || runtime.browserExecutable, headless: true });
  const canonical = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/canonical/quality/fqc.json'), 'utf8'));
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db/seed.json'), 'utf8'));
  let revision = seed.revision || 20;
  const values = { ...seed.values, canonicalQuality: JSON.stringify({ fqc: canonical.records, iqc: [], ipqc: [] }) };
  const user = { id: 'admin', role: 'admin', name: 'Fixture Admin' };
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });

  await context.route('**/api/**', async route => {
    const request = route.request(), url = request.url();
    if (url.includes('/platform-login')) return route.fulfill({ json: { user } });
    if (!url.includes('/shared-state')) return route.fulfill({ json: { ok: true } });
    if (request.method() === 'GET') return route.fulfill({ json: { revision, values, identity: user, serverProtected: true, demoEnabled: true } });
    const body = request.postDataJSON();
    if (body.baseRevision !== revision) return route.fulfill({ status: 409, json: { revision, values } });
    Object.assign(values, body.updates); revision += 1;
    return route.fulfill({ json: { revision, values } });
  });

  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));

  console.log('1. Testing FQC initial page load...');
  await page.goto(`${runtime.localUrl()}/process/?system=quality&view=data&dataTab=quality-fqc`);
  await page.locator('#fqc-page').waitFor({ timeout: 10000 });
  assert.match(await page.locator('#fqc-page').innerText(), /FQC - V1/);

  console.log('2. Testing Section VIII: Tab Switching (FQC -> AB -> FQC -> BOM -> FQC)...');
  // Click AB tab
  await page.locator('[data-master-scope="AB"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-master-scope="AB"]').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#master-category-filter, #master-category').count() > 0, true, 'AB view rendered');

  // Click FQC tab again
  await page.locator('[data-quality-tab="quality-fqc"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-quality-tab="quality-fqc"]').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#fqc-page').count() > 0, true, 'FQC view re-rendered successfully after AB');

  // Click BOM tab
  await page.locator('[data-tab="bom"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-tab="bom"]').getAttribute('aria-selected'), 'true');

  // Click FQC tab again
  await page.locator('[data-quality-tab="quality-fqc"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-quality-tab="quality-fqc"]').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#fqc-page').count() > 0, true, 'FQC view re-rendered successfully after BOM');

  console.log('3. Testing Draft creation, Yearly & Custom period, Multi-photo with notes...');
  await page.locator('#fqc-begin').click();
  await page.locator('#fqc-save').waitFor();
  assert.match(await page.locator('#fqc-page').innerText(), /FQC - V2/);

  await page.locator('#fqc-category').selectOption('BORUAXE1021');
  const firstItem = page.locator('[data-edit-item]').first();
  await firstItem.click();

  // Verify modal elements
  assert.equal(await page.locator('.fqc-item-form').count(), 1);
  const checkNo = await page.locator('.fqc-item-form input[readonly]').inputValue();

  // Check yearly & custom period checkboxes
  const yearlyBox = page.locator('.fqc-item-form input[name="yearly"]');
  const customBox = page.locator('.fqc-item-form input[name="customPeriod"]');
  const customWrap = page.locator('#fqc-custom-wrap');
  const customInput = page.locator('#fqc-custom-text');

  assert.equal(await yearlyBox.isChecked(), false);
  assert.equal(await customBox.isChecked(), false);
  assert.equal(await customWrap.isVisible(), false);

  await yearlyBox.check();
  await customBox.check();
  assert.equal(await customWrap.isVisible(), true);
  await customInput.fill('每半年一次');

  // Multi-photo upload: upload 1st photo
  const testImg1 = path.join(__dirname, '..', 'KD/ui-reference/01_fqc_main_layout.png');
  const testImg2 = path.join(__dirname, '..', 'KD/ui-reference/03_modal_edit_check_item.png');

  await page.locator('.fqc-item-form input[name="photos"]').setInputFiles(testImg1);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.fqc-photo-card').count(), 1);
  await page.locator('[data-photo-note="0"]').fill('首圖備註：外觀主檢');

  // Upload 2nd photo (append, not overwrite)
  await page.locator('.fqc-item-form input[name="photos"]').setInputFiles(testImg2);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.fqc-photo-card').count(), 2, 'Appending photos preserves existing photo');
  assert.equal(await page.locator('[data-photo-note="0"]').inputValue(), '首圖備註：外觀主檢');
  await page.locator('[data-photo-note="1"]').fill('第二張備註：配件接頭');

  // Test reordering: Set 2nd photo as primary
  await page.locator('[data-photo-primary="1"]').click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('[data-photo-note="0"]').inputValue(), '第二張備註：配件接頭', 'Primary photo is now the 2nd photo');
  assert.equal(await page.locator('[data-photo-note="1"]').inputValue(), '首圖備註：外觀主檢');

  // Verify reason field is removed from item modal and submit succeeds without reason
  assert.equal(await page.locator('.fqc-item-form textarea[name="reason"]').count(), 0, 'Reason textarea must be removed from item modal');
  await page.locator('.fqc-item-form button[type="submit"]').click();
  await page.locator('.fqc-modal-overlay').waitFor({ state: 'detached' });

  // Verify persistence in shared state
  const control = JSON.parse(values.qualityMasterControl);
  const draft = control.libraries.fqc.versions.find(version => version.status === 'draft');
  const saved = draft.snapshot.items.find(item => item.checkNo === checkNo);
  assert.equal(saved.isYearly, true);
  assert.equal(saved.isCustomPeriod, true);
  assert.equal(saved.customPeriodText, '每半年一次');
  assert.equal(saved.mediaItems.length, 2);
  assert.equal(saved.mediaItems[0].note, '第二張備註：配件接頭');
  assert.equal(saved.mediaItems[1].note, '首圖備註：外觀主檢');

  console.log('4. Testing Thumbnail & Photo Viewer Modal (Section VI)...');
  // Re-render and find thumbnail button
  const thumbBtn = page.locator(`[data-view-item="${saved.id}"]`);
  assert.equal(await thumbBtn.count(), 1);
  assert.match(await thumbBtn.innerText(), /📷 2/);

  // Click thumbnail to open Photo Viewer
  await thumbBtn.click();
  await page.locator('.fqc-viewer-modal').waitFor();
  assert.match(await page.locator('.fqc-viewer-modal h2').innerText(), /1 \/ 2/);
  assert.equal(await page.locator('.fqc-viewer-note').innerText(), '第二張備註：配件接頭');

  // Press ArrowRight to view next photo
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  assert.match(await page.locator('.fqc-viewer-modal h2').innerText(), /2 \/ 2/);
  assert.equal(await page.locator('.fqc-viewer-note').innerText(), '首圖備註：外觀主檢');

  // Press Escape to close modal
  await page.keyboard.press('Escape');
  await page.locator('.fqc-viewer-modal').waitFor({ state: 'detached' });

  console.log('5. Testing Reason Retention & Unsaved Input Protection on Language Switch (Section II & III)...');
  // Open item modal again and verify reason is still absent
  await firstItem.click();
  assert.equal(await page.locator('.fqc-item-form textarea[name="reason"]').count(), 0, 'Reason textarea absent on reopen');

  // Test typing unsaved form content, switching language, and verifying it is NOT cleared
  await page.locator('.fqc-item-form input[name="tool"]').fill('特製雷射測距儀 (Unsaved tool)');
  await page.evaluate(() => document.querySelector('.top-actions .language-switch')?.click());
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'vi');
  // Form input still retains unsaved user text
  assert.equal(await page.locator('.fqc-item-form input[name="tool"]').inputValue(), '特製雷射測距儀 (Unsaved tool)');
  // Check modal text is translated without splicing
  const modalText = await page.locator('.fqc-item-form').innerText();
  assert.equal(modalText.includes('Kiểm tra項目'), false, 'No Kiểm tra項目 splice in modal');
  assert.match(modalText, /Hạng mục kiểm tra/);
  // Switch back to Chinese
  await page.evaluate(() => document.querySelector('.top-actions .language-switch')?.click());
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'zh-Hant');
  assert.equal(await page.locator('.fqc-item-form input[name="tool"]').inputValue(), '特製雷射測距儀 (Unsaved tool)');
  // Close modal without saving
  await page.locator('.fqc-item-form [data-close]').last().click();

  console.log('6. Testing Vietnamese & Chinese Language Switch on Main Page (Section III)...');
  const langSwitch = page.locator('.top-actions .language-switch');
  await langSwitch.click();
  await page.waitForTimeout(400);

  // Check language changed to Vietnamese
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'vi');
  const pageText = await page.locator('#fqc-page').innerText();
  // Ensure NO spliced translations
  assert.equal(pageText.includes('Kiểm tra項目'), false, 'No Kiểm tra項目 splice on main page');
  assert.equal(pageText.includes('Thay đổi理由'), false, 'No Thay đổi理由 splice on main page');
  assert.match(pageText, /Mã lỗi/);
  assert.match(pageText, /Hạng mục kiểm tra/);

  // Switch back to Chinese
  await langSwitch.click();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'zh-Hant');

  console.log('7. Testing Excel Roundtrip with new fields (Section VII)...');
  await page.evaluate(() => {
    XLSX.writeFile = (workbook, fileName) => {
      window.__fqcExport = {
        fileName,
        sheetNames: workbook.SheetNames,
        bytes: XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }).byteLength,
        checkItemsSheet: XLSX.utils.sheet_to_json(workbook.Sheets['檢查項目']),
        photosSheet: XLSX.utils.sheet_to_json(workbook.Sheets['照片資料'])
      };
    };
  });
  await page.locator('#fqc-export').click();
  await page.waitForTimeout(300);
  const exported = await page.evaluate(() => window.__fqcExport);
  assert.ok(exported);
  assert.deepEqual(exported.sheetNames, ['FQC格式說明', '錯誤代碼', '檢查項目', '照片資料', '適用產品', '操作紀錄']);

  // Find saved item in exported sheet
  const exportedItem = exported.checkItemsSheet.find(row => row.FQC檢查編號 === checkNo);
  assert.ok(exportedItem, 'Saved item must be in exported Excel');
  assert.equal(exportedItem['年檢查'], 'YES');
  assert.equal(exportedItem['自訂檢查週期'], 'YES');
  assert.equal(exportedItem['自訂週期內容'], '每半年一次');

  // Verify photos sheet contains notes and chunks for both photos
  const exportedPhotos = exported.photosSheet.filter(row => row.檢查項目ID === saved.id);
  const distinctPhotoIds = new Set(exportedPhotos.map(row => row.圖片ID));
  assert.equal(distinctPhotoIds.size, 2, 'Must export exactly 2 photos');
  const photo1Row = exportedPhotos.find(row => row.圖片ID === saved.mediaItems[0].id);
  const photo2Row = exportedPhotos.find(row => row.圖片ID === saved.mediaItems[1].id);
  assert.equal(photo1Row['備註'], '第二張備註：配件接頭');
  assert.equal(photo2Row['備註'], '首圖備註：外觀主檢');

  console.log('8. Testing Old Excel Import does NOT clear existing yearly/custom/media fields (Section VII)...');
  await page.evaluate(async (checkNoToTest) => {
    const oldWb = XLSX.utils.book_new();
    const productData = [
      ['產品類別', '錯誤代碼', '錯誤名稱', '檢查編號', '檢查項目', '檢查方式敘述', '', '檢查工具', '季檢查', '適用產品', '啟用', '版本', '版本日期', '變更理由', '', '備註'],
      ['BORUAXE1021', 'BORUAXE1021-FQC-L01', 'Ngoại quan', checkNoToTest, '更新後的名稱', '更新後敘述', '', '目視', 'YES', '105B100051', 'YES', 'V1.0', '2026-09-20', '更新', '', '測試備註']
    ];
    const categoryData = [
      ['線別', '產品類別'],
      ['A', 'BORUAXE1021']
    ];
    XLSX.utils.book_append_sheet(oldWb, XLSX.utils.aoa_to_sheet(productData), '產品資料');
    XLSX.utils.book_append_sheet(oldWb, XLSX.utils.aoa_to_sheet(categoryData), '產品類別');
    const u8 = XLSX.write(oldWb, { type: 'array', bookType: 'xlsx' });
    const file = new File([u8], 'old-fqc.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const origConfirm = window.confirm;
    window.confirm = () => true;
    try {
      const input = document.querySelector('#fqc-import-input');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
    } finally {
      window.confirm = origConfirm;
    }
  }, checkNo);

  const afterImportItem = await page.evaluate((cNo) => {
    const v = window.FQCMasterUI.control.libraries.fqc.versions.find(x => x.status === 'draft');
    return v.snapshot.items.find(it => it.checkNo === cNo);
  }, checkNo);

  assert.ok(afterImportItem, 'Item must still exist after old Excel import');
  assert.equal(afterImportItem.isYearly, true, 'isYearly must be preserved when importing old Excel');
  assert.equal(afterImportItem.isCustomPeriod, true, 'isCustomPeriod must be preserved when importing old Excel');
  assert.equal(afterImportItem.customPeriodText, '每半年一次', 'customPeriodText must be preserved');
  assert.equal(afterImportItem.mediaItems.length, 2, 'mediaItems must be preserved when importing old Excel');

  await browser.close();
  console.log('ALL COMPREHENSIVE FQC CHECKS PASSED SUCCESSFULLY!');
})().catch(error => {
  console.error('TEST ERROR:', error);
  process.exitCode = 1;
});
