/* oxlint-disable typescript/no-require-imports -- deterministic browser races against the real UI module. */
const {chromium}=require('playwright'),{expect}=require('playwright/test'),assert=require('node:assert/strict'),path=require('node:path');
const source=path.resolve('public/process/process-ipqc.js');
const row=name=>({source:'C',scope:'C',itemId:'race-item',line:'C',category:'test',stage:'C-TEST',number:'01',name,status:'working',versionNumber:2,saved:true});
const result=(name,revision=1)=>({revision,references:[row(name)],canReadHistory:true});
const choices=name=>({source:'C',choices:[{source:'C',scope:'C',itemId:'race-item',sourceVersionId:name,productCodes:['test-product'],errorId:'error',errorCode:'E1',errorName:name,code:'I1',standard:name,description:'Isolated race fixture',photos:[],rules:[]}]});
(async()=>{const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true}),page=await browser.newPage(),steps=[];
 async function setup(){await page.goto('about:blank');await page.setContent('<div id="refs"></div><form id="form"><div class="inspector-form"><input id="operation-name"><div class="inspector-actions"><button id="apply-operation" type="button">Apply</button></div></div></form>');
  await page.evaluate(()=>{window.escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');window.ProcessSync={identity:{id:'A'},platformHeaders:()=>({})};window.state={editorLine:'C',category:'test'};window.op={id:'op',stageCode:'C-TEST',productCodes:['test-product'],name:'fixture'};window.ensureCategoryEditor=()=>({'C-TEST':[window.op]});window.requests=[];window.fetch=url=>new Promise((resolve,reject)=>window.requests.push({url:typeof url==='string'?url:url instanceof URL?url.href:url.url,resolve,reject}));});
  await page.addScriptTag({path:source});await page.evaluate(()=>{document.querySelector('#refs').innerHTML=window.ProcessIPQC.referenceMarkup('C','C','race-item');window.ProcessIPQC.mountInspector(document.querySelector('#form'),window.op);});
 }
 async function mount(){await page.evaluate(()=>{void window.ProcessIPQC.mountReferences();});}
 async function reply(index,body,fail=false){await page.evaluate(async({index,body,fail})=>{const r=window.requests[index];if(fail)r.reject(Error('old failed'));else r.resolve({ok:true,json:async()=>body});await new Promise(resolve=>setTimeout(resolve,0));},{index,body,fail});}
 async function identity(id){await page.evaluate(id=>{window.ProcessSync.identity=id?{id}:null;},id);}
 const reference=()=>page.locator('#refs');
 try{
  for(const fail of [false,true]){
   await setup();await mount();await identity('B');await page.locator('#refs').evaluate(n=>{n.querySelector('[role="status"]').textContent='B untouched';});await reply(0,result('A PRIVATE'),fail);await expect(reference()).toContainText('B untouched');await expect(reference()).not.toContainText('A PRIVATE');
   await mount();await reply(1,result('B current'));await expect(reference()).toContainText('B current');
   await identity('A');await mount();await identity('B');await mount();await reply(3,result('B newer'));await reply(2,result('A PRIVATE late'),fail);await expect(reference()).toContainText('B newer');await expect(reference()).not.toContainText('A PRIVATE');
  }steps.push('Old reference success AND failure ignored after identity change, before any new mount and after a newer account response');
  await setup();await mount();await identity(null);await identity('A');await reply(0,result('old A session'));await expect(reference()).not.toContainText('old A session');steps.push('Logout/login to same ID invalidates the old identity object');
  await setup();await mount();await reply(0,result('current'));await mount();assert.match(await page.evaluate(()=>window.requests[1].url),/revision=1/);await reply(1,{revision:1,unchanged:true,canReadHistory:true});await expect(reference()).toContainText('current');
  await page.locator('[data-ipqc-history-more]').click();assert.match(await page.evaluate(()=>window.requests[2].url),/mode=history/);await reply(2,{revision:1,references:[{...row('history page 1'),status:'superseded'}],nextOffset:10});await page.locator('[data-ipqc-history-more]').click();assert.match(await page.evaluate(()=>window.requests[3].url),/offset=10/);await reply(3,{revision:1,references:[{...row('history page 2'),status:'superseded'}],nextOffset:null});await expect(reference()).toContainText('history page 1');await expect(reference()).toContainText('history page 2');await expect(page.locator('[data-ipqc-history-more]')).toBeHidden();
  steps.push('Revision requests preserve current rendering; history only loads on click and paginates explicitly');
  for(const fail of [false,true]){
   await setup();await mount();await reply(0,result('current'));await page.locator('[data-ipqc-history-more]').click();await mount();await reply(2,result('new revision',2));await reply(1,{revision:1,references:[row('stale history')],nextOffset:null},fail);await expect(reference()).toContainText('new revision');await expect(reference()).not.toContainText('stale history');await expect(page.locator('[data-ipqc-history-more]')).toContainText('查看歷史');
  }steps.push('Old history success AND failure ignored after revision changed');
  for(const fail of [false,true]){
   await setup();await mount();await reply(0,result('A current'));await page.locator('[data-ipqc-history-more]').click();await identity('B');await mount();await reply(2,result('B current'));await reply(1,{revision:1,references:[row('A private history')],nextOffset:null},fail);await expect(reference()).toContainText('B current');await expect(reference()).not.toContainText('A private history');await expect(page.locator('[data-ipqc-history-more]')).toContainText('查看歷史');
  }steps.push('Old history success AND failure ignored after account switch');
  for(const fail of [false,true]){
   await setup();await page.getByRole('tab',{name:'IPQC',exact:true}).click();await page.getByRole('tab').first().click();await page.getByRole('tab',{name:'IPQC',exact:true}).click();await reply(1,choices('new source'));await reply(0,choices('old source'),fail);await expect(page.locator('.process-ipqc-panel')).toContainText('new source');await expect(page.locator('.process-ipqc-panel')).not.toContainText('old source');
   await page.locator('[data-ipqc-reload]').click();await identity('B');await page.locator('.process-ipqc-panel').evaluate(n=>{n.textContent='B current source screen';});await reply(2,choices('A private source'),fail);await expect(page.locator('.process-ipqc-panel')).not.toContainText('A private source');await expect(page.locator('.process-ipqc-panel')).toContainText('B current source screen');
  }steps.push('Old choice success AND failure ignored after same-panel reload and identity change');
  await setup();await page.getByRole('tab',{name:'IPQC',exact:true}).click();await page.evaluate(()=>window.op.productCodes=['changed']);await reply(0,choices('old products'));await expect(page.locator('.process-ipqc-panel')).not.toContainText('old products');steps.push('Changed source context invalidates pending choices without needing a remount');
  console.log(JSON.stringify({result:'PASS_IPQC_BROWSER_RACES',fixture:'Synthetic delayed transport; actual process-ipqc.js DOM/events',steps},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
