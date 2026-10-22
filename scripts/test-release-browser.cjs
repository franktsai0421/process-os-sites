const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||require('./browser-test-runtime.cjs').playwrightModule);
(async()=>{
 const browser=await chromium.launch({executablePath:require('./browser-test-runtime.cjs').browserExecutable,headless:true});
 try{
  const fixture=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'..','db','seed.json')));
  fixture.values.platformUsers=JSON.stringify(JSON.parse(fixture.values.platformUsers).map(({password: _password,...u})=>u));
  fixture.serverProtected=true;fixture.demoEnabled=true;fixture.identity=null;
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/**',async route=>{
   const url=route.request().url();
   if(url.includes('/shared-state'))return route.fulfill({json:fixture});
   if(url.includes('/platform-login')){const body=route.request().postDataJSON();if(body.action==='logout'){fixture.identity=null;return route.fulfill({json:{ok:true}});}const u=JSON.parse(fixture.values.platformUsers).find(u=>u.role===body.demoRole);fixture.identity=u;return route.fulfill({json:{user:u}});}
   if(url.includes('/backups'))return route.fulfill({json:{backups:[],revision:fixture.revision,settings:{enabled:false,frequency:'weekly',dayOfWeek:6,time:'12:00'},coverage:[]}});
   return route.fulfill({status:403,json:{error:'Fixture: mutation disabled'}});
  });
  await context.route('**/__local-backups*',r=>r.fulfill({status:403,json:{error:'Fixture'}}));
  page.setDefaultTimeout(20000);
  await page.setViewportSize({width:1366,height:900});
  await page.goto('http://localhost:4174/process/');
  await page.locator('[data-quick-login=admin]').click();
  await page.locator('.nav-item[data-view=editor]').waitFor({state:'visible'});
  const checked=[];
  for(const width of [1366,1024,390]){
   await page.setViewportSize({width,height:900});
   for(const view of ['dashboard','player','dispatch','productStatus','approval','editor','data']){
    if(await page.locator('#menu-toggle').isVisible()&&!await page.locator('.sidebar.open').count())await page.locator('#menu-toggle').click();
    await page.locator(`.nav-item[data-view="${view}"]`).click();
    await page.locator('#page-title').waitFor({state:'visible'});
    if(width===390)await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=2,`${view} at ${width}: overflow ${overflow}`);
    checked.push(`${view}:${width}`);
   }
  }
  await page.setViewportSize({width:1366,height:900});await page.locator('.nav-item[data-view=editor]').click();
  const expected=Object.values(JSON.parse(fixture.values.approvalVersions).find(v=>v.number===6).stages).flat().length;
  assert.equal(await page.locator('.operation-block').count(),expected,'current draft nodes are visible');
  await page.waitForFunction(()=>[...document.querySelectorAll('.operation-block img')].filter(n=>n.getBoundingClientRect().top<innerHeight).every(n=>n.complete&&n.naturalWidth>0));
  const out=await page.locator('.operation-card-media-preview').evaluateAll(nodes=>nodes.flatMap(n=>{const p=n.closest('.operation-block'),a=n.getBoundingClientRect(),b=p?.getBoundingClientRect();return b&&(a.bottom>b.bottom+1||a.right>b.right+1)?[p.textContent.slice(0,15)]:[]}));
  assert.deepEqual(out,[],'photos remain inside editor cards');
  await page.screenshot({path:'work/release-7000/desktop-editor.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);await page.screenshot({path:'work/release-7000/mobile-editor.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: public demo ADMIN entry, all seven sections at desktop/tablet/mobile, no document overflow, no page errors, photos contained. '+checked.length+' page/viewport checks');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
