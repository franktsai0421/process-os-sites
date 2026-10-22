const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
const { fs, assert } = require('./build5700-builtins.mjs').default;
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    require('./browser-test-runtime.cjs').playwrightModule,
);

async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

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
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const seed = JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'..','db','seed.json'), 'utf8'));
    seed.values.platformUsers = JSON.stringify(
      JSON.parse(seed.values.platformUsers).map((user) => {
        const safeUser = { ...user };
        delete safeUser.password;
        return safeUser;
      }),
    );
    seed.identity = { id: 'admin', role: 'admin', name: 'Fixture Manager' };
    seed.serverProtected = true;
    let writes = 0;
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      if (!request.url().includes('/shared-state'))
        return route.fulfill({ status: 403, json: { error: 'isolated fixture' } });
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
      (isolatedTestTarget_20261010+"/process/?build=20260911-5900&manage=1&dataTab=process-master"),
    );
    await page.locator('[data-view=data]').click();
    await page.locator('[data-tab=process-master]').click();
    await page.locator('.photo-template').first().waitFor();

    assert.equal(await page.locator('.photo-template').count(), 5);
    assert.equal(await page.locator('#add-master-template').count(), 0);
    assert.equal(await page.locator('#import-process-master').count(), 0);
    assert.equal(await page.locator('#export-process-master').isVisible(), true);
    assert.equal(
      await page.locator('.photo-template').first().innerText().then((text) =>
        text.includes('A-CUT-FLOW-01'),
      ),
      false,
    );

    await page.locator('#process-master-new-draft').click();
    await page.locator('#add-master-template').waitFor();
    assert.equal(await page.locator('#import-process-master').isVisible(), true);
    await page.locator('#add-master-template').click();
    const custom = page.locator('.photo-template').last();
    await custom.locator('[data-master-name]').fill('自訂拍照流程');
    await custom.locator('[data-master-media]').setInputFiles({
      name: 'custom-photo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="30"><rect width="48" height="30" fill="#0f6970"/></svg>',
      ),
    });
    await page.locator('#save-master-data').click();
    await page.evaluate(() => window.ProcessSync.flush());

    const beforeApproval = await page.evaluate(() => {
      const control = JSON.parse(localStorage.getItem('masterDataControl'));
      const draft = control.versions.find(
        (version) => version.scope === 'PROCESS' && version.status === 'draft',
      );
      return {
        draftNumber: draft.number,
        draftCustom: draft.snapshot['A-CUT'].some(
          (template) => template.name === '自訂拍照流程',
        ),
        activeCustom: processMaster['A-CUT'].some(
          (template) => template.name === '自訂拍照流程',
        ),
      };
    });
    assert.deepEqual(beforeApproval, {
      draftNumber: 2,
      draftCustom: true,
      activeCustom: false,
    });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export-process-master').click(),
    ]);
    assert.match(download.suggestedFilename(), /\.xlsx$/i);
    const exportedBuffer = await readDownload(download);
    const exportedBase64 = exportedBuffer.toString('base64');
    const excel = await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) =>
        character.charCodeAt(0),
      );
      const workbook = XLSX.read(bytes, { type: 'array' });
      const metadata = Object.fromEntries(
        XLSX.utils
          .sheet_to_json(workbook.Sheets['格式說明'], { header: 1, defval: '' })
          .slice(1)
          .map((row) => [row[0], row[1]]),
      );
      const templates = XLSX.utils.sheet_to_json(workbook.Sheets['流程資料'], {
        defval: '',
      });
      const photos = XLSX.utils.sheet_to_json(workbook.Sheets['照片資料'], {
        defval: '',
      });
      const custom = templates.find((row) => row['流程名稱'] === '自訂拍照流程');
      custom['流程名稱'] = 'Excel 匯入流程';
      workbook.Sheets['流程資料'] = XLSX.utils.json_to_sheet(templates);
      const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      let binary = '';
      new Uint8Array(output).forEach((byte) => (binary += String.fromCharCode(byte)));
      return {
        sheets: workbook.SheetNames,
        metadata,
        templateCount: templates.length,
        photoRows: photos.length,
        customPhotoRows: photos.filter(
          (row) => row['流程編號'] === custom['流程編號'],
        ).length,
        modified: btoa(binary),
      };
    }, exportedBase64);
    assert.deepEqual(excel.sheets, ['格式說明', '流程資料', '照片資料', '設備資料', '設備照片', '照片內容']);
    assert.equal(excel.metadata['格式'], 'PROCESS_OS_PROCESS_MASTER_EXCEL');
    assert.equal(Number(excel.metadata['格式版本']), 3);
    assert.equal(excel.metadata['網站版本'], '2026.09.11.5900');
    assert.ok(excel.templateCount > 5);
    assert.ok(excel.photoRows >= 5);
    assert.ok(excel.customPhotoRows >= 1);

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#process-master-import-file').setInputFiles({
      name: 'process-master.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(excel.modified, 'base64'),
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-master-name]')].some(
        (input) => input.value === 'Excel 匯入流程',
      ),
    );
    assert.equal(
      await page.evaluate(() =>
        processMaster['A-CUT'].some(
          (template) => template.name === 'Excel 匯入流程',
        ),
      ),
      false,
    );

    await page.locator('#process-master-submit').click();
    await page.evaluate(() => window.ProcessSync.flush());
    assert.equal(await page.locator('#add-master-template').count(), 0);
    assert.equal(await page.locator('#import-process-master').count(), 0);
    assert.equal(await page.locator('#process-master-review').isVisible(), true);
    assert.equal(
      await page.evaluate(() =>
        processMaster['A-CUT'].some(
          (template) => template.name === 'Excel 匯入流程',
        ),
      ),
      false,
    );

    await page.locator('#process-master-review').click();
    await page.locator('#approve-master:visible').first().waitFor();
    assert.match(
      await page.locator('.master-review-detail:visible').first().innerText(),
      /流程資料/,
    );
    await page.locator('#approve-master:visible').first().click();
    await page.evaluate(() => window.ProcessSync.flush());
    const approved = await page.evaluate(() => {
      const template = processMaster['A-CUT'].find(
        (item) => item.name === 'Excel 匯入流程',
      );
      const operation = newOperation('A-CUT', 77, template);
      const control = JSON.parse(localStorage.getItem('masterDataControl'));
      return {
        active: Boolean(template),
        mediaCount: operation.mediaItems.length,
        approvedVersions: control.versions.filter(
          (version) =>
            version.scope === 'PROCESS' && version.status === 'approved',
        ).length,
        priorVersions: control.versions.filter(
          (version) =>
            version.scope === 'PROCESS' && version.status === 'superseded',
        ).length,
      };
    });
    assert.deepEqual(approved, {
      active: true,
      mediaCount: 1,
      approvedVersions: 1,
      priorVersions: 1,
    });

    await page.locator('[data-view=data]').click();
    await page.locator('[data-tab=process-master]').click();
    await page.locator('.photo-template').first().waitFor();
    assert.equal(await page.locator('.photo-template').count(), 6);
    assert.equal(await page.locator('#add-master-template').count(), 0);
    assert.match(await page.locator('.process-master-history').innerText(), /2/);

    await page.evaluate(() => document.querySelector('.top-language-switch').click());
    await page.waitForFunction(
      () =>
        document.querySelector('.process-photo-master h2')?.textContent ===
        'Quy trình dùng trong trình chỉnh sửa',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.process-master-version').scrollIntoViewIfNeeded();
    const mobile = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
      exportVisible: Boolean(
        document.querySelector('#export-process-master')?.getClientRects().length,
      ),
      versionVisible: Boolean(
        document.querySelector('#process-master-version-choice')?.getClientRects()
          .length,
      ),
    }));
    assert.ok(mobile.pageWidth <= mobile.viewport + 1, JSON.stringify(mobile));
    assert.equal(mobile.exportVisible, true);
    assert.equal(mobile.versionVisible, true);

    await page.locator('#process-master-new-draft').click();
    await page.evaluate(() => {
      window.hasPermission = () => false;
      document.querySelector('#data-content').innerHTML = processMasterView();
      bindDataInner('process-master');
    });
    assert.equal(await page.locator('#add-master-template').isVisible(), true);
    assert.equal(await page.locator('#import-process-master').count(), 0);
    assert.equal(await page.locator('#export-process-master').count(), 0);
    assert.equal(await page.locator('.master-permission-note').isVisible(), true);
    assert.ok(writes >= 4);
    assert.deepEqual(errors, []);
    console.log('Build 5700 process-master Excel and approval workflow passed', {
      beforeApproval,
      excel: {
        sheets: excel.sheets,
        templateCount: excel.templateCount,
        photoRows: excel.photoRows,
      },
      approved,
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
