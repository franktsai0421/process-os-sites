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
    await page.goto(
      (isolatedTestTarget_20261010+"/process/?build=20260910-4900&manage=1"),
    );
    await page.locator('[data-view=editor]').click();
    await page.locator('.operation-block').first().waitFor();

    const fixture = await page.evaluate(() => {
      const key = (value) => String(value || '').trim().toUpperCase();
      const candidates = data.products.filter(
        (product) =>
          product.category === state.category &&
          routeFor(product.code)?.line === state.editorLine,
      );
      let match;
      for (let left = 0; left < candidates.length && !match; left += 1) {
        for (let right = left + 1; right < candidates.length; right += 1) {
          const first = candidates[left],
            second = candidates[right],
            commonStage = routeFor(first.code).stages.find((stageCode) =>
              routeFor(second.code).stages.includes(stageCode),
            ),
            firstRows = rootBom(first.code),
            secondRows = rootBom(second.code),
            secondKeys = new Set(secondRows.map((row) => key(row.itemCode))),
            sharedRows = firstRows.filter((row) =>
              secondKeys.has(key(row.itemCode)),
            );
          if (commonStage && sharedRows.length >= 2)
            match = { first, second, commonStage, firstRows, secondRows, sharedRows };
        }
      }
      if (!match) throw new Error('fixture needs products with shared BOM codes');
      const sharedCode = match.sharedRows[0].itemCode,
        untouchedSharedCode = match.sharedRows[1].itemCode,
        firstKeys = new Set(match.firstRows.map((row) => key(row.itemCode))),
        uniqueSecond = match.secondRows.find(
          (row) => !firstKeys.has(key(row.itemCode)),
        )?.itemCode;
      const source = Object.values(ensureCategoryEditor()).flat()[0],
        operation = {
          ...structuredClone(source),
          id: 'QA-BOM-SYNC',
          stageCode: match.commonStage,
          number: `${match.commonStage}-99`,
          name: 'QA BOM 同料號同步',
          productCodes: [match.first.code, match.second.code],
          bomProductCode: match.first.code,
          bomItems: [sharedCode],
          bomSelections: {
            [match.first.code]: [sharedCode],
            [match.second.code]: [],
          },
          nextIds: [],
          x: 30,
          y: 30,
        },
        stages = {};
      categoryStageCodes(state.category).forEach(
        (stageCode) =>
          (stages[stageCode] = stageCode === match.commonStage ? [operation] : []),
      );
      state.editorByCategory[editorKey()] = stages;
      state.selectedOperation = operation.id;
      render();
      ProcessOpenOperation(operation);
      return {
        firstCode: match.first.code,
        secondCode: match.second.code,
        sharedCode,
        untouchedSharedCode,
        uniqueSecond,
      };
    });

    const dialog = page.locator('#process-operation-dialog');
    await dialog.waitFor({ state: 'visible' });
    const checkbox = (productCode, itemCode) =>
      dialog.locator(
        `[data-bom-product="${productCode}"][data-bom-code="${itemCode}"]`,
      );
    const firstShared = checkbox(fixture.firstCode, fixture.sharedCode),
      secondShared = checkbox(fixture.secondCode, fixture.sharedCode),
      untouched = checkbox(fixture.secondCode, fixture.untouchedSharedCode);

    assert.equal(await firstShared.isChecked(), true);
    assert.equal(
      await secondShared.isChecked(),
      true,
      'an existing selection is inherited by another selected product with the same item code',
    );
    assert.equal(
      await untouched.isChecked(),
      false,
      'a different item code is not selected automatically',
    );

    await dialog
      .locator(`[data-bom-group="${fixture.secondCode}"] > header`)
      .click();
    await secondShared.uncheck();
    assert.equal(await firstShared.isChecked(), false);
    assert.equal(await secondShared.isChecked(), false);
    await firstShared.check();
    assert.equal(await firstShared.isChecked(), true);
    assert.equal(await secondShared.isChecked(), true);
    const stored = await page.evaluate(({ firstCode, secondCode, sharedCode }) => {
      const operation = Object.values(ensureCategoryEditor())
        .flat()
        .find((item) => item.id === 'QA-BOM-SYNC');
      return {
        first: operation.bomSelections[firstCode],
        second: operation.bomSelections[secondCode],
        sharedCode,
      };
    }, fixture);
    assert.ok(stored.first.includes(stored.sharedCode));
    assert.ok(stored.second.includes(stored.sharedCode));

    await page.setViewportSize({ width: 390, height: 844 });
    await secondShared.scrollIntoViewIfNeeded();
    await secondShared.uncheck();
    assert.equal(await firstShared.isChecked(), false);
    assert.equal(await secondShared.isChecked(), false);
    const mobile = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
      dialogWidth: document
        .querySelector('#process-operation-dialog')
        .getBoundingClientRect().width,
    }));
    assert.ok(mobile.pageWidth <= mobile.viewport + 1, JSON.stringify(mobile));
    assert.ok(mobile.dialogWidth <= mobile.viewport + 1, JSON.stringify(mobile));
    assert.deepEqual(errors, []);
    console.log('Build 4900 browser checks passed', { fixture, mobile });
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
