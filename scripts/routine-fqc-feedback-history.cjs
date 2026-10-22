// Targeted source-identity review: normal 3040 approval + isolated UI fixture.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  crypto = require('node:crypto');
const { chromium } = require(
    require('./browser-test-runtime.cjs').playwrightModule,
  ),
  dir = path.resolve('.wrangler/local-only/routine-fqc-3040'),
  base = 'http://127.0.0.1:3040',
  creds = JSON.parse(
    fs.readFileSync(path.join(dir, 'test-accounts.json')),
  ).admin;
let browser,
  context,
  page,
  flow,
  seq = 0;
const client = crypto.randomUUID(),
  id = 'rf3040-feedback-0',
  newName = '[3040 驗證 1 改名] 現行正式名稱 / Tên chính thức mới',
  evidence = [];
async function get(route) {
  const r = await context.request.get(base + route);
  assert.equal(r.status(), 200);
  return r.json();
}
async function command(action, extra = {}) {
  const r = await context.request.post(base + '/api/fqc/workflow', {
    data:
      action === 'begin'
        ? { action: 'begin' }
        : {
            command: {
              action,
              operationId: crypto.randomUUID(),
              generation: flow.generation,
              clientId: client,
              sequence: ++seq,
              ...extra,
            },
          },
  });
  const v = await r.json();
  assert.equal(r.status(), 200, JSON.stringify(v));
  flow = v.control.workflow;
}
function pass(name, detail) {
  evidence.push({ name, status: 'PASS', detail });
  console.log('PASS ' + name + ' ' + detail);
}
async function load() {
  await page.goto(base + '/process/?system=quality&view=quality-inspections');
  await page.locator('#routine-fqc-root [data-filter="item"]').waitFor();
  if ((await page.locator('html').getAttribute('lang')) !== 'zh-Hant')
    await page.locator('.top-language-switch').click();
}
(async () => {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  });
  page = await context.newPage();
  await page.goto(base + '/process/?system=quality');
  await page.locator('#login-id').fill(creds.id);
  await page.locator('#login-password').fill(creds.password);
  await page.locator('#login-submit').click();
  await page.locator('[data-dual-view="quality-inspections"]').click();
  await page.locator('#routine-fqc-root [data-filter="item"]').waitFor();
  const before = await get('/api/routine-fqc');
  flow = (await get('/api/fqc/workflow')).control.workflow;
  assert.equal(flow.pendingId, null);
  assert.deepEqual(
    flow.working,
    flow.active.content,
    'Do not approve concurrent unsaved standards',
  );
  const original = structuredClone(flow.active.content),
    index = original.items.findIndex((v) => v.id === id);
  assert.ok(index >= 0);
  const oldJob = before.control.jobs.find((j) => j.itemId === id),
    oldName = oldJob.source.name;
  assert.notEqual(oldName, newName);
  assert.ok(
    before.control.documents.some(
      (d) =>
        d.kind === 'report' &&
        d.flow.active.id &&
        d.flow.active.content.lines.some(
          (l) => l.source.id === id && l.source.name === oldName,
        ),
    ),
  );
  if (original.items[index].name !== newName) {
    await command('begin');
    await command('save', { expectedRevision: flow.revision });
    fs.writeFileSync(
      path.join(dir, 'feedback-history-preserved.json'),
      JSON.stringify({
        activeId: flow.active.id,
        savedId: flow.saved.id,
        content: flow.saved.content,
      }),
    );
    await command('apply', {
      patches: [{ op: 'set', path: ['items', { id }, 'name'], value: newName }],
      guards: [],
    });
    await command('save', { expectedRevision: flow.revision });
    await command('submit', {
      savedId: flow.saved.id,
      reason: '3040 review2 source rename only; preserve prior snapshots',
    });
    await command('approve', {
      caseId: flow.pendingId,
      reason: 'Explicit Admin self-review of isolated source rename',
      selfReviewConfirmed: true,
    });
  }
  const current = await get('/api/routine-fqc');
  assert.equal(current.sources.find((s) => s.id === id).name, newName);
  for (const key of ['jobs', 'documents', 'cases'])
    assert.deepEqual(current.control[key], before.control[key]);
  assert.deepEqual(flow.active.content, {
    ...original,
    items: original.items.map((v) =>
      v.id === id ? { ...v, name: newName } : v,
    ),
  });
  await load();
  const root = page.locator('#routine-fqc-root'),
    item = root.locator('[data-filter="item"]');
  assert.equal(await item.locator('option[value="' + id + '"]').count(), 1);
  assert.match(
    await item.locator('option[value="' + id + '"]').innerText(),
    /現行正式名稱/,
  );
  assert.doesNotMatch(
    await item.locator('option[value="' + id + '"]').innerText(),
    /歷史版本/,
  );
  await item.selectOption(id);
  await root.locator('[data-tab="history"]').click();
  const oldReport = before.control.documents.find(
    (d) =>
      d.kind === 'report' &&
      d.flow.active.id &&
      d.flow.active.content.lines.some((l) => l.source.id === id),
  );
  await root.locator('tr[data-id="' + oldReport.id + '"]').click();
  assert.ok((await root.locator('.rf-detail').innerText()).includes(oldName));
  pass(
    'real-rename-history',
    'Normal 3040 source save/submit/explicit self-review changes only test item name. Same-ID selector shows exact new official name; approved old report retains exact old name. Every existing job/report/case remains byte-equivalent.',
  );
  // Synthetic response only: current and historical same-ID scopes differ. No DB write.
  const fixture = structuredClone(current),
    source = fixture.sources.find((s) => s.id === id);
  source.line = 'C';
  source.category = 'REVIEW_CURRENT';
  source.name = 'Fixture current name';
  const job = fixture.control.jobs.find((j) => j.itemId === id);
  job.source.line = 'B';
  job.source.category = 'REVIEW_HISTORY';
  job.source.name = 'Fixture historical name';
  fixture.catalog.categories.push(
    { line: 'C', name: 'REVIEW_CURRENT' },
    { line: 'B', name: 'REVIEW_HISTORY' },
  );
  for (const d of fixture.control.documents)
    for (const content of [d.flow.working, d.flow.active?.content])
      if (content)
        for (const l of content.lines)
          if (l.jobId === job.id) l.source = structuredClone(job.source);
  await page.route(base + '/api/routine-fqc', async (route) => {
    if (route.request().method() === 'GET')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(fixture),
      });
    else await route.continue();
  });
  await load();
  await root.locator('[data-filter="line"]').selectOption('C');
  await root.locator('[data-filter="category"]').selectOption('REVIEW_CURRENT');
  assert.equal(
    await item.locator('option[value="' + id + '"]').innerText(),
    'Fixture current name · C · REVIEW_CURRENT · ' +
      source.errorCode +
      ' · ' +
      source.code,
  );
  await root.locator('[data-filter="line"]').selectOption('B');
  assert.ok(
    await root
      .locator('[data-filter="category"] option[value="REVIEW_HISTORY"]')
      .count(),
  );
  await root.locator('[data-filter="category"]').selectOption('REVIEW_HISTORY');
  assert.equal(
    await item.locator('option[value="' + id + '"]').innerText(),
    'Fixture historical name · B · REVIEW_HISTORY · ' +
      job.source.errorCode +
      ' · ' +
      job.source.code +
      ' · 歷史版本',
  );
  await item.selectOption(id);
  await root.locator('[data-tab="history"]').click();
  await root.locator('tr[data-id="' + oldReport.id + '"]').click();
  assert.match(
    await root.locator('.rf-detail').innerText(),
    /Fixture historical name/,
  );
  await page.screenshot({
    path: path.join(dir, 'feedback-history-version.png'),
  });
  pass(
    'historical-category-fixture',
    'Isolated response fixture: same-ID current C/REVIEW_CURRENT and historical B/REVIEW_HISTORY both independently selectable; old scope shows exact historical name and version label, and retained report remains discoverable. Expectations are explicit, not implementation-derived.',
  );
  await page.unroute(base + '/api/routine-fqc');
  const final = await get('/api/routine-fqc');
  const manual = final.control.jobs.filter((j) =>
    j.itemId.startsWith('rf3040-manual-'),
  );
  assert.equal(manual.length, 4);
  for (const j of manual) {
    assert.equal(j.planId, null);
    assert.equal(j.completion, null);
    assert.ok(
      !final.control.documents.some((d) =>
        d.flow.working.lines.some((l) => l.jobId === j.id),
      ),
    );
  }
  pass(
    'manual-preserved',
    'All four manual jobs remain unassigned, uncompleted and unreferenced; fixture made no backend writes.',
  );
  fs.writeFileSync(
    path.join(dir, 'feedback-history-evidence.json'),
    JSON.stringify(evidence, null, 2),
  );
  await browser.close();
})().catch(async (e) => {
  console.error(
    String(e.stack).replace(/cookie:[^\r\n]*/gi, 'cookie: [REDACTED]'),
  );
  if (browser) await browser.close();
  process.exitCode = 1;
});
