const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    require('./browser-test-runtime.cjs').playwrightModule,
);

(async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      require('./browser-test-runtime.cjs').browserExecutable,
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const seed = JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'..','db','seed.json'), 'utf8'));
    seed.values.platformUsers = JSON.stringify(
      JSON.parse(seed.values.platformUsers).map((user) => {
        const safeUser = { ...user };
        delete safeUser.password;
        return safeUser;
      }),
    );
    seed.identity = { id: 'admin', role: 'admin', name: 'Fixture' };
    seed.serverProtected = true;
    let writes = 0;
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      if (!request.url().includes('/shared-state'))
        return route.fulfill({ status: 403, json: { error: 'isolated' } });
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        Object.assign(seed.values, body.updates || {});
        seed.revision += 1;
        writes += 1;
      }
      return route.fulfill({ json: seed });
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      (isolatedTestTarget_20261010+"/process/?build=20260910-5500&manage=1"),
    );
    await page.locator('[data-view=data]').click();
    await page.locator('[data-tab=process-master]').click();
    await page.locator('.photo-template').first().waitFor();
    assert.equal(await page.locator('[data-master-media]').count(), 0);
    await page.locator('#process-master-new-draft').click();
    await page.locator('[data-master-media]').first().waitFor({ state: 'attached' });

    const expected = [
      '進站',
      '人工',
      '人工檢查',
      '機器組裝',
      '機器設定',
      '出站',
    ];
    assert.deepEqual(
      await page
        .locator('.photo-template [data-master-name]')
        .evaluateAll((inputs) => inputs.map((input) => input.value)),
      expected,
    );
    assert.equal(await page.locator('.photo-template').count(), 6);
    assert.equal(await page.locator('[data-master-people]').count(), 0);
    assert.equal(await page.locator('[data-master-mode]').count(), 0);
    assert.equal(await page.locator('[data-master-machine]').count(), 0);
    assert.equal(await page.locator('[data-master-media]').count(), 6);
    assert.equal(await page.locator('.master-template-media-grid img').count(), 6);
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.master-template-media-grid img')].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    );

    const presetState = await page.evaluate(() => {
      const entries = Object.entries(processMaster);
      const operation = newOperation(
        'A-CUT',
        98,
        processMaster['A-CUT'][0],
      );
      return {
        stages: entries.length,
        complete: entries.every(
          ([, templates]) =>
            templates.length === 6 &&
            templates.map((template) => template.name).join('|') ===
              '進站|人工|人工檢查|機器組裝|機器設定|出站',
        ),
        inherited: {
          name: operation.name,
          media: operation.media,
          count: operation.mediaItems.length,
        },
      };
    });
    assert.ok(presetState.stages > 0);
    assert.equal(presetState.complete, true);
    assert.deepEqual(presetState.inherited, {
      name: '進站',
      media: 'assets/process-templates/entry.png',
      count: 1,
    });

    const upload = page.locator('[data-master-media]').first();
    await upload.setInputFiles({
      name: 'extra-flow-photo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#154b50"/></svg>',
      ),
    });
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '.photo-template:first-child .master-template-media-grid img',
        ).length === 2,
    );
    await page.locator('#save-master-data').click();
    await page.waitForTimeout(400);
    const saved = await page.evaluate(() => {
      const control = JSON.parse(localStorage.getItem('masterDataControl'));
      const templates = control.versions.find(
        (version) => version.scope === 'PROCESS' && version.status === 'draft',
      ).snapshot;
      return {
        firstCount: templates['A-CUT'][0].mediaItems.length,
        preset: templates['A-CUT'].map((template) => template.presetKey),
      };
    });
    assert.equal(saved.firstCount, 2);
    assert.deepEqual(saved.preset, [
      'entry',
      'manual',
      'manual-inspection',
      'machine-assembly',
      'machine-setting',
      'exit',
    ]);

    await page.evaluate(() =>
      document.querySelector('.top-language-switch').click(),
    );
    await page.waitForFunction(
      () => document.querySelector('.process-photo-master h2')?.textContent === 'Quy trình dùng trong trình chỉnh sửa',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#save-master-data').scrollIntoViewIfNeeded();
    const mobile = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
      cards: document.querySelectorAll('.photo-template').length,
      saveVisible: Boolean(
        document.querySelector('#save-master-data')?.getClientRects().length,
      ),
    }));
    assert.ok(mobile.pageWidth <= mobile.viewport + 1, JSON.stringify(mobile));
    assert.equal(mobile.cards, 6);
    assert.equal(mobile.saveVisible, true);
    assert.ok(writes >= 1);
    assert.deepEqual(errors, []);
    console.log('Build 5500 process photo templates passed', {
      names: expected,
      inherited: presetState.inherited,
      saved,
      mobile,
      writes,
    });
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
