const isolatedTestTarget_20261010=require('./require-isolated-test-target.cjs')();
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require(require('./browser-test-runtime.cjs').playwrightModule);
(async()=>{
 const browser=await chromium.launch({executablePath:require('./browser-test-runtime.cjs').browserExecutable,headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1366,height:900},acceptDownloads:true});
  const seed=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'..','db','seed.json'),'utf8'));
  seed.values.platformUsers=JSON.stringify(JSON.parse(seed.values.platformUsers).map(u=>{delete u.password;return u;}));
  seed.identity={id:'admin',role:'admin',name:'Fixture Manager'};seed.serverProtected=true;
  await context.route('**/api/**',async route=>{
   if(!route.request().url().includes('/shared-state'))return route.fulfill({status:403,json:{error:'fixture'}});
   if(route.request().method()==='POST'){Object.assign(seed.values,route.request().postDataJSON().updates||{});seed.revision++;}
   return route.fulfill({json:seed});
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  await page.goto((isolatedTestTarget_20261010+"/process/?build=20260910-5800&manage=1&dataTab=process-master"));
  await page.locator('[data-view=data]').click();await page.locator('[data-tab=process-master]').click();
  await page.locator('#process-master-new-draft').click();await page.evaluate(()=>ProcessEquipment.loadSource());
  await page.waitForFunction(()=>window.ProcessEquipment.entries(currentProcessMasterData()).length===190);
  assert.equal(await page.locator('.equipment-record').count(),165);
  assert.equal(await page.evaluate(()=>ProcessEquipment.entries(processMaster).length),0,'draft must not publish');
  const stageCounts=await page.evaluate(()=>ProcessEquipment.entries(currentProcessMasterData()).reduce((o,e)=>(o[e.stage]=(o[e.stage]||0)+1,o),{}));
  assert.equal(stageCounts['A-CUT'],11);assert.ok(stageCounts['C-TIEN']>=36);
  assert.equal(await page.locator('.equipment-photo-list img').first().evaluate(i=>i.complete&&i.naturalWidth>0),true);
  await page.locator('[data-equipment-kind=machine-setting]').click();assert.equal(await page.locator('.equipment-record').count(),25);
  // CRUD and auto-compressed photo upload in the draft.
  await page.locator('#add-equipment').click();const record=page.locator('.equipment-record').filter({has:page.locator('[data-equipment-field=name][value="新設備"]')});
  await record.locator('[data-equipment-field=number]').fill('TEST-MACHINE');
  await record.locator('[data-equipment-field=name]').fill('測試設備');
  const id=await record.getAttribute('data-equipment-id');
  await record.locator('[data-equipment-photo]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHHoAAAAASUVORK5CYII=','base64')});
  await page.waitForFunction(id=>ProcessEquipment.entries(currentProcessMasterData()).find(e=>e.equipment.id===id)?.equipment.mediaItems.length===1,id);
  await page.locator('#save-equipment').click();await page.locator(`[data-equipment-id="${id}"] [data-equipment-delete]`).click();
  assert.equal(await page.evaluate(()=>ProcessEquipment.entries(currentProcessMasterData()).length),190);
  const before=await page.evaluate(()=>JSON.stringify(currentProcessMasterData()));
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.locator('#export-process-master').click()]);
  const stream=await download.createReadStream(),chunks=[];for await(const c of stream)chunks.push(c);const bytes=Buffer.concat(chunks);
  console.log('Export bytes',bytes.length);
  // Inspect using application parser and re-import the actual exported workbook.
  await page.locator('#process-master-import-file').setInputFiles({name:'roundtrip.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes});
  await page.waitForFunction(()=>processMasterDraft().history.some(h=>h.label==='匯入流程資料 Excel'),{},{timeout:120000});
  const after=await page.evaluate(()=>JSON.stringify(currentProcessMasterData()));
  const canonical=raw=>{const obj=JSON.parse(raw);Object.values(obj).flat().forEach(t=>{if(!t.equipment?.length)delete t.equipment;});return obj;};
  assert.deepEqual(canonical(after),canonical(before),'all templates, equipment and photos round-trip');
  await page.locator('#process-master-submit').click();assert.equal(await page.locator('#load-equipment-source').count(),0);
  await page.locator('#process-master-review').click();assert.match(await page.locator('.master-review-detail:visible').innerText(),/APU009/);
  await page.locator('#approve-master:visible').click();await page.evaluate(()=>ProcessSync.flush());
  assert.equal(await page.evaluate(()=>ProcessEquipment.entries(processMaster).length),190);
  // Use actual operation inspector, save, reopen another block, verify reuse label.
  await page.evaluate(()=>{state.view='editor';state.editorLine='A';state.category='BORUAXE1021';render();});
  const setup=await page.evaluate(()=>{
   const template=processMaster['A-CUT'].find(t=>t.presetKey==='machine-assembly'), ops=ensureCategoryEditor();
   const a=newOperation('A-CUT',71,template),b=newOperation('A-CUT',72,template);ops['A-CUT'].push(a,b);render();ProcessOpenOperation(a);
   return {a:a.id,b:b.id,m:template.equipment.find(e=>e.number==='APU009').id};
  });
  assert.equal(await page.locator('[data-operation-machine]').count(),11);
  await page.locator(`[data-operation-machine="${setup.m}"]`).check();
  await page.locator('#apply-operation').click();
  await page.locator('#process-operation-dialog').waitFor({state:'hidden'});
  await page.evaluate(id=>ProcessOpenOperation(Object.values(ensureCategoryEditor()).flat().find(op=>op.id===id)),setup.b);
  const choice=page.locator(`[data-operation-machine="${setup.m}"]`);
  assert.equal(await choice.isDisabled(),false);assert.equal(await choice.isChecked(),false);
  assert.match(await choice.locator('..').innerText(),/已用於/);
  await choice.check();await page.locator('#apply-operation').click();
  assert.equal(await page.evaluate(ids=>Object.values(ensureCategoryEditor()).flat().filter(o=>[ids.a,ids.b].includes(o.id)).every(o=>o.machineIds.includes(ids.m)),setup),true);
  // Exact line/stage filtering and PREP classification.
  const filter=await page.evaluate(()=>{
   state.editorLine='C';const p=processMaster['C-PREP'].find(t=>t.presetKey==='machine-setting');
   return ProcessEquipment.choices({stageCode:'C-PREP',machineIds:[]},p).map(m=>[m.line,m.stageCode,m.kind]);
  });assert.equal(filter.length,25);assert.ok(filter.every(r=>r.join('/')==='C/C-PREP/machine-setting'));
  // Mobile approved version: read only, full width controls and readable previews.
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{state.view='data';state.dataTab='process-master';render();});
  await page.locator('[data-equipment-kind=machine-assembly]').click();
  assert.equal(await page.locator('#add-equipment').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'mobile overflow');
  await page.locator('#equipment-search').fill('APU009');assert.equal(await page.locator('.equipment-record').count(),1);
  await page.locator('.equipment-record').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:'../.tmp-equipment-mobile.png',fullPage:false});
  await page.setViewportSize({width:1366,height:900});
  await page.locator('.equipment-record').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:'../.tmp-equipment-desktop.png',fullPage:false});
  await page.evaluate(()=>{document.documentElement.lang='vi';document.querySelector('#data-content').innerHTML=processMasterView();bindDataInner('process-master');});
  assert.match(await page.locator('#equipment-panel').innerText(),/Dữ liệu máy/);
  assert.deepEqual(errors,[]);
  console.log('PASS 5800: 190 equipment, source photos, CRUD, complete Excel round-trip, review, reusable machine selections, filters, mobile and Vietnamese');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
