const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Local read-only browser fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');

const base = isolatedTestTarget_20261010;
const real = process.env.IQC_REAL === '1';
const source = JSON.parse(fs.readFileSync('public/process/iqc-source.json', 'utf8'));
const snapshot = source.snapshot;
if (!real) {
  snapshot.categories = Array.from({ length: 8 }, (_, index) => ({ id: `fixture-${index}`, nameVi: `Nhóm thử ${index}` }));
  snapshot.parts.forEach((part, index) => { part.categoryId = snapshot.categories[index % 8].id; });
  snapshot.parts[0].photos.push(structuredClone(snapshot.parts[1].photos[0]));
  const equipmentSnapshot = { id: 'eq-1', assetCode: 'G7T017', pieceMark: '01', name: 'Dưỡng thử', spec: '10 mm' };
  for (const item of snapshot.items.slice(0, 2)) {
    item.inspectionMode = 'equipment'; item.equipmentId = 'eq-1'; item.equipmentSnapshot = equipmentSnapshot;
  }
  snapshot.items[2].toolVi = 'G7T017'; // A matching legacy text is not a confirmed third link.
  snapshot.items[0].mediaItems = snapshot.parts[0].photos.slice(0, 2).map((photo, index) =>
    ({ ...structuredClone(photo), note: `Item photo ${index + 1}` }));
  snapshot.errors.push({ id: 'fixture-empty-error', partCode: snapshot.parts[0].code,
    code: `${snapshot.parts[0].code}-IQC-L999`, nameVi: 'Lỗi thử không có hạng mục' });
}
const version = { id: 'fixture-version', number: 1, status: 'draft', snapshot,
  creatorId: 'demo-admin', creatorName: 'Demo admin', createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(), revision: 1, baseVersionId: null, history: [] };
const control = { schemaVersion: 1, activeVersionId: null, versions: [version],
  source: { fileName: source.fileName, sha256: source.sha256, mappingSha256: 'a'.repeat(64) },
  issues: source.issues, reservedErrorCodes: [], reservedCheckNos: [] };

async function cancelsOnlyAfterTwoPrompts(page, action) {
  let prompts = 0;
  const handler = async dialog => { prompts += 1; if (prompts === 1) await dialog.accept(); else await dialog.dismiss(); };
  page.on('dialog', handler);
  try { await action(); } finally { page.off('dialog', handler); }
  assert.equal(prompts, 2);
}

