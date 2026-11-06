// Real account renderer and handlers; ephemeral synthetic SQLite/R2 only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {accessKeys, catalog} from '../public/process/access-policy.mjs';

const evidence=process.env.USER_PERMISSIONS_EVIDENCE;
assert(evidence&&path.isAbsolute(evidence),'absolute evidence directory required');
fs.mkdirSync(evidence,{recursive:true});
const baselineCommit='2882f35de8e68370304a2d2235c039e226a2e4e5';
const baselineJS=execFileSync('git',['show',baselineCommit+':public/process/user-access.js']);
const baselineCSS=execFileSync('git',['show',baselineCommit+':public/process/user-access.css']);
const port=Number(process.env.USER_ACCESS_FIXTURE_PORT||3059),base='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['scripts/test-user-access.mjs','--serve'],{env:{...process.env,USER_ACCESS_FIXTURE_PORT:String(port)},stdio:['ignore','pipe','pipe']});
const report={baselineCommit,scope:'production renderer/events and actual handlers; synthetic fixtures, simulated viewports, no real accounts',cases:[],errors:[]};
let browser,page,stage='fixture';
const dialog=()=>page.locator('.ua-dialog[open]');
async function open(actor='frank',lang='zh'){
  await page.goto(base+'/fixture?actor='+actor+'&lang='+lang);
  await page.locator('.ua-page h2').waitFor();
  await page.waitForFunction(()=>window.ProcessUserAccess&&document.querySelector('[data-ua-view],.ua-own'));
}
async function read(){return page.evaluate(async()=>{const r=await fetch('/api/user-access');assertStatus(r);return r.json();function assertStatus(r){if(!r.ok)throw Error('GET '+r.status);}});}
async function close(){await dialog().locator('[data-ua-close]').first().click();await dialog().waitFor({state:'detached'});}
async function save(){await dialog().locator('[type=submit]').click();await dialog().waitFor({state:'detached'});}
async function check(name,fn){stage=name;await fn();report.cases.push({name,status:'PASS'});}
async function noOverflow(root){
  const bad=await root.evaluate(e=>[e,...e.querySelectorAll('.ua-simple-wrap,.ua-simple tr,.ua-extra-panel,.ua-role-list button')].filter(x=>{
    const r=x.getBoundingClientRect(),s=getComputedStyle(x);return r.width>0&&s.display!=='contents'&&x.scrollWidth>x.clientWidth+2;
  }).map(x=>({tag:x.tagName,class:x.className,width:x.clientWidth,scroll:x.scrollWidth})));
  assert.deepEqual(bad,[]);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
}
async function controls(){
  return dialog().locator('[data-ua-cell]').evaluateAll(nodes=>nodes.map(e=>({key:e.dataset.uaCell,checked:e.checked,disabled:e.disabled})).sort((a,b)=>a.key.localeCompare(b.key)));
}
async function capturePayload(individual){
  if(individual)await page.locator('[data-ua-view="staff-one"]').click();
  else{await page.locator('[data-ua-page="roles"]').click();await page.locator('[data-ua-role="staff"]').click();await page.locator('[data-ua-edit-role="staff"]').click();}
  const cells=await controls();
  await dialog().locator('[data-ua-details="bom"] summary').click();
  const cell=dialog().locator('[data-ua-cell="bom.exchange"]');await cell.setChecked(!await cell.isChecked());
  if(individual)await dialog().locator('[data-ua-reset="bom.exchange"]').click();
  let body;
  await page.route('**/api/user-access',async route=>{
    if(route.request().method()==='POST'){body=route.request().postData();await route.fulfill({status:400,contentType:'application/json',body:'{"error":"FORBIDDEN"}'});}
    else await route.continue();
  });
  await dialog().locator('[type=submit]').click();await dialog().locator('.ua-error').waitFor();
  assert(body);await close();await page.unroute('**/api/user-access');return{body,cells};
}
try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('FIXTURE_START_TIMEOUT')),60000);let output='';child.stdout.on('data',bytes=>{output+=bytes;if(output.includes('owned loopback port '+port)){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(Error('FIXTURE_EXIT_'+code));});child.stderr.on('data',()=>{});});
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
  page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());
  // Reuse each signed fixture shell; repeated viewport checks are not login load tests.
  const shells=new Map();
  await page.route('**/fixture?*',async route=>{const key=route.request().url();if(!shells.has(key)){const response=await route.fetch();shells.set(key,{status:response.status(),headers:response.headers(),body:await response.body()});}await route.fulfill(shells.get(key));});
  for(const individual of [false,true])await check('byte-identical '+(individual?'individual reset':'role update')+' payload and unchanged cell values/disabled states',async()=>{
    await page.route('**/process/user-access.js',r=>r.fulfill({contentType:'text/javascript',body:baselineJS}));
    await open();const before=await capturePayload(individual);await page.unroute('**/process/user-access.js');
    await open();const after=await capturePayload(individual);assert.deepEqual(after,before);assert.equal(after.cells.length,accessKeys.length);
  });
  for(const lang of ['zh','vi'])for(const width of [1440,1024,768,390,320])await check(lang+' '+width+' responsive matrix, long labels, disclosure and keyboard',async()=>{
    await page.setViewportSize({width,height:1000});await open('frank',lang);
    // Long synthetic labels retain all production keys and operations.
    await page.evaluate(()=>{const r=window.ProcessAccessPolicy.catalog.find(r=>r.id==='iqc');r.zh='IQC 長模組名稱測試'.repeat(5);r.vi='IQC Tên mô-đun dài Nguyễn '.repeat(5);});
    await page.locator('[data-ua-page="roles"]').click();
    assert.equal(await page.locator('[data-ua-details="dashboard"]').count(),0);
    assert.equal(await page.locator('[data-ua-cell]:enabled').count(),0);await noOverflow(page.locator('.ua-role-workspace'));
    await page.screenshot({path:path.join(evidence,'after-preview-'+lang+'-'+width+'.png')});
    await page.locator('[data-ua-edit-role]').click();
    const row=dialog().locator('[data-ua-matrix-row="iqc"]'),summary=row.locator('summary');
    await summary.focus();await page.keyboard.press('Enter');assert(await row.locator('details').evaluate(e=>e.open));
    const panel=await row.locator('.ua-extra-panel').boundingBox(),matrix=await dialog().locator('.ua-simple-wrap').boundingBox();
    assert(panel.width>matrix.width*.85);assert(panel.x>=matrix.x-1&&panel.x+panel.width<=matrix.x+matrix.width+1);
    if(width>=1024){const headers=await dialog().locator('.ua-simple thead th').all(),cells=await row.locator(':scope>th,:scope>td[data-label]').all();for(let i=0;i<cells.length;i++){const a=await headers[i].boundingBox(),b=await cells[i].boundingBox();assert(Math.abs(a.x-b.x)<1);assert(Math.abs(a.width-b.width)<1);}}
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.dataset.uaCell),'iqc.create');
    const toggle=dialog().locator('[data-ua-cell="iqc.create"]');await toggle.evaluate(e=>e.fixtureNode=true);await page.keyboard.press('Space');assert(await toggle.evaluate(e=>e.fixtureNode&&document.activeElement===e));
    await noOverflow(dialog());
    await summary.focus();await page.keyboard.press('Space');assert.equal(await row.locator('details').evaluate(e=>e.open),false);
    await summary.press('Enter');await dialog().locator('[data-ua-role-search]').fill('iqc');assert(await dialog().locator('[data-ua-details="iqc"]').evaluate(e=>e.open));
    assert(await dialog().locator('[data-ua-role-search]').evaluate(e=>document.activeElement===e));
    await page.screenshot({path:path.join(evidence,'after-dialog-'+lang+'-'+width+'.png')});
    const snapshot=await read();await dialog().locator('footer [data-ua-close]').click();await dialog().waitFor({state:'detached'});assert.deepEqual(await read(),snapshot);
    await page.locator('[data-ua-edit-role]').click();assert.equal(await dialog().locator('[data-ua-cell="iqc.create"]').isChecked(),snapshot.roles.find(r=>r.id==='staff').access?.['iqc.create']??true);
    await close();assert(await page.locator('[data-ua-edit-role]').evaluate(e=>e===document.activeElement));
  });
  await check('no empty disclosures; row select remains usable; synthetic role Save/readback/reopen and protected roles',async()=>{
    await page.setViewportSize({width:1440,height:1000});await open();await page.locator('[data-ua-page="roles"]').click();
    for(const id of ['admin','rd','staff']){await page.locator('[data-ua-role="'+id+'"]').click();assert(await page.locator('[data-ua-delete-role="'+id+'"]').isDisabled());}
    await page.locator('#ua-new-role').click();const name='Nguyễn角色名稱'.repeat(4).slice(0,40);await dialog().locator('[name=name]').fill(name);
    assert.equal(await dialog().locator('[data-ua-details="dashboard"]').count(),0);
    await dialog().locator('[data-ua-all="dashboard"]').check();await dialog().locator('[data-ua-cell="bom.view"]').check();await save();
    const role=(await read()).roles.find(r=>r.name===name);assert(role.access['dashboard.view']);assert(role.access['bom.view']);
    await page.locator('[data-ua-edit-role="'+role.id+'"]').click();assert(await dialog().locator('[data-ua-cell="bom.view"]').isChecked());await close();
    await page.setViewportSize({width:320,height:1000});await noOverflow(page.locator('.ua-role-workspace'));await page.screenshot({path:path.join(evidence,'after-long-role-320.png')});
  });
  await check('ordinary manager/regular staff read-only and disabled protection in both languages',async()=>{
    for(const lang of ['zh','vi']){await open('manager',lang);await page.locator('[data-ua-page="roles"]').click();assert.equal(await page.locator('#ua-new-role').count(),0);await page.locator('[data-ua-edit-role]').click();assert.equal(await dialog().locator('[data-ua-cell]:enabled').count(),0);assert(await dialog().locator('[type=submit]').isHidden());await noOverflow(dialog());await close();
      await open('staff-one',lang);assert.equal(await page.locator('[data-ua-page="roles"]').count(),0);await page.locator('[data-ua-account-info]').click();await dialog().locator('[data-ua-cell]').first().waitFor();assert.equal(await dialog().locator('[data-ua-cell]').count(),accessKeys.length);assert.equal(await dialog().locator('[data-ua-cell]:enabled').count(),0);await noOverflow(dialog());await close();}
  });
  // Baseline screenshots use the exact retained product renderer/styles.
  await check('before screenshots on the same isolated fixture',async()=>{
    await page.route('**/process/user-access.js',r=>r.fulfill({contentType:'text/javascript',body:baselineJS}));
    await page.route('**/process/user-access.css',r=>r.fulfill({contentType:'text/css',body:baselineCSS}));
    for(const lang of ['zh','vi'])for(const width of [1440,1024,390]){await page.setViewportSize({width,height:1000});await open('frank',lang);await page.locator('[data-ua-page="roles"]').click();await page.screenshot({path:path.join(evidence,'before-preview-'+lang+'-'+width+'.png')});await page.locator('[data-ua-edit-role]').click();await dialog().locator('[data-ua-details="iqc"] summary').click();await page.screenshot({path:path.join(evidence,'before-dialog-'+lang+'-'+width+'.png')});}
  });
  assert.deepEqual(report.errors,[]);report.catalogRows=catalog.length;report.cells=accessKeys.length;report.status='PASS';
}catch(error){report.status='FAIL';report.failure={stage,message:error.message,stack:error.stack};process.exitCode=1;if(page)await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});}
finally{await browser?.close();child.kill('SIGTERM');fs.writeFileSync(path.join(evidence,'role-layout.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
