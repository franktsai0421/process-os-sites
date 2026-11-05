import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createABCFixture } from './ab-c-native-fixture.mjs';
import { pngFixture } from './photo-fixtures.mjs';
const commit = process.env.PROCESS_PROGRAM_COMMIT;
const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'process-ipqc-ab-compiled-'));
for (const [width, lang] of [
  [1280, 'zh'],
  [390, 'vi'],
])
  void test(
    `compiled full application IPQC A/B groups, photo, matrix and review ${width}/${lang}`,
    { timeout: 90000 },
    async (t) => {
      let closed = false;
      const close = async () => {
        if (closed) return;
        closed = true;
        await browser?.close();
        await f?.close();
      };
      t.after(close);
      const results = [],
        mark = (name) => {
          results.push({ name, status: 'PASS' });
          fs.writeFileSync(
            path.join(evidenceRoot, 'ab-compiled-progress-' + width + '.json'),
            JSON.stringify(results),
          );
        };
      let browser, f, page;
      const requests = [],
        errors = [],
        assets = [];
      try {
        f = await createABCFixture({
          programCommit: commit,
          products: 4,
          decorate(values) {
            const m = JSON.parse(values.masterDataControl),
              a = m.active.AB;
            a.lines.push({
              code: 'B',
              name: 'Synthetic B',
              stages: ['A', 'B', 'C', 'D', 'E'].map((c) => ({
                code: 'B-' + c,
                name: 'B ' + c,
              })),
            });
            a.categoryGroups.push(
              ...a.categoryGroups
                .filter((g) => g.line === 'A')
                .map((g) => ({
                  ...g,
                  line: 'B',
                  defaultStages: g.defaultStages.map((s) => 'B' + s.slice(1)),
                })),
            );
            a.products.push(
              ...a.products.map((p) => ({
                ...p,
                code: 'B' + p.code.slice(1),
                line: 'B',
                stages: p.stages.map((s) => 'B' + s.slice(1)),
              })),
            );
            m.versions.find((v) => v.scope === 'AB').snapshot =
              structuredClone(a);
            values.masterDataControl = JSON.stringify(m);
          },
        });
        browser = await chromium.launch({
          ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
          headless: true,
        });
        const context = await browser.newContext({
          viewport: { width, height: 850 },
        });
        await context.addCookies([
          { name: 'process_demo', value: f.cookie(), url: f.url.origin },
        ]);
        await context.addInitScript(
          (lang) => localStorage.setItem('processUILanguage', lang),
          lang,
        );
        page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('dialog', (d) => d.accept());
        await page.route('**/*', (route) =>
          new URL(route.request().url()).origin === f.url.origin
            ? route.continue()
            : route.abort(),
        );
        page.on('request', (r) => {
          if (r.method() === 'GET' && new URL(r.url()).pathname.endsWith('.js'))
            assets.push(r.url());
          if (['POST', 'PUT'].includes(r.method()))
            requests.push({
              method: r.method(),
              url: new URL(r.url()).pathname,
              body:
                r.method() === 'POST'
                  ? JSON.parse(r.postData() || 'null')
                  : null,
            });
        });
        await page.goto(
          f.url.origin +
            '/process/?system=process&view=data&dataTab=quality-ipqc-ab',
        );
        await page.locator('#ipqcab-line').waitFor({ timeout: 30000 });
        assert.equal(
          await page.locator('html').getAttribute('lang'),
          lang === 'vi' ? 'vi' : 'zh-Hant',
        );
        for (const name of ['ipqc-ab.js', 'shared-draft-client.js']) {
          const source = fs.readFileSync('public/process/' + name, 'utf8'),
            file = fs
              .readdirSync('dist/client/process')
              .find(
                (file) =>
                  /^shell-scripts\..*\.js$/.test(file) &&
                  fs
                    .readFileSync('dist/client/process/' + file, 'utf8')
                    .includes('/* ' + name + ' */'),
              );
          assert(file);
          const body = fs.readFileSync('dist/client/process/' + file, 'utf8');
          assert(body.includes(source));
          assert(assets.some((u) => new URL(u).pathname.endsWith('/' + file)));
          assert.equal(
            await page.evaluate(
              (id) => window.ProcessRuntimeBundles?.[id],
              file.split('.')[1],
            ),
            true,
          );
          assert.equal(
            await (
              await page.request.get(f.url.origin + '/process/' + file)
            ).text(),
            body,
          );
        }
        mark(
          'compiled root, authentication, real SPA destination and exact A/B asset versions',
        );
        const read = async () => {
          const row = await f.db
            .prepare('SELECT "values" FROM shared_state WHERE id=1')
            .first();
          const bucket = await f.mf.getR2Bucket('STATE_ARCHIVE');
          const { values } = await f
            .load('lib/state-records.ts')
            .decodeRecordValues(bucket, JSON.parse(row.values));
          return JSON.parse(values.ipqcABMasterControl || '{}');
        };
        const waitIdle = () =>
          page.waitForFunction(
            () =>
              !window.sharedDraftAccountState().queued &&
              window.IPQCABUI.navigation.canLeave() &&
              !document.querySelector('#ipqcab-save')?.disabled,
          );
        const scopes = [];
        for (const line of ['A', 'B'])
          for (const group of ['GROUP-1', 'GROUP-2']) {
            await page.locator('#ipqcab-line').selectOption(line);
            await page.locator('#ipqcab-group').selectOption(group);
            await page
              .locator('#ipqcab-begin,#ipqcab-add-error')
              .first()
              .waitFor();
            if (await page.locator('#ipqcab-begin').count())
              await page.locator('#ipqcab-begin').click();
            await page.locator('#ipqcab-add-error').click();
            await page
              .locator('#ab-error-name')
              .fill(`${line} ${group} synthetic error`);
            await page.locator('#ab-apply').click();
            await page.locator('#ipqcab-add-item').click();
            await page
              .locator('#ab-standard')
              .fill(`${line} ${group} synthetic standard`);
            await page.locator('#ab-method').fill('Synthetic visual check');
            if (scopes.length === 0) {
              await page.locator('[data-ab-upload=standard]').setInputFiles({
                name: 'synthetic.png',
                mimeType: 'image/png',
                buffer: Buffer.from(pngFixture({ width: 8, height: 8 })),
              });
              await page.locator('.ipqcab-photo-row').waitFor();
            }
            await page.locator('#ab-apply').click();
            await page.locator('[data-ab-matrix-item]').last().check();
            scopes.push(line + ':' + group);
            mark('local forms and matrix ' + line + ':' + group);
          }
        assert.equal(
          requests.filter((r) => r.url.startsWith('/api/ipqc-ab')).length,
          0,
        );
        assert.equal(Object.keys((await read()).scopes || {}).length, 0);
        mark('all four groups and photo remain local before Save');
        await page.locator('#ipqcab-save').click();
        await waitIdle();
        const mutations = requests.filter((r) =>
          r.url.startsWith('/api/ipqc-ab'),
        );
        assert.deepEqual(
          mutations.map((r) => r.method),
          ['POST', 'PUT', 'POST'],
        );
        assert.deepEqual(
          mutations
            .filter((r) => r.method === 'POST')
            .map((r) => r.body.action || r.body.command.action),
          ['begin-v1', 'save'],
        );
        let root = await read();
        const snapshot = root.moduleDraft.workflow.saved.content;
        assert.deepEqual(Object.keys(snapshot.scopes).sort(), scopes.sort());
        for (const scope of scopes) {
          assert.equal(snapshot.scopes[scope].items.length, 1);
          assert.equal(snapshot.scopes[scope].items[0].productCodes.length, 1);
        }
        assert.match(
          snapshot.scopes['A:GROUP-1'].items[0].standardPhotos[0].id,
          /^[a-f0-9]{64}$/,
        );
        mark(
          'one click saves four groups atomically with real photo PUT and matrix',
        );
        await page.reload();
        await page.locator('#ipqcab-line').waitFor({ timeout: 30000 });
        for (const scope of scopes) {
          const [line, group] = scope.split(':');
          await page.locator('#ipqcab-line').selectOption(line);
          await page.locator('#ipqcab-group').selectOption(group);
          assert(
            await page.locator('[data-ab-matrix-item]').last().isChecked(),
          );
          assert(
            (await page.locator('.ipqcab-page').innerText()).includes(
              `${line} ${group} synthetic standard`,
            ),
          );
        }
        mark('reload and per-group saved forms/matrix');
        await page.locator('#ipqcab-line').selectOption('A');
        await page.locator('#ipqcab-group').selectOption('GROUP-1');
        await page.locator('[data-ab-photo-item]').first().click();
        await page.locator('.ipqcab-viewer img').waitFor();
        assert(
          await page
            .locator('.ipqcab-viewer img')
            .evaluate((img) => img.complete && img.naturalWidth > 0),
        );
        await page.locator('[data-ab-close-viewer]').click();
        mark('saved photo served from isolated R2 and rendered');
        const openReview = async (action) => {
          const selector = '[data-ab-module-action=' + action + ']';
          await page.locator(selector).first().waitFor({ state: 'attached' });
          for (let n = 0; n < 5; n++) {
            const closed = page
              .locator('details:not([open])')
              .filter({ has: page.locator(selector) });
            if (!(await closed.count())) break;
            await closed.first().locator(':scope > summary').click();
          }
          await page.locator(selector).first().waitFor();
        };
        const submit = async (reason) => {
          await page.locator('#ipqcab-submit').click();
          await page.locator('dialog[open] textarea').fill(reason);
          await page.locator('dialog[open] button[type=submit]').click();
          await waitIdle();
        };
        await submit('Synthetic compiled review');
        root = await read();
        const originalCase = root.moduleDraft.workflow.pendingId;
        assert(originalCase);
        assert.deepEqual(
          root.moduleDraft.workflow.cases.find((c) => c.id === originalCase)
            .content,
          snapshot,
        );
        for (const scope of scopes)
          assert(
            root.scopes[scope].versions.some(
              (v) => v.id === originalCase && v.status === 'pending',
            ),
          );
        mark('UI Submit locks all groups to the fixed saved snapshot');
        await page.locator('#ipqcab-withdraw').click();
        await page
          .locator('dialog[open] textarea')
          .fill('Synthetic compiled withdrawal');
        await page.locator('dialog[open] button[type=submit]').click();
        await waitIdle();
        root = await read();
        assert.equal(root.moduleDraft.workflow.pendingId, null);
        assert.equal(
          root.moduleDraft.workflow.cases.find((c) => c.id === originalCase)
            .status,
          'withdrawn',
        );
        mark('UI Withdraw preserves saved data and original case history');
        if (!(await page.locator('#ipqcab-submit').count())) {
          await page.locator('#ipqcab-save').click();
          await waitIdle();
        }
        await submit('Synthetic compiled resubmit');
        root = await read();
        assert(root.moduleDraft.workflow.pendingId);
        assert.notEqual(root.moduleDraft.workflow.pendingId, originalCase);
        assert.deepEqual(
          root.moduleDraft.workflow.cases.find(
            (c) => c.id === root.moduleDraft.workflow.pendingId,
          ).content,
          snapshot,
        );
        mark(
          'UI Resubmit after withdrawal preserves all group/photo/matrix contents',
        );
        await page.evaluate(() => {
          void ProcessDeliveryNavigation.approval('quality');
        });
        await openReview('withdraw');
        await page.locator('[data-ab-module-action=withdraw]').first().click();
        await page
          .locator('dialog[open] textarea')
          .fill('Synthetic review-page withdraw');
        await page.locator('dialog[open] button[type=submit]').click();
        await page.waitForFunction(() => !sharedDraftAccountState().queued);
        assert.equal((await read()).moduleDraft.workflow.pendingId, null);
        await page.waitForFunction(() => IPQCABUI.navigation.canLeave());
        mark('review-page whole-module Withdraw');
        await page.evaluate(() => {
          void ProcessDeliveryNavigation.navigate('data', 'quality-ipqc-ab');
        });
        await page.locator('#ipqcab-submit').waitFor();
        await submit('Synthetic review-page approval');
        await page.evaluate(() => {
          void ProcessDeliveryNavigation.approval('quality');
        });
        await openReview('approve');
        await page.locator('[data-ab-module-action=approve]').first().click();
        await page.locator('dialog[open] input[type=checkbox]').check();
        await page.locator('dialog[open] button[type=submit]').click();
        await page.waitForFunction(() => !sharedDraftAccountState().queued);
        root = await read();
        assert.equal(root.moduleDraft.workflow.pendingId, null);
        assert.equal(root.moduleDraft.workflow.cases.at(-1).status, 'approved');
        for (const scope of scopes) {
          const g = root.scopes[scope];
          assert(g.activeVersionId);
          assert.deepEqual(
            g.versions.find((v) => v.id === g.activeVersionId).snapshot,
            snapshot.scopes[scope],
          );
        }
        mark(
          'review-page explicit self-review Approve preserves each group formal version and history',
        );
        if (width === 1280) {
          await page.goto(
            f.url.origin +
              '/process/?system=quality&view=data&dataTab=quality-ipqc-ab',
          );
          await page.locator('#ipqcab-line').waitFor();
          await page.locator('#ipqcab-begin').click();
          await page.locator('[data-ab-edit-item]').first().click();
          await page.locator('#ab-standard').fill('Discard synthetic local');
          await page.locator('#ab-apply').click();
          const beforeLeave = requests.length;
          await page.evaluate(() =>
            ProcessDeliveryNavigation.navigate('dashboard'),
          );
          await page.waitForFunction(() => state.view === 'dashboard');
          assert.equal(
            await page.locator('#process-navigation-departure').count(),
            0,
          );
          await page.evaluate(() => {
            void ProcessDeliveryNavigation.navigate('data', 'quality-ipqc-ab');
          });
          await page.locator('#ipqcab-line').waitFor();
          assert.equal(requests.length, beforeLeave);
          assert(
            !(await page.locator('.ipqcab-page').innerText()).includes(
              'Discard synthetic local',
            ),
          );
          mark(
            'real router silently discards unsent local edit without writes',
          );
          await page.locator('#ipqcab-begin').click();
          await page.locator('[data-ab-edit-item]').first().click();
          await page.locator('#ab-standard').fill('Compiled lost ACK');
          await page.locator('#ab-apply').click();
          let lost = false,
            receiptDown = true;
          await page.route('**/api/ipqc-ab/workflow?*', async (route) => {
            const r = route.request(),
              u = new URL(r.url());
            if (receiptDown && u.searchParams.has('operationId'))
              return route.fulfill({
                status: 404,
                json: { error: 'OPERATION_NOT_FOUND' },
              });
            if (
              !lost &&
              r.method() === 'POST' &&
              JSON.parse(r.postData() || '{}').command?.action === 'save'
            ) {
              lost = true;
              await route.fetch();
              return route.abort('failed');
            }
            return route.continue();
          });
          await page.locator('#ipqcab-save').click();
          await waitIdle();
          assert(lost);
          assert(await page.evaluate(() => sharedDraftAccountState().unknown));
          const markers = await page.evaluate(() =>
              Object.fromEntries(
                Object.entries(sessionStorage).filter(([k]) =>
                  k.startsWith('shared-draft'),
                ),
              ),
            ),
            postCount = requests.length;
          await page.evaluate(() =>
            ProcessDeliveryNavigation.navigate('dashboard'),
          );
          await page.waitForFunction(() => state.view === 'dashboard');
          await page.evaluate(() => {
            void ProcessDeliveryNavigation.navigate('data', 'quality-ipqc-ab');
          });
          await page.locator('[data-ab-local-query]').waitFor();
          await page.reload();
          await page
            .locator('[data-ab-local-query]')
            .waitFor({ timeout: 30000 });
          await page.locator('[data-ab-local-query]').click();
          await page.waitForFunction(
            () => !document.querySelector('[data-ab-local-query]')?.disabled,
          );
          assert(await page.evaluate(() => sharedDraftAccountState().unknown));
          assert.deepEqual(
            await page.evaluate(() =>
              Object.fromEntries(
                Object.entries(sessionStorage).filter(([k]) =>
                  k.startsWith('shared-draft'),
                ),
              ),
            ),
            markers,
          );
          assert.equal(requests.length, postCount);
          receiptDown = false;
          await page.locator('[data-ab-local-query]').click();
          await page.waitForFunction(() => !sharedDraftAccountState().unknown);
          assert.equal(requests.length, postCount);
          assert.equal(
            (await read()).moduleDraft.workflow.saved.content.scopes[
              'A:GROUP-1'
            ].items[0].standard,
            'Compiled lost ACK',
          );
          mark(
            'compiled lost ACK, safe departure/reload, 404 and original receipt recovery without repeated POST',
          );
        }
        assert.deepEqual(errors, []);
        mark('no browser JavaScript errors');
        await page.screenshot({
          path: path.join(evidenceRoot, `ipqc-ab-compiled-${width}-${lang}.png`),
          fullPage: true,
        });
        t.diagnostic(
          JSON.stringify({
            commit,
            buildEntrySha256: f.buildEntrySha256,
            width,
            lang,
            results,
            requests: requests.map((r) => ({
              method: r.method,
              url: r.url,
              action: r.body?.action || r.body?.command?.action,
            })),
          }),
        );
      } catch (e) {
        try {
          fs.writeFileSync(
            path.join(evidenceRoot, 'ab-compiled-error-' + width + '.txt'),
            e.stack || e.message,
          );
        } catch (diagnosticError) {
          t.diagnostic('Failure diagnostic write failed: ' + (diagnosticError.code || 'UNKNOWN'));
        }
        if (page) {
          await page
            .screenshot({
              path: path.join(evidenceRoot, `ipqc-ab-compiled-fail-${width}.png`),
              fullPage: true,
              timeout: 3000,
            })
            .catch(() => {});
          t.diagnostic(
            JSON.stringify({
              results,
              errors,
              visible: await page
                .locator('body')
                .innerText()
                .catch(() => ''),
              failure: e.message,
            }),
          );
        }
        throw e;
      } finally {
        await close();
      }
    },
  );
