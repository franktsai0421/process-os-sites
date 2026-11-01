// Read-only styling regression for the other React entries sharing globals.css.
// Paired mode compares exact compiled builds; smoke mode does not claim parity.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createRootEntryFixture, nativeFailureDiagnostics} from './root-entry-native-fixture.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const mode = process.env.PROCESS_LOGIN_STYLE_MODE || 'paired';
const routes = ['/setup/owner', '/setup/import', '/setup/startup-assets'];
const viewports = [
  {name: 'desktop', width: 1365, height: 900, mobile: false},
  {name: 'mobile', width: 390, height: 844, mobile: true},
];
const report = {
  status: 'PENDING', mode, environment: 'compiled-local-browser-synthetic',
  programCommit: process.env.PROCESS_PROGRAM_COMMIT,
  scope: {
    routes, viewports, anonymous: true, formSubmission: false, mutationsAllowed: false,
    realCredentials: false, realData: false, physicalDevice: false,
    comparison: 'all rendered visible DOM elements, computed styles, bounds and static text; no script elements or build hashes',
    assets: 'every file under both compiled client/process trees, exact bytes and relative paths',
  },
  builds: {}, cases: [], comparisons: [],
};
let fixture, browser, activeContext, activeCase, stage = 'configuration';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function progress(value) {
  stage = value;
  console.log(JSON.stringify({status: 'STYLE_SCOPE_PROGRESS', stage}));
}

function assetManifest(directory) {
  const rows = [];
  function visit(relative = '') {
    for (const name of fs.readdirSync(path.join(directory, relative)).sort()) {
      const entry = path.join(relative, name), full = path.join(directory, entry);
      const stat = fs.lstatSync(full);
      assert.equal(stat.isSymbolicLink(), false, 'SPA_ASSET_SYMLINK');
      if (stat.isDirectory()) visit(entry);
      else {
        assert.equal(stat.isFile(), true, 'SPA_ASSET_NOT_FILE');
        const bytes = fs.readFileSync(full);
        rows.push({path: entry.split(path.sep).join('/'), bytes: bytes.length, sha256: hash(bytes)});
      }
    }
  }
  visit();
  assert.ok(rows.some(row => row.path === 'index.html'), 'SPA_ENTRY_MISSING');
  assert.ok(rows.some(row => row.path === 'bootstrap.js'), 'SPA_BOOTSTRAP_MISSING');
  return rows;
}

function compareAssets(baseline, candidate) {
  const beforeRoot = path.join(baseline, 'client/process');
  const afterRoot = path.join(candidate, 'client/process');
  const before = assetManifest(beforeRoot), after = assetManifest(afterRoot);
  const beforePaths = before.map(row => row.path), afterPaths = after.map(row => row.path);
  const missing = beforePaths.filter(name => !afterPaths.includes(name));
  const added = afterPaths.filter(name => !beforePaths.includes(name));
  const changed = beforePaths.filter(name => afterPaths.includes(name)
    && !fs.readFileSync(path.join(beforeRoot, name)).equals(fs.readFileSync(path.join(afterRoot, name))));
  const result = {status: missing.length || added.length || changed.length ? 'FAIL' : 'PASS_EXACT_BYTES',
    files: before.length, bytes: before.reduce((sum, row) => sum + row.bytes, 0),
    baselineTreeSha256: hash(JSON.stringify(before)), candidateTreeSha256: hash(JSON.stringify(after)),
    missing, added, changed, manifest: before};
  report.processAssets = result;
  assert.deepEqual(missing, [], 'SPA_ASSET_MISSING');
  assert.deepEqual(added, [], 'SPA_ASSET_ADDED');
  assert.deepEqual(changed, [], 'SPA_ASSET_BYTES_CHANGED');
}

