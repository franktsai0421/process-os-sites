const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Repository browser fixtures use CommonJS. */
/* Read-only acceptance for the annotated quality screens on the existing Local server. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.PROCESS_TEST_URL || isolatedTestTarget_20261010;
const output = path.resolve('.wrangler/local-only/quality-comments');

(async () => {
  fs.mkdirSync(output, { recursive:true });
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}), headless:true });
  try {
    for (const width of [1366,390]) {
      const context = await browser.newContext({ viewport:{ width,height:844 } });
      const page = await context.newPage();
      const errors=[];
      page.on('pageerror', error=>errors.push(error.message));
      await page.goto(`${base}/process/`);
      await page.locator('[data-quick-login="admin"]').click();
      await page.waitForURL('**/process/?**');
      await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-iqc`);
      await page.locator('.iqc-part').first().click();
      assert.equal(await page.locator('.iqc-checks details').count(),0);
      assert.ok(await page.locator('.iqc-checks article.iqc-item').count()>0);
      await page.screenshot({path:path.join(output,`iqc-${width}.png`),fullPage:false});

      await page.locator('[data-quality-tab="quality-ipqc-ab"]').click();
      await page.locator('.ipqcab-version h2').waitFor();
      const photoInventory=await page.evaluate(async()=>{
        const body=await (await fetch('/api/ipqc-ab')).json();
        const versions=Object.values(body.control.scopes).flatMap(scope=>scope.versions);
        const items=versions.flatMap(version=>version.snapshot.items);
        const ids=[...new Set(items.flatMap(item=>[...(item.standardPhotos||[]),...(item.methodPhotos||[])].map(photo=>photo.id)))];
        const bad=[];
        for(const id of ids){try{const response=await fetch(`/api/ipqc-ab/photo?id=${encodeURIComponent(id)}`);
          if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error(`HTTP ${response.status}`);
          const bitmap=await createImageBitmap(await response.blob());if(!bitmap.width||!bitmap.height)throw Error('empty image');bitmap.close();
        }catch(error){bad.push({id,error:String(error)});}}
        return {versions:versions.length,items:items.length,photos:ids.length,
          equipment:(body.equipment||[]).length,selectable:(body.equipment||[]).filter(eq=>eq.available).length,bad};
      });
      assert.deepEqual(photoInventory.bad,[]);
      await page.locator('#ipqcab-add-error').click();
      assert.ok(await page.locator('#ab-error-name').isVisible());
      assert.match(await page.locator('.ipqcab-dialog').innerText(),/自動帶入|tự động/);
      await page.locator('[data-ab-close]').first().click();
      await page.locator('.ipqcab-error [data-ab-error]').first().click();
      await page.locator('[data-ab-edit-item]').first().click();
      assert.equal(await page.locator('.ipqcab-photo-editor').count(),1);
      assert.ok(await page.locator('[data-ab-item-product]').count()>0);
      await page.screenshot({path:path.join(output,`ipqc-ab-editor-${width}.png`),fullPage:false});
      await page.locator('#ab-select-equipment').click();
      assert.ok(await page.locator('#ab-equipment-search').isVisible());
      assert.ok(await page.locator('#ab-equipment-category').isVisible());
      await page.screenshot({path:path.join(output,`ipqc-ab-equipment-${width}.png`),fullPage:false});
      await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-ipqc-ab`);
      await page.locator('#ipqcab-add-item').waitFor();
      await page.route('**/api/ipqc-ab',route=>route.request().method()==='POST'
        ? new Promise(resolve=>setTimeout(resolve,1200)).then(()=>route.fulfill({status:409,json:{error:'isolated slow-response fixture'}}))
        : route.continue());
      const started=Date.now();
      await page.locator('#ipqcab-add-item').click();
      await page.locator('.ipqcab-dialog [role="status"]').waitFor({timeout:750});
      const openMs=Date.now()-started;
      assert.ok(openMs<750,`AB item progress appeared after ${openMs}ms`);

      await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-ipqc-c`);
      await page.locator('#ipqcc-page').waitFor();
      const aside=page.locator('.ipqcc-products');
      const originalCode=await page.locator('.ipqcc-product.selected').getAttribute('data-ipqcc-product');
      await aside.evaluate(node=>{node.scrollTop=500;});
      const before=await aside.evaluate(node=>node.scrollTop);
      await page.locator('.ipqcc-product').nth(40).click();
      const after=await aside.evaluate(node=>node.scrollTop);
      assert.ok(after>=before-10,`IPQC-C scroll lost: ${before} -> ${after}`);
      await page.locator(`[data-ipqcc-product="${originalCode}"]`).click();
      await page.locator('.ipqcc-item [data-ipqcc-view-item]').first().click();
      assert.ok(await page.locator('#ipqcc-editor').isVisible());
      assert.equal(await page.locator('#ipqcc-editor button[type="submit"]').count(),0);
      await page.screenshot({path:path.join(output,`ipqc-c-view-${width}.png`),fullPage:false});
      await page.locator('#ipqcc-cancel').click();

      if(width<600)await page.locator('#menu-toggle').click();
      await page.locator('[data-dual-view="approval"]').click();
      await page.locator('[data-review-tab="quality"]').click();
      await page.locator('#approval-panel-quality .quality-review-intro').waitFor();
      assert.equal(await page.locator('#quality-review-detail p:has-text("請選擇左側案件查看差異")').count(),0);
      for(const id of ['review-fqc','review-iqc','review-ipqc-ab','review-ipqc-c','review-equipment'])
        assert.equal(await page.locator(`#${id}`).count(),1);
      const layout=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
      assert.ok(layout.scrollWidth<=layout.width+1,JSON.stringify(layout));
      await page.waitForTimeout(250);
      await page.screenshot({path:path.join(output,`quality-review-${width}.png`),fullPage:false});
      assert.deepEqual(errors,[]);
      console.log(`PASS quality comments ${width}px: expanded IQC, AB editor/equipment (progress ${openMs}ms; ${photoInventory.photos} stored photos; ${photoInventory.selectable}/${photoInventory.equipment} equipment selectable), C read-only, grouped review`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
