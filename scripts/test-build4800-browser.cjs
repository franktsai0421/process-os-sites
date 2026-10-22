const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    require('./browser-test-runtime.cjs').playwrightModule,
);

async function uploadGeneratedPhoto(page, selector, name) {
  await page.evaluate(
    async ({ selector, name }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 2200;
      canvas.height = 1400;
      const context = canvas.getContext('2d');
      const pixels = context.createImageData(canvas.width, canvas.height);
      let value = 17;
      for (let index = 0; index < pixels.data.length; index += 4) {
        value = (value * 48271) % 2147483647;
        pixels.data[index] = value & 255;
        pixels.data[index + 1] = (value >> 4) & 255;
        pixels.data[index + 2] = (value >> 8) & 255;
        pixels.data[index + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      );
      window.__qaOriginalPhotoBytes = blob.size;
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], name, { type: 'image/png' }));
      const input = document.querySelector(selector);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { selector, name },
  );
}

async function inspectPhoto(page, kind, productCode, name) {
  return page.evaluate(
    async ({ kind, productCode, name }) => {
      const operation = Object.values(ensureCategoryEditor())
        .flat()
        .find((item) => item.id === state.selectedOperation);
      const list =
        kind === 'product'
          ? operation.productMediaItems?.[productCode] || []
          : operation.mediaItems || [];
      const item = list.find((entry) => entry.name === name);
      if (!item) return null;
      const blob = await fetch(item.src).then((response) => response.blob());
      const image = await createImageBitmap(blob);
      const result = {
        name: item.name,
        type: item.type,
        width: image.width,
        height: image.height,
        bytes: blob.size,
        originalBytes: window.__qaOriginalPhotoBytes,
      };
      image.close();
      return result;
    },
    { kind, productCode, name },
  );
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
      (isolatedTestTarget_20261010+"/process/?build=20260910-4800&manage=1"),
    );
    await page.locator('[data-view=editor]').click();
    await page.locator('.operation-block').first().waitFor();

    const fixture = await page.evaluate(() => {
      const operation = Object.values(ensureCategoryEditor()).flat()[0];
      const product = data.products.find(
        (item) =>
          item.category === state.category &&
          routeFor(item.code)?.line === state.editorLine &&
          routeFor(item.code)?.stages.includes(operation.stageCode),
      );
      operation.productCodes = [product.code];
      operation.noteProductCode = product.code;
      operation.productInstructions = operation.productInstructions || {};
      operation.productMediaItems = operation.productMediaItems || {};
      operation.productMediaItems[product.code] = [];
      operation.mediaItems = [];
      operation.media = null;
      operation.mediaName = '';
      operation.mediaType = '';
      state.selectedOperation = operation.id;
      render();
      ProcessOpenOperation(operation);
      return { operationId: operation.id, productCode: product.code };
    });

    const dialog = page.locator('#process-operation-dialog');
    await dialog.waitFor({ state: 'visible' });
    assert.ok(
      (await dialog.locator('#operation-media').locator('..').innerText()).includes(
        '1600px',
      ),
      'common photo upload explains automatic compression',
    );

    await uploadGeneratedPhoto(page, '#operation-media', 'qa-common.png');
    await page.waitForFunction(() =>
      Object.values(ensureCategoryEditor())
        .flat()
        .some((operation) =>
          operation.mediaItems?.some((item) => item.name === 'qa-common.webp'),
        ),
    );
    const common = await inspectPhoto(
      page,
      'common',
      fixture.productCode,
      'qa-common.webp',
    );
    assert.equal(common.type, 'image/webp');
    assert.ok(Math.max(common.width, common.height) <= 1600);
    assert.ok(common.bytes < common.originalBytes, 'common photo is smaller');

    const productSelector = `[data-product-media-input="${fixture.productCode}"]`;
    await uploadGeneratedPhoto(page, productSelector, 'qa-product.png');
    await page.waitForFunction(
      ({ productCode }) =>
        Object.values(ensureCategoryEditor())
          .flat()
          .some((operation) =>
            operation.productMediaItems?.[productCode]?.some(
              (item) => item.name === 'qa-product.webp',
            ),
          ),
      { productCode: fixture.productCode },
    );
    const product = await inspectPhoto(
      page,
      'product',
      fixture.productCode,
      'qa-product.webp',
    );
    assert.equal(product.type, 'image/webp');
    assert.ok(Math.max(product.width, product.height) <= 1600);
    assert.ok(product.bytes < product.originalBytes, 'product photo is smaller');

    await page.evaluate(() => document.querySelector('.top-language-switch').click());
    await page.waitForTimeout(80);
    assert.ok(
      (await dialog.locator('.product-media-upload small').innerText()).includes(
        'tự động nén',
      ),
      'Vietnamese mode explains automatic photo compression',
    );

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
      dialogWidth: document.querySelector('#process-operation-dialog').getBoundingClientRect()
        .width,
    }));
    assert.ok(mobile.pageWidth <= mobile.viewport + 1, JSON.stringify(mobile));
    assert.ok(mobile.dialogWidth <= mobile.viewport + 1, JSON.stringify(mobile));
    assert.deepEqual(errors, []);
    console.log('Build 4800 browser checks passed', { common, product, mobile });
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
