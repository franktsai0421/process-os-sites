import {createRequire as __esmFactory} from 'node:module';
import {fileURLToPath as __esmPath} from 'node:url';
const __esmOldFilename=__esmPath(new URL("./test-routine-browser.cjs",import.meta.url));
const __esmRequire=__esmFactory(__esmOldFilename);
const isolatedTestTarget_20261010=__esmRequire('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Isolated Local browser fixture. */
const assert = __esmRequire('node:assert/strict');
const fs = __esmRequire('node:fs');
const path = __esmRequire('node:path');
const { chromium } = __esmRequire('playwright');

const base = isolatedTestTarget_20261010;
const artifactDir = path.resolve('.wrangler/local-only/routine-browser');
fs.mkdirSync(artifactDir, { recursive: true });
function getFreshFixture() {
  const source = JSON.parse(fs.readFileSync('public/process/routine-source.json', 'utf8'));
  const now = new Date().toISOString();
  const version = { id: 'fixture-routine-v1', number: 1, status: 'draft',
    equipment: JSON.parse(JSON.stringify(source.equipment)),
    groups: JSON.parse(JSON.stringify(source.groups)),
    issues: JSON.parse(JSON.stringify(source.issues)),
    creatorId: 'demo-admin', creatorName: 'Demo admin',
    createdAt: now, updatedAt: now, revision: 1, history: [] };
  const control = { schemaVersion: 1, activeVersionId: null, versions: [version], source: null,
    issues: JSON.parse(JSON.stringify(source.issues)), reservedMarks: {} };
  return { control, version, revision: 7 };
}

async function check(browser, width, height, mobile) {
  const fixture = getFreshFixture();
  const { control, version } = fixture;
  let { revision } = fixture;
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/process/`);
  await page.locator('[data-quick-login="admin"]').waitFor();
  await page.locator('[data-quick-login="admin"]').click();
  await page.locator('#main-nav').waitFor();
  const photoId = 'a'.repeat(64);
  page.route('**/api/routine-equipment/photo**', route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: photoId }) })
    : route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/m7sAAAAASUVORK5CYII=', 'base64') }));
  await page.route('**/api/routine-equipment', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision, control }) });
    const body = route.request().postDataJSON();
    if (body.baseRevision !== revision) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'fixture conflict' }) });
    if (body.action === 'save' || body.action === 'workbookImport') {
      Object.assign(version, body.snapshot);
      version.revision += 1; revision += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision, control }) });
    }
    if (body.action === 'submit') {
      const target = version.equipment.find(item => String(item.calibrationMethod).startsWith('外部校正'));
      return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: '送審檢查未通過',
        errors: ['日期必填'], problems: [{ id: target.id, field: 'calibratedAt', message: '日期必填' }] }) });
    }
    return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'fixture unsupported action' }) });
  });
  await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-routine-equipment`);
  try { await page.locator('.routine-page .routine-count').waitFor({ timeout: 10000 }); }
  catch (error) { console.error('routine debug', { url: page.url(), text: (await page.locator('body').innerText()).slice(0, 1800), errors }); throw error; }
  assert.match(await page.locator('.routine-count').innerText(), /119/);
  assert.equal(await page.locator('[data-node-select="category"]').count() > 0, true);
  await page.locator('#routine-search').click();
  await page.keyboard.type('g7t');
  assert.equal(await page.locator('#routine-search').inputValue(), 'g7t');
  assert.equal(await page.locator('#routine-search').evaluate(input => document.activeElement === input), true);
  assert.equal(await page.locator('.routine-equipment-list [data-equipment-select]').count() > 0, true);
  await page.locator('#routine-search').fill('');

  // 1. Group click does NOT open equipment editor
  await page.locator('[data-node-select="category"]').first().click();
  await page.locator('[data-node-select="subcategory"]').first().click();
  await page.locator('[data-node-select="group"]').first().click();
  assert.equal(await page.locator('#routine-editor').count(), 0, 'Clicking group card must NOT open equipment editor');
  assert.equal(await page.locator('#routine-add').isEnabled(), true);

  // 2. Equipment card body click only selects card, does NOT open editor
  await page.locator('.routine-equipment-list .routine-equipment-select').first().click();
  assert.equal(await page.locator('#routine-editor').count(), 0, 'Clicking equipment card body must NOT open editor');
  assert.equal(await page.locator('.routine-equipment-card.active').count(), 1, 'Card should be active');

  // 3. Equipment card "修改" opens editor
  await page.locator('.routine-equipment-list [data-equipment-edit]').first().click();
  await page.locator('#routine-editor').waitFor();
  const original = await page.locator('[data-field="name"]').inputValue();
  const edited = `${original} TEST`;
  await page.locator('[data-field="name"]').fill(edited);
  const groupBeforeLanguage = await page.locator('#routine-edit-group').inputValue();
  if (!mobile) {
    await page.locator('#routine-photo-input').setInputFiles({ name: 'fixture.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/m7sAAAAASUVORK5CYII=', 'base64') });
    assert.match(await page.locator('.routine-photo-field img').getAttribute('src'), /^blob:/);
  }
  await page.locator('#routine-language-toggle').click();
  assert.equal(await page.locator('[data-field="name"]').inputValue(), edited);
  assert.equal(await page.locator('#routine-edit-group').inputValue(), groupBeforeLanguage);
  assert.match(await page.locator('[data-field="assetCode"]').locator('..').innerText(), /Mã TSCĐ/);
  assert.equal(await page.locator('#routine-form-apply').innerText(), 'Áp dụng sửa đổi');
  assert.equal(await page.locator('[data-field="spec"]').count(), 1);
  if (mobile) {
    await page.screenshot({ path: path.join(artifactDir, 'drawer-mobile-after.png') });
  }
  await page.locator('#routine-form-apply').click();
  assert.equal(await page.locator('#routine-editor').count(), 0);
  await page.locator('#routine-save').click();
  await page.locator('.routine-message').filter({ hasText: /後端已保存|Máy chủ đã lưu/ }).first().waitFor();
  assert.equal(version.equipment.some(item => item.name === edited), true);
  if (!mobile) assert.equal(version.equipment.find(item => item.name === edited).photoId, photoId);

  await page.reload();
  await page.locator('.routine-page .routine-count').waitFor();
  assert.equal(await page.locator('.routine-count').innerText().then(text => text.includes('119')), true);

  if (!mobile) {
    // Verify 3 removed features
    assert.equal(await page.locator('#routine-export').count(), 0, 'Export button must be removed');
    assert.equal(await page.locator('#routine-blank-template').count(), 0, 'Blank template button must be removed');
    assert.equal(await page.locator('#routine-import-template').count(), 0, 'Import template button must be removed');

    // Verify card action buttons are compact
    const btnBox = await page.locator('.routine-node-actions button').first().boundingBox();
    assert.ok(btnBox && btnBox.height <= 32, `Button height should be compact <= 32px, got ${btnBox?.height}`);

    // Select group and capture equipment card with action buttons screenshot
    await page.locator('[data-node-select="category"]').first().click();
    await page.locator('[data-node-select="subcategory"]').first().click();
    await page.locator('[data-node-select="group"]').first().click();
    await page.locator('.routine-equipment-card').first().waitFor();
    await page.locator('#routine-list-card').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifactDir, 'equipment-cards-actions.png') });

    // 4. Test Add Equipment all-in-one flow
    await page.locator('#routine-add').click();
    await page.locator('#routine-add-modal').waitFor();
    await page.screenshot({ path: path.join(artifactDir, 'form-add-equipment.png') });

    // Test dynamic piece mark
    await page.locator('#routine-add-asset-code').fill('G7T999');
    const markVal = await page.locator('#routine-add-piece-mark-input').inputValue();
    assert.ok(markVal.length >= 2, 'Piece mark should be auto-computed');

    await page.locator('#routine-add-name').fill('高精度數位分厘卡測試品');
    await page.locator('#routine-add-unit').selectOption('支');
    await page.locator('#routine-add-owner').fill('品保量測室');
    await page.locator('#routine-add-calibration-method').selectOption('internal');
    await page.locator('#routine-add-calibration-cycle').selectOption('halfyear');
    await page.locator('#routine-add-calibrated-at').fill('2026-09-01');
    await page.locator('#routine-add-expires-at').fill('2027-03-01');
    await page.locator('#routine-add-notes').fill('本機自動驗收新增項目');

    // Click submit
    await page.locator('#routine-add-submit').click();
    await page.locator('#routine-add-modal').waitFor({ state: 'detached' });
    await page.locator('.routine-message').filter({ hasText: /已新增檢具至本頁草稿|Đã thêm thiết bị vào bản nháp/ }).waitFor();

    // Verify newly added equipment appears in list and is active
    const newCard = page.locator('.routine-equipment-card.active');
    assert.ok(await newCard.innerText().then(t => t.includes('G7T999')), 'New card must show G7T999');

    // Click "修改" on newly added equipment -> opens drawer with all inputs intact
    await newCard.locator('[data-equipment-edit]').click();
    await page.locator('#routine-editor').waitFor();
    assert.equal(await page.locator('[data-field="name"]').inputValue(), '高精度數位分厘卡測試品');
    assert.equal(await page.locator('[data-select="unit"]').inputValue(), '支');
    assert.equal(await page.locator('[data-field="calibratedAt"]').inputValue(), '2026-09-01');
    await page.locator('#routine-close').click();
    await page.locator('#routine-editor').waitFor({ state: 'detached' });

    // Save draft
    await page.locator('#routine-save').click();
    await page.locator('.routine-message').filter({ hasText: /後端已保存|Máy chủ đã lưu/ }).first().waitFor();

    // 5. Test Deletion with two-step confirmation
    let dialogCount = 0;
    page.on('dialog', async dialog => {
      dialogCount++;
      await dialog.accept();
    });

    // Delete newly created equipment (should succeed after 2 confirmations)
    dialogCount = 0;
    const addedCard = page.locator('.routine-equipment-card', { hasText: 'G7T999' });
    await addedCard.locator('[data-equipment-delete]').click();
    assert.equal(dialogCount, 2, 'Should require 2 confirmations to delete equipment');
    await page.locator('.routine-message').filter({ hasText: /已從目前草稿刪除|Đã xóa.*khỏi bản nháp hiện tại/ }).waitFor();
    assert.equal(await page.locator('.routine-equipment-card', { hasText: 'G7T999' }).count(), 0);

    // 6. Test delete blocking when node has children
    const catWithChild = page.locator('[data-node-select="category"]').first();
    const catId = await catWithChild.getAttribute('data-id');
    await page.locator(`[data-node-delete="category"][data-id="${catId}"]`).click();
    await page.locator('.routine-message').filter({ hasText: /下階已有資料，故不能刪除|Không thể xóa vì cấp dưới đã có dữ liệu/ }).waitFor();

    // 7. Add empty category, subcategory, group and test 2-step delete
    async function addNode(kind, name) {
      await page.locator(`[data-node-add="${kind}"]`).click();
      await page.locator('#routine-dialog-name').waitFor();
      await page.locator('#routine-dialog-name').fill(name);
      if (kind === 'group') await page.locator('#routine-dialog-spec').fill('空規格');
      await page.locator('#routine-dialog-confirm').click();
      await page.locator('#routine-node-dialog-backdrop').waitFor({ state: 'detached' });
    }
    await addNode('category', '空類別驗證');
    assert.equal(await page.locator('[data-node-select="category"].active').count(), 1);
    await addNode('subcategory', '空子類別驗證');
    await addNode('group', '空群組驗證');

    // Deleting empty group requires 2 confirmations
    dialogCount = 0;
    const activeGroupNode = page.locator('.routine-groups .routine-node', { hasText: '空群組驗證' });
    await activeGroupNode.locator('[data-node-delete="group"]').click();
    assert.equal(dialogCount, 2, 'Should require 2 confirmations to delete empty group');
    await page.locator('.routine-message').filter({ hasText: /已從目前草稿刪除|Đã xóa.*khỏi bản nháp hiện tại/ }).waitFor();

    // Search and submit validation check
    await page.locator('#routine-search').fill('g7t001');
    assert.ok(await page.locator('.routine-equipment-list [data-equipment-select]').count() > 0, 'search must span all categories');
    await page.locator('#routine-submit').click();
    await page.locator('[data-fix-equipment]').first().click();
    assert.equal(await page.locator('[data-field="calibratedAt"]').evaluate(input => document.activeElement === input), true);
  }
  const overflow = await page.locator('.routine-page').evaluate(element => element.scrollWidth - element.clientWidth);
  assert.ok(overflow <= 1, `routine page overflow ${overflow}px at ${width}px`);
  assert.deepEqual(errors, []);
  await context.close();
  return { width, searchFocus: true, languageValue: true, saveReload: true, photoSave: !mobile, hierarchy: !mobile, overflow };
}

async function checkRealLocal(browser) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 850 } });
  const page = await context.newPage();
  await page.goto(`${base}/process/`);
  await page.locator('[data-quick-login="admin"]').waitFor();
  await page.locator('[data-quick-login="admin"]').click();
  await page.locator('#main-nav').waitFor();
  await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-routine-equipment`);
  await page.locator('.routine-count').waitFor();
  const count = await page.locator('.routine-count').innerText();
  const versionStatus = await page.locator('.routine-status').innerText();
  const nav = await page.locator('#main-nav').isVisible();
  const issueCount = await page.locator('.routine-issues > div').count();
  assert.ok(nav, 'left navigation should remain visible');
  assert.match(count, /\d+ 筆設備/);
  assert.equal(issueCount, 37);
  await context.close();
  return { equipment: count, versionStatus, issues: issueCount, navigationVisible: nav };
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel:'chrome' });
  try { console.log(JSON.stringify({ desktop: await check(browser, 1440, 900, false), mobile: await check(browser, 390, 844, true), localReadOnly: await checkRealLocal(browser) })); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
