/* oxlint-disable typescript/no-require-imports -- actual isolated SPA read-only history interaction. */
const {chromium}=require('playwright'),{expect}=require('playwright/test'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true}),page=await browser.newPage({viewport:{width:1366,height:768}}),out=process.argv[2],origin=process.argv[3],history=[];page.on('request',r=>{if(r.url().includes('/api/process-ipqc?mode=history'))history.push(r.url());});
 try{
  await page.goto(origin+'/process/?system=quality&view=data&dataTab=quality-ipqc-c');await page.locator('#ipqcc-search').fill('3012902');await page.locator('[data-ipqcc-product="3012902"]').click();await page.locator('[data-ipqcc-stage="C-TIEN"]').click();await expect(page.locator('[data-ipqc-reference]').filter({hasText:'C-TIEN-01'}).first()).toBeVisible();assert.equal(history.length,0);
  const unchanged=await page.waitForResponse(async r=>r.url().includes('/api/process-ipqc?mode=references')&&r.url().includes('revision=')&&r.status()===200&&(await r.json()).unchanged===true,{timeout:12000});assert.equal((await unchanged.json()).references,undefined);
  for(const width of [1366,390]){
   await page.setViewportSize({width,height:width===390?844:768});await page.locator('[data-ipqcc-view-item="ipqc-c-item-row-2"]').click();await expect(page.locator('.ipqcc-view-fields')).toHaveAttribute('disabled','');
   const button=page.locator('#ipqcc-editor [data-ipqc-history-more]');await button.scrollIntoViewIfNeeded();await expect(button).toBeVisible();const prior=history.length;if(width===390)await button.press('Space');else await button.click();
   await expect(page.locator('#ipqcc-editor [data-ipqc-history]')).toContainText('此歷史頁無引用');assert.equal(history.length,prior+1);assert.match(history.at(-1),/itemId=ipqc-c-item-row-2/);assert.match(history.at(-1),/limit=10/);await expect(button).toBeHidden();await page.screenshot({path:path.join(out,'after-history-readonly-'+width+'.png')});await page.locator('#ipqcc-cancel').click();
  }
  console.log(JSON.stringify({result:'PASS_IPQC_HISTORY_UI',steps:['Real SPA daily poll sends revision and receives unchanged without reference payload','No history requests until explicit action','Readonly C viewer permits mouse/Space history action despite disabled editing fieldset','History is item-scoped, limit 10; 1366 and 390 viewport screenshots'],realLocalWrites:0},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
