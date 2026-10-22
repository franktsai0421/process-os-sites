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
    page.setDefaultTimeout(10000);
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
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto(
      (isolatedTestTarget_20261010+"/process/?build=20260910-5200&manage=1"),
    );
    await page.locator('[data-view=editor]').click();
    await page.locator('.operation-block').first().waitFor();

    const fixture = await page.evaluate(() => {
      const targetCode = '105B100121',
        product = data.products.find((item) => item.code === targetCode),
        route = routeFor(targetCode),
        version = approvalVersions.find(
          (item) =>
            item.status === 'draft' &&
            item.category === product.category &&
            item.line === route.line,
        );
      if (!product || !route || !version)
        throw new Error('expected target product and draft fixture');
      state.category = product.category;
      state.editorLine = route.line;
      state.editorVersionId = version.id;
      const stages = structuredClone(version.stages),
        rootRows = [
          ...new Map(
            rootBom(targetCode).map((row) => [bomItemCodeKey(row.itemCode), row]),
          ).values(),
        ],
        missing =
          [...rootRows].reverse().find((row) => row.itemName?.trim()) ||
          rootRows.at(-1),
        routeOperations = route.stages.flatMap((stageCode) =>
          (stages[stageCode] || []).map((operation) => ({ stageCode, operation })),
        );
      if (routeOperations.length < 2 || rootRows.length < 3)
        throw new Error('fixture requires multiple operations and BOM items');
      Object.entries(stages).forEach(([stageCode, operations]) =>
        operations.forEach((operation) => {
          const participates = route.stages.includes(stageCode);
          operation.productCodes = participates ? [targetCode] : [];
          operation.bomSelections = participates ? { [targetCode]: [] } : {};
          operation.bomItems = [];
        }),
      );
      rootRows
        .filter(
          (row) => bomItemCodeKey(row.itemCode) !== bomItemCodeKey(missing.itemCode),
        )
        .forEach((row, index) => {
          const operation = routeOperations[index % routeOperations.length].operation;
          operation.bomSelections[targetCode].push(row.itemCode);
        });
      const outsideRoute = structuredClone(routeOperations[0].operation);
      outsideRoute.id = 'QA-OUTSIDE-ROUTE';
      outsideRoute.number = 'QA-OUTSIDE';
      outsideRoute.stageCode = 'A-OUTSIDE';
      outsideRoute.nextIds = [];
      outsideRoute.productCodes = [targetCode];
      outsideRoute.bomSelections = { [targetCode]: [missing.itemCode] };
      stages['A-OUTSIDE'] = [outsideRoute];
      state.editorByCategory[editorKey()] = stages;
      state.editorSubmissionVersionId = null;
      state.editorSubmissionErrors = [];
      render();
      const targetErrors = ProcessVersionValidation.validate(
        { category: state.category, line: state.editorLine, stages },
        targetCode,
      );
      return {
        targetCode,
        missingCode: missing.itemCode,
        missingName: missing.itemName,
        routeOperationCount: routeOperations.length,
        selectedMissing: Object.entries(stages).flatMap(([stageCode, items]) =>
          items
            .filter((operation) =>
              operation.bomSelections?.[targetCode]?.includes(missing.itemCode),
            )
            .map((operation) => ({ stageCode, id: operation.id })),
        ),
        targetErrors,
      };
    });
    assert.deepEqual(
      fixture.targetErrors.map((error) => ({ type: error.type, items: error.items })),
      [{ type: 'bom', items: [fixture.missingCode] }],
      'the union of selections across stages leaves only the intentionally omitted item',
    );

    await page.locator('#submit-version').click();
    const productRow = page.locator('.issue-product-row').filter({
      hasText: fixture.targetCode,
    });
    const productSummary = productRow.locator('summary').first();
    await productSummary.waitFor({ state: 'attached' });
    assert.ok((await productSummary.textContent()).includes('缺 1 個料號'));
    await page.locator('.editor-submit-issues > details > summary').click();
    await page
      .locator('.editor-submit-issues details[data-issue-group="bom"] > summary')
      .click();
    await productSummary.click();
    const missingList = productRow.locator('.issue-missing-bom');
    await missingList.waitFor({ state: 'visible' });
    const missingText = await missingList.innerText();
    assert.ok(missingText.includes(fixture.missingCode), missingText);
    assert.ok(missingText.includes(fixture.missingName), missingText);
    const unexpectedCovered = await page.evaluate(({ targetCode, missingCode }) => {
      const covered = rootBom(targetCode).find(
        (row) => row.itemCode !== missingCode,
      );
      return covered?.itemCode || '';
    }, fixture);
    assert.ok(!missingText.includes(unexpectedCovered), missingText);

    await page.locator('.top-language-switch').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('.issue-missing-bom > b')
          ?.textContent.includes('Mã BOM chưa được phân bổ'),
    );
    await page.locator('.top-language-switch').click();

    await page.setViewportSize({ width: 390, height: 844 });
    await missingList.scrollIntoViewIfNeeded();
    const mobile = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
      listWidth: document
        .querySelector('.issue-missing-bom')
        .getBoundingClientRect().width,
      repairVisible: Boolean(
        document.querySelector('.issue-product-row [data-submit-error]')
          ?.getClientRects().length,
      ),
    }));
    assert.ok(mobile.pageWidth <= mobile.viewport + 1, JSON.stringify(mobile));
    assert.ok(mobile.listWidth <= mobile.viewport, JSON.stringify(mobile));
    assert.equal(mobile.repairVisible, true);

    const repaired = await page.evaluate(({ targetCode, missingCode }) => {
      const stages = ensureCategoryEditor(),
        operation = Object.values(stages)
          .flat()
          .find((item) => item.productCodes?.includes(targetCode));
      operation.bomSelections[targetCode] = [
        ...new Set([...(operation.bomSelections[targetCode] || []), missingCode]),
      ];
      render();
      return ProcessVersionValidation.validate(
        { category: state.category, line: state.editorLine, stages },
        targetCode,
      );
    }, fixture);
    assert.deepEqual(repaired, []);
    await page.locator('.editor-submit-issues.resolved').waitFor();
    await page.locator('#submit-version').click();
    await page.waitForFunction(() => {
      const version = approvalVersions.find(
        (item) => item.id === state.editorVersionId,
      );
      return version?.status === 'pending';
    });
    await page.waitForTimeout(900);
    assert.ok(writes > 0, 'successful submission is persisted only to isolated API');
    assert.deepEqual(browserErrors, []);
    console.log('Build 5200 distributed BOM validation checks passed', {
      product: fixture.targetCode,
      operations: fixture.routeOperationCount,
      missingItem: fixture.missingCode,
      repaired: true,
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
