// A local synthetic preview check. Configuration (including login) is stdin-only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export function validateConfig(input) {
  const url = new URL(input.origin);
  assert.equal(url.protocol, 'http:');
  assert(['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname));
  assert(url.port && url.pathname === '/' && !url.search && !url.hash);
  assert(!url.username && !url.password);
  assert.equal(input.isolationConfirmed, true);
  for (const key of [
    'account',
    'password',
    'expectedTitle',
    'expectedComposition',
  ]) {
    assert(
      typeof input[key] === 'string' &&
        input[key].length > 0 &&
        input[key].length <= 512,
    );
  }
  for (const key of ['equipmentCount', 'photoWidth']) {
    assert(
      Number.isSafeInteger(input[key]) && input[key] > 0 && input[key] <= 10000,
    );
  }
  return { ...input, origin: url.origin };
}

export async function smoke(input, options = {}) {
  const config = validateConfig(input);
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch({
    headless: true,
    ...(options.browserPath ? { executablePath: options.browserPath } : {}),
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      serviceWorkers: 'block',
    });
    let blockedRequests = 0;
    await context.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin !== config.origin) {
        blockedRequests++;
        await route.abort();
        return;
      }
      // continue() does not intercept every redirect hop. Fetch exactly one
      // response and refuse redirects, including same-origin redirect chains.
      // This smoke requires a direct-response isolated fixture, not a proxy.
      let response;
      try {
        response = await route.fetch({ maxRedirects: 0 });
        if (response.status() >= 300 && response.status() < 400) {
          blockedRequests++;
          await route.abort();
        } else {
          await route.fulfill({ response });
        }
      } catch {
        // Network failures may contain URLs or request details. Keep the
        // failure inside the same fixed-diagnostic boundary as the CLI.
        blockedRequests++;
        await route.abort().catch(() => {});
      } finally {
        await response?.dispose().catch(() => {});
      }
    });
    // Check the isolated preview label before sending any login credentials.
    const response = await context.request.get(config.origin + '/process/', {
      maxRedirects: 0,
    });
    assert.equal(response.status(), 200);
    const shell = await response.text();
    assert(
      shell.includes(config.expectedTitle) && shell.includes('隔離合成資料'),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    let pageErrors = 0;
    page.on('pageerror', () => pageErrors++);
    await page.goto(config.origin + '/login?view=data&dataTab=process-master');
    assert.equal(new URL(page.url()).origin, config.origin);
    await page.locator('#id').fill(config.account);
    assert.equal(new URL(page.url()).origin, config.origin);
    await page.locator('#password').fill(config.password);
    assert.equal(new URL(page.url()).origin, config.origin);
    await page.locator('.site-entry-submit').click();
    await page.locator('#add-master-template').waitFor();
    assert((await page.title()).includes(config.expectedTitle));
    const text = await page.locator('body').innerText();
    assert(
      text.includes(config.expectedTitle) &&
        text.includes(config.expectedComposition),
    );
    await page.waitForFunction(
      (width) =>
        document.querySelector('.process-template-preview img')
          ?.naturalWidth === width,
      config.photoWidth,
    );
    assert.equal(
      await page.locator('#equipment-panel tbody tr').count(),
      config.equipmentCount,
    );
    const statuses = await page.evaluate(() =>
      window.MasterDataWorkflow.shared
        .flow('PROCESS')
        .cases.map((entry) => entry.status),
    );
    assert(statuses.includes('returned') && statuses.includes('withdrawn'));
    await page.locator('.process-template-preview').first().click();
    await page.locator('.media-lightbox-zoom').click();
    assert.equal(
      await page.locator('.media-lightbox-zoom').getAttribute('aria-pressed'),
      'true',
    );
    await page.locator('.media-lightbox-close').click();
    assert.equal(pageErrors, 0);
    assert.equal(blockedRequests, 0);
    return {
      status: 'PASS_LOCAL_SYNTHETIC_PREVIEW',
      checks: [
        'isolated-label-before-login',
        'normal-login',
        'expected-version',
        'photos-decoded',
        'equipment-count',
        'returned-withdrawn-history',
        'photo-zoom',
      ],
      // No credentials, origin, page text, screenshots or traces in the receipt.
      realData: false,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  if (process.argv[2] === '--help') {
    process.stdout.write(
      'Usage: node preview-smoke.mjs [--browser-path PATH] < private-config.json\n' +
        'Required stdin fields: origin, isolationConfirmed:true, account, password, ' +
        'expectedTitle, expectedComposition, equipmentCount, photoWidth.\n' +
        'Only explicit-port HTTP loopback previews are accepted; no screenshots or traces are created.\n',
    );
    return;
  }
  assert(
    process.argv.length === 2 ||
      (process.argv.length === 4 && process.argv[2] === '--browser-path'),
  );
  const buffer = fs.readFileSync(0);
  assert(buffer.length <= 16384);
  const config = validateConfig(JSON.parse(buffer.toString('utf8')));
  process.stdout.write(
    JSON.stringify(await smoke(config, { browserPath: process.argv[3] })) +
      '\n',
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    // Playwright errors can contain entered values; never serialize them.
    process.stdout.write(
      '{"status":"FAIL","code":"PREVIEW_SMOKE_CHECK_FAILED"}\n',
    );
    process.exitCode = 1;
  });
}
