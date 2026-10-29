import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { createPhotoEntryFixture } from './photo-entry-cloud-fixture.mjs';
import { technicalPhotoFixtures } from './photo-technical-fixtures.mjs';
const report = {
  commit: process.env.PROCESS_PROGRAM_COMMIT,
  realData: false,
  physicalPhone: false,
  cases: [],
  errors: [],
};
const files = await technicalPhotoFixtures(),
  selected = new Set(
    (
      process.env.PHOTO_ENTRIES ||
      'fqc,iqc-part,iqc-item,ipqc-ab,ipqc-c,equipment,equipment-hierarchy,equipment-new,tooling,routine-report,routine-disposal,feedback'
    ).split(','),
  );
let fixture, browser;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  fixture = await createPhotoEntryFixture();
  browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  const origin = fixture.url.origin;
  async function pageFor(tab) {
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      serviceWorkers: 'block',
    });
    await context.route('**/*', (r) =>
      new URL(r.request().url()).origin === origin ? r.continue() : r.abort(),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', (e) => report.errors.push(e.message));
    page.on('dialog', (d) =>
      d.accept(d.type() === 'prompt' ? 'Synthetic photo QA' : undefined),
    );
    await page.goto(origin + '/login?system=quality&view=data&dataTab=' + tab);
    await page.locator('#id').fill('frank');
    await page.locator('#password').fill(fixture.password);
    await page.locator('.site-entry-submit').click();
    await page.waitForURL('**/process/**');
    return page;
  }
  async function verify(page, selector, file, index = 0) {
    const img = page.locator(selector).nth(index);
    await img.waitFor();
    await img.evaluate((image) => image.decode());
    const dims = await img.evaluate((image) => [
      image.naturalWidth,
      image.naturalHeight,
    ]);
    assert.deepEqual(dims, [file.width, file.height]);
    const src = await img.getAttribute('src');
    let bytes;
    if (src.startsWith('data:'))
      bytes = Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
    else if (src.startsWith('blob:'))
      bytes = Buffer.from(
        await page.evaluate(
          async (url) => [
            ...new Uint8Array(await (await fetch(url)).arrayBuffer()),
          ],
          src,
        ),
      );
    else {
      const r = await page.request.get(new URL(src, origin).href);
      assert.equal(r.status(), 200);
      bytes = await r.body();
    }
    if (file.mimeType === 'image/png')
      assert.equal(
        hash(await sharp(bytes).ensureAlpha().raw().toBuffer()),
        hash(await sharp(file.buffer).ensureAlpha().raw().toBuffer()),
      );
    else assert.equal(hash(bytes), hash(file.buffer));
    return {
      dimensions: dims,
      bytes: bytes.length,
      pixelsOrOriginalBytesEqual: true,
    };
  }
  async function saved(key, select) {
    for (let n = 0; n < 160; n++) {
      const value = JSON.parse((await fixture.readValues())[key]);
      if (select(value)) return value;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error('Saved readback failed: ' + key);
  }
  async function hierarchy(page) {
    for (const kind of ['category', 'subcategory', 'group'])
      await page
        .locator('[data-node-select=' + kind + ']')
        .first()
        .click();
  }
  async function test(name, tab, fn) {
    if (!selected.has(name)) return;
    const page = await pageFor(tab),
      at = performance.now();
    try {
      const evidence = await fn(page);
      assert.ok(
        !/目前規格|一般規格|1600px|WebP 0\.82/.test(
          await page.locator('body').innerText(),
        ),
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: '.sites-runtime/photo-entry-' + name + '-390.png',
        fullPage: false,
      });
      report.cases.push({
        name,
        status: 'PASS',
        ms: Math.round(performance.now() - at),
        evidence,
      });
    } catch (error) {
      console.log(JSON.stringify({ name, error: error.message }));
      report.cases.push({
        name,
        status: 'FAIL',
        error: error.message,
        screen: (await page.locator('body').innerText()).slice(-3000),
      });
      await page.screenshot({
        path: '.sites-runtime/photo-entry-' + name + '-failure.png',
        fullPage: true,
      });
    } finally {
      console.log(
        JSON.stringify({ entry: name, result: report.cases.at(-1)?.status }),
      );
      await page.context().close();
    }
  }
  await test('fqc', 'quality-fqc', async (page) => {
    await page.locator('#fqc-begin').click();
    await page.locator('[data-edit-item]').first().click();
    await page.locator('#fqc-file-input').setInputFiles(files.slice(0, 2));
    await page.waitForFunction(
      () => document.querySelectorAll('.fqc-photo-card img').length === 2,
    );
    const evidence = [
      await verify(page, '.fqc-photo-card img', files[0]),
      await verify(page, '.fqc-photo-card img', files[1], 1),
    ];
    await page.locator('.fqc-item-form button[type=submit]').click();
    await page.locator('.fqc-item-form').waitFor({ state: 'detached' });
    await page.locator('#fqc-save').click();
    await saved(
      'qualityMasterControl',
      (x) =>
        x.libraries.fqc.workflow?.saved?.content.items[0].mediaItems.length ===
        2,
    );
    await page.reload();
    await page.locator('[data-edit-item]').first().click();
    await verify(page, '.fqc-photo-card img', files[1], 1);
    await page.locator('[data-photo-remove="1"]').click();
    await page.locator('.fqc-item-form button[type=submit]').click();
    await page.locator('.fqc-item-form').waitFor({ state: 'detached' });
    await page.locator('#fqc-save').click();
    await saved(
      'qualityMasterControl',
      (x) =>
        x.libraries.fqc.workflow?.saved?.content.items[0].mediaItems.length ===
        1,
    );
    return evidence;
  });
  await test('iqc-part', 'quality-iqc', async (page) => {
    const begin = page.locator('#iqc-begin');
    await begin.waitFor();
    await begin.click();
    await page.locator('[data-edit-part]').first().click();
    await page.route('**/api/iqc/photo', (r) => r.abort('failed'), {
      times: 1,
    });
    await page.locator('#iqc-part-file').setInputFiles(files[0]);
    await page.locator('#iqc-part-error').filter({ hasText: /./ }).waitFor();
    assert.equal(await page.locator('#iqc-part-photos img').count(), 0);
    await page.locator('#iqc-part-file').setInputFiles(files.slice(0, 2));
    await page.waitForFunction(
      () => document.querySelectorAll('#iqc-part-photos img').length === 2,
    );
    const evidence = [
      await verify(page, '#iqc-part-photos img', files[0]),
      await verify(page, '#iqc-part-photos img', files[1], 1),
    ];
    await page.locator('#iqc-part-form button[type=submit]').click();
    await page.locator('#iqc-part-form').waitFor({ state: 'detached' });
    await page.locator('#iqc-save').click();
    await saved(
      'iqcMasterControl',
      (x) => x.workflow?.saved?.content.parts[0].photos.length === 2,
    );
    await page.reload();
    await page.locator('[data-edit-part]').first().click();
    await verify(page, '#iqc-part-photos img', files[1], 1);
    await page.locator('.iqc-dialog-overlay [data-close]').last().click();
    return evidence;
  });
  await test('iqc-item', 'quality-iqc', async (page) => {
    await page.locator('[data-select-part]').first().waitFor();
    if (await page.locator('#iqc-begin').count())
      await page.locator('#iqc-begin').click();
    await page.locator('[data-select-part]').first().click();
    await page.locator('[data-edit-item]').first().click();
    await page.locator('#iqc-item-file').setInputFiles([files[0], files[3]]);
    await page.waitForFunction(
      () => document.querySelectorAll('#iqc-item-photo-list img').length === 2,
    );
    const evidence = [
      await verify(page, '#iqc-item-photo-list img', files[0]),
      await verify(page, '#iqc-item-photo-list img', files[3], 1),
    ];
    await page.locator('#iqc-item-form button[type=submit]').click();
    await page.locator('#iqc-item-form').waitFor({ state: 'detached' });
    await page.locator('#iqc-save').click();
    await saved(
      'iqcMasterControl',
      (x) => x.workflow?.saved?.content.items[0].mediaItems.length === 2,
    );
    await page.reload();
    await page.locator('[data-select-part]').first().click();
    await page.locator('[data-edit-item]').first().click();
    await verify(page, '#iqc-item-photo-list img', files[3], 1);
    return evidence;
  });
  await test('ipqc-ab', 'quality-ipqc-ab', async (page) => {
    await page.locator('#ipqcab-begin').click();
    await page.locator('[data-ab-edit-item]').first().click();
    await page
      .locator('[data-ab-upload=standard]')
      .setInputFiles(files.slice(0, 2));
    await page.waitForFunction(
      () => document.querySelectorAll('.ipqcab-photo-row img').length === 2,
    );
    const evidence = [
      await verify(page, '.ipqcab-photo-row img', files[0]),
      await verify(page, '.ipqcab-photo-row img', files[1], 1),
    ];
    await page.locator('#ab-apply').click();
    await page.locator('#ab-apply').waitFor({ state: 'detached' });
    await page.locator('#ipqcab-save').click();
    await saved(
      'ipqcABMasterControl',
      (x) =>
        x.moduleDraft?.workflow?.saved?.content.scopes['A:G1'].items[0]
          .standardPhotos.length === 2,
    );
    await page.reload();
    await page.locator('[data-ab-edit-item]').first().click();
    await verify(page, '.ipqcab-photo-row img', files[1], 1);
    await page.locator('[data-ab-view-modal="standard:0"]').click();
    await verify(page, '.ipqcab-viewer img', files[0]);
    return evidence;
  });
  await test('ipqc-c', 'quality-ipqc-c', async (page) => {
    await page.locator('#ipqcc-begin').click();
    await page.locator('[data-ipqcc-edit-item]').first().click();
    await page.locator('#ipqcc-photo-input').setInputFiles(files.slice(0, 2));
    await page.waitForFunction(
      () => document.querySelectorAll('.ipqcc-photo-row img').length === 2,
    );
    const evidence = [
      await verify(page, '.ipqcc-photo-row img', files[0]),
      await verify(page, '.ipqcc-photo-row img', files[1], 1),
    ];
    await page.locator('#ipqcc-editor button[type=submit]').click();
    await page.locator('#ipqcc-editor').waitFor({ state: 'detached' });
    await page.locator('#ipqcc-save').click();
    await saved(
      'ipqcCMasterControl',
      (x) => x.workflow?.saved?.content.items[0].mediaItems.length === 2,
    );
    await page.reload();
    await page.locator('[data-ipqcc-edit-item]').first().click();
    await verify(page, '.ipqcc-photo-row img', files[1], 1);
    return evidence;
  });
  await test('equipment', 'quality-routine-equipment', async (page) => {
    await page.locator('#routine-begin').click();
    await hierarchy(page);
    await page.locator('[data-equipment-edit]').first().click();
    await page.locator('#routine-photo-input').setInputFiles(files[0]);
    await page.waitForFunction(
      () =>
        document.querySelector('.routine-photo-field img')?.naturalWidth ===
        2000,
    );
    const evidence = [await verify(page, '.routine-photo-field img', files[0])];
    await page.locator('#routine-form-apply').click();
    await page.locator('#routine-form-apply').waitFor({ state: 'detached' });
    await page.locator('#routine-save').click();
    const initialEquipment = await saved(
      'routineEquipmentControl',
      (x) => !!x.workflow?.saved?.content.equipment[0].photoId,
    );
    await page.reload();
    await hierarchy(page);
    await page.locator('[data-equipment-edit]').first().click();
    await verify(page, '.routine-photo-field img', files[0]);
    await page.locator('#routine-photo-input').setInputFiles(files[1]);
    await page.waitForFunction(
      () =>
        document.querySelector('.routine-photo-field img')?.naturalWidth ===
        800,
    );
    evidence.push(await verify(page, '.routine-photo-field img', files[1]));
    await page.locator('#routine-form-apply').click();
    await page.locator('#routine-save').click();
    await saved(
      'routineEquipmentControl',
      (x) =>
        x.workflow?.saved?.content.equipment[0].photoId !==
        initialEquipment.workflow.saved.content.equipment[0].photoId,
    );
    await page.reload();
    await hierarchy(page);
    await page.locator('[data-equipment-edit]').first().click();
    await verify(page, '.routine-photo-field img', files[1]);
    return evidence;
  });

  await test('equipment-new', 'quality-routine-equipment', async (page) => {
    await page.locator('[data-node-select=category]').first().waitFor();
    if (await page.locator('#routine-begin').count())
      await page.locator('#routine-begin').click();
    await hierarchy(page);
    await page.locator('#routine-add').click();
    await page.locator('#routine-add-asset-code').fill('QA-NEW-PHOTO');
    await page.locator('#routine-add-name').fill('Synthetic photo equipment');
    await page.locator('#routine-add-photo-input').setInputFiles(files[2]);
    await page.waitForFunction(
      () =>
        document.querySelector('#routine-add-modal .routine-photo-field img')
          ?.naturalWidth === 1600,
    );
    const evidence = [
      await verify(
        page,
        '#routine-add-modal .routine-photo-field img',
        files[2],
      ),
    ];
    await page.locator('#routine-add-submit').click();
    await page.locator('#routine-add-modal').waitFor({ state: 'detached' });
    await page.locator('#routine-save').click();
    const state = await saved('routineEquipmentControl', (x) =>
      x.workflow?.saved?.content.equipment.some(
        (e) => e.assetCode === 'QA-NEW-PHOTO' && e.photoId,
      ),
    );
    const newId = state.workflow.saved.content.equipment.find(
      (e) => e.assetCode === 'QA-NEW-PHOTO',
    ).id;
    await page.reload();
    await hierarchy(page);
    await page.locator('[data-equipment-edit="' + newId + '"]').click();
    await verify(page, '.routine-photo-field img', files[2]);
    return evidence;
  });
  await test('tooling', 'quality-mold-equipment', async (page) => {
    await page.locator('#tooling-begin').click();
    await page.locator('[data-tool-edit]').first().click();
    await page
      .locator('.tooling-dialog [data-upload]')
      .setInputFiles(files.slice(0, 2));
    await page.waitForFunction(
      () => document.querySelectorAll('[data-album] img').length === 2,
    );
    const evidence = [
      await verify(page, '[data-album] img', files[0]),
      await verify(page, '[data-album] img', files[1], 1),
    ];
    await page.locator('.tooling-dialog button[type=submit]').click();
    await page.locator('.tooling-dialog').waitFor({ state: 'detached' });
    await page.locator('#tooling-save').click();
    await saved(
      'toolingMasterControl',
      (x) => x.workflow?.saved?.content.tools[0].photos.length === 2,
    );
    await page.reload();
    await page.locator('[data-tool-edit]').first().click();
    await verify(page, '[data-album] img', files[1], 1);
    await page.locator('[data-original]').first().click();
    await verify(page, '.tooling-original', files[0]);
    return evidence;
  });

  await test(
    'equipment-hierarchy',
    'quality-routine-equipment',
    async (page) => {
      await page.locator('[data-node-select=category]').first().waitFor();
      if (await page.locator('#routine-begin').count())
        await page.locator('#routine-begin').click();
      const evidence = [];
      for (const [kind, list, i] of [
        ['category', 'categories', 0],
        ['subcategory', 'subcategories', 1],
        ['group', 'groups', 3],
      ]) {
        await page
          .locator('[data-node-edit=' + kind + ']')
          .first()
          .click();
        await page
          .locator('#routine-dialog-photo-input')
          .setInputFiles(files[i]);
        await page.waitForFunction(
          (w) =>
            document.querySelector('.routine-dialog .routine-photo-field img')
              ?.naturalWidth === w,
          files[i].width,
        );
        evidence.push(
          await verify(
            page,
            '.routine-dialog .routine-photo-field img',
            files[i],
          ),
        );
        await page.locator('#routine-dialog-confirm').click();
        await page
          .locator('#routine-dialog-confirm')
          .waitFor({ state: 'detached' });
        await page.locator('#routine-save').click();
        await saved(
          'routineEquipmentControl',
          (x) => !!x.workflow?.saved?.content[list][0].photoId,
        );
        await page
          .locator('[data-node-edit=' + kind + ']')
          .first()
          .click();
        await verify(
          page,
          '.routine-dialog .routine-photo-field img',
          files[i],
        );
        await page.locator('#routine-dialog-cancel').click();
        await page
          .locator('[data-node-select=' + kind + ']')
          .first()
          .click();
      }
      return evidence;
    },
  );
  for (const kind of ['report', 'disposal'])
    await test('routine-' + kind, 'quality-fqc', async (page) => {
      await page.goto(
        origin +
          '/process/?system=quality&view=quality-inspections&rfDocument=photo-' +
          kind,
      );
      await page.locator('.rf-tabs [data-tab=reports]').click();
      await page.locator('[data-document-kind=' + kind + ']').click();
      const selector =
        '[data-upload=' + (kind === 'report' ? 'result' : 'evidence') + ']';
      await page.locator(selector).setInputFiles(files[0]);
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.rf-document .rf-photo img').length === 1,
      );
      await verify(page, '.rf-document .rf-photo img', files[0]);
      await page.locator(selector).setInputFiles(files[1]);
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.rf-document .rf-photo img').length === 2,
      );
      const evidence = [
        await verify(page, '.rf-document .rf-photo img', files[0]),
        await verify(page, '.rf-document .rf-photo img', files[1], 1),
      ];
      await page.locator('.rf-document [data-action=save]').click();
      await saved('routineFqcControl', (x) => {
        const c = x.documents.find((d) => d.kind === kind)?.flow.saved?.content;
        return (
          (kind === 'report' ? c?.lines[0].results[0].photos : c?.evidence)
            ?.length === 2
        );
      });
      await page.reload();
      await page.locator('.rf-tabs [data-tab=reports]').click();
      await page.locator('[data-document-kind=' + kind + ']').click();
      await verify(page, '.rf-document .rf-photo img', files[1], 1);
      const popupPromise = page.waitForEvent('popup');
      await page.locator('.rf-document .rf-photo').first().click();
      const popup = await popupPromise;
      await popup.waitForLoadState();
      await verify(popup, 'img', files[0]);
      await popup.close();
      return evidence;
    });
  await test('feedback', 'quality-mold-equipment', async (page) => {
    await page.locator('#wf-launcher').click();
    await page.locator('#wf-panel input[type=file]').setInputFiles(files[0]);
    await page.waitForFunction(
      () => document.querySelectorAll('#wf-panel .wf-thumb img').length === 1,
    );
    await page.evaluate(
      ({ base64, name, type }) => {
        const dt = new DataTransfer();
        dt.items.add(
          new File(
            [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
            name,
            { type },
          ),
        );
        document.dispatchEvent(
          new ClipboardEvent('paste', {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      {
        base64: files[1].buffer.toString('base64'),
        name: files[1].name,
        type: files[1].mimeType,
      },
    );
    await page.waitForFunction(
      () => document.querySelectorAll('#wf-panel .wf-thumb img').length === 2,
    );
    const evidence = [
      await verify(page, '#wf-panel .wf-thumb img', files[0]),
      await verify(page, '#wf-panel .wf-thumb img', files[1], 1),
    ];
    await page.locator('#wf-panel [data-image="0"]').click();
    await verify(page, '#wf-viewer img', files[0]);
    await page.locator('#wf-viewer button').click();
    await page
      .locator('#wf-panel textarea')
      .fill('Synthetic photo QA, no business data');
    await page.route(
      '**/api/web-feedback?action=upload*',
      (r) => r.abort('failed'),
      { times: 1 },
    );
    await page.locator('#wf-panel [data-submit]').click();
    await page
      .locator('#wf-panel [role=status]')
      .filter({ hasText: /未確認成功|Chưa xác nhận/ })
      .waitFor();
    assert.equal(await page.locator('#wf-panel .wf-thumb img').count(), 2);
    await page.locator('#wf-panel [data-submit]').click();
    await page
      .locator('#wf-panel [role=status]')
      .filter({ hasText: /已建立|Đã tạo/ })
      .waitFor();
    const row = await fixture.db
        .prepare('SELECT payload FROM web_feedback_store WHERE id=1')
        .first(),
      store = JSON.parse(row.payload);
    assert.equal(store.issues.length, 1);
    assert.equal(store.attachments.length, 2);
    for (const a of store.attachments) {
      const r = await page.request.get(
        origin + '/api/web-feedback?action=image&id=' + a.id,
      );
      assert.equal(r.status(), 200);
      const original = a.type === 'image/png' ? files[0] : files[1],
        bytes = await r.body();
      assert.equal(hash(bytes), hash(original.buffer));
    }
    return evidence;
  });

  await test('process-template', 'process-master', async (page) => {
    await page.locator('#process-master-new-draft').click();
    await page
      .locator('.master-template-upload input')
      .first()
      .setInputFiles(files.slice(0, 2));
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '.photo-template:first-child .master-template-media-grid img',
        ).length === 2,
    );
    const evidence = [
      await verify(
        page,
        '.photo-template:first-child .master-template-media-grid img',
        files[0],
      ),
      await verify(
        page,
        '.photo-template:first-child .master-template-media-grid img',
        files[1],
        1,
      ),
    ];
    await page.locator('#save-master-data').click();
    await saved('masterDataControl', (x) =>
      Object.values(x.workflowScopes?.PROCESS?.saved?.content || {})
        .flat()
        .some((t) => t.mediaItems?.length === 2),
    );
    await page.reload();
    await verify(
      page,
      '.photo-template:first-child .master-template-media-grid img',
      files[1],
      1,
    );
    await page.locator('.process-template-preview').first().click();
    await verify(page, '#media-lightbox img', files[0]);
    await page.screenshot({ path: '.sites-runtime/photo-nameplate-fit.png' });
    await page.locator('.media-lightbox-zoom').click();
    assert.equal(
      await page
        .locator('#media-lightbox img')
        .evaluate((i) => Math.round(i.getBoundingClientRect().width)),
      2000,
    );
    const bounds = await page
      .locator('.media-lightbox-viewport')
      .evaluate((v) => {
        const b = v.getBoundingClientRect(),
          i = v.querySelector('img').getBoundingClientRect();
        return {
          left: b.left,
          imageLeft: i.left,
          width: b.width,
          screen: innerWidth,
          grid: getComputedStyle(v.parentElement).gridTemplateColumns,
          viewportStyle: getComputedStyle(v).display,
          scroll: v.scrollLeft,
          margin: getComputedStyle(v.querySelector('img')).margin,
          transform: getComputedStyle(v.querySelector('img')).transform,
          css: [...document.querySelectorAll('link[rel=stylesheet]')].map(
            (x) => x.href,
          ),
        };
      });
    assert.ok(
      Math.abs(bounds.imageLeft - bounds.left) < 2 &&
        bounds.width <= bounds.screen,
      JSON.stringify(bounds),
    );
    await page.screenshot({ path: '.sites-runtime/photo-nameplate-zoom.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator('.media-lightbox-viewport')
      .evaluate((v) => (v.scrollLeft = 500));
    assert.equal(
      await page
        .locator('.media-lightbox-viewport')
        .evaluate((v) => v.scrollLeft),
      500,
    );
    await page.locator('.media-lightbox-zoom').click();
    assert.ok(
      await page
        .locator('#media-lightbox img')
        .evaluate((i) => i.getBoundingClientRect().width <= innerWidth),
    );
    await page.locator('.media-lightbox-zoom').click();
    await page.locator('#media-lightbox .next').click();
    assert.equal(
      await page.locator('.media-lightbox-zoom').getAttribute('aria-pressed'),
      'false',
    );
    await verify(page, '#media-lightbox img', files[1]);
    await page.locator('.media-lightbox-close').click();
    if (await page.evaluate(() => document.documentElement.lang === 'vi'))
      await page.locator('.language-switch').first().click();
    await page.waitForFunction(
      () => document.documentElement.lang === 'zh-Hant',
    );
    await page.locator('.process-template-preview').first().click();
    assert.equal(
      await page.locator('.media-lightbox-zoom').innerText(),
      '放大',
    );
    await page.locator('.media-lightbox-zoom').click();
    assert.equal(
      await page.locator('.media-lightbox-zoom').innerText(),
      '適合視窗',
    );
    return evidence;
  });
  await test('process-equipment', 'process-master', async (page) => {
    await page.locator('[data-equipment-open]').waitFor();
    if (await page.locator('#process-master-new-draft').count())
      await page.locator('#process-master-new-draft').click();
    await page.locator('[data-equipment-open]').click();
    await page.locator('[data-equipment-edit]').first().click();
    await page
      .locator('[data-equipment-photo-add]')
      .setInputFiles(files.slice(0, 2));
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.equipment-photo-preview img').length === 2,
    );
    const evidence = [
      await verify(page, '.equipment-photo-preview img', files[0]),
      await verify(page, '.equipment-photo-preview img', files[1], 1),
    ];
    await page.locator('[data-equipment-save]').click();
    await page
      .locator('#equipment-editor-dialog')
      .waitFor({ state: 'detached' });
    await page.locator('#save-master-data').click();
    await page.waitForFunction(() =>
      Object.values(
        MasterDataWorkflow.shared.flow('PROCESS').saved?.content || {},
      )
        .flat()
        .some((t) => t.equipment?.some((e) => e.mediaItems?.length === 2)),
    );
    await page.reload();
    await page.locator('[data-equipment-open]').click();
    await page.locator('[data-equipment-edit]').first().click();
    await verify(page, '.equipment-photo-preview img', files[1], 1);
    await page.locator('.equipment-photo-preview').first().click();
    await verify(page, '#media-lightbox img', files[0]);
    return evidence;
  });
  await test('process-authoring', 'process-master', async (page) => {
    await page.goto(origin + '/process/?view=editor');
    await page.locator('.pe-card [data-pe=edit]').first().waitFor();
    if (await page.locator('[data-av3=begin]').count()) {
      await page.locator('[data-av3=begin]').click();
      await page.waitForFunction(
        () =>
          ProcessAuthoringV3.canMutate() &&
          !document.querySelector('[data-av3=begin]'),
      );
    }
    await page.locator('.pe-card [data-pe=edit]').first().click();
    const evidence = [];
    for (const tab of ['common', 'product-work']) {
      await page.locator('.pe-modal-tabs [data-tab=' + tab + ']').click();
      await page
        .locator('.pe-modal-body [data-upload]')
        .setInputFiles(files.slice(0, 2));
      await page.waitForFunction(
        () => document.querySelectorAll('.pe-media img').length === 2,
      );
      evidence.push(
        await verify(page, '.pe-media img', files[0]),
        await verify(page, '.pe-media img', files[1], 1),
      );
      await page.locator('.pe-media [data-media-open]').first().click();
      await verify(page, '.pe-album img', files[0]);
      await page.locator('.pe-album [data-pe=close]').click();
    }
    await page.locator('#apply-operation').click();
    await page
      .locator('#process-operation-dialog')
      .waitFor({ state: 'detached' });
    await page.locator('[data-av3=save]').click();
    await saved('processAuthoringControl', (x) => {
      const o = x.workflow.saved?.content.workspaces[0].stages['A-CUT'][0];
      return (
        o?.mediaItems.length === 2 && o?.productMediaItems?.P1?.length === 2
      );
    });
    await page.reload();
    await page.locator('.pe-card [data-pe=edit]').first().click();
    for (const tab of ['common', 'product-work']) {
      await page.locator('.pe-modal-tabs [data-tab=' + tab + ']').click();
      await verify(page, '.pe-media img', files[1], 1);
    }
    return evidence;
  });
  report.status =
    report.cases.every((x) => x.status === 'PASS') && !report.errors.length
      ? 'PASS'
      : 'FAIL';
} catch (error) {
  report.status = 'FAIL';
  report.failure = error.stack;
} finally {
  await browser?.close();
  await fixture?.close();
  fs.writeFileSync(
    '.sites-runtime/photo-entry-results.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}
process.exitCode = report.status === 'PASS' ? 0 : 1;
