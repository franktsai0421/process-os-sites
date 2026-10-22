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
      (isolatedTestTarget_20261010+"/process/?build=20260910-5300&manage=1"),
    );
    await page.locator('[data-view=editor]').click();
    await page.locator('.operation-block').first().waitFor();

    const fixture = await page.evaluate(() => {
      const operations = Object.values(ensureCategoryEditor()).flat();
      let match;
      for (const current of operations) {
        for (const productCode of current.productCodes || []) {
          const currentCodes = new Set(
            (current.bomSelections?.[productCode] || []).map(bomItemCodeKey),
          );
          const other = operations.find(
            (candidate) =>
              candidate.id !== current.id &&
              candidate.productCodes?.includes(productCode) &&
              (candidate.bomSelections?.[productCode] || []).some(
                (code) => !currentCodes.has(bomItemCodeKey(code)),
              ),
          );
          const elsewhereCode = other?.bomSelections?.[productCode]?.find(
            (code) => !currentCodes.has(bomItemCodeKey(code)),
          );
          if (other && elsewhereCode) {
            match = { current, other, productCode, elsewhereCode };
            break;
          }
        }
        if (match) break;
      }
      if (!match)
        throw new Error('fixture needs a BOM code used by another operation');
      state.selectedOperation = match.current.id;
      render();
      ProcessOpenOperation(match.current);
      return {
        currentId: match.current.id,
        currentNumber: match.current.number,
        otherId: match.other.id,
        otherNumber: match.other.number,
        otherName: match.other.name,
        productCode: match.productCode,
        elsewhereCode: match.elsewhereCode,
      };
    });

    const dialog = page.locator('#process-operation-dialog'),
      group = dialog.locator(`[data-bom-group="${fixture.productCode}"]`),
      checkbox = group.locator(
        `[data-bom-product="${fixture.productCode}"][data-bom-code="${fixture.elsewhereCode}"]`,
      ),
      usage = group.locator(
        `[data-bom-usage-product="${fixture.productCode}"][data-bom-usage-code="${fixture.elsewhereCode}"]`,
      );
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await checkbox.isChecked(), false);
    assert.equal(await checkbox.isDisabled(), true);
    const usageText = await usage.innerText();
    assert.ok(usageText.includes('已使用於'), usageText);
    assert.ok(usageText.includes(fixture.otherNumber), usageText);
    assert.ok(usageText.includes(fixture.otherName), usageText);
    assert.ok(!usageText.includes(fixture.currentNumber), usageText);

    await page.evaluate(() =>
      document.querySelector('.top-language-switch').click(),
    );
    await page.waitForFunction(
      ({ productCode, itemCode }) => {
        const text = document.querySelector(
          `[data-bom-usage-product="${productCode}"][data-bom-usage-code="${itemCode}"]`,
        )?.textContent;
        return (
          text?.includes('Đã dùng tại') &&
          text?.includes('Hãy bỏ chọn tại thẻ ban đầu trước')
        );
      },
      { productCode: fixture.productCode, itemCode: fixture.elsewhereCode },
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await usage.scrollIntoViewIfNeeded();
    const mobilePage = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        pageWidth: document.documentElement.scrollWidth,
        applyVisible: Boolean(
          document.querySelector('#apply-operation')?.getClientRects().length,
        ),
      })),
      mobileRow = await usage.evaluate((element) => ({
        rowWidth: element.closest('label').getBoundingClientRect().width,
        usageWidth: element.getBoundingClientRect().width,
      })),
      mobile = { ...mobilePage, ...mobileRow };
    assert.ok(mobile.pageWidth <= mobile.viewport + 1, JSON.stringify(mobile));
    assert.ok(mobile.usageWidth <= mobile.rowWidth, JSON.stringify(mobile));
    assert.equal(mobile.applyVisible, true);
    assert.deepEqual(errors, []);
    console.log('Build 5300 BOM usage labels passed', {
      product: fixture.productCode,
      item: fixture.elsewhereCode,
      existingOperation: fixture.otherNumber,
      currentOperation: fixture.currentNumber,
      mobile,
    });
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
