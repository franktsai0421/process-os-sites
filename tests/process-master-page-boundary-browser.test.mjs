import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createProcessMasterFixture } from './process-master-cloud-fixture.mjs';

const fixture = await createProcessMasterFixture();
let browser;
try {
  await fixture.adoptAuthoring();
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  await fixture.adoptAuthoring();
  const origin = fixture.url.origin;
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  page.setDefaultTimeout(10000);
  const dialogs = [], writes = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/master/workflow') writes.push(request.url());
  });
  await page.goto(origin + '/login?view=data&dataTab=process-master');
  await page.locator('#id').fill('frank');
  await page.locator('#password').fill(fixture.password);
  await page.locator('.site-entry-submit').click();
  await page.locator('#process-master-new-draft').click();
  const name = page.locator('[data-master-name]').first();
  const save = page.locator('#save-master-data');
  const read = async () => {
    const r = await page.request.get(origin + '/api/master/workflow?scope=PROCESS');
    assert.equal(r.status(), 200);
    return (await r.json()).control.workflow;
  };
  const waitSaved = value => page.waitForFunction(v => Object.values(MasterDataWorkflow.shared.flow('PROCESS').saved?.content || {}).flat().some(row => row.name === v), value);
  await name.fill('Synthetic saved boundary');
  await save.click();
  await waitSaved('Synthetic saved boundary');
  const saved = await read();
  for (const destination of ['line-admin', 'editor', 'dashboard']) {
    const count = writes.length;
    await name.fill('Synthetic unsaved ' + destination);
    if (destination === 'line-admin') {
      await page.locator('[data-tab=line-admin]').click();
      await page.locator('[data-tab=line-admin].active').waitFor();
    } else {
      await page.locator('.nav-item[data-view=' + destination + ']').click();
      await page.waitForFunction(view => state.view === view && !ProcessDeliveryNavigation.pending(), destination);
      await page.locator('.nav-item[data-view=data]').click();
    }
    await page.locator('[data-tab=process-master]').click();
    await page.waitForFunction(() => document.querySelector('[data-master-name]')?.value === 'Synthetic saved boundary');
    assert.equal(writes.length, count);
    assert.deepEqual(await read(), saved);
    assert.deepEqual(dialogs, []);
    console.log('PASS saved draft and no implicit write on departure to ' + destination);
  }
  assert.equal(await page.locator('#process-master-reload,#export-process-master,#import-process-master,#process-master-import-file').count(), 0);
  await page.locator('[data-equipment-edit]').first().click();
  await page.locator('[data-equipment-field=name]').fill('Synthetic applied machine');
  await page.locator('[data-equipment-save]').click();
  await page.locator('#equipment-editor-dialog').waitFor({state:'detached'});
  assert.deepEqual(await read(), saved);
  const referenced = page.locator('[data-delete-template="fixture-custom-0"]');
  await referenced.click();
  const protection = page.locator('.process-reference-dialog[open]');
  await protection.waitFor();
  assert.match(await protection.innerText(), /A-01/);
  await protection.locator('button').click();
  assert.equal(await referenced.count(), 1);
  await page.locator('[data-template-key="fixture-custom-1"] [data-master-type]').selectOption('machine');
  const count = await page.locator('.photo-template').count();
  await page.locator('#add-master-template').click();
  await page.waitForFunction(n => document.querySelectorAll('.photo-template').length === n + 1, count);
  const card = page.locator('.photo-template').last();
  await card.locator('[data-master-name]').fill('Synthetic new template');
  await card.locator('[data-name-action=apply]').click();
  await card.locator('[data-master-type]').selectOption('inspection');
  await save.click();
  await waitSaved('Synthetic new template');
  const flow = await read();
  assert.ok(Object.values(flow.saved.content).flat().some(row => row.name === 'Synthetic new template' && row.editorType === 'inspection'));
  assert.ok(Object.values(flow.saved.content).flat().some(row => row.equipment?.some(item => item.name === 'Synthetic applied machine')));
  assert.deepEqual(flow.active, saved.active);
  assert.ok(Object.values(flow.saved.content).flat().some(row => row.catalogKey === 'fixture-custom-1' && row.editorType === 'machine'));
  console.log('PASS referenced deletion blocked, existing and new types saved');

  const confirm = async selector => {
    await page.locator(selector).click();
    const dialog = page.locator('.vd-confirm[open]');
    await dialog.locator('textarea').fill('Synthetic boundary verification');
    const box = dialog.locator('input[type=checkbox]');
    if (await box.count()) await box.check();
    await dialog.locator('button[type=submit]').click();
    await dialog.waitFor({ state: 'detached' });
  };
  await confirm('#process-master-submit');
  await page.locator('#process-master-withdraw').waitFor();
  const pending = await read();
  assert.deepEqual(pending.cases.find(row => row.id === pending.pendingId).content, flow.saved.content);
  assert.deepEqual(pending.active, saved.active);
  const canvas = await context.newPage();
  await canvas.goto(origin + '/process/?view=editor');
  await canvas.locator('[data-pe=add]').waitFor();
  const beginCanvas = canvas.locator('[data-av3=begin]');
  if (await beginCanvas.count()) await beginCanvas.click();
  await canvas.locator('[data-pe=add]').click();
  const choices = canvas.locator('.pe-add [data-choice]');
  await choices.first().waitFor();
  assert.ok((await choices.allTextContents()).some(text => text.includes('隔離流程 1')));
  assert.equal(await choices.filter({ hasText: 'Synthetic new template' }).count(), 0);
  await canvas.close();
  await confirm('#process-master-withdraw');
  await save.waitFor();
  const withdrawn = await read();
  assert.ok(!withdrawn.pendingId);
  assert.deepEqual(withdrawn.active, saved.active);
  assert.deepEqual(withdrawn.saved.content, flow.saved.content);
  await confirm('#process-master-submit');
  await page.locator('#process-master-review').click();
  await page.locator('#master-unified-review [data-review-action=approve]').waitFor();
  console.log('PASS frozen PROCESS case, current canvas choices, withdrawal and resubmission');
} finally {
  await browser?.close();
  await fixture.close();
}