async function renderedStyles(page) {
  return page.evaluate(() => {
    const properties = [
      'display', 'position', 'boxSizing', 'visibility', 'opacity', 'direction',
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch',
      'lineHeight', 'letterSpacing', 'wordSpacing', 'textAlign', 'textIndent',
      'textTransform', 'textDecorationLine', 'textDecorationStyle', 'textDecorationColor',
      'textDecorationThickness', 'textOverflow', 'whiteSpace', 'wordBreak', 'overflowWrap',
      'color', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundRepeat',
      'backgroundPosition', 'backgroundClip', 'backgroundOrigin', 'backgroundAttachment',
      'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'aspectRatio',
      'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
      'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
      'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
      'borderCollapse', 'borderSpacing', 'outlineWidth', 'outlineStyle', 'outlineColor', 'outlineOffset',
      'boxShadow', 'overflowX', 'overflowY', 'rowGap', 'columnGap',
      'gridTemplateColumns', 'gridTemplateRows', 'gridAutoFlow', 'gridAutoRows', 'gridAutoColumns',
      'alignContent', 'alignItems', 'alignSelf', 'justifyContent', 'justifyItems', 'justifySelf',
      'flexDirection', 'flexWrap', 'flexGrow', 'flexShrink', 'flexBasis', 'order',
      'listStyleType', 'listStylePosition', 'listStyleImage', 'verticalAlign',
      'appearance', 'cursor', 'transform', 'transformOrigin',
    ];
    const omitted = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE']);
    const styles = computed => Object.fromEntries(properties.map(name => [name, computed[name]]));
    const elements = [];
    function visit(element, location) {
      if (omitted.has(element.tagName)) return;
      const computed = getComputedStyle(element), rect = element.getBoundingClientRect();
      // "Visible" means rendered anywhere in the full document, including below
      // the fold. Do not compare the changing hidden RSC/script transport nodes.
      if (computed.display !== 'none' && computed.visibility !== 'hidden'
        && computed.visibility !== 'collapse' && Number(computed.opacity) !== 0
        && element.getClientRects().length && rect.width > 0 && rect.height > 0) {
        const pseudos = {};
        for (const pseudo of ['::before', '::after']) {
          const value = getComputedStyle(element, pseudo);
          if (!['none', 'normal', ''].includes(value.content))
            pseudos[pseudo] = {content: value.content, styles: styles(value)};
        }
        elements.push({location, tag: element.tagName.toLowerCase(),
          id: element.getAttribute('id'), name: element.getAttribute('name'),
          type: element.getAttribute('type'), role: element.getAttribute('role'),
          disabled: 'disabled' in element ? element.disabled : null,
          text: [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent).join('').replace(/\s+/g, ' ').trim(),
          bounds: Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(rect[key] * 100) / 100])),
          styles: styles(computed), pseudos});
      }
      const siblings = new Map();
      for (const child of element.children) {
        if (omitted.has(child.tagName)) continue;
        const count = (siblings.get(child.tagName) || 0) + 1;
        siblings.set(child.tagName, count);
        visit(child, location + '/' + child.tagName.toLowerCase() + ':' + count);
      }
    }
    visit(document.documentElement, 'html');
    return {viewport: {width: innerWidth, height: innerHeight},
      document: {width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight},
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, elements};
  });
}

