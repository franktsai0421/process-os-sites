import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { createProcessMasterFixture } from './process-master-cloud-fixture.mjs';
let f = await createProcessMasterFixture();
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const results = [];
try {
  for (const [language, width] of [
    ['zh', 1365],
    ['vi', 390],
  ]) {
    const c = await browser.newContext({
      viewport: { width, height: 900 },
      serviceWorkers: 'block',
    });
    await c.route('**/*', (r) =>
      new URL(r.request().url()).origin === f.url.origin
        ? r.continue()
        : r.abort(),
    );
    await c.addInitScript(
      (language) => localStorage.setItem('processUILanguage', language),
      language,
    );
    const p = await c.newPage(),
      errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(f.url.origin + '/login?view=data&dataTab=process-master');
    await p.locator('#id').fill('frank');
    await p.locator('#password').fill(f.password);
    let unblock;
    const gate = new Promise((r) => (unblock = r));
    await p.route('**/api/process-bootstrap?*', async (r) => {
      await gate;
      await r.continue();
    });
    await p.locator('.site-entry-submit').click();
    await p.locator('#process-boot').waitFor();
    assert.equal(await p.locator('.app-shell').isVisible(), false);
    assert.equal(
      await p.evaluate(
        () =>
          document.querySelector('.app-shell').getBoundingClientRect().height,
      ),
      0,
    );
    unblock();
    await p.waitForFunction(
      () =>
        document.documentElement.dataset.processNavigationStatus === 'ready',
    );
    await p.unroute('**/api/process-bootstrap?*');
    assert.equal(await p.locator('.app-shell').isVisible(), true);
    assert.equal(
      await p.locator('#process-master-new-draft').isEnabled(),
      true,
    );
    assert.equal(await p.locator('[data-master-name]').count(), 15);
    assert.equal(await p.locator('#equipment-panel tbody tr').count(), 40);
    const bounds = await p.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    assert(bounds.scroll <= bounds.viewport + 1, JSON.stringify(bounds));
    await p.screenshot({
      path: '.sites-runtime/entry-layout-' + language + '-' + width + '.png',
      fullPage: true,
    });
    await p.locator('#process-master-new-draft').click();
    await p.locator('#add-master-template').waitFor();
    await p.locator('[data-equipment-edit]').last().click();
    await p
      .locator('[data-equipment-field=name]')
      .fill('Entry check ' + language);
    await p.locator('[data-equipment-save]').click();
    await p.locator('#equipment-editor-dialog').waitFor({ state: 'detached' });
    await p.locator('#save-master-data').click();
    await p.waitForFunction(
      (name) =>
        Object.values(
          MasterDataWorkflow.shared.flow('PROCESS').saved?.content || {},
        )
          .flat()
          .some((t) => t.equipment?.some((e) => e.name === name)),
      'Entry check ' + language,
    );
    await p.reload();
    await p.waitForFunction(
      () =>
        document.documentElement.dataset.processNavigationStatus === 'ready',
    );
    const saved = await p.request.get(
      f.url.origin + '/api/master/workflow?scope=PROCESS',
    );
    assert.equal(saved.status(), 200);
    assert(
      JSON.stringify(await saved.json()).includes('Entry check ' + language),
    );
    await p.locator('[data-tab=line-admin]').click();
    await p.waitForFunction(() =>
      document.querySelector('[data-tab=line-admin].active'),
    );
    assert.equal(await p.locator('.app-shell').isVisible(), true);
    assert.deepEqual(errors, []);
    results.push({
      name:
        'delayed-entry-edit-apply-save-readback-tab-' + language + '-' + width,
      status: 'PASS',
      bounds,
    });
    await c.close();
    await f.close();
    f = await createProcessMasterFixture();
  }
  {
    const c = await browser.newContext();
    await c.route('**/*', (r) =>
      new URL(r.request().url()).origin === f.url.origin
        ? r.continue()
        : r.abort(),
    );
    const p = await c.newPage();
    await p.goto(f.url.origin + '/login?view=data&dataTab=process-master');
    await p.locator('#id').fill('frank');
    await p.locator('#password').fill(f.password);
    await p.route('**/api/process-bootstrap?*', (r) =>
      r.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"SYNTHETIC_UNAVAILABLE"}',
      }),
    );
    await p.locator('.site-entry-submit').click();
    await p.locator('#process-boot[role=alert]').waitFor();
    assert.equal(await p.locator('.app-shell').isVisible(), false);
    await p.unroute('**/api/process-bootstrap?*');
    await p.locator('#process-boot button').click();
    await p.waitForFunction(
      () =>
        document.documentElement.dataset.processNavigationStatus === 'ready',
    );
    assert.equal(
      await p.locator('#process-master-new-draft').isEnabled(),
      true,
    );
    results.push({
      name: 'failed-bootstrap-visible-error-retry',
      status: 'PASS',
    });
    await c.close();
  }
  {
    const c = await browser.newContext();
    await c.route('**/*', (r) =>
      new URL(r.request().url()).origin === f.url.origin
        ? r.continue()
        : r.abort(),
    );
    const p = await c.newPage();
    await p.goto(f.url.origin + '/process/?view=data&dataTab=process-master');
    await p.waitForURL('**/login?*');
    assert.equal(await p.locator('#id').isVisible(), true);
    await p.locator('#id').fill('denied');
    await p.locator('#password').fill(f.password);
    await p.locator('.site-entry-submit').click();
    await p.locator('#process-boot[role=alert]').waitFor();
    assert.equal(await p.locator('#process-master-new-draft').count(), 0);
    assert.equal(await p.locator('.app-shell').isVisible(), false);
    const denied = await p.request.get(
      f.url.origin + '/api/master/workflow?scope=PROCESS',
    );
    assert.equal(denied.status(), 403);
    await p.goto(f.url.origin + '/process/?view=dashboard');
    await p.waitForFunction(
      () =>
        document.documentElement.dataset.processNavigationStatus === 'ready',
    );
    assert.equal(await p.locator('.app-shell').isVisible(), true);
    assert.equal(
      await p.evaluate(
        () => document.documentElement.dataset.processBootLayout,
      ),
      undefined,
    );
    results.push({
      name: 'anonymous-redirect-denied-actor-no-module-access',
      status: 'PASS',
    });
    await c.close();
  }
} finally {
  await browser.close();
  await f.close();
}
fs.writeFileSync(
  '.sites-runtime/entry-layout-checks.json',
  JSON.stringify(
    {
      commit: process.env.PROCESS_PROGRAM_COMMIT,
      results,
      physicalDevice: false,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results));
