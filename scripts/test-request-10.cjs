const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = isolatedTestTarget_20261010;
const artifactDir = require('./local-evidence-paths.cjs').configuredPath('PROCESS_ROUTINE_EVIDENCE_ROOT',"");

function getFreshFixture() {
  const source = JSON.parse(fs.readFileSync('public/process/routine-source.json', 'utf8'));
  const now = new Date().toISOString();
  const version = {
    id: 'fixture-routine-v1', number: 1, status: 'draft',
    equipment: JSON.parse(JSON.stringify(source.equipment)),
    groups: JSON.parse(JSON.stringify(source.groups)),
    categories: [], subcategories: [],
    issues: JSON.parse(JSON.stringify(source.issues)),
    creatorId: 'demo-admin', creatorName: 'Demo admin',
    createdAt: now, updatedAt: now, revision: 1, history: []
  };
  const control = {
    schemaVersion: 1, activeVersionId: null, versions: [version], source: null,
    issues: JSON.parse(JSON.stringify(source.issues)), reservedMarks: {}
  };
  return { control, version, revision: 10 };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel:'chrome'
  });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const { control, version, revision: initialRevision } = getFreshFixture();
  let revision = initialRevision;
  const photoId = 'b'.repeat(64);

  await page.route('**/api/routine-equipment/photo**', route => {
    if (route.request().method() === 'PUT') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: photoId }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/m7sAAAAASUVORK5CYII=', 'base64')
    });
  });

  await page.route('**/api/routine-equipment', async route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision, control }) });
    }
    const body = route.request().postDataJSON();
    if (body.action === 'save') {
      Object.assign(version, body.snapshot);
      version.revision += 1;
      revision += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision, control }) });
    }
    if (body.action === 'submit') {
      // Find any item missing calibration date to simulate validation failure
      const target = version.equipment.find(item => item.calibrationMethod && item.calibrationMethod !== 'none');
      return route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: '送審驗證未通過',
          errors: ['校正有效期限必填'],
          problems: [{
            id: target.id,
            field: 'expiresAt',
            message: '校正有效期限必填（含當天有效）'
          }]
        })
      });
    }
    return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'unsupported' }) });
  });

  // Login
  await page.goto(`${base}/process/`);
  await page.locator('[data-quick-login="admin"]').waitFor();
  await page.locator('[data-quick-login="admin"]').click();
  await page.locator('#main-nav').waitFor();

  // Navigate to routine equipment
  await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-routine-equipment`);
  await page.locator('.routine-count').waitFor();

  console.log('--- TEST 1: Section ordering ---');
  const sectionClasses = await page.evaluate(() => {
    const pageEl = document.querySelector('#routine-page');
    const directChildren = Array.from(pageEl.children).map(el => {
      const cls = el.className || el.tagName.toLowerCase();
      const id = el.id || '';
      return `${cls}#${id}`;
    });
    return directChildren;
  });
  console.log('Section sequence:', sectionClasses);
  // Order must have: .routine-version before details (history) before details (errors) before details (issues) before toolbar before hierarchy before list
  const verIdx = sectionClasses.findIndex(s => s.includes('routine-version'));
  const histIdx = sectionClasses.findIndex(s => s.includes('routine-card#') && !s.includes('routine-version') && !s.includes('routine-errors') && !s.includes('routine-issues'));
  const issuesIdx = sectionClasses.findIndex(s => s.includes('routine-issues'));
  const toolIdx = sectionClasses.findIndex(s => s.includes('routine-toolbar'));
  const hierIdx = sectionClasses.findIndex(s => s.includes('routine-hierarchy'));
  const listIdx = sectionClasses.findIndex(s => s.includes('routine-list-card'));

  assert.ok(verIdx !== -1, 'Version section found');
  assert.ok(histIdx > verIdx, 'History after version');
  assert.ok(issuesIdx > histIdx, 'Issues after history');
  assert.ok(toolIdx > issuesIdx, 'Toolbar after issues');
  assert.ok(hierIdx > toolIdx, 'Hierarchy after toolbar');
  assert.ok(listIdx > hierIdx, 'List after hierarchy');

  console.log('--- TEST 2: C01~C06 representative photos auto-filled ---');
  // Check that groups under C01 have photos
  await page.locator('[data-node-select="category"]').first().click();
  await page.locator('[data-node-select="subcategory"]').first().click();
  const groupImgs = await page.locator('.routine-groups .routine-node-select img').count();
  console.log('C01 Group images count:', groupImgs);
  assert.ok(groupImgs > 0, 'C01 groups should have representative photos auto-filled');

  console.log('--- TEST 3: "查看資訊" (View Info) for 4 tiers ---');
  // 3.1 Category View Info
  await page.locator('.routine-tiles .routine-node [data-node-view="category"]').first().click();
  await page.locator('#routine-view-modal-backdrop').waitFor();
  assert.ok(await page.locator('.routine-view-dialog h3').innerText().then(t => t.includes('類別資訊')));
  assert.ok(await page.locator('.routine-view-photo').count() === 1);
  assert.ok(await page.locator('.routine-view-grid').innerText().then(t => t.includes('類別編號')));
  await page.screenshot({ path: path.join(artifactDir, 'view-modal-category.png') });
  await page.locator('#routine-view-close').click();
  await page.locator('#routine-view-modal-backdrop').waitFor({ state: 'detached' });

  // 3.2 Subcategory View Info
  await page.locator('.routine-tiles .routine-node [data-node-view="subcategory"]').first().click();
  await page.locator('#routine-view-modal-backdrop').waitFor();
  assert.ok(await page.locator('.routine-view-dialog h3').innerText().then(t => t.includes('子類別資訊')));
  await page.locator('#routine-view-dismiss').click();
  await page.locator('#routine-view-modal-backdrop').waitFor({ state: 'detached' });

  // 3.3 Group View Info
  await page.locator('.routine-groups .routine-node [data-node-view="group"]').first().click();
  await page.locator('#routine-view-modal-backdrop').waitFor();
  assert.ok(await page.locator('.routine-view-dialog h3').innerText().then(t => t.includes('規格群組資訊')));
  await page.locator('#routine-view-dismiss').click();
  await page.locator('#routine-view-modal-backdrop').waitFor({ state: 'detached' });

  // 3.4 Equipment View Info
  await page.locator('[data-node-select="group"]').first().click();
  await page.locator('.routine-equipment-list [data-equipment-view]').first().click();
  await page.locator('#routine-view-modal-backdrop').waitFor();
  assert.ok(await page.locator('.routine-view-dialog h3').innerText().then(t => t.includes('檢具詳細資訊')));
  await page.screenshot({ path: path.join(artifactDir, 'view-modal-equipment.png') });
  await page.locator('#routine-view-close').click();
  await page.locator('#routine-view-modal-backdrop').waitFor({ state: 'detached' });

  console.log('--- TEST 4: Calibration dropdown jump fix ---');
  // Open edit equipment drawer
  await page.locator('.routine-equipment-list [data-equipment-edit]').first().click();
  await page.locator('#routine-editor').waitFor();

  // Type an unapplied change into name field
  await page.locator('[data-field="name"]').fill('CALIBRATION SCROLL JUMP TEST NAME');

  // Scroll down drawer body
  const scrollBefore = await page.evaluate(() => {
    const body = document.querySelector('#routine-editor .routine-modal-body');
    body.scrollTop = 320;
    return body.scrollTop;
  });
  assert.ok(scrollBefore > 200, 'Drawer scrolled down');

  // Switch calibration method from current to 'none'
  await page.locator('#routine-edit-calibration-method').selectOption('none');

  // Check scroll position immediately
  const scrollAfterNone = await page.evaluate(() => {
    const body = document.querySelector('#routine-editor .routine-modal-body');
    return body.scrollTop;
  });
  console.log('Scroll after switching to none:', scrollAfterNone);
  assert.ok(scrollAfterNone > 200, 'Scroll position must not jump to top on method change');

  // Check unapplied name field is intact
  assert.equal(await page.locator('[data-field="name"]').inputValue(), 'CALIBRATION SCROLL JUMP TEST NAME');

  // Switch back to internal
  await page.locator('#routine-edit-calibration-method').selectOption('internal');
  const scrollAfterInternal = await page.evaluate(() => {
    const body = document.querySelector('#routine-editor .routine-modal-body');
    return body.scrollTop;
  });
  console.log('Scroll after switching to internal:', scrollAfterInternal);
  assert.ok(scrollAfterInternal > 200, 'Scroll position must remain intact');

  // Switch calibration cycle
  await page.locator('[data-select="calibrationCycle"]').selectOption('halfyear');
  const scrollAfterCycle = await page.evaluate(() => {
    const body = document.querySelector('#routine-editor .routine-modal-body');
    return body.scrollTop;
  });
  console.log('Scroll after cycle change:', scrollAfterCycle);
  assert.ok(scrollAfterCycle > 200, 'Scroll position must remain intact after cycle change');

  // Unapplied name is still intact!
  assert.equal(await page.locator('[data-field="name"]').inputValue(), 'CALIBRATION SCROLL JUMP TEST NAME');
  await page.locator('#routine-form-apply').click();
  await page.locator('#routine-editor').waitFor({ state: 'detached' });

  console.log('--- TEST 5: Category/Subcategory/Group Photo Setting ---');
  // Open Category Edit dialog
  await page.locator('.routine-tiles .routine-node [data-node-edit="category"]').first().click();
  await page.locator('#routine-node-dialog-backdrop').waitFor();
  assert.ok(await page.locator('#routine-dialog-photo-input').count() === 1, 'Photo input must exist in node dialog');

  // Upload test image
  await page.locator('#routine-dialog-photo-input').setInputFiles({
    name: 'test-cat.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/m7sAAAAASUVORK5CYII=', 'base64')
  });
  // Verify preview is shown
  assert.match(await page.locator('.routine-dialog-body .routine-photo-field img').getAttribute('src'), /^blob:/);
  await page.screenshot({ path: path.join(artifactDir, 'dialog-node-photo-preview.png') });

  // Test remove photo button
  await page.locator('#routine-dialog-photo-remove').click();
  assert.ok(await page.locator('.routine-dialog-body .routine-photo-empty').count() === 1);

  await page.locator('#routine-dialog-cancel').click();
  await page.locator('#routine-node-dialog-backdrop').waitFor({ state: 'detached' });

  console.log('--- TEST 6: Submit failure, Error Reasons card, and "前往修正" button ---');
  // Click submit to trigger the 422 mock failure
  await page.locator('#routine-submit').click();

  // Error card should automatically appear and be open
  await page.locator('#routine-errors-details').waitFor();
  const isOpen = await page.locator('#routine-errors-details').getAttribute('open');
  assert.notEqual(isOpen, null, 'Error card must be auto-expanded on submit failure');

  // Check error item and advice
  const errorItemText = await page.locator('.routine-errors-list .routine-error-item').innerText();
  console.log('Error item text:', errorItemText);
  assert.ok(errorItemText.includes('校正有效期限必填'));
  assert.ok(errorItemText.includes('修正建議'));

  await page.screenshot({ path: path.join(artifactDir, 'error-reasons-card.png') });

  // Click "前往修正"
  await page.locator('[data-fix-equipment]').first().click();
  await page.locator('#routine-editor').waitFor();

  // The field should be focused or present in drawer
  assert.equal(await page.locator('[data-field="expiresAt"]').count(), 1);
  await page.locator('#routine-close').click();
  await page.locator('#routine-editor').waitFor({ state: 'detached' });

  console.log('ALL TESTS PASSED SUCCESSFULLY!');
  await browser.close();
})().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
