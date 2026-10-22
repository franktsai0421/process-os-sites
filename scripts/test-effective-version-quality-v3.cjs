/* oxlint-disable typescript/no-require-imports -- actual browser quality-only adoption notice regression. */
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true});try{
 for(const key of ['qualityMasterControl','iqcMasterControl','ipqcABMasterControl','ipqcCMasterControl','routineEquipmentControl']){
  const page=await browser.newPage({viewport:{width:1366,height:900}});let requests=0,version='old';
  await page.route('**/*',route=>{if(route.request().url().includes('/api/effective-versions')){requests++;return route.fulfill({json:{effective:{[key]:version}}});}return route.fulfill({contentType:'text/html; charset=utf-8',body:'<html lang="vi"><meta charset="utf-8"><main><input id="input" value="Chưa áp dụng"></main></html>'});});
  await page.goto('http://fixture/process/');await page.evaluate(key=>{localStorage.clear();const workflow={};localStorage.setItem(key,JSON.stringify(key==='qualityMasterControl'?{libraries:{fqc:{workflow}}}:key==='ipqcABMasterControl'?{scopes:{'A:G':{workflow}}}:{workflow}));window.ProcessSync={identity:{id:'a'},platformHeaders:()=>({})};},key);
  await page.addScriptTag({content:fs.readFileSync('public/process/effective-version-notice.js','utf8')});await page.waitForFunction(()=>!!window.EffectiveVersionNotice);await page.waitForTimeout(50);assert.ok(requests>0,'quality-only adoption must enable readonly formal-version polling');
  version='new';await page.evaluate(()=>EffectiveVersionNotice.check());await page.locator('#effective-version-notice a').waitFor();assert.equal(await page.locator('#input').inputValue(),'Chưa áp dụng');assert.equal(await page.locator('#effective-version-notice a').getAttribute('rel'),'noopener');await page.close();
 }
 console.log('PASS T45 all five quality-only V3 projections enable formal-ID notification without authoring/master adoption; current input remains untouched');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
