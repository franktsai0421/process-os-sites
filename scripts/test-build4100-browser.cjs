const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||require('./browser-test-runtime.cjs').playwrightModule);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||require('./browser-test-runtime.cjs').browserExecutable,headless:true});
 try {
 const context=await browser.newContext();const page=await context.newPage();
 page.setDefaultTimeout(6000);
 const seed=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'..','db','seed.json'),'utf8'));
 const users=JSON.parse(seed.values.platformUsers).map(({password: _password,...u})=>u);seed.values.platformUsers=JSON.stringify(users);
 seed.identity={id:'admin',role:'admin',name:'Test Admin'};seed.serverProtected=true;
 let conflict=false;
 await context.route('**/api/**',async route=>{
  const req=route.request();
  if(req.url().includes('/shared-state')){
   if(conflict&&req.method()==='POST')return route.fulfill({status:409,json:seed});
   if(req.method()==='POST'){const body=req.postDataJSON();Object.assign(seed.values,body.updates||{});seed.revision++;}
   return route.fulfill({json:seed});
  }
  return route.fulfill({status:403,json:{error:'Isolated test: writes blocked'}});
 });
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((isolatedTestTarget_20261010+"/process/?build=20260909-4100&manage=1"));
 await page.waitForSelector('.nav-item[data-view="data"]',{state:'visible'});
 await page.locator('.nav-item[data-view="data"]').click();
 await page.getByRole('button',{name:'使用者與權限',exact:true}).click();
 assert.equal(await page.locator('.user-admin > section').count(),3);
 for(const width of [375,390,430,768,1024,1366,1920]){
  await page.setViewportSize({width,height:width<500?844:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'user overflow '+width);
 }
 await page.setViewportSize({width:1366,height:768});
 await page.locator('[data-edit="rd"]').click();
 assert.ok(await page.locator('.user-edit-dialog').evaluate(e=>e.open));
 assert.equal(await page.locator('.user-edit-dialog [data-scope]:not(:disabled)').count(),0);
 await page.locator('.user-edit-dialog [name="mode"]').selectOption('custom');
 assert.ok(await page.locator('.user-edit-dialog [data-scope]:not(:disabled)').count()>10);
 page.on('dialog',d=>d.accept());
 await page.locator('.user-edit-dialog [data-close]').last().click();
 await page.locator('.nav-item[data-view="editor"]').click();
 await page.locator('.operation-block').first().waitFor();
 for(let i=0;i<3;i++){
  await page.locator('.operation-block h4,.operation-block h3,.operation-block strong').first().click();
  assert.ok(await page.locator('#process-operation-dialog').evaluate(e=>e.open));
  await page.locator('.editor-modal-close').click();
 }
 assert.equal(await page.locator('.editor-workspace > aside').count(),0);
 await page.locator('.auto-layout-stage').first().click();
 await page.locator('[data-zoom-action="out"]').first().click();
 await page.locator('.operation-block h4,.operation-block h3,.operation-block strong').first().click();
 assert.ok(await page.locator('#process-operation-dialog').evaluate(e=>e.open));
 await page.locator('.editor-modal-close').click();
 // Graph mutations below affect only this isolated browser fixture.
 await page.evaluate(()=>{const stages=ensureCategoryEditor(),stage=Object.keys(stages).find(k=>stages[k].length>=2);const ops=stages[stage];ops.forEach(op=>op.nextIds=[]);autoLayoutStage(stage);render();});
 const first=page.locator('.operation-block').first();
 const handle=first.locator('strong');await handle.scrollIntoViewIfNeeded();
 const initial=await first.evaluate(e=>({x:parseFloat(e.style.left),y:parseFloat(e.style.top)}));
 let box=await handle.boundingBox();await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.mouse.move(box.x+40,box.y+35,{steps:5});await page.mouse.up();await page.waitForTimeout(450);
 assert.ok(await first.evaluate((e,p)=>parseFloat(e.style.left)>p.x,initial));
 const link=first.locator('.operation-link-handle'),target=page.locator('.operation-block').nth(1);
 await link.scrollIntoViewIfNeeded();box=await link.boundingBox();const end=await target.boundingBox();
 await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.mouse.move(end.x+end.width/2,Math.min(760,end.y+20),{steps:6});await page.mouse.up();await page.waitForTimeout(450);
 assert.ok(await page.evaluate(()=>{const blocks=[...document.querySelectorAll('.operation-block')];const ops=Object.values(ensureCategoryEditor()).flat();return ops.find(o=>o.id===blocks[0].dataset.operation).nextIds.includes(blocks[1].dataset.operation);}));
 const edge=page.locator('[data-stage-canvas]').first().locator('.flow-link-hit').first();
 await edge.evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));await page.waitForTimeout(400);assert.equal(await page.locator('[data-stage-canvas]').first().locator('.flow-link-hit').count(),0);
 box=await link.boundingBox();const reconnectEnd=await target.boundingBox();await page.mouse.move(box.x+16,box.y+16);await page.mouse.down();await page.mouse.move(reconnectEnd.x+reconnectEnd.width/2,Math.min(760,reconnectEnd.y+20),{steps:5});await page.mouse.up();await page.waitForTimeout(400);assert.equal(await page.locator('[data-stage-canvas]').first().locator('.flow-link-hit').count(),1);
 const linked=await page.evaluate(()=>JSON.stringify(Object.values(ensureCategoryEditor()).flat().map(o=>o.nextIds)));
 // Reverse edge would create a cycle: it must leave all edges unchanged.
 box=await target.locator('.operation-link-handle').boundingBox();const reverse=await first.boundingBox();await page.mouse.move(box.x+16,box.y+16);await page.mouse.down();await page.mouse.move(reverse.x+reverse.width/2,reverse.y+reverse.height/2,{steps:5});await page.mouse.up();await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>JSON.stringify(Object.values(ensureCategoryEditor()).flat().map(o=>o.nextIds))),linked);
 await page.setViewportSize({width:430,height:932});
 const zoomOut=page.locator('[data-zoom-action="out"]').first();while(await zoomOut.isEnabled())await zoomOut.click();
 await page.evaluate(()=>{Object.values(ensureCategoryEditor()).flat().forEach(o=>o.nextIds=[]);render();});
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 await first.locator('.operation-move-handle').scrollIntoViewIfNeeded();const touchMove=await first.locator('.operation-move-handle').boundingBox(),touchBefore=await first.evaluate(e=>parseFloat(e.style.left));
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchMove.x+10,y:touchMove.y+10}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchMove.x+30,y:touchMove.y+20}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(450);assert.ok(await first.evaluate((e,x)=>parseFloat(e.style.left)>x,touchBefore));
 await link.scrollIntoViewIfNeeded();box=await link.boundingBox();const mobileEnd=await target.boundingBox();
 const start={x:box.x+8,y:box.y+8},finish={x:mobileEnd.x+mobileEnd.width/2,y:mobileEnd.y+mobileEnd.height/2};
 assert.ok(finish.x<430,'touch target visible');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
 for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(finish.x-start.x)*i/6,y:start.y+(finish.y-start.y)*i/6}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(450);
 assert.ok(await page.evaluate(()=>{const blocks=[...document.querySelectorAll('.operation-block')];return Object.values(ensureCategoryEditor()).flat().find(o=>o.id===blocks[0].dataset.operation).nextIds.includes(blocks[1].dataset.operation);}),'emulated touch connection');
 await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
 await page.setViewportSize({width:1366,height:768});
 await page.locator('.operation-block strong').first().click();
 await page.locator('#operation-name').fill('Unsaved isolated conflict test');conflict=true;
 await page.locator('#apply-operation').click();await page.waitForTimeout(400);
 assert.ok(await page.locator('#process-operation-dialog').evaluate(e=>e.open),'conflict keeps modal open');
 assert.equal(await page.locator('#operation-name').inputValue(),'Unsaved isolated conflict test');
 await page.locator('.editor-modal-close').click();
 for(const width of [375,390,430,1366,1920]){
  await page.setViewportSize({width,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'editor overflow '+width);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: isolated browser: user scopes, modal after repeat/layout/zoom, mouse move/link, CDP-emulated touch link, mobile/desktop overflow. No real API writes.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e.stack);process.exit(1)});
