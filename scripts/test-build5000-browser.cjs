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
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto(
      (isolatedTestTarget_20261010+"/process/?build=20260910-5000&manage=1"),
    );
    await page.locator('[data-view=editor]').click();
    await page.locator('.operation-block').first().waitFor();

    const initial = await page.evaluate(() => {
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
      window.__qaOriginalStages = structuredClone(version.stages);
      const stages = structuredClone(version.stages),
        required = rootBom(targetCode).map((row) => row.itemCode),
        operations = Object.values(stages).flat(),
        first = operations[0];
      operations.forEach((operation) => {
        operation.productCodes = route.stages.includes(operation.stageCode)
          ? [targetCode]
          : [];
        operation.bomSelections = route.stages.includes(operation.stageCode)
          ? { [targetCode]: [] }
          : {};
        operation.bomItems = [];
      });
      first.bomSelections[targetCode] = required.slice(0, 2);
      first.bomItems = required.slice(0, 2);
      state.editorByCategory[editorKey()] = stages;
      state.editorSubmissionVersionId = null;
      render();
      return {
        targetCode,
        requiredCount: new Set(required.map(bomItemCodeKey)).size,
      };
    });

    await page.locator('#submit-version').click();
    const issueSummary = page.locator('.issue-product-row summary').filter({
      hasText: initial.targetCode,
    });
    await issueSummary.waitFor({ state: 'attached' });
    const issueText = await issueSummary.textContent();
    assert.ok(
      issueText.includes(`缺 ${initial.requiredCount - 2} 個料號`),
      issueText,
    );
    await page.locator('.top-language-switch').click();
    await page.waitForFunction(
      ({ targetCode, missingCount }) =>
        [...document.querySelectorAll('.issue-product-row summary')]
          .find((element) => element.textContent.includes(targetCode))
          ?.textContent.includes(`thiếu ${missingCount} mã vật tư`),
      {
        targetCode: initial.targetCode,
        missingCount: initial.requiredCount - 2,
      },
    );
    await page.locator('.top-language-switch').click();

    const repaired = await page.evaluate(({ targetCode }) => {
      const stages = ensureCategoryEditor(),
        originals = window.__qaOriginalStages;
      Object.values(stages)
        .flat()
        .forEach((operation) => {
          const source = Object.values(originals)
            .flat()
            .find((item) => item.id === operation.id);
          if (!source || !routeFor(targetCode).stages.includes(operation.stageCode))
            return;
          operation.productCodes = [...source.productCodes, targetCode];
          operation.bomSelections = {
            ...structuredClone(source.bomSelections),
            [targetCode]: operation.bomSelections[targetCode] || [],
          };
        });
      render();
      const targetSelections = Object.values(ensureCategoryEditor())
          .flat()
          .flatMap((operation) => operation.bomSelections?.[targetCode] || []),
        targetErrors = ProcessVersionValidation.validate(
          {
            category: state.category,
            line: state.editorLine,
            stages: ensureCategoryEditor(),
          },
          targetCode,
        ),
        allErrors = ProcessVersionValidation.validate({
          category: state.category,
          line: state.editorLine,
          stages: ensureCategoryEditor(),
        });
      return {
        assignedCount: new Set(targetSelections.map(bomItemCodeKey)).size,
        targetErrors,
        allErrors,
      };
    }, initial);
    assert.equal(repaired.assignedCount, initial.requiredCount);
    assert.deepEqual(repaired.targetErrors, []);
    assert.deepEqual(repaired.allErrors, []);
    await page.locator('.editor-submit-issues.resolved').waitFor();
    assert.ok(
      (await page.locator('.editor-submit-issues.resolved').innerText()).includes(
        '可以重新送審',
      ),
    );

    await page.locator('#submit-version').click();
    await page.waitForFunction(() => {
      const version = approvalVersions.find(
        (item) => item.id === state.editorVersionId,
      );
      return version?.status === 'pending';
    });
    await page.waitForTimeout(1200);
    assert.ok(writes > 0, 'successful submission is persisted to the isolated API');
    assert.deepEqual(errors, []);
    console.log('Build 5000 BOM submission checks passed', {
      target: initial.targetCode,
      required: initial.requiredCount,
      inherited: repaired.assignedCount,
      writes,
    });
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