async function check(browser, width, height, mobile) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  await page.goto(`${base}/process/`);
  await page.locator('[data-quick-login=admin]').click();
  await page.waitForURL('**/process/?**');
  const fixture = structuredClone(control);
  let fixtureRevision = 1;
  if (!real) await page.route('**/api/iqc', route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify({ revision: fixtureRevision, control: fixture }) });
    const body = route.request().postDataJSON();
    const current = fixture.versions.find(version => version.id === body.versionId) || fixture.versions[0];
    if (body.baseRevision !== fixtureRevision ||
        (body.versionRevision && body.versionRevision !== current.revision)) return route.abort();
    if (body.action === 'save' || body.action === 'submit') {
      current.snapshot = body.snapshot;
      if (body.action === 'submit') { current.status = 'pending'; current.submittedBy = 'Demo admin'; current.submittedAt = new Date().toISOString(); }
    } else if (body.action === 'reject' || body.action === 'approve') {
      current.status = body.action === 'reject' ? 'draft' : 'approved';
      current.reviewedBy = 'Demo admin'; current.reviewedAt = new Date().toISOString(); current.reviewComment = body.comment;
      if (body.action === 'approve') fixture.activeVersionId = current.id;
    } else if (body.action === 'begin') {
      fixture.versions.push({ ...structuredClone(current), id: 'fixture-version-2', number: 2,
        status: 'draft', baseVersionId: current.id, revision: 1, history: [], reviewedBy: undefined,
        reviewedAt: undefined, reviewComment: undefined });
    } else return route.abort();
    current.revision += 1;
    fixtureRevision += 1;
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ revision: fixtureRevision, control: fixture }) });
  });
  if (!real) await page.route('**/api/routine-equipment', route => route.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify({ control: {
      activeVersionId: 'eq-version', versions: [{ id: 'eq-version', status: 'approved',
        categories: [{ id: 'cat-1', code: 'C02', name: 'Dưỡng kiểm' }, { id: 'cat-2', code: 'C03', name: 'Thiết bị khác' }],
        subcategories: [{ id: 'sub-1', categoryId: 'cat-1', name: 'Dưỡng vòng' }],
        groups: [{ id: 'group-1', categoryId: 'cat-1', subcategoryId: 'sub-1', name: 'M10' }],
        equipment: [{ ...snapshot.items[0].equipmentSnapshot, categoryId: 'cat-1', subcategoryId: 'sub-1', groupId: 'group-1', enabled: true },
          { id: 'eq-2', assetCode: 'G7T017-1', pieceMark: '02', name: 'Dưỡng vòng khác', spec: 'M12', categoryId: 'cat-1', subcategoryId: 'sub-1', groupId: 'group-1', enabled: true },
          { id: 'eq-off', assetCode: 'OFF', pieceMark: '01', name: 'Không dùng', spec: '', categoryId: 'cat-2', enabled: false }] }],
    } }) }));
  if (!real) {
    const isolatedPhotos = new Map();
    await page.route('**/api/iqc/photo*', route => {
      if (route.request().method() === 'PUT') {
        const bytes = route.request().postDataBuffer();
        const id = createHash('sha256').update(bytes).digest('hex');
        isolatedPhotos.set(id, bytes);
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ id, url: `/api/iqc/photo?id=${id}` }) });
      }
      const id = new URL(route.request().url()).searchParams.get('id');
      if (isolatedPhotos.has(id)) return route.fulfill({ status: 200, contentType: 'image/png',
        body: isolatedPhotos.get(id) });
      return route.continue();
    });
  }
  await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-iqc`);
  await page.locator('#iqc-page .iqc-part').first().waitFor();
  assert.equal(await page.locator('#iqc-page .iqc-part').count(), 187);
  if (real) {
    await page.locator('.iqc-part-thumb[src]').first().evaluate(img => img.decode());
    assert.ok(await page.locator('.iqc-part-thumb[src]').first().evaluate(img => img.naturalWidth > 0));
  }
  const first = snapshot.parts[0];
  await page.locator('#iqc-search').click();
  await page.keyboard.press('3');
  assert.equal(await page.locator('#iqc-search').inputValue(), '3', 'single key must not duplicate');
  await page.keyboard.press('Backspace');
  assert.equal(await page.locator('#iqc-search').inputValue(), '');
  await page.keyboard.type('3010202');
  assert.equal(await page.locator('#iqc-search').inputValue(), '3010202');
  await page.locator('#iqc-search').fill('');
  await page.keyboard.insertText('đ');
  assert.equal(await page.locator('#iqc-search').inputValue(), 'đ');
  await page.locator('#iqc-search').fill(first.code);
  assert.equal(await page.locator('#iqc-page .iqc-part').count(), 1);
  await page.locator('[data-select-part]').click();
  assert.ok((await page.locator('.iqc-detail').innerText()).includes(first.code));
  const details = page.locator('.iqc-detail [data-item-details]');
  assert.ok(await details.count() > 0);
  if (!real) {
    await details.first().locator('summary').click();
    await details.first().locator('.iqc-item-photo-line button').click();
    assert.match(await page.locator('.iqc-lightbox').innerText(), /1 \/ 2/);
    await page.locator('#iqc-photo-next').click();
    assert.match(await page.locator('.iqc-lightbox').innerText(), /2 \/ 2/);
    await page.locator('#iqc-photo-close').click();
    const refs = await page.evaluate(() => window.RoutineEquipmentUI.getEquipmentReferences('eq-1', { refresh: true }));
    assert.equal(refs.iqc.draft.length, 2, 'two IQC items must remain separate formal equipment references');
  }
  await details.first().locator('summary').click();
  assert.equal(await details.first().getAttribute('open'), null);
  await page.locator('#iqc-search').fill('3030912');
  assert.ok((await page.locator('.iqc-part').innerText()).includes('無圖'));
  await page.locator('#iqc-search').fill('3040117');
  assert.ok((await page.locator('.iqc-part').innerText()).includes('無圖'));
  await page.locator('#iqc-search').fill('');
  await page.locator('[data-photo-part]').first().click();
  await page.locator('.iqc-lightbox img').evaluate(img => img.decode());
  assert.ok(await page.locator('.iqc-lightbox img').evaluate(img => img.naturalWidth > 0));
  await page.locator('#iqc-photo-next').click();
  await page.locator('#iqc-photo-close').click();
  const supplier = snapshot.parts.find(part => part.supplierIds.length)?.supplierIds[0];
  await page.locator('#iqc-supplier').selectOption(supplier);
  assert.ok(await page.locator('.iqc-part').count() < 187);
  await page.locator('#iqc-search').fill(first.code);
  await page.locator('#iqc-category').selectOption(first.categoryId);
  assert.equal(await page.locator('#iqc-search').inputValue(), first.code);
  assert.equal(await page.locator('.iqc-part').count(), 1, 'search and both filters must combine');
  await page.locator('#iqc-search').fill('');
  await page.locator('#iqc-supplier').selectOption('');
  await page.locator('#iqc-category').selectOption(snapshot.categories[0].id);
  assert.ok(await page.locator('.iqc-part').count() < 187);
  await page.locator('#iqc-category').selectOption('');
  if (real) await page.locator('.iqc-part-thumb[src]').first().evaluate(img => img.decode());
  if (process.env.IQC_SCREENSHOT_DIR)
    await page.screenshot({ path: path.join(process.env.IQC_SCREENSHOT_DIR,
      mobile ? 'iqc-populated-mobile.png' : 'iqc-populated-desktop.png'), fullPage: true });
  await page.locator('.top-actions .language-switch').click();
  assert.ok((await page.locator('#iqc-page').innerText()).includes('Danh sách linh kiện'));
  assert.ok((await page.locator('#iqc-page').innerText()).includes(first.nameVi));
  if (!mobile) {
    await page.locator('#iqc-manage-suppliers').click();
    if (process.env.IQC_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.IQC_SCREENSHOT_DIR, 'iqc-registry-desktop.png') });
    const supplierSearch = page.locator('#iqc-list-search');
    const supplierRows = page.locator('.iqc-dialog [data-row-id]');
    const totalSuppliers = await supplierRows.count();
    await supplierSearch.fill('DỨT THÀNH');
    assert.ok(await page.locator('.iqc-dialog [data-row-id]:visible').count() < totalSuppliers);
    await page.locator('#iqc-list-new').fill('NHÀ CUNG CẤP THỬ');
    await page.locator('#iqc-list-add').click();
    await supplierSearch.fill('');
    await cancelsOnlyAfterTwoPrompts(page, () => page.locator('.iqc-dialog [data-row-id]').filter({ hasText: 'NHÀ CUNG CẤP THỬ' }).locator('[data-row-remove]').click());
    await page.locator('.iqc-dialog [data-close]').first().click();
    await page.locator('#iqc-manage-categories').click();
    await page.locator('#iqc-list-search').fill(snapshot.categories[0].nameVi);
    assert.equal(await page.locator('.iqc-dialog [data-row-id]:visible').count(), 1);
    await page.locator('#iqc-list-new').fill('NHÓM THỬ');
    await page.locator('#iqc-list-add').click();
    await page.locator('#iqc-list-search').fill('');
    await cancelsOnlyAfterTwoPrompts(page, () => page.locator('.iqc-dialog [data-row-label]').getByText('NHÓM THỬ', { exact: true }).locator('..').locator('[data-row-remove]').click());
    await page.locator('.iqc-dialog [data-close]').first().click();
    await cancelsOnlyAfterTwoPrompts(page, () => page.locator('[data-delete-part]').first().click());
    await page.locator('[data-edit-part]').first().click();
    if (process.env.IQC_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.IQC_SCREENSHOT_DIR, 'iqc-part-editor-desktop.png') });
    await cancelsOnlyAfterTwoPrompts(page, () => page.locator('[data-supplier-remove="0"]').click());
    if (!real) {
      const secondPhoto = await page.locator('.iqc-photo-edit img').nth(1).getAttribute('src');
      await page.locator('[data-photo-down="0"]').click();
      assert.equal(await page.locator('.iqc-photo-edit img').first().getAttribute('src'), secondPhoto);
    }
    await cancelsOnlyAfterTwoPrompts(page, () => page.locator('[data-photo-remove="0"]').click());
    await page.locator('.iqc-dialog [data-close]').first().click();
    const errorCount = await page.locator('[data-delete-error]').count();
    await page.locator('[data-delete-error]').first().click();
    assert.equal(await page.locator('[data-delete-error]').count(), errorCount);
    if (!real) {
      await page.locator('[data-select-error="fixture-empty-error"]').click();
      await cancelsOnlyAfterTwoPrompts(page, () => page.locator('[data-delete-error="fixture-empty-error"]').click());
      await page.locator('[data-select-error]').first().click();
    }
    await page.locator('[data-item-details]').first().locator('summary').click();
    await cancelsOnlyAfterTwoPrompts(page, () => page.locator('[data-delete-item]').first().click());
    await page.locator('[data-edit-item]').first().click();
    if (!real) {
      assert.equal(await page.locator('input[name=isEnabled]').isChecked(), true);
      assert.equal(await page.locator('input[name=inspectionMode][value=equipment]').isChecked(), true);
      assert.match(await page.locator('#iqc-selected-equipment').innerText(), /G7T017/);
      await page.locator('#iqc-equipment-change').click();
      await page.locator('#iqc-picker-list .iqc-picker-item').first().waitFor();
      assert.equal(await page.locator('#iqc-picker-list .iqc-picker-item').count(), 2);
      await page.locator('#iqc-picker-category').selectOption('cat-2');
      assert.equal(await page.locator('#iqc-picker-list .iqc-picker-item').count(), 1);
      assert.equal(await page.locator('[data-iqc-select-equipment=eq-off]').isDisabled(), true);
      await page.locator('#iqc-picker-category').selectOption('cat-1');
      await page.locator('#iqc-picker-subcategory').selectOption('sub-1');
      await page.locator('#iqc-picker-group').selectOption('group-1');
      await page.locator('#iqc-picker-search').fill('G7T017-1');
      assert.equal(await page.locator('#iqc-picker-list .iqc-picker-item').count(), 1);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.iqc-dialog-overlay').count(), 1, 'Escape closes only the picker');
      assert.match(await page.locator('#iqc-selected-equipment').innerText(), /G7T017/);
      await page.locator('#iqc-equipment-change').click();
      await page.locator('#iqc-picker-search').fill('G7T017-1');
      await page.locator('[data-iqc-select-equipment=eq-2]').click();
      assert.match(await page.locator('#iqc-selected-equipment').innerText(), /G7T017-1/);
      await page.locator('#iqc-equipment-change').click();
      await page.locator('[data-iqc-select-equipment=eq-1]').click();
      assert.equal(await page.locator('.iqc-dialog-overlay').count(), 1);
      assert.equal(await page.locator('#iqc-item-photo-list .iqc-photo-edit').count(), 2);
    }
    assert.ok(await page.locator('textarea[name=methodVi]').isVisible());
    assert.equal(await page.locator('textarea[name=inspectionSpecVi]').count(), 0);
    assert.equal(await page.locator('input[name=toolVi]').count(), 0);
    assert.equal(await page.locator('[data-rule-cadence]').count(), 0);
    assert.equal(await page.locator('#iqc-source-rule-pending').count(), 0);
    assert.equal(await page.locator('#iqc-item-form').getByText('原始 Excel', { exact: true }).count(), 0);
    if (process.env.IQC_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.IQC_SCREENSHOT_DIR, 'iqc-rules-desktop.png') });
    await page.locator('#iqc-rule-add').click();
    await page.locator('[data-rule-cadence="1"]').selectOption('batch');
    assert.equal(await page.locator('[data-rule-value="1"]').isVisible(), true);
    for (const kind of ['fixed_count','batch_quantity','custom']) {
      await page.locator('[data-rule-kind="1"]').selectOption(kind);
      assert.equal(await page.locator('[data-rule-value="1"]').isVisible(), true);
      assert.equal(await page.locator('[data-rule-name="1"]').count(), kind === 'custom' ? 1 : 0);
    }
    await page.locator('#iqc-item-form button[type=submit]').click();
    assert.match(await page.locator('#iqc-item-error').innerText(), /數值|數量|giá trị|số lượng/i);
    await page.locator('[data-rule-cadence="1"]').selectOption('time');
    assert.equal(await page.locator('[data-rule-value="1"]').isVisible(), false);
    await page.locator('[data-rule-kind="1"]').selectOption('custom');
    assert.equal(await page.locator('[data-rule-name="1"]').isVisible(), true);
    await page.locator('#iqc-item-form button[type=submit]').click();
    assert.match(await page.locator('#iqc-item-error').innerText(), /名稱|tên/i);
    assert.equal(await page.locator('[data-rule-remove="1"]').isDisabled(), false);
    await page.locator('#iqc-rule-add').click();
    await cancelsOnlyAfterTwoPrompts(page, () => page.locator('[data-rule-remove="2"]').click());
    if (!real) {
      const originalSourceRule = structuredClone(fixture.versions[0].snapshot.items[0].rules[0]);
      const originalToolText = fixture.versions[0].snapshot.items[0].toolVi;
      const originalMethod = fixture.versions[0].snapshot.items[0].methodVi;
      const secondPhotoSource = await page.locator('#iqc-item-photo-list img').nth(1).getAttribute('src');
      await page.locator('[data-item-photo-first="1"]').click();
      await page.locator('[data-rule-name="1"]').fill('Mỗi 9 ngày');
      await page.locator('[data-rule-kind="2"]').selectOption('custom');
      await page.locator('[data-rule-name="2"]').fill('Mẫu riêng');
      await page.locator('[data-rule-value="2"]').fill('Theo yêu cầu khách hàng');
      await page.locator('#iqc-item-form button[type=submit]').click();
      await page.locator('.iqc-dialog-overlay').waitFor({ state: 'detached' });
      assert.deepEqual(fixture.versions[0].snapshot.items[0].rules[0], originalSourceRule);
      assert.equal(fixture.versions[0].snapshot.items[0].toolVi, originalToolText);
      assert.equal(fixture.versions[0].snapshot.items[0].methodVi, originalMethod);
      assert.equal(fixture.versions[0].snapshot.items[0].rules.length, 3);
      assert.equal(fixture.versions[0].snapshot.items[0].mediaItems[0].src, secondPhotoSource);
      await page.locator('[data-edit-item]').first().click();
      assert.equal(await page.locator('[data-rule-name="1"]').inputValue(), 'Mỗi 9 ngày');
      assert.equal(await page.locator('[data-rule-value="2"]').inputValue(), 'Theo yêu cầu khách hàng');
      await page.locator('#iqc-equipment-clear').click();
      await page.locator('#iqc-item-form button[type=submit]').click();
      await page.locator('.iqc-dialog-overlay').waitFor({ state: 'detached' });
      assert.equal(fixture.versions[0].snapshot.items[0].equipmentId, '');
      assert.equal(fixture.versions[0].snapshot.items[0].toolVi, originalToolText);
      await page.locator('[data-edit-item]').first().click();
      assert.equal(await page.locator('input[name=inspectionMode]:checked').count(), 0);
      await page.locator('input[name=inspectionMode][value=equipment]').check();
      await page.locator('#iqc-equipment-change').click();
      await page.locator('[data-iqc-select-equipment=eq-1]').click();
      await page.locator('#iqc-item-form button[type=submit]').click();
      await page.locator('.iqc-dialog-overlay').waitFor({ state: 'detached' });
      assert.equal(fixture.versions[0].snapshot.items[0].equipmentId, 'eq-1');
      await page.locator('[data-edit-item]').first().click();
    }
    await page.locator('.iqc-dialog [data-close]').first().click();
    if (!real) {
      // Persist a second supplier, changed photo order and two edited rules in
      // the isolated browser fixture; the user's Local draft is not modified.
      await page.locator('[data-edit-part]').first().click();
      const secondSupplier = snapshot.suppliers.find(row => row.id !== first.supplierIds[0]).id;
      await page.locator('#iqc-part-add-supplier').click();
      await page.locator('[data-supplier-index="1"]').selectOption(secondSupplier);
      const formerSecondPhoto = await page.locator('.iqc-photo-edit img').nth(1).getAttribute('src');
      await page.locator('[data-photo-down="0"]').click();
      await page.locator('#iqc-part-form button[type=submit]').click();
      await page.locator('.iqc-dialog-overlay').waitFor({ state: 'detached' });
      assert.equal(fixture.versions[0].snapshot.parts[0].supplierIds[1], secondSupplier);
      assert.equal(fixture.versions[0].snapshot.parts[0].photos[0].src, formerSecondPhoto);
      await page.locator('[data-select-part]').first().click();
      await page.locator(`[data-select-error="${snapshot.items[1].errorId}"]`).click();
      const secondItem = page.locator('.iqc-detail [data-item-details]').first();
      await secondItem.locator('summary').click();
      await secondItem.locator('[data-edit-item]').click();
      await page.locator('textarea[name=methodVi]').fill('Bề mặt không nứt');
      await page.locator('input[name=isEnabled]').uncheck();
      await page.locator('input[name=inspectionMode][value=equipment]').check();
      const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/L5kAAAAASUVORK5CYII=', 'base64');
      await page.locator('#iqc-item-file').setInputFiles({ name: 'item-test.png', mimeType: 'image/png', buffer: imageBytes });
      await page.locator('#iqc-item-photo-list .iqc-photo-edit').waitFor();
      await page.locator('[data-item-photo-note="0"]').fill('Mặt trước');
      await page.locator('#iqc-rule-add').click();
      await page.locator('[data-rule-cadence="1"]').selectOption('time');
      await page.locator('[data-rule-kind="1"]').selectOption('month');
      await page.locator('#iqc-item-form button[type=submit]').click();
      await page.locator('.iqc-dialog-overlay').waitFor({ state: 'detached' });
      await page.reload();
      await page.locator('[data-select-part]').first().click();
      assert.ok((await page.locator('.iqc-detail').innerText()).includes(snapshot.suppliers.find(row => row.id === secondSupplier).nameVi));
      assert.equal(await page.locator('.iqc-detail .iqc-photo-strip button').first().locator('img').getAttribute('src'), formerSecondPhoto);
      await page.locator(`[data-select-error="${snapshot.items[1].errorId}"]`).click();
      const savedSecond = page.locator('.iqc-detail [data-item-details]').first();
      await savedSecond.locator('summary').click();
      assert.equal(fixture.versions[0].snapshot.items[1].rules.length, 2);
      assert.match(await savedSecond.innerText(), /Bề mặt không nứt/);
      assert.match(await savedSecond.innerText(), /Dưỡng thử/);
      assert.equal(fixture.versions[0].snapshot.items[1].isEnabled, false);
      assert.equal(fixture.versions[0].snapshot.items[1].mediaItems[0].note, 'Mặt trước');
      await savedSecond.locator('[data-item-photo]').first().click();
      assert.match(await page.locator('.iqc-lightbox').innerText(), /Mặt trước/);
      await page.locator('#iqc-photo-close').click();
      await page.locator('#iqc-submit').click();
      await page.locator('#iqc-withdraw').waitFor();
      assert.equal(fixture.versions[0].status, 'pending');
      await page.locator('#iqc-to-review').click();
      await page.locator('[data-iqc-review]:not(:disabled)').first().click();
      await page.locator('#iqc-review-reject').click();
      await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-iqc`);
      await page.locator('#iqc-submit').waitFor();
      assert.equal(fixture.versions[0].status, 'draft');
      await page.locator('#iqc-submit').click();
      await page.locator('#iqc-withdraw').waitFor();
      await page.locator('#iqc-to-review').click();
      await page.locator('[data-iqc-review]:not(:disabled)').first().click();
      await page.locator('#iqc-review-approve').click();
      await page.waitForFunction(() => !document.querySelector('#iqc-review-approve'));
      assert.equal(fixture.versions[0].status, 'approved');
      await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-iqc`);
      await page.locator('#iqc-begin').waitFor();
      assert.equal(fixture.activeVersionId, fixture.versions[0].id);
      await page.locator('#iqc-begin').click();
      await page.locator('#iqc-save').waitFor();
      assert.ok((await page.locator('.iqc-version h2').innerText()).includes('V2'));
      assert.equal(new URL(page.url()).searchParams.get('dataTab'), 'quality-iqc');
      assert.equal(await page.locator('#data-content').getAttribute('data-active-tab'), 'quality-iqc');
      await page.locator('#iqc-save').click();
      await page.locator('#iqc-save').waitFor();
      assert.equal(await page.locator('#data-content > #iqc-page').count(), 1);
      await page.locator('#iqc-version').selectOption(fixture.versions[0].id);
      assert.equal(await page.locator('#data-content > #iqc-page').count(), 1);
      assert.equal(new URL(page.url()).searchParams.get('dataTab'), 'quality-iqc');
    }
  }
  if (mobile) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, 'IQC mobile page must not overflow horizontally');
    await page.locator('[data-edit-part]').first().click();
    if (process.env.IQC_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.IQC_SCREENSHOT_DIR, 'iqc-part-editor-mobile.png') });
    assert.ok(await page.locator('.iqc-dialog-overlay').isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await page.locator('.iqc-dialog [data-close]').first().click();
    await page.locator('#iqc-manage-suppliers').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await page.locator('#iqc-list-search').fill('CÔNG TY');
    assert.equal(await page.locator('.iqc-dialog [data-row-id]:visible').count(), 1);
    await page.locator('.iqc-dialog [data-close]').first().click();
    if (await page.locator('.iqc-detail [data-item-details]').first().getAttribute('open') === null)
      await page.locator('.iqc-detail [data-item-details]').first().locator('summary').click();
    await page.locator('.iqc-detail [data-edit-item]').first().click();
    if (process.env.IQC_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.IQC_SCREENSHOT_DIR, 'iqc-rules-mobile.png') });
    assert.equal(await page.locator('#iqc-source-rule-pending').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await page.locator('#iqc-equipment-change').click();
    await page.locator('#iqc-picker-list .iqc-picker-item').first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    assert.ok(await page.locator('#iqc-picker-search').isVisible());
    await page.locator('.iqc-equipment-picker [data-close]').first().click();
    const saveButton = await page.locator('#iqc-item-form button[type=submit]').evaluate(button => {
      const rect = button.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, height: innerHeight };
    });
    assert.ok(saveButton.top < saveButton.height && saveButton.bottom > 0, 'mobile Save must remain reachable in dialog');
    await page.locator('.iqc-dialog [data-close]').first().click();
  }
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.IQC_CHROME_PATH?{executablePath:process.env.IQC_CHROME_PATH}:{channel:'chrome'}) });
  try {
    await check(browser, 1440, 900, false);
    await check(browser, 390, 844, true);
    console.log(JSON.stringify({ desktop: true, mobile: true, search: true, filters: true,
      details: true, noImage: true, language: true, managerSearch: true, ruleFields: true,
      doubleConfirm: true, noHorizontalOverflow: true, mobileDialogActions: true,
      isolatedDraftReloadAndReview: !real, itemPhotoUploadAndAlbum: !real,
      stableEquipmentPickerAndTwoReverseRefs: !real }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
