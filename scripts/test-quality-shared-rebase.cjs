const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Node CommonJS fixture. */
/* Isolated browser fixture: no Local D1, R2, or real draft writes. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true,
    channel:'chrome' });
  try {
    const page = await browser.newPage();
    const server = { revision: 1, values: { qualityMasterControl: 'initial' } };
    const posts = [];
    await page.route((isolatedTestTarget_20261010+"/process/"), route => route.fulfill({ status: 200,
      contentType: 'text/html', body: '<!doctype html><title>isolated sync test</title><script src="/process/shared-state.js"></script>' }));
    await page.route('**/api/shared-state', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ status: 200,
        contentType: 'application/json', body: JSON.stringify({ ...server, serverProtected: false }) });
      const request = route.request().postDataJSON();
      posts.push(request.baseRevision);
      if (request.baseRevision !== server.revision) return route.fulfill({ status: 409,
        contentType: 'application/json', body: JSON.stringify({ error: 'revision conflict' }) });
      Object.assign(server.values, request.updates);
      server.revision++;
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ revision: server.revision, values: server.values }) });
    });
    await page.goto((isolatedTestTarget_20261010+"/process/"));
    await page.evaluate(() => window.ProcessSync.ready);
    // A dedicated module advances D1 without touching the FQC shared key.
    server.revision++;
    server.values.routineEquipmentControl = 'updated by equipment API';
    const clean = await page.evaluate(async () => {
      window.ProcessSync.setDemoIdentity({ id: 'demo-admin', name: 'Demo admin', role: 'admin' });
      localStorage.setItem('qualityMasterControl', 'fqc-draft-change');
      return window.ProcessSync.flush();
    });
    assert.equal(clean, true);
    assert.deepEqual(posts, [1, 2]);
    assert.equal(server.values.qualityMasterControl, 'fqc-draft-change');
    // Another tab changes the *same* key. The old draft must not overwrite it.
    server.revision++;
    server.values.qualityMasterControl = 'newer-tab-draft';
    const conflicting = await page.evaluate(async () => {
      localStorage.setItem('qualityMasterControl', 'stale-tab-draft');
      return window.ProcessSync.flush();
    });
    assert.equal(conflicting, false);
    assert.equal(server.values.qualityMasterControl, 'newer-tab-draft');
    assert.equal(await page.evaluate(() => window.ProcessSync.status), 'conflict');
    assert.deepEqual(posts, [1, 2, 3]);
    console.log(JSON.stringify({ isolated: true, unrelatedRevisionRebased: true,
      sameKeyConflictBlocked: true, requestBaseRevisions: posts }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
