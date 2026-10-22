/* oxlint-disable typescript/no-require-imports -- real V3 API/controller against disposable memory storage. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const harness = require('./ipqc-ab-import-harness.cjs');
const fixture = require('./v3-quality-growth-fixture.cjs');

(async () => {
  const db = new DatabaseSync(':memory:'), objects = new Map();
  let browser;
  try {
    db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT);CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');
    const env = { PROCESS_SESSION_SECRET: randomUUID(), STATE_ARCHIVE: {
      async put(key, value) { objects.set(key, value); },
      async get(key) { return objects.has(key) ? { body: objects.get(key), text: async () => objects.get(key) } : null; },
      async head(key) { return objects.has(key) ? {} : null; },
    }, DB: { prepare(sql) { let args = []; return {
      bind(...values) { args = values; return this; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
    }; } } };
    const load = harness(env), core = load('lib/process-state.ts');
    const f = fixture('routine-equipment', [{ id: 'a'.repeat(64), bytes: 1 }], 1, 3);
    const password = randomUUID(), values = { ...f.values, platformUsers: JSON.stringify(['a', 'b'].map(id => ({
      id, name: id, role: 'admin', enabled: true, password, inheritRole: false,
      views: ['data', 'approval'], lines: ['A', 'B', 'C'],
      permissions: ['approval.submit', 'approval.withdraw', 'approval.approve', 'approval.reject', 'approval.compare', 'master.delete'],
    }))) };
    // A real formal quality reference produces the backend's error-kind issue.
    const quality = JSON.parse(fixture('ipqc-c', [{ id: 'a'.repeat(64), bytes: 1 }], 0, 1).values.ipqcCMasterControl);
    quality.versions.find(version => version.id === quality.activeVersionId).snapshot.items[0].equipmentId = 'row0';
    values.ipqcCMasterControl = JSON.stringify(quality);
    db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(await load('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE, values), 'fixture');
    const endpoint = 'https://fixture/api/routine-equipment/workflow?caseMetadata=1', api = load('app/api/routine-equipment/workflow/route.ts');
    const sessions = {};
    for (const id of ['a', 'b']) {
      const response = await load('app/api/platform-login/route.ts').POST(new Request('https://fixture/api/platform-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password }) }));
      assert.equal(response.status, 200);
      sessions[id] = { Cookie: response.headers.get('set-cookie').split(';')[0], Origin: 'https://fixture', 'Content-Type': 'application/json' };
    }
    assert.notEqual(sessions.a.Cookie, sessions.b.Cookie);
    const read = async () => (await (await api.GET(new Request(endpoint, { headers: sessions.a }))).json()).control.workflow;
    let sequence = 0;
    const command = async (action, detail = {}) => {
      const response = await api.POST(new Request(endpoint, { method: 'POST', headers: sessions.b, body: JSON.stringify({ command: {
        action, generation: (await read()).generation, operationId: randomUUID(), clientId: 'validation-b', sequence: ++sequence, ...detail,
      } }) }));
      const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
    };
    const patch = (id, field, value) => ({ op: 'set', path: ['equipment', { id }, field], value });
    await command('apply', { patches: [patch('row0', 'enabled', false), patch('row2', 'name', '')], guards: [{ path: patch('row0', 'enabled').path, value: true }] });
    await command('save');
    const beforeFailure = await read();
    browser = await chromium.launch({ ...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}), headless: true });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } }), page = await context.newPage(), errors = [], calls = [];
    const actor = await core.identity(new Request(endpoint, { headers: sessions.a }), await core.readState());
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'Kiểm tra vấn đề của bản đã lưu' : undefined));
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/process/styles.css"><link rel="stylesheet" href="/process/routine-equipment.css"><main id="data-content" data-active-tab="quality-routine-equipment"></main><script>window.ProcessSync={identity:${JSON.stringify(actor)},platformHeaders:()=>({'Content-Type':'application/json'})};window.hasPermission=()=>true;localStorage.setItem('processUILanguage','vi');</script><script src="/process/shared-draft-client.js"></script><script src="/process/routine-equipment.js"></script><script>RoutineEquipmentUI.mount(document.querySelector('#data-content'))</script></html>` });
      if (url.pathname.startsWith('/process/')) return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(path.join('public', url.pathname)) });
      if (url.pathname.endsWith('/photo')) return route.fulfill({ status: 404 });
      if (url.pathname.startsWith('/api/')) {
        const handler = load('app' + url.pathname + '/route.ts');
        const response = await handler[request.method()](new Request(url, { method: request.method(), headers: sessions.a, ...(request.method() === 'GET' ? {} : { body: request.postData() }) }));
        const body = await response.text();
        if (request.method() === 'POST') calls.push({ action: request.postDataJSON().command?.action, status: response.status, body: JSON.parse(body) });
        return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
      }
      return route.fulfill({ status: 404 });
    });
    await page.goto('https://fixture/fixture');
    await page.locator('#routine-search').fill('NO_MATCH');
    const submit = async () => {
      const count = calls.length;
      await page.locator('#routine-submit').click();
      await page.waitForFunction(() => !document.querySelector('#routine-submit')?.disabled);
      assert.equal(calls.length, count + 1, 'submission never silently saves');
      assert.equal(calls.at(-1).action, 'submit');
      return calls.at(-1);
    };
    const failed = await submit();
    assert.equal(failed.status, 422);
    assert.deepEqual(failed.body.details.issues.map(issue => issue.kind).sort(), ['error', 'missing']);
    assert.deepEqual(await read(), beforeFailure, 'failed validation must not mutate case, save or working content');
    // This assertion fails on the pre-fix controller despite real structured API errors.
    assert.equal(await page.locator('[data-routine-issue-kind="error"] .routine-error-item').count(), 1, 'backend reference error must be shown');
    assert.equal(await page.locator('[data-routine-issue-kind="missing"] .routine-error-item').count(), 1, 'missing field belongs only in its own panel');
    assert.equal(await page.locator('[data-routine-issue-kind][open]').count(), 2);
    assert.ok((await page.locator('[data-routine-issue-kind="missing"]').innerText()).includes(beforeFailure.saved.id));
    assert.ok((await page.locator('[data-routine-issue-kind="error"]').innerText()).includes('tiêu chuẩn'));
    const originalSubmit = await page.locator('#routine-submit').evaluate(button => document.activeElement === button);
    assert.equal(originalSubmit, true, 'new issues must not steal keyboard focus');
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => { document.body.style.zoom = '1.5'; });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true, 'problem panels contain narrow/zoom layout');
      const fix = page.locator('[data-fix-equipment="row2"]').first();
      await fix.scrollIntoViewIfNeeded();
      assert.ok((await fix.boundingBox()).height >= 40, 'correction is touch accessible');
      await fix.focus(); assert.equal(await fix.evaluate(button => button === document.activeElement), true);
      const evidence = path.resolve('.wrangler/local-only/v3-evidence');
      fs.mkdirSync(evidence, { recursive: true });
      await page.screenshot({ path: path.join(evidence, 'equipment-validation-20261003-' + width + '.png'), fullPage: true });
    }
    await page.evaluate(() => { document.body.style.zoom = '1'; });
    await page.locator('[data-fix-equipment="row2"]').first().click();
    const name = page.locator('#routine-editor [data-field="name"]');
    await name.waitFor();
    assert.equal(await page.locator('#routine-search').inputValue(), '');
    await page.waitForFunction(() => document.activeElement?.matches('#routine-editor [data-field="name"]'));
    assert.ok((await page.locator('#routine-editor').innerText()).includes('Mã, tên và nhóm'), 'inline saved-field validation uses selected Vietnamese language');
    await name.fill('Tên đã sửa nhưng chưa lưu · '.repeat(12));
    await page.locator('#routine-form-apply').click();
    await page.locator('#routine-editor').waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-routine-issue-kind="missing"] .routine-error-item').count(), 1, 'working repair cannot erase saved-snapshot issue');
    assert.deepEqual((await read()).saved, beforeFailure.saved);
    assert.equal((await submit()).status, 422, 'unchanged saved snapshot still fails');
    assert.equal(await page.locator('[data-routine-issue-kind] .routine-error-item').count(), 2, 'retry replaces rather than duplicates issues');
    await page.evaluate(() => localStorage.setItem('processUILanguage', 'zh'));
    await page.locator('#routine-save').click();
    await page.waitForFunction(() => !document.querySelector('#routine-save')?.disabled);
    assert.equal(await page.locator('[data-routine-issue-kind]').count(), 0, 'new save invalidates old validation, without declaring it valid');
    assert.equal((await submit()).status, 422);
    assert.equal(await page.locator('[data-routine-issue-kind="missing"]').count(), 0);
    assert.ok((await page.locator('[data-routine-issue-kind="error"]').innerText()).includes('正式標準'));
    await command('apply', { patches: [patch('row0', 'enabled', true)], guards: [{ path: patch('row0', 'enabled').path, value: false }] });
    await page.waitForFunction(() => document.querySelector('#routine-shared-status')?.textContent.includes('尚未手動儲存'), {}, { timeout: 12000 });
    await page.locator('#routine-save').click();
    await page.waitForFunction(() => !document.querySelector('#routine-save')?.disabled);
    assert.equal((await submit()).status, 200);
    const after = await read(); assert.ok(after.pendingId);
    assert.equal(after.cases.length, beforeFailure.cases.length + 1);
    assert.deepEqual(after.cases.slice(0, -1), beforeFailure.cases);
    assert.equal(await page.locator('[data-routine-issue-kind]').count(), 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS_EQUIPMENT_VALIDATION', isolated: true, localWrites: 0, desktop: 1366, narrow: 390, cssZoom: 1.5, cases: ['structured-error-and-missing', 'saved-versus-working', 'filtered-field-navigation', 'focus', 'touch-targets', 'retry-dedup', 'zh-vi', 'save-revalidation', 'successful-submit'] }));
  } finally { if (browser) await browser.close(); db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
