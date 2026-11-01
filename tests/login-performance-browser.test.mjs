// Five real browser logins against the compiled, isolated Worker. No hosted
// endpoint, employee account, persistent database or pre-signed session is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {createRootEntryFixture, nativeFailureDiagnostics} from './root-entry-native-fixture.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const phases = ['pageOpen', 'credentials', 'homepage'];
const label = process.env.PROCESS_LOGIN_BENCHMARK_LABEL || 'candidate';
assert.match(label, /^[a-z0-9_-]{1,40}$/);
const actor = 'synthetic-login-benchmark';
const signer = randomBytes(32).toString('hex');
const password = randomBytes(24).toString('base64url');
const report = {
  status: 'PENDING', label, environment: 'compiled-local-browser-synthetic',
  programCommit: process.env.PROCESS_PROGRAM_COMMIT, samples: [], summary: {},
  realData: false, realCredentials: false, externalNetwork: false,
  conditions: {
    iterations: 5, viewport: {width: 1365, height: 900},
    browserContexts: 'fresh for every iteration; service workers blocked; routing disables browser cache',
    worker: 'one fresh compiled Worker reused for all five samples; no unreported warmup or discarded sample',
    password: 'runtime random; production passwordHash; scrypt N=32768 r=8 p=3',
    clock: 'one Node performance.now driver clock across both documents',
    pageOpen: 'before goto /login until real system-button effects confirm hydration, restored to process',
    credentials: 'before driver submit click until POST response headers arrive with status 200',
    homepage: 'same POST-200 boundary through navigation, authoritative readiness and an account-menu click effect',
    bytes: 'eventual response-body bytes from Request.sizes, not bytes before stage end; start-phase attribution only; unavailable metadata stays null',
    responseHeaderWait: 'driver request event to response event; login document, login POST, or sum of homepage document redirect hops; excludes asset waits and rendering',
    idle: 'credential filling, validations and teardown are outside the three timed intervals',
  },
};
let fixture, browser, activeContext;
let stage = 'setup';
function mark(value) {
  stage = value;
  console.log(JSON.stringify({label, stage}));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
const round = value => Math.round(value * 100) / 100;

async function chooseSystem(page, index, system, touch = false) {
  const deadline = performance.now() + 60000;
  let clicks = 0;
  // SSR controls can be visible before React has attached handlers. Repeating
  // this display-only action measures readiness without a window marker,
  // a fixed warmup sleep or submitting credentials prematurely.
  while (performance.now() < deadline) {
    const button = page.locator('.site-entry-systems button').nth(index);
    if (touch) await button.tap(); else await button.click();
    clicks++;
    if (await page.evaluate(({index, system}) => new URL(location.href).searchParams.get('system') === system
      && document.querySelectorAll('.site-entry-systems button')[index]?.getAttribute('aria-pressed') === 'true',
    {index, system})) return clicks;
  }
  throw Error('LOGIN_HYDRATION_TIMEOUT');
}

async function loginStyles(page) {
  return page.evaluate(() => {
    const selectors = ['.site-entry', '.site-entry-panel', '.site-entry-brand', '.site-entry-brand h1',
      'label[for="id"]', '#id', '#password', '.site-entry-submit', '#entry-line'];
    const properties = ['display', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color',
      'backgroundColor', 'margin', 'padding', 'borderWidth', 'borderStyle', 'borderColor', 'borderRadius'];
    const elements = Object.fromEntries(selectors.map(selector => {
      const element = document.querySelector(selector);
      if (!element) throw Error('LOGIN_STYLE_ELEMENT_MISSING');
      const rect = element.getBoundingClientRect(), computed = getComputedStyle(element);
      return [selector, {bounds: Object.fromEntries(['x', 'y', 'width', 'height']
        .map(key => [key, Math.round(rect[key] * 100) / 100])),
      styles: Object.fromEntries(properties.map(key => [key, computed[key]]))}];
    }));
    return {viewport: {width: innerWidth, height: innerHeight},
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, elements};
  });
}

try {
  mark('create isolated compiled fixture');
  fixture = await createRootEntryFixture({syntheticBindings: {
    PROCESS_IMPORT_ENABLED: '0', PROCESS_SESSION_SECRET: signer,
    PROCESS_SESSION_REVOCATION_ENABLED: '1', DEMO_LOGIN_ENABLED: 'false',
  }});
  report.buildEntrySha256 = fixture.buildEntrySha256;
  const bucket = await fixture.mf.getR2Bucket('STATE_ARCHIVE');
  const load = require('../scripts/ipqc-ab-import-harness.cjs')({STATE_ARCHIVE: bucket});
  const hashed = await load('lib/passwords.ts').passwordHash(password);
  assert.match(hashed, /^scrypt\$32768\$8\$3\$[a-f0-9]{48}\$[a-f0-9]{128}$/);
  const user = {id: actor, name: 'Synthetic login benchmark', role: 'admin', primary: true,
    enabled: true, authMode: 'platform', authEpoch: 1, passwordHash: hashed};
  assert.equal(Object.hasOwn(user, 'password'), false);
  const catalog = line => ({name: line,
    products: [{code: line + '1', name: 'Synthetic product', category: 'CAT-' + line,
      line, unit: 'pcs', stages: [line + '-CUT']}],
    lines: [{code: line, name: 'Synthetic line', stages: [{code: line + '-CUT',
      name: 'Synthetic stage', machine: 'Synthetic machine', assetNumber: 'FIXTURE', operators: 1}]}],
    categoryGroups: [{line, name: 'CAT-' + line}],
  });
  const active = {AB: catalog('A'), C: catalog('C'), PROCESS: {}};
  const values = {
    platformUsers: JSON.stringify([user]), backupSettings: '{"enabled":false}',
    masterDataControl: JSON.stringify({active, versions: []}),
    processMasterData: '{}', bomOverrides: '{"replaceAll":true,"data":{}}',
    dispatchBoard: '{"A":[],"B":[],"C":[]}',
  };
  const raw = await load('lib/state-records.ts').encodeRecordValues(bucket, values);
  await fixture.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,700,?,?)')
    .bind(raw, 'synthetic').run();

  mark('launch isolated browser');
  const bundled = chromium.executablePath();
  const launchTarget = process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH}
    : fs.existsSync(bundled) ? {executablePath: bundled} : {channel: 'chrome'};
  browser = await chromium.launch({headless: true, ...launchTarget,
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run']});
  report.browserVersion = browser.version();
  const origin = fixture.url.origin;

  for (let iteration = 1; iteration <= 5; iteration++) {
    mark('iteration ' + iteration + ' setup');
    const context = await browser.newContext({serviceWorkers: 'block', viewport: report.conditions.viewport});
    activeContext = context;
    assert.equal((await context.cookies()).length, 0);
    const violations = [], rows = new Map();
    let phase = 'idle', authHeadersAt = null, submitAt = null;
    let resolveLogin;
    const loginResponse = new Promise(resolve => {resolveLogin = resolve;});
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) {violations.push('EXTERNAL_REQUEST'); return route.abort();}
      if (!['GET', 'HEAD'].includes(request.method())
        && !(request.method() === 'POST' && url.pathname === '/api/platform-login' && phase === 'credentials')) {
        violations.push('UNEXPECTED_MUTATION'); return route.abort();
      }
      if (rows.size > 250) {violations.push('REQUEST_BOUND_EXCEEDED'); return route.abort();}
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on('pageerror', () => {violations.push('PAGE_ERROR');});
    page.on('request', request => {
      let complete;
      const completion = new Promise(resolve => {complete = resolve;});
      rows.set(request, {phase, at: performance.now(), path: new URL(request.url()).pathname,
        method: request.method(), resourceType: request.resourceType(), status: null,
        headersAt: null, bodyBytes: null, finishedAt: null,
        failed: false, completion, complete});
    });
    page.on('response', response => {
      const row = rows.get(response.request());
      if (!row) {violations.push('UNTRACKED_RESPONSE'); return;}
      row.status = response.status();
      row.headersAt = performance.now();
      if (row.status >= 400) violations.push('HTTP_FAILURE');
      if (row.method === 'POST' && row.path === '/api/platform-login') {
        if (phase !== 'credentials' || authHeadersAt !== null) violations.push('DUPLICATE_OR_LATE_LOGIN');
        authHeadersAt = row.headersAt;
        // The app navigates on response.ok, without awaiting the response body.
        // This single timestamp ends stage two and starts stage three.
        phase = 'homepage';
        resolveLogin(response);
      }
    });
    page.on('requestfinished', request => {
      const row = rows.get(request);
      if (!row) return;
      row.finishedAt = performance.now();
      void request.sizes().then(sizes => {
        if (Number.isFinite(sizes.responseBodySize) && sizes.responseBodySize >= 0)
          row.bodyBytes = sizes.responseBodySize;
      }, () => {}).finally(() => row.complete());
    });
    page.on('requestfailed', request => {
      const row = rows.get(request);
      if (row) {row.failed = true; row.finishedAt = performance.now(); row.complete();}
    });

    mark('iteration ' + iteration + ' login page usability');
    phase = 'pageOpen';
    const pageOpenAt = performance.now();
    await page.goto(origin + '/login', {waitUntil: 'domcontentloaded'});
    await page.locator('#id').waitFor({state: 'visible'});
    assert.equal(await page.locator('#id').isEditable(), true);
    assert.equal(await page.locator('#password').isEditable(), true);
    const hydrationProbeClicks = await chooseSystem(page, 1, 'quality') + await chooseSystem(page, 0, 'process');
    assert.equal(await page.locator('.site-entry-submit').isEnabled(), true);
    const pageOpenEnd = performance.now();
    phase = 'idle';
    const loginStyle = await loginStyles(page);
    assert.equal(loginStyle.horizontalOverflow, false);
    await page.locator('#id').fill(actor);
    await page.locator('#password').fill(password);

    mark('iteration ' + iteration + ' submit and homepage');
    phase = 'credentials';
    submitAt = performance.now();
    await page.locator('.site-entry-submit').click();
    let response, loginTimer;
    try {
      response = await Promise.race([loginResponse,
        new Promise((_, reject) => {loginTimer = setTimeout(() => reject(Error('LOGIN_RESPONSE_TIMEOUT')), 60000);})]);
    } finally {clearTimeout(loginTimer);}
    assert.equal(response.status(), 200);
    assert.ok(authHeadersAt >= submitAt);
    await page.waitForFunction(expected => window.ProcessSync?.identity?.id === expected
      && window.ProcessSync?.destination?.key === 'dashboard'
      && document.documentElement.dataset.processNavigationStatus === 'ready'
      && document.documentElement.dataset.processDestinationReadyGeneration
        === document.documentElement.dataset.processDestinationGeneration
      && !document.querySelector('#process-boot')
      && document.querySelector('#view-root')?.textContent?.trim(), actor, {timeout: 60000});
    assert.equal(await page.locator('#retry-page-load').count(), 0);
    assert.equal(await page.locator('#view-root [role="alert"]:not(:empty)').count(), 0);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.locator('#account-button').click();
    await page.waitForFunction(() => document.querySelector('#account-menu')?.classList.contains('open'));
    const homeEnd = performance.now();
    phase = 'idle';

    mark('iteration ' + iteration + ' correctness and completed request sizes');
    // Login navigates as soon as headers arrive; its response body can be
    // abandoned with the old document. Identity is proved by the new document's
    // authenticated bootstrap above, never by trying to re-read that old body.
    const cookie = (await context.cookies()).find(item => item.name === 'process_demo');
    assert.ok(cookie?.value);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Strict');
    const measured = [...rows.values()].filter(row => phases.includes(row.phase));
    let completionTimer;
    try {
      await Promise.race([Promise.all(measured.filter(row => row.method !== 'POST').map(row => row.completion)),
        new Promise(resolve => {completionTimer = setTimeout(resolve, 3000);})]);
    } finally {clearTimeout(completionTimer);}
    const network = Object.fromEntries(phases.map(name => {
      const assigned = measured.filter(row => row.phase === name);
      const missing = assigned.filter(row => row.bodyBytes === null).length;
      const measuredBytes = assigned.reduce((sum, row) => sum + (row.bodyBytes || 0), 0);
      return [name, {requests: assigned.length, responseBodyBytes: missing ? null : measuredBytes,
        measuredResponseBodyBytes: measuredBytes, unavailableSizeCount: missing,
        failedRequests: assigned.filter(row => row.failed).length,
        completionUnobserved: assigned.filter(row => row.finishedAt === null).length,
        statuses: assigned.reduce((counts, row) => {
          const key = String(row.status ?? 'unavailable'); counts[key] = (counts[key] || 0) + 1; return counts;
        }, {})}];
    }));
    const loginRows = measured.filter(row => row.method === 'POST' && row.path === '/api/platform-login');
    assert.equal(loginRows.length, 1);
    const headerRows = measured.filter(row => row.resourceType === 'document'
      || row.method === 'POST' && row.path === '/api/platform-login');
    assert(headerRows.every(row => row.headersAt !== null));
    const responseHeaderWaitMs = Object.fromEntries(phases.map(name => [name,
      round(headerRows.filter(row => row.phase === name).reduce((sum, row) => sum + row.headersAt - row.at, 0))]));
    const sample = {iteration, hydrationProbeClicks, loginStyle,
      elapsedMs: {pageOpen: round(pageOpenEnd - pageOpenAt),
      credentials: round(authHeadersAt - submitAt), homepage: round(homeEnd - authHeadersAt)}, network,
      responseHeaderWaitMs,
      headerRequests: headerRows.map(row => ({phase: row.phase, path: row.path, status: row.status,
        requestToHeadersMs: round(row.headersAt - row.at)})),
      loginPost: {status: response.status(), requestToHeadersMs: round(authHeadersAt - loginRows[0].at),
        responseBodyBytes: loginRows[0].bodyBytes},
      correctness: {actor: true, destination: 'dashboard', readyGeneration: true,
        normalHttpOnlyCookie: true, accountMenuAction: true, noBootOrRetryOrAlerts: true},
      idleRequests: [...rows.values()].filter(row => row.phase === 'idle').length,
      resources: measured.slice(0, 250).map(row => ({phase: row.phase, path: row.path,
        method: row.method, status: row.status, responseBodyBytes: row.bodyBytes,
        driverRequestToFinishedMs: row.finishedAt === null ? null : round(row.finishedAt - row.at),
        failed: row.failed})),
      violations: [...new Set(violations)],
    };
    report.samples.push(sample);
    assert.deepEqual(violations, []);
    // The old document can abandon the POST body after its successful headers.
    // Keep its unavailable byte total explicit; every other request must finish.
    const unexplained = measured.filter(row => (row.bodyBytes === null || row.failed)
      && !(row.method === 'POST' && row.path === '/api/platform-login' && row.status === 200));
    assert.equal(unexplained.length, 0);
    await context.close();
    activeContext = undefined;
  }
  mark('mobile viewport display and touch smoke');
  const mobile = await browser.newContext({serviceWorkers: 'block',
    viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  activeContext = mobile;
  const mobileViolations = [];
  await mobile.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin || !['GET', 'HEAD'].includes(request.method())) {
      mobileViolations.push('MOBILE_UNEXPECTED_REQUEST'); return route.abort();
    }
    return route.continue();
  });
  const mobilePage = await mobile.newPage();
  mobilePage.on('pageerror', () => {mobileViolations.push('MOBILE_PAGE_ERROR');});
  await mobilePage.goto(origin + '/login', {waitUntil: 'domcontentloaded'});
  await chooseSystem(mobilePage, 1, 'quality', true);
  await chooseSystem(mobilePage, 0, 'process', true);
  const mobileStyle = await loginStyles(mobilePage);
  assert.equal(mobileStyle.horizontalOverflow, false);
  await mobilePage.locator('.site-entry-roles button').first().tap();
  assert.equal(await mobilePage.evaluate(() => document.activeElement?.id), 'id');
  assert.equal(await mobilePage.locator('#id').isEditable(), true);
  assert.equal(await mobilePage.locator('#password').isEditable(), true);
  assert.deepEqual(mobileViolations, []);
  report.mobileSmoke = {status: 'PASS_VIEWPORT_SIMULATION', physicalDevice: false,
    loginStyle: mobileStyle, systemToggle: true, touchFocus: true, noCredentialsSubmitted: true};
  await mobile.close();
  activeContext = undefined;

  // Separate HTTP evidence consumes the whole POST response without document
  // navigation. These decoded bytes never replace missing browser transfer data.
  mark('five separate compiled HTTP login responses');
  const httpSamples = [];
  for (let iteration = 1; iteration <= 5; iteration++) {
    const requestBody = JSON.stringify({id: actor, password});
    const started = performance.now();
    const response = await fetch(origin + '/api/platform-login', {method: 'POST',
      headers: {Origin: origin, 'Content-Type': 'application/json'},
      body: requestBody, signal: AbortSignal.timeout(15000)});
    const headersAt = performance.now();
    const body = await response.text();
    const finished = performance.now();
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(body).user.id, actor);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    httpSamples.push({iteration, requests: 1, status: response.status,
      headersMs: round(headersAt - started), completeMs: round(finished - started),
      requestBodyBytes: Buffer.byteLength(requestBody), decodedResponseBodyBytes: Buffer.byteLength(body)});
  }
  report.httpPostSupplement = {environment: 'compiled-local-http-synthetic',
    boundary: 'separate requests after browser trials; Node fetch consumes full response; decoded bytes, not browser transfer',
    samples: httpSamples,
    medianMs: median(httpSamples.map(sample => sample.completeMs)),
    maximumMs: Math.max(...httpSamples.map(sample => sample.completeMs))};
  mark('unchanged synthetic business state');
  assert.equal((await fixture.db.prepare('SELECT "values" v FROM shared_state WHERE id=1').first()).v, raw);
  report.businessStateUnchanged = true;
  report.summary = Object.fromEntries(phases.map(name => [name, {
    elapsedMs: {median: median(report.samples.map(sample => sample.elapsedMs[name])),
      maximum: Math.max(...report.samples.map(sample => sample.elapsedMs[name]))},
    responseHeaderWaitMs: {median: median(report.samples.map(sample => sample.responseHeaderWaitMs[name])),
      maximum: Math.max(...report.samples.map(sample => sample.responseHeaderWaitMs[name]))},
    requests: {median: median(report.samples.map(sample => sample.network[name].requests)),
      maximum: Math.max(...report.samples.map(sample => sample.network[name].requests))},
    responseBodyBytes: report.samples.some(sample => sample.network[name].responseBodyBytes === null)
      ? {median: null, maximum: null, status: 'PARTIAL_METADATA_UNAVAILABLE'}
      : {median: median(report.samples.map(sample => sample.network[name].responseBodyBytes)),
        maximum: Math.max(...report.samples.map(sample => sample.network[name].responseBodyBytes)), status: 'COMPLETE'},
    correctSamples: report.samples.length,
  }]));
  report.status = 'PASS_COMPILED_LOCAL_LOGIN_BROWSER';
} catch (error) {
  report.status = 'FAIL_COMPILED_LOCAL_LOGIN_BROWSER';
  report.failedStage = stage;
  report.errorType = error?.constructor?.name || 'UnknownError';
  report.diagnostics = nativeFailureDiagnostics(error);
  const diagnosticText = String(error?.message || '') + ' ' + String(error?.cause?.message || '');
  report.knownFailureReasons = [
    ['PERMISSION_DENIED', /EACCES|Permission denied/i],
    ['OPERATION_NOT_PERMITTED', /EPERM|Operation not permitted/i],
    ['BROWSER_SANDBOX_UNAVAILABLE', /No usable sandbox|SUID sandbox|Failed to move to new namespace/i],
    ['EXECUTABLE_OR_FILE_MISSING', /Executable doesn.t exist|ENOENT|executable.*not found/i],
  ].filter(([, pattern]) => pattern.test(diagnosticText)).map(([code]) => code);
  const sourceLocation = String(error?.stack || '').match(/login-performance-browser\.test\.mjs:(\d+):(\d+)/);
  if (sourceLocation) report.sourceLocation = {line: Number(sourceLocation[1]), column: Number(sourceLocation[2])};
  // No raw error, URL, request body, password, signer, cookie or database content.
  if (typeof error?.actual === 'number') report.actual = error.actual;
  if (typeof error?.expected === 'number') report.expected = error.expected;
  console.log(JSON.stringify({label, status: report.status, failedStage: report.failedStage,
    errorType: report.errorType, sourceLocation: report.sourceLocation, diagnostics: report.diagnostics,
    environmentFailure: report.environmentFailure, actual: report.actual, expected: report.expected}));
} finally {
  console.log(JSON.stringify({label, stage: 'dispose owned fixture and browser'}));
  if (activeContext) await activeContext.close();
  if (browser) await browser.close();
  if (fixture) await fixture.close();
  report.disposed = true;
}
const output = path.resolve('.sites-runtime', 'login-performance-' + label + '.json');
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({...report, samples: report.samples.map(sample => ({
  iteration: sample.iteration, elapsedMs: sample.elapsedMs, responseHeaderWaitMs: sample.responseHeaderWaitMs,
  headerRequests: sample.headerRequests, network: sample.network,
  loginPost: sample.loginPost, correctness: sample.correctness, violations: sample.violations,
})), mobileSmoke: report.mobileSmoke ? {...report.mobileSmoke, loginStyle: undefined} : undefined}));
process.exitCode = report.status === 'PASS_COMPILED_LOCAL_LOGIN_BROWSER' ? 0 : 1;
