import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {setup,photoBytes,photoEndpoint} from './piece-calibration-native-fixture.mjs';

// The same pending disposition must become approvable only after all four
// producer workflows have approved the actual replacements from Equipment.
void test('native calibration browser retires the same piece after four approved replacements',async t=>{
 const f=await setup('1','1',{transfer:true});let browser;
 try{
  const today=(await f.state()).today;
  const post=(action,doc,fields={})=>f.send('operator',{action,doc,...fields});
  const approve=async doc=>{await post('submit',doc);await f.send('reviewer',{action:'approve',doc});};
  const docOf=async kind=>(await f.state()).docs.find(doc=>doc.kind===kind).id;
  const plan=(await f.send('operator',{action:'newPlan',ids:['source']})).doc;
  await post('save',plan,{start:today,end:today});await approve(plan);
  const upload=await f.request(photoEndpoint,'operator','PUT',photoBytes,{'content-type':'image/png'});
  assert.equal(upload.status,200);const photo=(await upload.json()).id,report=await docOf('initial');
  await post('save',report,{rows:[{id:'source',date:today,outcome:'fail',photos:[photo]}]});await approve(report);
  await post('branch',await docOf('failure'),{kind:'scrapRequest'});
  const scrap=await docOf('scrapRequest');
  await post('save',scrap,{reason:'Synthetic replacement acceptance'});await post('submit',scrap);
  const blocked=await f.send('reviewer',{action:'approve',doc:scrap},409,'EQUIPMENT_STILL_REFERENCED');
  assert.deepEqual(blocked.modules.sort(),['FQC','IPQC-AB A:G-A','IPQC-C','IQC']);
  assert.equal((await f.state()).docs.find(doc=>doc.id===scrap).status,'pending');
  t.diagnostic('Four approved standards blocked disposition of the same piece (HTTP 409).');
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||chromium.executablePath()});
  const page=await browser.newPage({viewport:{width:1280,height:900},serviceWorkers:'block'});
  const origin=f.url.origin;
  await page.context().route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  page.setDefaultTimeout(8000);page.on('dialog',dialog=>dialog.accept());
  await page.context().addCookies([{name:'process_demo',value:f.cookie('frank'),url:origin}]);
  const modules=['fqc','iqc','ipqc-ab','ipqc-c'];
  const preview=async id=>(await f.json('/api/quality-equipment-replacement?sourceId='+id,'frank')).modules;
  for(const m of await preview('source'))assert(m.items.some(i=>i.activeEquipmentId==='source'),m.moduleId+' active source');
  const libraries=async()=>{
   const row=await f.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();
   const bucket=await f.mf.getR2Bucket('STATE_ARCHIVE');
   const {values}=await f.load('lib/state-records.ts').decodeRecordValues(bucket,JSON.parse(row.values));
   return [JSON.parse(values.qualityMasterControl).libraries.fqc,JSON.parse(values.iqcMasterControl),JSON.parse(values.ipqcABMasterControl).scopes['A:G-A'],JSON.parse(values.ipqcCMasterControl)];
  };
  const before=(await libraries()).map(lib=>lib.versions.find(v=>v.id===lib.activeVersionId));
  let sequence=0;
  const review=async(moduleId)=>{
   const url='/api/'+moduleId+'/workflow?caseMetadata=1'+(moduleId==='ipqc-ab'?'&module=1':'');
   async function call(body){
    const res=await f.request(url,'frank',body?'POST':'GET',body,{'X-Process-Expected-Actor':'frank'});
    const payload=await res.json();assert.equal(res.status,200,moduleId+' '+(body?.command?.action||body?.action||'read')+' '+JSON.stringify(payload).slice(0,500));return payload;
   }
   if(moduleId==='ipqc-ab')await call({action:'begin'});
   async function command(action,fields={}){
    const prior=await call();const workflow=prior.control?.workflow||prior.workflow;
    return call({command:{clientId:'calibration-transfer-review',operationId:randomUUID(),sequence:++sequence,generation:workflow.generation,expectedRevision:workflow.revision,action,input:{stateRevision:prior.revision},...fields}});
   }
   const saved=await command('save'),savedId=(saved.control?.workflow||saved.workflow).saved.id;
   const submitted=await command('submit',{savedId,reason:'Synthetic replacement acceptance'});
   await command('approve',{caseId:submitted.receipt.caseId,selfReviewConfirmed:true});
  };
  for(const [index,moduleId] of modules.entries()){
   await page.goto(origin+'/process/?system=quality&view=data&dataTab=quality-routine-equipment');
   await page.locator('[data-node-select="category"]').first().click();
   await page.locator('[data-node-select="subcategory"]').first().click();
   if(await page.locator('[data-node-select="group"]').count())await page.locator('[data-node-select="group"]').first().click();
   await page.locator('[data-equipment-transfer="source"]').click();
   await page.locator('#routine-target-eq-select').selectOption('target');
   const button=page.locator('#routine-confirm-transfer-'+moduleId);
   const dialog=page.locator('#routine-transfer-backdrop');
   await page.waitForFunction(id=>!document.querySelector('#routine-confirm-transfer-'+id)?.disabled,moduleId,{timeout:8000}).catch(async err=>{throw Error(moduleId+' transfer unavailable: '+await dialog.innerText(),{cause:err});});
   const result=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/'+moduleId+'/workflow'&&r.request().method()==='POST'&&['apply','save'].includes(r.request().postDataJSON().command?.action),{timeout:10000});
   const [response]=await Promise.all([result,button.click()]);
   assert.equal(response.status(),200,moduleId+' transfer '+(await response.text()).slice(0,280));
   await page.waitForFunction(()=>!window.sharedDraftAccountState().queued);
   await review(moduleId);
   const rows=(await preview('target')).find(row=>row.moduleId===moduleId).items;
   assert(rows.some(row=>row.activeEquipmentId==='target'),moduleId+' replacement approved');
   if(index<modules.length-1){
    const again=await f.send('reviewer',{action:'approve',doc:scrap},409,'EQUIPMENT_STILL_REFERENCED');
    assert.equal(again.modules.length,modules.length-index-1,JSON.stringify(again.modules));
   }
  }
  for(const row of await preview('source'))assert(!row.items.some(i=>i.activeEquipmentId==='source'),row.moduleId);
  await f.send('reviewer',{action:'approve',doc:scrap});
  const state=await f.state();assert.equal(state.items.find(row=>row.id==='source')?.status||state.retired?.find(row=>row.id==='source')?.status,'retired');
  assert(state.items.find(row=>row.id==='target').selectable);
  for(const [i,lib] of (await libraries()).entries())assert.deepEqual(lib.versions.find(v=>v.id===before[i].id).snapshot,before[i].snapshot);
  t.diagnostic('Same pending request approved (HTTP 200) after FQC, IQC, IPQC-AB and IPQC-C replacements were approved.');
 }finally{await browser?.close();await f.close();}
});

