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
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const seed = JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'..','db','seed.json'), 'utf8'));
    seed.values.platformUsers = JSON.stringify(
      JSON.parse(seed.values.platformUsers).map(({ password: _password, ...user }) => user),
    );
    seed.identity = { id: 'admin', role: 'admin', name: 'Fixture' };
    seed.serverProtected = true;
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      if (!request.url().includes('/shared-state'))
        return route.fulfill({ status: 403, json: { error: 'isolated' } });
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        Object.assign(seed.values, body.updates || {});
        seed.revision += 1;
      }
      return route.fulfill({ json: seed });
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto((isolatedTestTarget_20261010+"/process/?build=20260910-4700&manage=1"));
    await page.locator('[data-view=editor]').click();
    await page.locator('.operation-block').first().waitFor();

    const fixture = await page.evaluate(() => {
      const product = data.products.find(
        (item) =>
          item.category === state.category &&
          routeFor(item.code)?.line === state.editorLine,
      );
      const route = routeFor(product.code).stages;
      const stages = {};
      route.forEach((stageCode, _index) => {
        stages[stageCode] = [
          {
            id: `QA-${stageCode}`,
            stageCode,
            number: `${stageCode}-01`,
            name: `QA ${stageCode}`,
            mode: 'human',
            people: 1,
            productCodes: [product.code],
            bomProductCode: product.code,
            bomItems: [],
            bomSelections: {},
            machineIds: [],
            nextIds: [],
            x: 30,
            y: 30,
            instructionSteps: [{ text: '操作', standard: '完成' }],
            instructions: '操作',
            ipqc: '完成',
            productInstructions: {},
            productInstructionSteps: {},
            productMediaItems: {},
            mediaItems: [],
          },
        ];
      });
      state.editorByCategory[editorKey()] = stages;
      const draft = {
        id: 'QA-4700',
        number: 4700,
        category: state.category,
        line: state.editorLine,
        status: 'draft',
        stages,
        history: [],
      };
      approvalVersions.unshift(draft);
      state.editorVersionId = draft.id;
      state.editorSubmissionVersionId = draft.id;
      state.editorSubmissionErrors = ProcessVersionValidation.validate(draft);
      render();
      return { code: product.code, firstId: stages[route[0]][0].id };
    });

    await page.evaluate(() =>
      document
        .querySelectorAll('.editor-submit-issues details')
        .forEach((details) => (details.open = true)),
    );
    const initialIssueText = await page.locator('.editor-submit-issues').innerText();
    assert.ok(
      initialIssueText.includes('BOM 未分配'),
      `fixture starts with a real BOM allocation problem: ${initialIssueText}`,
    );
    const bomQuick = page.locator('.issue-quick-action', { hasText: '前往分配 BOM' }).first();
    assert.equal(await bomQuick.count(), 1, 'collapsed product group exposes a direct BOM action');
    await bomQuick.click();
    const dialog = page.locator('#process-operation-dialog');
    await dialog.waitFor({ state: 'visible' });
    const bomGroup = dialog.locator(`[data-bom-group="${fixture.code}"]`);
    await bomGroup.locator('[data-bom-select-all]').click();
    await page.waitForTimeout(120);
    assert.ok(
      !(await page.locator('.editor-submit-issues').innerText()).includes('BOM 未分配'),
      'Select all immediately removes the stale BOM warning',
    );
    const validation = await page.evaluate((code) => {
      const used = new Set(
        Object.values(ensureCategoryEditor())
          .flat()
          .flatMap((operation) => operation.bomSelections?.[code] || []),
      );
      return {
        required: new Set(rootBom(code).map((row) => row.itemCode)).size,
        used: used.size,
        missing: ProcessVersionValidation.validate({
          category: state.category,
          line: state.editorLine,
          stages: ensureCategoryEditor(),
        }).filter((error) => error.type === 'bom').length,
      };
    }, fixture.code);
    assert.equal(validation.used, validation.required);
    assert.equal(validation.missing, 0);

    const mediaInput = dialog.locator(`[data-product-media-input="${fixture.code}"]`);
    const productStep = dialog.locator('.step-editor[data-step-kind="product"]');
    await productStep.locator('[data-step-text="0"]').fill('產品專用操作內容');
    await productStep.locator('[data-step-standard="0"]').fill('產品專用完成標準');
    await mediaInput.setInputFiles('public/process/assets/demo-process/hose-cutting.png');
    await dialog.locator('.product-media-editor figure').waitFor();
    assert.equal(await dialog.locator('.product-media-editor figure').count(), 1);
    assert.ok(
      (await dialog.locator('.product-media-editor').innerText()).includes(
        '只會顯示在此產品',
      ),
    );
    await dialog.locator('#apply-operation').click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(
      await page.locator(`[data-operation="${fixture.firstId}"] .operation-product-content`).count(),
      1,
      'editor card shows only a product supplement entry point',
    );
    assert.equal(
      await page.locator(`[data-operation="${fixture.firstId}"] img[src^="data:"]`).count(),
      0,
      'product-specific photo does not clutter the editor card',
    );
    await page.evaluate((code) => {
      state.qa4700Workspace = structuredClone(ensureCategoryEditor());
      approvalVersions
        .filter(
          (version) =>
            version.category === state.category &&
            version.line === state.editorLine &&
            version.status === 'approved',
        )
        .forEach((version) => (version.status = 'superseded'));
      approvalVersions.unshift({
        id: 'QA-4700-APPROVED',
        number: 4701,
        category: state.category,
        line: state.editorLine,
        status: 'approved',
        stages: structuredClone(state.qa4700Workspace),
        history: [],
      });
      state.productCode = code;
      navigate('productStatus');
    }, fixture.code);
    assert.ok(
      (await page.locator('.status-media-sections').first().innerText()).includes(
        `${fixture.code} 專用照片`,
      ),
      'product status separates the product-specific photo',
    );
    assert.ok(
      (await page.locator('.status-product-note').first().innerText()).includes(
        '產品專用操作內容',
      ),
      'product status shows the product-specific operation content',
    );
    await page.evaluate((code) => {
      const route = routeFor(code);
      dispatchBoard[route.line] = [code];
      state.deviceLine = route.line;
      state.deviceStage = route.stages[0];
      navigate('player');
    }, fixture.code);
    assert.ok(
      (await page.locator('.device-page .status-media-sections').first().innerText()).includes(
        `${fixture.code} 專用照片`,
      ),
      'line player shows the product-specific photo',
    );
    assert.ok(
      (await page.locator('.device-page .status-product-note').first().innerText()).includes(
        '產品專用操作內容',
      ),
      'line player shows the product-specific content',
    );
    await page.evaluate((code) => {
      const route = routeFor(code);
      state.dispatchPreviewLine = route.line;
      state.dispatchPreviewStage = route.stages[0];
      navigate('dispatch');
    }, fixture.code);
    assert.ok(
      (await page.locator('.dispatch-live-preview .status-media-sections').first().innerText()).includes(
        `${fixture.code} 專用照片`,
      ),
      'dispatch monitor shows the product-specific photo',
    );
    assert.ok(
      (await page.locator('.dispatch-live-preview .status-product-note').first().innerText()).includes(
        '產品專用操作內容',
      ),
      'dispatch monitor shows the product-specific content',
    );
    await page.evaluate(() => {
      state.view = 'editor';
      state.editorByCategory[editorKey()] = state.qa4700Workspace;
      const draft = approvalVersions.find((version) => version.id === 'QA-4700');
      draft.stages = state.qa4700Workspace;
      state.editorVersionId = draft.id;
      state.editorSubmissionVersionId = draft.id;
      state.editorSubmissionErrors = ProcessVersionValidation.validate(draft);
      render();
    });

    await page.evaluate(() => {
      const stageCode = Object.keys(ensureCategoryEditor()).find(
        (code) => ensureCategoryEditor()[code].length,
      );
      const operations = ensureCategoryEditor()[stageCode];
      const source = operations[0];
      const target = structuredClone(source);
      target.id = `${source.id}-TARGET`;
      target.number = `${stageCode}-02`;
      target.x = 390;
      target.productMediaItems = {};
      source.nextIds = [];
      operations.push(target);
      state.editorSubmissionErrors = ProcessVersionValidation.validate({
        category: state.category,
        line: state.editorLine,
        stages: ensureCategoryEditor(),
      });
      render();
      document
        .querySelectorAll('.editor-submit-issues details')
        .forEach((details) => (details.open = true));
    });
    const connectionQuick = page
      .locator('.issue-quick-action', { hasText: '前往建立連線' })
      .first();
    assert.equal(await connectionQuick.count(), 1, 'connection error has a direct action');
    await connectionQuick.click();
    assert.ok((await page.locator('.connection-guide-notice').innerText()).includes('請建立連線'));
    assert.equal(await page.locator('.connection-guide-source').count(), 1);
    assert.equal(await page.locator('.connection-guide-target').count(), 1);
    assert.equal(await page.locator('.connection-guide-overlay').count(), 1);

    const responsive = await page.evaluate(() => {
      const media = document.querySelector('.product-media-editor');
      return media ? getComputedStyle(media).gridTemplateColumns : '';
    });
    assert.ok(responsive !== '', 'product-specific editor is rendered');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(80);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    assert.equal(overflow, false, '390px viewport has no full-page horizontal overflow');
    assert.deepEqual(errors, []);
    console.log(
      'PASS: direct issue actions, connection demonstration, immediate BOM refresh, product-specific media, editor-card indicator, and 390px layout.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack);
  process.exit(1);
});
