const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Dedicated acceptance test for Request 11. */
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
    id: 'fixture-routine-v1',
    number: 1,
    status: 'draft',
    equipment: JSON.parse(JSON.stringify(source.equipment)),
    groups: JSON.parse(JSON.stringify(source.groups)),
    categories: JSON.parse(JSON.stringify(source.categories || [])),
    subcategories: JSON.parse(JSON.stringify(source.subcategories || [])),
    issues: JSON.parse(JSON.stringify(source.issues)),
    creatorId: 'demo-admin',
    creatorName: 'Demo admin',
    createdAt: now,
    updatedAt: now,
    revision: 1,
    history: [{ at: now, actorName: 'Demo admin', action: 'begin', comment: '開始建立草稿' }]
  };
  const control = {
    schemaVersion: 1,
    activeVersionId: null,
    versions: [version],
    source: null,
    issues: JSON.parse(JSON.stringify(source.issues)),
    reservedMarks: {}
  };
  return { control, version, revision: 10 };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel:'chrome'
  });

  const { control, version, revision } = getFreshFixture();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.goto(`${base}/process/`);
  await page.locator('[data-quick-login="admin"]').waitFor();
  await page.locator('[data-quick-login="admin"]').click();
  await page.locator('#main-nav').waitFor();

  // Route API
  let currentRevision = revision;
  await page.route('**/api/routine-equipment', async route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: currentRevision, control }) });
    }
    const body = route.request().postDataJSON();
    if (body.action === 'save') {
      Object.assign(version, body.snapshot);
      version.revision += 1;
      currentRevision += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: currentRevision, control }) });
    }
    if (body.action === 'submit') {
      // Mock submit validation returning 2 problems on 2 distinct equipments
      const target1 = version.equipment[1]; // xlsx-row-3 (external calib)
      target1.calibrationMethod = 'external';
      const target2 = version.equipment[2]; // xlsx-row-4 (distinct equipment)
      target2.name = ''; // empty name
      const problems = [
        { id: target1.id, field: 'calibratedAt', message: `${target1.assetCode}/${target1.pieceMark}: 最近校正日期必填`, advice: '請填寫有效之最近校正日期（YYYY-MM-DD）。' },
        { id: target2.id, field: 'name', message: `${target2.assetCode}/${target2.pieceMark}: 檢具名稱必填`, advice: '請輸入完整之檢具名稱與所屬群組。' }
      ];
      return route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: '送審檢查未通過', problems })
      });
    }
    return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'unsupported' }) });
  });

  await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-routine-equipment`);
  await page.locator('.routine-count').waitFor();

  // 1. Verify "操作歷程" is removed from the UI
  const historyTextCount = await page.locator('.routine-card summary', { hasText: '操作歷程' }).count();
  assert.equal(historyTextCount, 0, 'UI must NOT contain "操作歷程" summary');

  // 2. Before any error, "問題提醒" must be HIDDEN
  const problemReminderBefore = await page.locator('#routine-errors-details').count();
  assert.equal(problemReminderBefore, 0, 'Problem reminder card must be hidden when there are no errors');

  // 3. Click "送出審核" -> triggers validation error -> Problem reminder card appears
  await page.locator('#routine-submit').click();
  await page.locator('#routine-errors-details').waitFor();
  assert.equal(await page.locator('#routine-errors-details').getAttribute('open'), '', 'Problem card should be open');

  // Verify content of problem reminder
  const summaryText = await page.locator('#routine-errors-details summary').innerText();
  assert.ok(summaryText.includes('問題提醒') && summaryText.includes('2 項待處理'), `Expected 2 problems in summary, got: ${summaryText}`);

  // Screenshot problem reminder banner
  await page.screenshot({ path: path.join(artifactDir, 'problem-reminder-card.png') });

  // 4. Check position order
  // Order: 1. routine-version, 2. routine-errors-card, 3. routine-issues-card, 4. routine-toolbar
  const cardClasses = await page.locator('.routine-page > section, .routine-page > details, .routine-page > div.routine-toolbar').evaluateAll(
    nodes => nodes.map(n => n.getAttribute('class') || '')
  );
  const versionIdx = cardClasses.findIndex(c => c.includes('routine-version'));
  const errorsIdx = cardClasses.findIndex(c => c.includes('routine-errors-card'));
  const issuesIdx = cardClasses.findIndex(c => c.includes('routine-issues-card'));
  const toolbarIdx = cardClasses.findIndex(c => c.includes('routine-toolbar'));

  assert.ok(versionIdx < errorsIdx, 'Version card must come before errors card');
  assert.ok(errorsIdx < issuesIdx, 'Errors card must come before issues card');
  assert.ok(issuesIdx < toolbarIdx, 'Issues card must come before toolbar');

  // 5. Test "前往修正" button and actual location
  const fixButtons = page.locator('#routine-errors-details [data-fix-equipment]');
  assert.equal(await fixButtons.count(), 2);

  // Click first "前往修正"
  await fixButtons.first().click();
  await page.locator('#routine-editor').waitFor();

  // Verify calibratedAt field is focused and has highlight & error class
  const calInput = page.locator('#routine-editor [data-field="calibratedAt"]');
  assert.ok(await calInput.isVisible(), 'calibratedAt input should be visible');
  assert.equal(await calInput.evaluate(el => el.classList.contains('has-error')), true, 'Input should have has-error class');

  // Verify inline error message beside label
  const calLabel = calInput.locator('..');
  const errorBadge = calLabel.locator('.routine-field-error');
  assert.ok(await errorBadge.count() > 0, 'Field should show .routine-field-error badge');
  assert.ok((await errorBadge.innerText()).includes('最近校正日期必填'));

  await page.screenshot({ path: path.join(artifactDir, 'editor-field-highlight.png') });

  // 6. Test unapplied edits protection (isFormDirty)
  await page.locator('#routine-editor [data-field="owner"]').fill('品保暫存組長');
  let confirmPromptSeen = false;
  page.once('dialog', async dialog => {
    confirmPromptSeen = true;
    assert.ok(dialog.message().includes('尚有未套用的修改'));
    await dialog.dismiss(); // dismiss to protect
  });
  await page.locator('#routine-close').click();
  assert.ok(confirmPromptSeen, 'Confirm prompt must trigger when form is dirty');
  assert.equal(await page.locator('#routine-editor').count(), 1, 'Editor must stay open after dismiss');

  // 7. Fix the calibratedAt field and click "套用修改至草稿"
  await calInput.fill('2026-09-15');
  await page.locator('#routine-editor [data-field="expiresAt"]').fill('2027-09-15');
  await page.locator('#routine-form-apply').click();
  await page.locator('#routine-editor').waitFor({ state: 'detached' });

  // Verify message
  const applyMsg = await page.locator('.routine-message').innerText();
  assert.ok(applyMsg.includes('已套用至本頁草稿，尚未儲存至伺服器'), `Expected apply message, got: ${applyMsg}`);

  // Verify that the fixed problem is REMOVED from "問題提醒", leaving only 1 problem
  const detailsHTML = await page.locator('#routine-errors-details').innerHTML().catch(() => 'NOT FOUND');
  console.log('detailsHTML:', detailsHTML);
  const remainingProblems = page.locator('#routine-errors-details .routine-error-item');
  console.log('remaining count:', await remainingProblems.count());
  assert.equal(await remainingProblems.count(), 1, 'Should now only have 1 problem remaining');
  const remainingSummary = await page.locator('#routine-errors-details summary').innerText();
  assert.ok(remainingSummary.includes('1 項待處理'), `Expected 1 problem in summary, got: ${remainingSummary}`);

  // 8. Fix the second problem
  await page.locator('#routine-errors-details [data-fix-equipment]').first().click();
  await page.locator('#routine-editor').waitFor();
  await page.locator('#routine-editor [data-field="name"]').fill('修復後名稱');
  await page.locator('#routine-form-apply').click();
  await page.locator('#routine-editor').waitFor({ state: 'detached' });

  // 9. When all problems are fixed, "問題提醒" must be automatically HIDDEN
  assert.equal(await page.locator('#routine-errors-details').count(), 0, 'Problem reminder card must be hidden once all problems are resolved');

  // 10. Click "儲存草稿" -> verifies message
  await page.locator('#routine-save').click();
  await page.locator('.routine-message').filter({ hasText: /後端已保存草稿/ }).waitFor();

  // 11. Test Mobile Viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#routine-submit').click();
  await page.locator('#routine-errors-details').waitFor();
  await page.screenshot({ path: path.join(artifactDir, 'mobile-problem-reminder.png') });

  const mobileOverflow = await page.locator('.routine-page').evaluate(el => el.scrollWidth - el.clientWidth);
  assert.ok(mobileOverflow <= 1, `Mobile overflow should be <= 1px, got: ${mobileOverflow}`);

  await context.close();
  await browser.close();

  assert.deepEqual(pageErrors, []);
  console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
})().catch(err => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
