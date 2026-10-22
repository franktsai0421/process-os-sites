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
      (isolatedTestTarget_20261010+"/process/?build=20260910-5100&manage=1"),
    );
    await page.locator('[data-view=editor]').click();
    await page.locator('.operation-block').first().waitFor();

    const fixture = await page.evaluate(() => {
      const operations = Object.values(ensureCategoryEditor()).flat();
      let match;
      for (const current of operations) {
        for (const productCode of current.productCodes || []) {
          const currentCodes = new Set(
            current.bomSelections?.[productCode] || [],
          );
          const required = new Set(
            rootBom(productCode).map((row) => row.itemCode),
          );
          const other = operations.find(
            (operation) =>
              operation.id !== current.id &&
              (operation.bomSelections?.[productCode] || []).some(
                (code) => required.has(code) && !currentCodes.has(code),
              ),
          );
          const elsewhereCode = other?.bomSelections?.[productCode]?.find(
            (code) => required.has(code) && !currentCodes.has(code),
          );
          if (other && elsewhereCode) {
            match = { current, other, productCode, elsewhereCode };
            break;
          }
        }
        if (match) break;
      }
      if (!match)
        throw new Error('fixture needs a BOM code assigned to another process');
      state.selectedOperation = match.current.id;
      render();
      ProcessOpenOperation(match.current);
      return {
        operationId: match.current.id,
        otherOperationId: match.other.id,
        productCode: match.productCode,
        elsewhereCode: match.elsewhereCode,
        rootCount: rootBom(match.productCode).length,
        initialCount: match.current.bomSelections[match.productCode].length,
      };
    });

    const dialog = page.locator('#process-operation-dialog'),
      group = dialog.locator(`[data-bom-group="${fixture.productCode}"]`),
      checkboxes = group.locator('[data-bom-product][data-bom-code]'),
      elsewhere = group.locator(
        `[data-bom-product="${fixture.productCode}"][data-bom-code="${fixture.elsewhereCode}"]`,
      );
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await checkboxes.count(), fixture.rootCount);
    assert.equal(await elsewhere.count(), 1, 'BOM used elsewhere remains visible');
    assert.equal(await elsewhere.isChecked(), false);
    assert.equal(
      await elsewhere.isDisabled(),
      true,
      'BOM used elsewhere stays visible but cannot be assigned twice',
    );
    assert.ok(
      !(await group.textContent()).includes('已全部分配至其他流程'),
      await group.textContent(),
    );

    const stored = await page.evaluate(
      ({ operationId, otherOperationId, productCode, elsewhereCode }) => {
        const operations = Object.values(ensureCategoryEditor()).flat(),
          current = operations.find((item) => item.id === operationId),
          other = operations.find((item) => item.id === otherOperationId);
        return {
          current: current.bomSelections[productCode].includes(elsewhereCode),
          other: other.bomSelections[productCode].includes(elsewhereCode),
        };
      },
      fixture,
    );
    assert.deepEqual(stored, { current: false, other: true });
    assert.ok(
      (await group.locator('.bom-count').textContent()).includes(
        `${fixture.initialCount} 已選／${fixture.rootCount} 個料號`,
      ),
    );

    await page.evaluate(() =>
      document.querySelector('.top-language-switch').click(),
    );
    await page.waitForFunction(
      ({ productCode, count }) =>
        document
          .querySelector(`[data-bom-group="${productCode}"] .bom-count`)
          ?.textContent.includes(`${count} mã vật tư`),
      { productCode: fixture.productCode, count: fixture.rootCount },
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await elsewhere.scrollIntoViewIfNeeded();
    const mobile = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
      dialogWidth: document
        .querySelector('#process-operation-dialog')
        .getBoundingClientRect().width,
      applyVisible: Boolean(
        document.querySelector('#apply-operation')?.getClientRects().length,
      ),
    }));
    assert.ok(mobile.pageWidth <= mobile.viewport + 1, JSON.stringify(mobile));
    assert.ok(mobile.dialogWidth <= mobile.viewport + 1, JSON.stringify(mobile));
    assert.equal(mobile.applyVisible, true);
    assert.deepEqual(errors, []);
    console.log('Build 5100 complete BOM list checks passed', {
      product: fixture.productCode,
      visibleItems: fixture.rootCount,
      exclusiveAssignment: stored,
      mobile,
    });
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