try {
  assert.ok(['paired', 'smoke'].includes(mode), 'INVALID_STYLE_MODE');
  const candidate = path.resolve(process.env.PROCESS_LOGIN_STYLE_CANDIDATE_BUILD
    || process.env.PROCESS_TEST_BUILD_DIR || 'dist');
  const baseline = process.env.PROCESS_LOGIN_STYLE_BASELINE_BUILD;
  if (mode === 'paired') {
    assert.ok(baseline, 'PROCESS_LOGIN_STYLE_BASELINE_BUILD_REQUIRED');
    compareAssets(path.resolve(baseline), candidate);
  } else report.processAssets = {status: 'NOT_COMPARED_CANDIDATE_SMOKE_ONLY',
    files: assetManifest(path.join(candidate, 'client/process')).length};
  progress('browser launch');
  const bundled = chromium.executablePath();
  const launchTarget = process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH}
    : fs.existsSync(bundled) ? {executablePath: bundled} : {channel: 'chrome'};
  browser = await chromium.launch({headless: true, ...launchTarget,
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run']});
  report.browserVersion = browser.version();
  const builds = mode === 'paired' ? {baseline: path.resolve(baseline), candidate} : {candidate};
  for (const [variant, buildDirectory] of Object.entries(builds)) {
    progress(variant + ' isolated fixture');
    const programCommit = variant === 'baseline'
      ? process.env.PROCESS_LOGIN_STYLE_BASELINE_COMMIT || process.env.PROCESS_PROGRAM_COMMIT
      : process.env.PROCESS_PROGRAM_COMMIT;
    fixture = await createRootEntryFixture({buildDirectory, programCommit,
      syntheticBindings: {PROCESS_IMPORT_ENABLED: '0', PROCESS_OWNER_BOOTSTRAP_ENABLED: '0', DEMO_LOGIN_ENABLED: 'false'}});
    report.builds[variant] = {programCommit, serverEntrySha256: fixture.buildEntrySha256};
    const origin = fixture.url.origin;
    for (const viewport of viewports) for (const route of routes) {
      const caseStage = variant + ' ' + viewport.name + ' ' + route;
      progress(caseStage + ' context setup');
      activeCase = {variant, viewport: viewport.name, route, requests: 0,
        documentStatus: null, documentLoaded: false, uiReady: false, apiResponses: [], violations: []};
      const context = await browser.newContext({serviceWorkers: 'block', locale: 'en-US', timezoneId: 'UTC',
        viewport: {width: viewport.width, height: viewport.height},
        isMobile: viewport.mobile, hasTouch: viewport.mobile});
      activeContext = context;
      assert.equal((await context.cookies()).length, 0, 'ANONYMOUS_COOKIES_REQUIRED');
      const {violations, apiResponses} = activeCase;
      let requests = 0;
      await context.route('**/*', requestRoute => {
        const request = requestRoute.request(), url = new URL(request.url());
        if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method())) {
          violations.push('UNEXPECTED_REQUEST'); return requestRoute.abort();
        }
        activeCase.requests = ++requests;
        if (requests > 250) {violations.push('REQUEST_BOUND_EXCEEDED'); return requestRoute.abort();}
        return requestRoute.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on('pageerror', () => violations.push('PAGE_ERROR'));
      page.on('requestfailed', () => violations.push('FAILED_REQUEST'));
      page.on('response', response => {
        const pathname = new URL(response.url()).pathname;
        if (pathname.startsWith('/api/')) apiResponses.push({path: pathname, status: response.status()});
        else if (response.status() >= 400) violations.push('PROGRAM_ASSET_HTTP_FAILURE');
      });
      progress(caseStage + ' document navigation');
      const response = await page.goto(origin + route, {waitUntil: 'domcontentloaded'});
      activeCase.documentStatus = response.status();
      activeCase.documentLoaded = true;
      assert.equal(response.status(), 200, 'ENTRY_HTTP_STATUS');
      progress(caseStage + ' explicit anonymous UI readiness');
      if (route === '/setup/import') {
        await page.waitForFunction(() => document.querySelector('main output')?.textContent
          ?.includes('無法取得管理員匯入權限或設定'));
        assert.equal(apiResponses.length, 1, 'IMPORT_CONFIGURATION_READ_COUNT');
        assert.equal(apiResponses[0].path, '/api/snapshots/import', 'IMPORT_CONFIGURATION_READ_PATH');
      } else if (route === '/setup/startup-assets') {
        await page.waitForFunction(() => document.querySelector('main [role="alert"]')?.textContent
          ?.includes('請正常登入 Frank 管理員後重開本頁'));
        assert.equal(apiResponses.length, 1, 'STARTUP_STATUS_READ_COUNT');
        assert.equal(apiResponses[0].path, '/api/setup/startup-assets', 'STARTUP_STATUS_READ_PATH');
        assert.equal(await page.locator('input[type="file"]').count(), 0, 'ANONYMOUS_UPLOAD_CONTROL');
      } else {
        await page.locator('main h1').waitFor({state: 'visible'});
        assert.equal(await page.locator('input[type="password"]').count(), 3, 'OWNER_FORM_FIELDS');
        assert.deepEqual(apiResponses, [], 'OWNER_PAGE_SHOULD_NOT_SUBMIT');
      }
      assert.ok(apiResponses.every(row => row.status >= 400), 'ANONYMOUS_API_MUST_DENY');
      activeCase.uiReady = true;
      progress(caseStage + ' fonts and rendered styles');
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const snapshot = await renderedStyles(page);
      assert.ok(snapshot.elements.length > 5, 'VISIBLE_ELEMENTS_MISSING');
      assert.equal(snapshot.horizontalOverflow, false, 'HORIZONTAL_OVERFLOW');
      assert.deepEqual(violations, [], 'READ_ONLY_BROWSER_VIOLATIONS');
      assert.equal((await context.cookies()).length, 0, 'ANONYMOUS_COOKIE_CREATED');
      report.cases.push({variant, viewport: viewport.name, route, status: 'PASS_READ_ONLY_RENDER',
        requests, apiResponses, snapshot, violations});
      progress(caseStage + ' completed');
      await context.close(); activeContext = undefined;
      activeCase = undefined;
    }
    for (const table of ['shared_state', 'state_backups', 'process_owner_bootstrap',
      'process_login_limits', 'process_revoked_sessions', 'process_snapshot_transfers']) {
      assert.equal((await fixture.db.prepare('SELECT count(*) n FROM ' + table).first()).n, 0,
        'ANONYMOUS_RENDER_CREATED_RECORDS');
    }
    report.builds[variant].noBusinessOrCredentialRecords = true;
    await fixture.close(); fixture = undefined;
  }
  if (mode === 'paired') {
    progress('paired visible style equality');
    for (const viewport of viewports) for (const route of routes) {
      const before = report.cases.find(row => row.variant === 'baseline' && row.viewport === viewport.name && row.route === route);
      const after = report.cases.find(row => row.variant === 'candidate' && row.viewport === viewport.name && row.route === route);
      const result = {viewport: viewport.name, route, visibleElements: before.snapshot.elements.length,
        equal: JSON.stringify(before.snapshot) === JSON.stringify(after.snapshot)};
      report.comparisons.push(result);
      assert.deepEqual(after.apiResponses, before.apiResponses, 'ANONYMOUS_READ_STATUS_CHANGED');
      assert.deepEqual(after.snapshot, before.snapshot, 'VISIBLE_STYLE_OR_GEOMETRY_CHANGED');
    }
  }
  report.status = mode === 'paired' ? 'PASS_PAIRED_STYLE_AND_PROCESS_ASSETS' : 'PASS_CANDIDATE_SMOKE_ONLY';
} catch (error) {
  report.status = 'FAIL_STYLE_SCOPE'; report.failedStage = stage;
  if (activeCase) report.failedCase = {...activeCase,
    apiResponses: activeCase.apiResponses.slice(0, 250), violations: [...new Set(activeCase.violations)]};
  report.errorType = error?.constructor?.name || 'UnknownError';
  report.diagnostics = nativeFailureDiagnostics(error);
  const sourceLocation = String(error?.stack || '').match(/login-style-scope-browser\.test\.mjs:(\d+):(\d+)/);
  if (sourceLocation) report.sourceLocation = {line: Number(sourceLocation[1]), column: Number(sourceLocation[2])};
  // No raw request/response/error, credential, cookie or database values.
  if (typeof error?.actual === 'number') report.actual = error.actual;
  if (typeof error?.expected === 'number') report.expected = error.expected;
} finally {
  for (const [name, close] of [
    ['context', () => activeContext?.close()], ['browser', () => browser?.close()], ['fixture', () => fixture?.close()],
  ]) {
    try {await close();} catch {report.status = 'FAIL_STYLE_SCOPE'; (report.cleanupFailures ||= []).push(name);}
  }
  report.disposed = !report.cleanupFailures;
}
const output = path.resolve('.sites-runtime', 'login-style-scope-' + (mode === 'smoke' ? 'smoke' : 'paired') + '.json');
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, mode, cases: report.cases.length,
  comparisons: report.comparisons, processAssetStatus: report.processAssets?.status,
  failedStage: report.failedStage, failedCase: report.failedCase,
  sourceLocation: report.sourceLocation, disposed: report.disposed}));
process.exitCode = report.status.startsWith('PASS_') ? 0 : 1;
