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
      (isolatedTestTarget_20261010+"/process/?build=20260910-5400&manage=1"),
    );
    await page.locator('[data-view=editor]').click();
    await page.locator('.operation-block').first().waitFor();

    const fixture = await page.evaluate(() => {
      const operations = Object.values(ensureCategoryEditor()).flat();
      let match;
      for (const destination of operations) {
        for (const productCode of destination.productCodes || []) {
          const destinationCodes = new Set(
            (destination.bomSelections?.[productCode] || []).map(bomItemCodeKey),
          );
          const source = operations.find(
            (candidate) =>
              candidate.id !== destination.id &&
              candidate.productCodes?.includes(productCode) &&
              (candidate.bomSelections?.[productCode] || []).some(
                (code) => !destinationCodes.has(bomItemCodeKey(code)),
              ),
          );
          const itemCode = source?.bomSelections?.[productCode]?.find(
            (code) => !destinationCodes.has(bomItemCodeKey(code)),
          );
          if (source && itemCode) {
            match = { source, destination, productCode, itemCode };
            break;
          }
        }
        if (match) break;
      }
      if (!match)
        throw new Error('fixture needs a source assignment and empty destination');
      state.openBomGroups = state.openBomGroups || {};
      state.openBomGroups[match.destination.id] = [match.productCode];
      ProcessOpenOperation(match.destination);
      return {
        sourceId: match.source.id,
        sourceNumber: match.source.number,
        destinationId: match.destination.id,
        destinationNumber: match.destination.number,
        productCode: match.productCode,
        itemCode: match.itemCode,
      };
    });

    const checkbox = () =>
        page.locator(
          `[data-bom-product="${fixture.productCode}"][data-bom-code="${fixture.itemCode}"]`,
        ),
      usage = () =>
        page.locator(
          `[data-bom-usage-product="${fixture.productCode}"][data-bom-usage-code="${fixture.itemCode}"]`,
        );
    assert.equal(await checkbox().isChecked(), false);
    assert.equal(await checkbox().isDisabled(), true);
    assert.ok((await usage().innerText()).includes(fixture.sourceNumber));
    assert.ok((await usage().innerText()).includes('請先到原方塊取消勾選'));

    await page.evaluate(({ sourceId, productCode }) => {
      const source = Object.values(ensureCategoryEditor())
        .flat()
        .find((operation) => operation.id === sourceId);
      state.openBomGroups[source.id] = [productCode];
      ProcessOpenOperation(source);
    }, fixture);
    assert.equal(await checkbox().isChecked(), true);
    assert.equal(await checkbox().isDisabled(), false);
    await checkbox().uncheck();
    await page.waitForFunction(
      ({ sourceId, productCode, itemCode }) => {
        const source = Object.values(ensureCategoryEditor())
          .flat()
          .find((operation) => operation.id === sourceId);
        return !(source.bomSelections?.[productCode] || []).some(
          (code) => bomItemCodeKey(code) === bomItemCodeKey(itemCode),
        );
      },
      fixture,
    );

    await page.evaluate(({ destinationId, productCode }) => {
      const destination = Object.values(ensureCategoryEditor())
        .flat()
        .find((operation) => operation.id === destinationId);
      state.openBomGroups[destination.id] = [productCode];
      ProcessOpenOperation(destination);
    }, fixture);
    assert.equal(await checkbox().isChecked(), false);
    assert.equal(await checkbox().isDisabled(), false);
    assert.equal((await usage().innerText()).trim(), '');
    await checkbox().check();
    await page.waitForFunction(
      ({ destinationId, productCode, itemCode }) => {
        const destination = Object.values(ensureCategoryEditor())
          .flat()
          .find((operation) => operation.id === destinationId);
        return (destination.bomSelections?.[productCode] || []).some(
          (code) => bomItemCodeKey(code) === bomItemCodeKey(itemCode),
        );
      },
      fixture,
    );
    const movedUsage = await usage().innerText();
    assert.ok(movedUsage.includes(fixture.destinationNumber), movedUsage);
    assert.ok(movedUsage.includes('本方塊'), movedUsage);
    assert.ok(!movedUsage.includes(fixture.sourceNumber), movedUsage);

    const stored = await page.evaluate(
      ({ sourceId, destinationId, productCode, itemCode }) => {
        const operations = Object.values(ensureCategoryEditor()).flat(),
          hasItem = (id) =>
            (
              operations.find((operation) => operation.id === id)
                ?.bomSelections?.[productCode] || []
            ).some(
              (code) => bomItemCodeKey(code) === bomItemCodeKey(itemCode),
            );
        return { source: hasItem(sourceId), destination: hasItem(destinationId) };
      },
      fixture,
    );
    assert.deepEqual(stored, { source: false, destination: true });

    await page.evaluate(() =>
      document.querySelector('.top-language-switch').click(),
    );
    await page.waitForFunction(
      ({ productCode, itemCode }) =>
        document
          .querySelector(
            `[data-bom-usage-product="${productCode}"][data-bom-usage-code="${itemCode}"]`,
          )
          ?.textContent.includes('Thẻ này'),
      { productCode: fixture.productCode, itemCode: fixture.itemCode },
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await usage().scrollIntoViewIfNeeded();
    const mobile = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
      applyVisible: Boolean(
        document.querySelector('#apply-operation')?.getClientRects().length,
      ),
    }));
    assert.ok(mobile.pageWidth <= mobile.viewport + 1, JSON.stringify(mobile));
    assert.equal(mobile.applyVisible, true);
    assert.deepEqual(errors, []);
    console.log('Build 5400 exclusive BOM transfer passed', {
      product: fixture.productCode,
      item: fixture.itemCode,
      from: fixture.sourceNumber,
      to: fixture.destinationNumber,
      stored,
      mobile,
    });
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
