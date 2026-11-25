// Real process UI and HTTP routes, with synthetic nonpersistent D1/R2 and no external requests.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createProcessMasterFixture} from './process-master-cloud-fixture.mjs';

const fixture=await createProcessMasterFixture();
const old=['M-A-001','M-A-003','M-A-006'], valid=['A-CUT-EQ-0','A-CUT-EQ-1'];
const code='A-CUT-03', label='QA historical equipment block';
let browser;
try {
 await fixture.adoptAuthoring();
 await fixture.mutateSyntheticValues(values=>{
  const authority=JSON.parse(values.processAuthoringControl);
  const content=authority.workflow.active.content, op=content.workspaces[0].stages['A-CUT'][0];
  Object.assign(op,{name:label,number:code,editorType:'machine',mode:'machine',machineIds:[...old,...valid],
   machineDetails:[{id:'QA-retired-id',no:old[1],name:'QA original snapshot'}]});
  authority.workflow.working=structuredClone(content);
  authority.versions[0].snapshot=content;values.processAuthoringControl=JSON.stringify(authority);
  const master=JSON.parse(values.masterDataControl);
  for(const catalog of [master.active.PROCESS,...master.versions.filter(v=>v.scope==='PROCESS').map(v=>v.snapshot)]){
   catalog['C-CUT'].find(t=>t.equipment).equipment[2].number=old[2];
   const ordinary=catalog['A-CUT'].find(t=>t.id==='A-CUT-CUSTOM-0');
   ordinary.mode='machine';ordinary.machineIds=['EQ-0',...old,'C-CUT-EQ-2'];
  }
  values.masterDataControl=JSON.stringify(master);values.processMasterData=JSON.stringify(master.active.PROCESS);
 });
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--disable-gpu']});
 const origin=fixture.url.origin;
 async function login(actor){
  const ctx=await browser.newContext({serviceWorkers:'block'});
  await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await ctx.newPage();page.setDefaultTimeout(12000);
  await page.goto(origin+'/login?view='+(actor==='reader'?'data&dataTab=process-master':'productStatus'));
  await page.locator('#id').fill(actor);await page.locator('#password').fill(fixture.password);
  await page.locator('.site-entry-submit').click();return page;
 }
 const p=await login(fixture.users[0].id),block=p.locator('.status-product-node').filter({hasText:label});
 await block.waitFor();
 const cards=block.locator('.node-machine-grid article');
 assert.deepEqual(await cards.locator('code').allTextContents(),[...old,'EQ-0','EQ-1']);
 assert.deepEqual(await cards.filter({has:p.locator('[data-unresolved-machine]')}).locator('code').allTextContents(),old);
 assert.ok((await cards.nth(1).innerText()).includes('QA original snapshot'));
 await p.goto(origin+'/process/?view=data&dataTab=process-master');await p.locator('[data-equipment-open]').first().click();
 const notice=p.locator('[data-missing-equipment]');await notice.locator('summary').click();
 assert.deepEqual(await notice.locator('li').allTextContents(),old.map(raw=>['A','CAT-A','A-CUT',code,raw].join(' · ')));
 for(const id of valid){
  await p.locator('[data-usage-id="'+id+'"]').getByRole('button',{name:new RegExp(code)}).click();
  const refs=p.locator('.equipment-approved-usage li');await refs.first().waitFor();
  assert.equal(await refs.filter({hasText:code}).filter({hasText:/生效版本|Bản có hiệu lực/}).count(),1);
  await p.locator('#equipment-editor-dialog [data-equipment-close]').first().click();
 }
 assert.match(await p.locator('[data-usage-id="C-CUT-EQ-2"]').innerText(),/^(無|Không)$/);
 const reader=await login('reader');
 await reader.locator('[data-master-name]').first().waitFor();
 for(const r of [await reader.request.post(origin+'/api/master/references?scope=PROCESS&kind=equipment',{data:{ids:valid}}),
  await reader.request.get(origin+'/api/master/references?scope=PROCESS&kind=equipment&view=detail&id='+valid[0])]){
  assert.equal(r.status(),403);assert.deepEqual(await r.json(),{error:'FORBIDDEN'});
 }
 await reader.context().close();

 await p.goto(origin+'/process/?view=editor&category=CAT-A&line=A');await p.locator('[data-av3=begin]:visible').click();
 await p.locator('[data-pe=add]:visible:enabled').first().waitFor();
 await p.locator('.pe-card').filter({hasText:label}).locator('[data-pe=edit]').click();await p.locator('[data-tab=machines]').click();
 assert.deepEqual((await p.locator('[data-machine]:checked').evaluateAll(es=>es.map(e=>e.dataset.machine))).sort(),[...old,...valid].sort());
 assert.equal(await p.locator('.pe-machine-row [data-unresolved-machine]').count(),3);
 for(const raw of old){
  const checkbox=p.locator('[data-machine="'+raw+'"]');await checkbox.click();assert.equal(await checkbox.count(),0);
 }
 const control=p.locator('[data-machine="'+valid[0]+'"]');await control.uncheck();await control.check();assert(await control.isChecked());

 // Mount the ordinary machine-mode inspector in the compiled client and use its own controls.
 const legacy=await p.context().newPage();await legacy.goto(origin+'/process/?view=editor&category=CAT-A&line=A');
 await legacy.locator('.pe-card').first().waitFor();
 const defaults=await legacy.evaluate(()=>{
  const stage='A-CUT',template=processMaster[stage].find(t=>t.id==='A-CUT-CUSTOM-0'),op=newOperation(stage,50,template);
  const defaults=op.machineIds.slice();op.machineIds=['M-A-003','A-CUT-EQ-1'];op.machineId=op.machineIds[0];
  op.machineDetails=[{id:'QA-retired',no:'M-A-003',name:'Retained snapshot'}];
  const panel=document.createElement('dialog');panel.id='inspector-form';document.body.append(panel);panel.showModal();
  renderInspector(op);return defaults;
 });
 assert.deepEqual(defaults,[valid[0]]);
 const checked=()=>legacy.locator('[data-operation-machine]:checked').evaluateAll(es=>es.map(e=>e.dataset.operationMachine).sort());
 await legacy.locator('#select-all-machines').click();assert.deepEqual(await checked(),[...valid,old[1]].sort());
 await legacy.locator('[data-operation-machine="'+old[1]+'"]').click();
 await legacy.locator('#select-all-machines').click();assert.deepEqual(await checked(),valid);
 await legacy.locator('#operation-template').selectOption('A-CUT-manual');
 await legacy.locator('#operation-template').selectOption('A-CUT-CUSTOM-0');assert.deepEqual(await checked(),valid);
 await legacy.locator('#clear-machines').click();await legacy.locator('#select-all-machines').click();assert.deepEqual(await checked(),[valid[0]]);
 console.log('PASS approved block, reverse catalog, authorized and restricted reads, canvas and ordinary inspector selection, select all and template changes');
} finally {await browser?.close();await fixture.close();}
