import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createProcessMasterFixture} from './process-master-cloud-fixture.mjs';
const expected=Number(process.env.EXPECTED_APPLY_WRITES||1),phase=process.env.MEASUREMENT_PHASE||'optimized';
const reports=[];
for(let round=1;round<=3;round++){
 const fixture=await createProcessMasterFixture();let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage(),origin=fixture.url.origin;
  await page.goto(origin+'/login?view=data&dataTab=process-master');await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await page.locator('#process-master-new-draft').click();await page.locator('#add-master-template').waitFor();
  let applies=0,saves=0;
  await page.route('**/api/master/workflow?**',async route=>{
   const request=route.request(),command=request.method()==='POST'?request.postDataJSON()?.command:null;
   if(command?.action==='apply'){applies++;const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,150));await route.fulfill({response});}
   else{if(command?.action==='save')saves++;await route.continue();}
  });
  const text='ABCDEFGHIJKLMNOPQRST',start=performance.now();
  await page.locator('[data-master-name]').first().evaluate((input,value)=>{for(let index=1;index<=value.length;index++){input.value=value.slice(0,index);input.dispatchEvent(new InputEvent('input',{bubbles:true}));}},text);
  assert.equal(applies,0,'typing must not Apply');assert.equal(saves,0);
  await page.locator('#save-master-data').click();
  assert.equal(applies,0,'Save must not Apply local names');assert.equal(saves,0,'local names must block Save');
  await page.locator('.process-name-apply-bar [data-name-action="apply"]').first().click();
  await page.waitForFunction(()=>document.querySelector('[data-master-name]')?.dataset.unapplied==='false');
  assert.equal(applies,expected);assert.equal(saves,0);
  await page.locator('#save-master-data').click();
  await page.waitForFunction(value=>Object.values(MasterDataWorkflow.shared.flow('PROCESS').saved?.content||{}).flat().some(row=>row.name===value),text);
  const ms=Math.round(performance.now()-start);
  const persisted=await page.request.get(origin+'/api/master/workflow?scope=PROCESS');assert.equal(persisted.status(),200);assert.ok(Object.values((await persisted.json()).control.workflow.saved.content).flat().some(row=>row.name===text));
  assert.equal(applies,expected);assert.equal(saves,1);
  reports.push({round,ms,applies,saves,status:'PASS'});
 }finally{await browser?.close();await fixture.close();}
}
const result={phase,programCommit:process.env.PROCESS_PROGRAM_COMMIT,conditions:'20 input events make zero writes; Save refuses local input; explicit Apply then Save; 150ms artificial Apply response delay; isolated fixture',reports};
fs.writeFileSync('.sites-runtime/name-burst-'+phase+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
