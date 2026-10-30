import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { createProcessMasterFixture } from './process-master-cloud-fixture.mjs';
const report = {
  commit: process.env.PROCESS_PROGRAM_COMMIT,
  realData: false,
  physicalDevice: false,
  cases: [],
  errors: [],
};
const selected = process.env.DEPARTURE_CASES?.split(',');
const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
async function test(name, fn) {
  if (selected && !selected.includes(name)) return;
  let f, c, p;
  const start = performance.now();
  try {
    f = await createProcessMasterFixture();
    c = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      serviceWorkers: 'block',
    });
    const origin = f.url.origin;
    await c.route('**/*', (r) =>
      new URL(r.request().url()).origin === origin ? r.continue() : r.abort(),
    );
    p = await c.newPage();
    p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => report.errors.push(e.message));
    await p.goto(origin + '/login?view=data&dataTab=process-master');
    await p.locator('#id').fill('frank');
    await p.locator('#password').fill(f.password);
    await p.locator('.site-entry-submit').click();
    await p.locator('#process-master-new-draft').waitFor();
    const begin = async () => {
      await p.locator('#process-master-new-draft').click();
      await p.locator('#add-master-template').waitFor();
    };
    const read = async () => {
      const response = await p.request.get(
        origin + '/api/master/workflow?scope=PROCESS',
      );
      assert.equal(response.status(), 200);
      return response.json();
    };
    const edit = async () => {
      await begin();
      await p.locator('[data-equipment-edit]').first().click();
      await p.locator('[data-equipment-field=name]').fill('未套用設備輸入');
    };
    const nameChange = async () => {
      await begin();
      await p.locator('[data-master-name]').first().fill('已同步但未手動儲存');
      await p.waitForFunction(() =>
        Object.values(MasterDataWorkflow.shared.flow('PROCESS').working)
          .flat()
          .some((t) => t.name === '已同步但未手動儲存'),
      );
    };
    const result = await fn({ p, c, f, begin, read, edit, nameChange, origin });
    report.cases.push({
      name,
      status: 'PASS',
      ms: Math.round(performance.now() - start),
      ...result,
    });
  } catch (error) {
    report.cases.push({
      name,
      status: 'FAIL',
      error: error.message,
      ms: Math.round(performance.now() - start),
    });
  } finally {
    await c?.close();
    await f?.close();
    console.log(JSON.stringify(report.cases.at(-1)));
  }
}
async function depart(p, action, expectPrompt, accept = false) {
  const dialogs = [];
  let finish;
  const observed = new Promise((r) => (finish = r));
  const handler = async (d) => {
    dialogs.push(d.type());
    try {
      if (accept) await d.accept();
      else await d.dismiss();
    } finally {
      finish('dialog');
    }
  };
  p.on('dialog', handler);
  let failure;
  const operation = (
    action === 'close'
      ? p.close({ runBeforeUnload: true })
      : action === 'navigate'
        ? p.goto(new URL('/login', p.url()).href, {
            waitUntil: 'domcontentloaded',
          })
        : p.reload({ waitUntil: 'domcontentloaded' })
  ).catch((e) => {
    failure = e.message;
  });
  if (action === 'close')
    await Promise.race([
      observed,
      p.waitForEvent('close'),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  else await operation;
  await operation;
  await new Promise((r) => setTimeout(r, 120));
  p.off('dialog', handler);
  assert.equal(
    dialogs.includes('beforeunload'),
    expectPrompt,
    JSON.stringify({ action, dialogs, closed: p.isClosed(), failure }),
  );
  if (expectPrompt && !accept) assert.equal(p.isClosed(), false);
  return { dialogTypes: dialogs, accepted: accept };
}
try {
  await test('clean-close', async ({ p }) => depart(p, 'close', false));
  await test('equipment-unapplied-close-cancel', async ({ p, edit, read }) => {
    await edit();
    const before = await read();
    const result = await depart(p, 'close', true);
    assert.equal(
      await p.locator('[data-equipment-field=name]').inputValue(),
      '未套用設備輸入',
    );
    assert.deepEqual(await read(), before);
    return result;
  });
  await test('equipment-unapplied-reload-cancel', async ({ p, edit, read }) => {
    await edit();
    const before = await read();
    const result = await depart(p, 'reload', true);
    assert.equal(
      await p.locator('[data-equipment-field=name]').inputValue(),
      '未套用設備輸入',
    );
    assert.deepEqual(await read(), before);
    return result;
  });
  await test('equipment-unapplied-reload-confirm', async ({
    p,
    edit,
    read,
  }) => {
    await edit();
    const before = await read();
    const result = await depart(p, 'reload', true, true);
    await p.locator('[data-equipment-edit]').first().click();
    assert.notEqual(
      await p.locator('[data-equipment-field=name]').inputValue(),
      '未套用設備輸入',
    );
    assert.deepEqual(await read(), before);
    return { ...result, unappliedDiscardedOnlyAfterConfirmation: true };
  });
  await test('working-unsaved-close-cancel', async ({
    p,
    nameChange,
    read,
  }) => {
    await nameChange();
    const before = await read();
    assert.equal(before.control.workflow.saved, null);
    const result = await depart(p, 'close', true);
    assert.deepEqual(await read(), before);
    return result;
  });
  await test('working-unsaved-reload-confirm', async ({
    p,
    nameChange,
    read,
  }) => {
    await nameChange();
    const result = await depart(p, 'reload', true, true);
    await p.locator('[data-master-name]').first().waitFor();
    assert.equal(
      await p.locator('[data-master-name]').first().inputValue(),
      '已同步但未手動儲存',
    );
    assert.equal((await read()).control.workflow.saved, null);
    return { ...result, workingRestored: true, noImplicitSave: true };
  });
  await test('saved-reload-and-close', async ({ p, nameChange, read }) => {
    await nameChange();
    await p.locator('#save-master-data').click();
    await p.waitForFunction(
      () => !!MasterDataWorkflow.shared.flow('PROCESS').saved,
    );
    const before = await read();
    const result = await depart(p, 'reload', false);
    await p.locator('[data-master-name]').first().waitFor();
    assert.equal(
      await p.locator('[data-master-name]').first().inputValue(),
      '已同步但未手動儲存',
    );
    assert.deepEqual(await read(), before);
    await p.locator('[data-master-name]').first().click();
    await depart(p, 'close', false);
    return result;
  });
  await test('queued-apply-close-cancel', async ({ p, begin }) => {
    await begin();
    let release, seen;
    const gate = new Promise((r) => (release = r)),
      started = new Promise((r) => (seen = r));
    await p.route('**/api/master/workflow?**', async (r) => {
      if (
        r.request().method() === 'POST' &&
        r.request().postDataJSON()?.command?.action === 'apply'
      ) {
        seen();
        await gate;
      }
      await r.continue();
    });
    await p.locator('[data-master-name]').first().fill('等待套用');
    await started;
    try {
      const result = await depart(p, 'close', true);
      assert.equal(
        await p.locator('[data-master-name]').first().inputValue(),
        '等待套用',
      );
      return result;
    } finally {
      release();
      await p.waitForFunction(() =>
        Object.values(MasterDataWorkflow.shared.flow('PROCESS').working)
          .flat()
          .some((t) => t.name === '等待套用'),
      );
    }
  });
  await test('failed-apply-close-cancel', async ({ p, begin }) => {
    await begin();
    await p.route('**/api/master/workflow?**', (r) =>
      r.request().method() === 'POST' ? r.abort('failed') : r.continue(),
    );
    await p.locator('[data-master-name]').first().fill('失敗仍保留');
    await p.waitForFunction(() => {
      const a = sharedDraftAccountState();
      return a.unknown || a.failed;
    });
    const result = await depart(p, 'close', true);
    assert.equal(
      await p.locator('[data-master-name]').first().inputValue(),
      '失敗仍保留',
    );
    return result;
  });

  await test('begin-without-changes-close', async ({ p, begin }) => {
    await begin();
    return depart(p, 'close', false);
  });
  await test('equipment-unchanged-close', async ({ p, begin }) => {
    await begin();
    await p.locator('[data-equipment-edit]').first().click();
    return depart(p, 'close', false);
  });
  await test('equipment-reverted-close', async ({ p, begin }) => {
    await begin();
    await p.locator('[data-equipment-edit]').first().click();
    const input = p.locator('[data-equipment-field=name]'),
      old = await input.inputValue();
    await input.fill('temporary');
    await input.fill(old);
    return depart(p, 'close', false);
  });
  await test('equipment-unapplied-close-confirm', async ({
    p,
    c,
    edit,
    read,
    origin,
  }) => {
    await edit();
    const before = await read();
    const result = await depart(p, 'close', true, true);
    assert.equal(p.isClosed(), true);
    const next = await c.newPage();
    await next.goto(origin + '/process/?view=data&dataTab=process-master');
    await next.locator('[data-equipment-edit]').first().click();
    assert.notEqual(
      await next.locator('[data-equipment-field=name]').inputValue(),
      '未套用設備輸入',
    );
    const response = await next.request.get(
      origin + '/api/master/workflow?scope=PROCESS',
    );
    assert.deepEqual(await response.json(), before);
    return { ...result, noImplicitWrite: true };
  });
  await test('equipment-unapplied-external-navigation-cancel', async ({
    p,
    edit,
    read,
  }) => {
    await edit();
    const before = await read(),
      url = p.url();
    const result = await depart(p, 'navigate', true);
    assert.equal(p.url(), url);
    assert.equal(
      await p.locator('[data-equipment-field=name]').inputValue(),
      '未套用設備輸入',
    );
    assert.deepEqual(await read(), before);
    return result;
  });
  await test('equipment-applied-unsaved-close-cancel', async ({
    p,
    edit,
    read,
  }) => {
    await edit();
    await p.locator('[data-equipment-save]').click();
    await p.locator('#equipment-editor-dialog').waitFor({ state: 'detached' });
    const before = await read();
    assert.equal(before.control.workflow.saved, null);
    const result = await depart(p, 'close', true);
    assert.deepEqual(await read(), before);
    return result;
  });
  await test('equipment-photo-unapplied-close-cancel', async ({
    p,
    begin,
    read,
  }) => {
    await begin();
    await p.locator('[data-equipment-edit]').first().click();
    const png = (await import('./photo-fixtures.mjs')).pngFixture({
      width: 320,
      height: 160,
      alpha: true,
    });
    await p
      .locator('[data-equipment-photo-add]')
      .setInputFiles({
        name: 'departure.png',
        mimeType: 'image/png',
        buffer: png,
      });
    await p.waitForFunction(
      () =>
        document.querySelector('.equipment-photo-preview img')?.naturalWidth ===
        320,
    );
    const before = await read();
    const result = await depart(p, 'close', true);
    assert.equal(await p.locator('.equipment-photo-preview img').count(), 1);
    assert.deepEqual(await read(), before);
    return result;
  });
  await test('composing-name-close-cancel', async ({ p, begin, read }) => {
    await begin();
    const input = p.locator('[data-master-name]').first();
    await input.click();
    const before = await read();
    await input.evaluate((el) => {
      el.dispatchEvent(
        new CompositionEvent('compositionstart', { bubbles: true }),
      );
      el.value = '中文正在組字';
      el.dispatchEvent(
        new InputEvent('input', { bubbles: true, isComposing: true }),
      );
    });
    const result = await depart(p, 'close', true);
    assert.equal(await input.inputValue(), '中文正在組字');
    assert.deepEqual(await read(), before);
    return result;
  });
  await test('unapplied-background-freeze-resume', async ({
    p,
    c,
    edit,
    read,
  }) => {
    await edit();
    const before = await read(),
      cdp = await c.newCDPSession(p);
    let dialogs = 0;
    const handler = async (d) => {
      dialogs++;
      await d.dismiss();
    };
    p.on('dialog', handler);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await new Promise((r) => setTimeout(r, 250));
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    assert.equal(
      await p.locator('[data-equipment-field=name]').inputValue(),
      '未套用設備輸入',
    );
    assert.deepEqual(await read(), before);
    assert.equal(dialogs, 0);
    p.off('dialog', handler);
    return {
      inputPreserved: true,
      noImplicitWrite: true,
      simulation: 'Chromium freeze/resume, not physical device termination',
    };
  });
} catch (error) {
  report.error = error.stack;
} finally {
  await browser.close();
  report.status =
    report.cases.length > 0 &&
    report.cases.every((x) => x.status === 'PASS') &&
    !report.errors.length &&
    !report.error
      ? 'PASS'
      : 'FAIL';
  fs.writeFileSync(
    '.sites-runtime/process-master-departure.json',
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({ status: report.status, cases: report.cases.length }),
  );
}
process.exitCode = report.status === 'PASS' ? 0 : 1;
