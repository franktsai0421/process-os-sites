const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
/* oxlint-disable typescript/no-require-imports -- Read-only browser fixture. */
/* The Local database is never written: API reads are modified only inside this browser context. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=isolatedTestTarget_20261010;
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
const digest='0'.repeat(64);

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    for(const width of [1366,390]){
      const context=await browser.newContext({viewport:{width,height:844}});
      const page=await context.newPage();
      await page.goto(`${base}/process/`);
      await page.locator('[data-quick-login="admin"]').click();
      await page.waitForURL('**/process/?**');
      let resolvePost;
      let postSeen=new Promise(resolve=>{resolvePost=resolve;});
      await context.route('**/api/ipqc-ab',async route=>{
        if(route.request().method()==='POST'){
          resolvePost(JSON.parse(route.request().postData()));
          return route.fulfill({status:409,json:{error:'isolated matrix fixture'}});
        }
        const response=await route.fetch(),body=await response.json();
        for(const scope of Object.values(body.control.scopes))for(const version of scope.versions){
          for(const item of version.snapshot.items){
            item.standardPhotos=[{id:digest,name:'fixture.png',note:'fixture photo'}];
            item.inspectionMode='equipment';item.equipmentId='fixture-equipment';
            item.equipmentSnapshot={id:'fixture-equipment',assetCode:'FIXTURE',pieceMark:'01',name:'Fixture',spec:'',photoId:digest};
          }
        }
        return route.fulfill({json:body});
      });
      await context.route('**/api/ipqc-ab/photo?*',route=>route.fulfill({status:200,contentType:'image/png',body:image}));
      await context.route('**/api/routine-equipment/photo?*',route=>route.fulfill({status:200,contentType:'image/png',body:image}));
      await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-ipqc-ab`);
      await page.locator('.ipqcab-item-photos img').first().waitFor();
      assert.ok(await page.locator('.ipqcab-equipment-thumb').first().isVisible());
      await page.locator('.ipqcab-item-photos button').first().click();
      await page.locator('.ipqcab-viewer img').waitFor();
      assert.equal(await page.locator('.ipqcab-viewer img').evaluate(img=>img.naturalWidth),1);
      assert.match(await page.locator('.ipqcab-viewer p').innerText(),/fixture photo/);
      await page.locator('[data-ab-close-viewer]').click();
      const cell=page.locator('[data-ab-matrix-item]').first();
      const itemId=await cell.getAttribute('data-ab-matrix-item');
      const product=await cell.getAttribute('data-ab-matrix-product');
      const checked=await cell.isChecked();
      await cell.setChecked(!checked);
      const request=await postSeen;
      const item=request.snapshot.items.find(row=>row.id===itemId);
      assert.ok(item,'The full colon-containing item ID must survive the matrix click');
      assert.equal(item.productCodes.includes(product),!checked);
      postSeen=new Promise(resolve=>{resolvePost=resolve;});
      await page.goto(`${base}/process/?system=quality&view=data&dataTab=quality-ipqc-ab`);
      await page.locator('#ipqcab-add-error').click();
      await page.locator('#ab-error-name').fill('Fixture error');
      await page.locator('#ab-apply').click();
      const create=await postSeen;
      assert.equal(create.action,'create-error');
      assert.equal(create.name,'Fixture error');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
      assert.equal(overflow,false);
      console.log(`PASS mocked IPQC-AB ${width}: photo viewer, equipment thumbnail, colon-ID matrix and create-error payloads, no overflow`);
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