for(const [language,width] of [['zh',1280],['vi',390]])test('native calibration browser handles plan, report and reset '+language+' '+width,async t=>{
 const f=await setup('1','1',{transfer:false});let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||chromium.executablePath()});
  const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'});
  page.setDefaultTimeout(10000);page.on('dialog',dialog=>dialog.accept());
  const origin=f.url.origin,base=origin+'/process/index.html?system=quality&';
  const main=base+'view=quality-inspections&rfModule=calibration',review=base+'view=approval&approvalTab=routine&rfModule=calibration';
  const equipment=base+'view=data&dataTab=quality-routine-equipment',eqPath='/api/routine-equipment/workflow';
  await page.context().route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.addInitScript(lang=>localStorage.setItem('processUILanguage',lang),language);
  const login=async()=>{
   await page.context().clearCookies();const result=await page.request.post(origin+'/api/platform-login',{headers:{origin},data:{id:'frank',password:f.password}});
   assert.equal(result.status(),200,await result.text());
  };
  const clickPost=async(locator,path,action)=>{
   const [r]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===path&&(!action||(r.request().postDataJSON().command?.action||r.request().postDataJSON().action)===action)),locator.click()]);
   const body=await r.json();assert.equal(r.status(),200,action+' '+JSON.stringify(body).slice(0,400));return body;
  };
  const endpoint='/api/piece-calibration';
  const act=(selector,action)=>clickPost(page.locator(selector),endpoint,action);
  const calApprove=async doc=>{
   await page.goto(review);await page.locator('[data-open="'+doc+'"]').click();
   await page.locator('[data-act="approve"]').click();await act('[data-confirm-approve]','approve');
   await page.waitForFunction(()=>!document.querySelector('[data-confirm-approve]'));
  };
  const master=()=>f.json('/api/routine-equipment?caseMetadata=1','frank');
  const selectSource=async()=>{await page.locator('#routine-search').fill('SYN-X-0');};
  async function changeAndApprove(notes,dates){
   await page.goto(equipment);await selectSource();
   if(await page.locator('#routine-begin').isVisible())await clickPost(page.locator('#routine-begin'),eqPath);
   await page.locator('[data-equipment-edit="source"]').click();
   const editor=page.locator('#routine-editor');
   for(const [field,val] of Object.entries(dates||{}))await editor.locator('[data-field="'+field+'"]').fill(val);
   if(!dates){
    assert(await editor.locator('[data-field="calibratedAt"]').isDisabled());
    assert.equal(await editor.locator('[data-field="calibratedAt"]').inputValue(),'2026-09-17');
   }
   await editor.locator('[data-field="notes"]').fill(notes);
   await page.locator('#routine-form-apply').click();
   await clickPost(page.locator('#routine-save'),eqPath,'save');
   await page.locator('#routine-submit').click();
   const dialog=page.locator('dialog.vd-confirm[open]');await dialog.locator('textarea').fill('Synthetic equipment review');
   await clickPost(dialog.locator('button[type=submit]'),eqPath,'submit');
   const pending=(await master()).control.workflow.pendingId;assert(pending);
   await page.goto(base+'view=approval&approvalTab=quality');
   const panel=page.locator('#review-equipment'),button=panel.locator('[data-routine-review="approve"][data-version="'+pending+'"]');
   await button.waitFor({state:'attached'});const summary=panel.locator('xpath=ancestor::details[not(@open)]/summary');
   if(await summary.count())await summary.first().click();
   await button.click();if(await dialog.locator('[type=checkbox]').count())await dialog.locator('[type=checkbox]').check();
   await clickPost(dialog.locator('button[type=submit]'),eqPath,'approve');
   assert.equal((await master()).control.activeVersionId,pending);
  }
  await login();await page.goto(equipment);await selectSource();
  await clickPost(page.locator('#routine-begin'),eqPath);
  await page.goto(main);
  const today=(await f.state()).today;
  const piece=page.locator('[data-id="source"]');
  await piece.check();await page.locator('[data-id="target"]').check();
  const created=await act('[data-create]','newPlan');
  await page.locator('[name=start]').fill('2026-09-01');await page.locator('[name=end]').fill(today);
  await act('[data-act=save]','save');await act('[data-act=submit]','submit');
  await calApprove(created.doc);
  const initial=(await f.state()).docs.find(d=>d.kind==='initial');assert.equal(initial.ids.length,2);
  await page.goto(main+'&calStage=initial');await page.locator('[data-open="'+initial.id+'"]').click();
  for(const id of initial.ids){
   const row=page.locator('fieldset[data-row="'+id+'"]');
   await row.locator('[name=day]').fill('2026-09-17');await row.locator('[name=outcome]').selectOption('pass');
   await row.locator('[type=file]').setInputFiles({name:'measurement.png',mimeType:'image/png',buffer:photoBytes});
  }
  await act('[data-act=save]','save');await act('[data-act=submit]','submit');
  await calApprove(initial.id);await login();
  await page.goto(equipment);await selectSource();await page.locator('[data-equipment-view="source"]').click();
  const detail=await page.locator('.routine-view-grid').innerText();assert(detail.includes('2026-09-17')&&detail.includes('2026-10-17'),detail);
  await page.locator('#routine-view-close').click();
  if(language==='zh')await changeAndApprove('Synthetic unrelated note');
  await page.goto(main);await page.locator('[data-piece-record="source"]').click();
  const history=page.locator('[data-piece-dialog]');assert(await history.locator('a[href*="/api/piece-calibration/photo"]').count()>0);
  const resetButton=history.locator('[data-reset-plan]');await resetButton.click();
  const box=page.locator('[data-reset-dialog]');await box.locator('[data-reset-confirm]').waitFor();
  assert.equal(await box.locator('h4 + ul li').count(),2);
  await act('[data-reset-confirm]','reset');
  assert.equal((await f.state()).docs.length,0);
  if(language==='zh')await changeAndApprove('Synthetic manual dates',{calibratedAt:'2026-10-01',expiresAt:'2027-10-01'});
  else{
    await page.goto(main);assert.match(await page.locator('[data-reset]').innerText(),/Đặt lại toàn bộ/);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('[data-id="source"]').check();await act('[data-create]','newPlan');
    await page.locator('[name=start]').waitFor();
    await act('[data-reset]','resetPreview');await box.locator('[data-reset-confirm]').waitFor();
    await act('[data-reset-confirm]','reset');assert.equal((await f.state()).docs.length,0);
  }
  t.diagnostic('Authorized platform login, shared plan and photo report, approval, master detail and shared reset via Chromium '+language+' '+width);
 }finally{await browser?.close();await f.close();}
});
