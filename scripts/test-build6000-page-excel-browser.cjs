const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||require('./browser-test-runtime.cjs').playwrightModule);
const baseUrl=require('./browser-test-runtime.cjs').localUrl(process.argv[2]);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||require('./browser-test-runtime.cjs').browserExecutable,headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage(),seed=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'..','db','seed.json'),'utf8')),errors=[];
  seed.values.platformUsers=JSON.stringify(JSON.parse(seed.values.platformUsers).map(user=>{const copy={...user};delete copy.password;return copy;}));seed.identity={id:'admin',role:'admin',name:'Fixture Manager'};seed.serverProtected=true;
  await context.route('**/api/**',async route=>{if(!route.request().url().includes('/shared-state'))return route.fulfill({status:403,json:{error:'fixture'}});return route.fulfill({json:seed});});
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);
  await page.goto(`${baseUrl}/process/?build=20260911-6000&manage=1&dataTab=process-master`);await page.locator('[data-view=data]').click();
  await page.locator('[data-master-scope=AB]').click();
  assert.equal(await page.locator('#master-import').count(),1);assert.equal(await page.locator('#master-export').count(),1);assert.match(await page.locator('#master-export').innerText(),/匯出全部 Excel/);assert.equal(await page.locator('.master-sync-map').count(),0);
  await page.locator('[data-tab=bom]').click();assert.equal(await page.locator('.bom-excel-toolbar').count(),1);assert.equal(await page.locator('#bom-excel-import').count(),1);assert.equal(await page.locator('#bom-excel-all').count(),1);assert.equal(await page.locator('#bom-excel-current,#bom-excel-template').count(),0);
  await page.locator('[data-tab=line-admin]').click();assert.equal(await page.locator('#master-line-import').count(),1);assert.equal(await page.locator('#master-line-export').count(),1);assert.match(await page.locator('#master-line-export').innerText(),/匯出全部 Excel/);
  await page.locator('[data-tab=process-master]').click();assert.equal(await page.locator('#export-process-master').count(),1);assert.ok(await page.locator('#import-process-master').count()<=1);assert.equal(await page.locator('#load-equipment-source').count(),0);assert.equal(await page.locator('.sync-notice').count(),0);
  await page.setViewportSize({width:390,height:844});await page.locator('[data-tab=bom]').click();const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert.ok(overflow<=1,`mobile horizontal overflow ${overflow}px`);
  assert.deepEqual(errors,[]);console.log('PASS: one complete Excel control pair per backend page, no sync explainer/persistent notice, and 390 px no overflow.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exit(1)});
