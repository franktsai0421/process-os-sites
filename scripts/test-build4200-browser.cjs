const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||require('./browser-test-runtime.cjs').playwrightModule);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||require('./browser-test-runtime.cjs').browserExecutable,headless:true});
 try {
 const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(7000);
 const seed=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'..','db','seed.json'),'utf8'));seed.values.platformUsers=JSON.stringify(JSON.parse(seed.values.platformUsers).map(({password: _password,...u})=>u));seed.identity={id:'admin',role:'admin',name:'Fixture'};seed.serverProtected=true;
 await context.route('**/api/**',async route=>{const req=route.request();if(req.url().includes('/users')){const b=req.postDataJSON(),users=JSON.parse(seed.values.platformUsers);if(users.some(u=>u.id===b.id))return route.fulfill({status:409,json:{field:'id',error:'此帳號已存在，請使用其他帳號（英文不分大小寫）'}});users.push({id:b.id,name:b.name,role:b.role,enabled:true,inheritRole:true});seed.values.platformUsers=JSON.stringify(users);seed.revision++;}else if(req.method()==='POST'){Object.assign(seed.values,req.postDataJSON().updates||{});seed.revision++;}return route.fulfill({json:seed});});
 await context.route('**/__local-backups*',route=>route.fulfill({json:{settings:{backupPath:require('./browser-test-runtime.cjs').fixtureBackupPath,enabled:false},state:{},disk:{},backups:[],audit:[],pathPickerSupported:false}}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto((isolatedTestTarget_20261010+"/process/?build=20260910-4700&manage=1"));
 await page.locator('[data-view="data"]').click();
 await page.locator('[data-tab="users"]').click();
 await page.locator('#backup-tab').click();
 await page.locator('.backup-console').waitFor();
 assert.equal(await page.locator('.master-tabs .active').count(),1);assert.equal(await page.locator('#backup-tab').getAttribute('aria-selected'),'true');
 await page.goBack();await page.locator('#user-create-form').waitFor();assert.equal(await page.locator('[data-tab="users"]').getAttribute('aria-selected'),'true');
 await page.goForward();await page.locator('.backup-console').waitFor();await page.reload();await page.locator('.backup-console').waitFor();assert.equal(await page.locator('#backup-tab').getAttribute('aria-selected'),'true');
 await page.locator('[data-tab="users"]').click();
 for(const width of [1920,1366,1024,768,430,390,375]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'user overflow '+width);const widths=await page.locator('#user-create-form input,#user-create-form select').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().width));assert.ok(widths.every(w=>w>=150),'field widths '+width);}
 await page.setViewportSize({width:1366,height:768});
 const form=page.locator('#user-create-form');await form.locator('button').click();assert.ok(await page.locator('[data-error-for="id"]').innerText());
 await form.locator('[name=id]').fill('admin');await form.locator('[name=name]').fill('Fixture');await form.locator('[name=password]').fill('fixture-only');await form.locator('button').click();await page.locator('[data-error-for=id]:not(:empty)').waitFor();
 await form.locator('[name=id]').fill('fixture.user');await form.locator('button').click();await page.locator('[data-edit="fixture.user"]').waitFor();assert.equal(await form.locator('[name=password]').inputValue(),'');
 await page.locator('.top-language-switch').click();await page.waitForTimeout(80);assert.equal(await page.locator('[data-tab="users"]').getAttribute('aria-selected'),'true');assert.ok(!/[\u3400-\u9fff]/.test(await page.locator('.user-create-section h2').innerText()));await page.locator('.top-language-switch').click();
 await page.locator('[data-view=editor]').click();await page.locator('.operation-block').first().waitFor();
 assert.equal(await page.locator('.operation-move-handle').first().isVisible(),false);assert.equal(await page.locator('.operation-link-handle').first().innerText(),'');
 const before=await page.evaluate(()=>{const ops=Object.values(ensureCategoryEditor()).flat();return Object.fromEntries(ops.map(o=>[o.id,JSON.stringify({products:o.productCodes,bom:o.bomSelections,media:o.mediaItems,next:o.nextIds,instructions:o.instructions})]));});
 const expected=await page.evaluate(()=>inheritedOperationProducts(Object.keys(ensureCategoryEditor())[0]));assert.ok(expected.length);
 await page.locator('.add-operation').first().click();await page.locator('[data-add-template]').first().click();
 const created=await page.evaluate(()=>{const o=selectedEditorOperation();return {id:o.id,products:o.productCodes};});assert.deepEqual(created.products,expected);
 await page.locator(`[data-operation="${created.id}"] strong`).click();for(const code of expected)assert.equal(await page.locator(`[data-operation-product="${code}"]`).isChecked(),true);await page.locator('.editor-modal-close').click();
 const unchanged=await page.evaluate(before=>Object.values(ensureCategoryEditor()).flat().filter(o=>before[o.id]).every(o=>before[o.id]===JSON.stringify({products:o.productCodes,bom:o.bomSelections,media:o.mediaItems,next:o.nextIds,instructions:o.instructions})),before);assert.ok(unchanged,'existing content preserved');
 await page.evaluate(code=>{const stages=routeFor(code).stages,stageCode=stages.find(stage=>stage!==Object.keys(ensureCategoryEditor())[0]&&(ensureCategoryEditor()[stage]||[]).length)||stages[0];(ensureCategoryEditor()[stageCode]||[]).forEach(op=>{op.productCodes=(op.productCodes||[]).filter(item=>item!==code);delete op.bomSelections?.[code]});render();},expected[0]);
 await page.locator('#save-process').click();await page.evaluate(()=>ProcessSync.flush());await page.reload();await page.locator('[data-view=editor]').click();await page.locator(`[data-operation="${created.id}"]`).waitFor();assert.deepEqual(await page.evaluate(id=>Object.values(ensureCategoryEditor()).flat().find(o=>o.id===id).productCodes,created.id),expected);
 await page.locator('#submit-version').click();const all=page.locator('.editor-submit-issues [data-issue-group=all]');assert.equal(await all.getAttribute('open'),null);await all.locator(':scope > summary').click();
 const stageGroup=page.locator('[data-issue-group=stage]');await stageGroup.locator(':scope > summary').click();await stageGroup.locator('details > summary').first().click();const countBefore=await page.evaluate(()=>state.editorSubmissionErrors.length);await stageGroup.locator('[data-submit-error]').first().click();await page.locator('#process-operation-dialog[open]').waitFor();
 const code=await page.evaluate(()=>state.editorProblemProduct);await page.locator(`[data-operation-product="${code}"]`).check();await page.waitForTimeout(60);const countAfter=await page.evaluate(()=>state.editorSubmissionErrors.length);if(!(countAfter<countBefore))console.log(await page.evaluate(()=>({n:state.editorSubmissionErrors.length,product:state.editorProblemProduct,op: selectedEditorOperation().productCodes,errors:state.editorSubmissionErrors.filter(e=>e.productCode===state.editorProblemProduct)})));assert.ok(countAfter<countBefore,'product correction removes missing stage');
 const bomButton=page.locator(`[data-bom-select-all="${code}"]`);if(await bomButton.count()&&(await bomButton.innerText()).includes('全選')){const missingBefore=await page.evaluate(code=>state.editorSubmissionErrors.find(e=>e.type==='bom'&&e.productCode===code)?.items.length||0,code);await bomButton.click();await page.locator('#apply-operation').click();await page.waitForTimeout(250);const missingAfter=await page.evaluate(code=>state.editorSubmissionErrors.find(e=>e.type==='bom'&&e.productCode===code)?.items.length||0,code);assert.ok(missingAfter<=missingBefore,'BOM correction does not increase the remaining product error count');}
 assert.deepEqual(errors,[]);console.log('PASS: isolated tabs/history/reload, user fields/errors/create, bilingual tab state, new-node inherited products/save/reload, preserved node data, collapsed grouped validation/fix navigation/live counts.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exit(1)});
