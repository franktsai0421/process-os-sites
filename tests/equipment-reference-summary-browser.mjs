// Run against the compiled local Worker, using only its ephemeral synthetic D1/R2 fixture.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createProcessMasterFixture} from './process-master-cloud-fixture.mjs';

const fixture=await createProcessMasterFixture();
let browser;
try {
 await fixture.mutateSyntheticValues(values=>{
  const master=JSON.parse(values.masterDataControl),catalog=master.active.PROCESS;
  for(const [stage,templates] of Object.entries(catalog)){
   const template=templates.find(row=>row.equipment);
   template.equipment=Array.from({length:91},(_,i)=>({...template.equipment[0],id:stage+'-synthetic-'+i,number:'Unit-'+i}));
  }
  for(const version of master.versions)if(version.scope==='PROCESS')version.snapshot=catalog;
  values.masterDataControl=JSON.stringify(master);values.processMasterData=JSON.stringify(catalog);
  const workspace={id:'synthetic-workspace',category:'CAT-A',line:'A',stages:{'A-CUT':
   ['01','02'].map(number=>({id:'step-'+number,number:'A-CUT-'+number,name:'Step '+number,
    stageCode:'A-CUT',productCodes:['One','Two'],machineIds:['A-CUT-synthetic-0']}))}};
  const content={workspaces:[workspace]};
  values.processAuthoringControl=JSON.stringify({workflow:{active:{id:'effective',content},working:content,
   saved:{id:'stored',content},cases:[{id:'review',status:'pending',content}]}});
 });
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--disable-background-networking','--disable-gpu']});
 const page=await browser.newPage({viewport:{width:1365,height:900},serviceWorkers:'block'});
 const origin=fixture.url.origin;
 const summaries=[],details=[];
 let failNext=false;
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin)return route.abort();
  if(url.pathname==='/api/master/references'){
   if(request.method()==='POST'){
    summaries.push(request.postDataJSON().ids);
    if(failNext){failNext=false;return route.fulfill({status:503,body:'{}'});}
   }else details.push(url.searchParams.get('id'));
  }
  return route.continue();
 });
 await page.goto(origin+'/login?view=data&dataTab=process-master');
 await page.locator('#id').fill(fixture.users[0].id);
 await page.locator('#password').fill(fixture.password);
 await page.locator('.site-entry-submit').click();
 const panel=page.locator('#equipment-panel'),cell=panel.locator('[data-usage-id="A-CUT-synthetic-0"]');
 await page.locator('[data-equipment-open]').first().click();
 await cell.getByRole('button',{name:/A-CUT-01/}).waitFor();
 assert.equal(await panel.locator('[data-usage-id]').count(),182);
 assert.deepEqual(summaries.map(ids=>new Set(ids).size),[182]);
 assert.equal(details.length,0);
 const originalLabel=await cell.textContent();
 await page.locator('.top-language-switch').click();
 await page.waitForFunction(previous=>document.querySelector('[data-usage-id="A-CUT-synthetic-0"]').textContent!==previous,originalLabel);
 const labels=[originalLabel,await cell.textContent()];
 assert.ok(labels.some(label=>label.includes('另 1 筆'))&&labels.some(label=>label.includes('Thêm 1')));
 assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 assert.match(await panel.locator('[data-usage-id="C-CUT-synthetic-0"]').textContent(),/^(無|Không)$/);
 await cell.getByRole('button').click();
 const dialog=page.locator('#equipment-editor-dialog[open]'),usage=dialog.locator('.equipment-approved-usage li');
 await usage.first().waitFor();
 assert.equal(await usage.count(),6);
 assert.equal((await usage.allTextContents()).filter(label=>/Bản nháp|草稿/.test(label)).length,2);
 assert.deepEqual(details,['A-CUT-synthetic-0']);
 await dialog.locator('[data-equipment-close]').first().click();
 await page.setViewportSize({width:390,height:844});
 failNext=true;
 await page.reload();
 await cell.locator('[data-summary-retry]').waitFor();
 assert.match(await cell.textContent(),/查詢失敗|Lỗi truy vấn/);
 await cell.scrollIntoViewIfNeeded();
 const scroll=await page.evaluate(()=>scrollY);
 await cell.locator('[data-summary-retry]').click();
 await cell.getByRole('button',{name:/A-CUT-01/}).waitFor();
 assert.equal(await page.evaluate(()=>scrollY),scroll);
 assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 assert.deepEqual(summaries.map(ids=>ids.length),[182,182,182]);
 const reader=await browser.newPage();
 await reader.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await reader.goto(origin+'/login?view=data&dataTab=process-master');
 await reader.locator('#id').fill(fixture.users.find(u=>u.id==='reader').id);
 await reader.locator('#password').fill(fixture.password);
 await reader.locator('.site-entry-submit').click();
 const denied=reader.locator('[data-usage-id="A-CUT-synthetic-0"]');
 await denied.getByRole('button',{name:/重試|Thử lại/}).waitFor();
 assert.match(await denied.textContent(),/無查看權限|Không có quyền xem/);
 const privateResponse=await reader.request.post(origin+'/api/master/references?scope=PROCESS&kind=equipment',{data:{ids:['A-CUT-synthetic-0']}});
 assert.equal(privateResponse.status(),403);assert.deepEqual(await privateResponse.json(),{error:'FORBIDDEN'});
 await reader.close();
 console.log('PASS 182 IDs in one opening request; two effective blocks, two current draft blocks, two pending blocks; mobile 503 retry preserves scroll.');
} finally {await browser?.close();await fixture.close();}
