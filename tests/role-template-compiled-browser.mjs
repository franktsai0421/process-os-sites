// Full compiled product, real navigation/styles/events, synthetic memory-only D1/R2.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {createRootEntryFixture} from './root-entry-native-fixture.mjs';

const evidence=process.env.USER_PERMISSIONS_EVIDENCE;
assert(evidence&&path.isAbsolute(evidence),'absolute evidence directory required');
fs.mkdirSync(evidence,{recursive:true});
const report={status:'RUNNING',scope:'compiled full product, synthetic accounts and nonpersistent D1/R2; viewport simulation, not physical devices',cases:[],errors:[],confirmations:[]};
let fixture,browser,page,stage='fixture';
const confirmationAnswers=[];
const dialog=()=>page.locator('.ua-dialog[open]');

async function visiblePoint(locator){
  await locator.scrollIntoViewIfNeeded();
  // Language repaint and responsive sidebar transitions can move a connected
  // element after scrolling. Require stable geometry before the same hit test.
  await locator.evaluate(element=>new Promise((resolve,reject)=>{
    let previous='',stable=0,frames=0;
    function frame(){
      if(!element.isConnected)return reject(Error('visible target detached during layout'));
      const r=element.getBoundingClientRect(),next=[r.x,r.y,r.width,r.height,scrollX,scrollY].join('|');
      stable=next===previous?stable+1:0;previous=next;
      if(stable>=3)return resolve();
      if(++frames>=120)return reject(Error('visible target geometry did not stabilize'));
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
  const geometry=await locator.evaluate(element=>{
    const r=element.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    const hit=document.elementFromPoint(x,y);
    return {visible:r.width>0&&r.height>0&&x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&!!hit&&(hit===element||element.contains(hit)),rect:r.toJSON(),point:{x,y},hit:hit?.outerHTML.slice(0,240),topbar:document.querySelector('.topbar')?.getBoundingClientRect().toJSON(),sidebar:document.querySelector('.sidebar')?.getBoundingClientRect().toJSON(),scrollY,viewport:{width:innerWidth,height:innerHeight}};
  });
  assert(geometry.visible,'matrix/control must be inside viewport and unobscured: '+JSON.stringify(geometry));
}

async function closeSidebarThroughUI(width){
  if(width>720)return;
  const toggle=page.locator('#menu-toggle');
  await toggle.scrollIntoViewIfNeeded();
  // Do not open a closed menu just to capture a role preview. If it was left
  // open, reach its existing toggle by keyboard rather than clicking through it.
  if(await page.locator('.sidebar').evaluate(e=>e.classList.contains('open'))){
    for(let step=0;step<80&&!await toggle.evaluate(e=>e===document.activeElement);step++)await page.keyboard.press('Tab');
    assert(await toggle.evaluate(e=>e===document.activeElement),'existing menu toggle is keyboard reachable');
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(()=>{
    const e=document.querySelector('.sidebar');
    return e&&!e.classList.contains('open')&&e.getBoundingClientRect().right<=1;
  });
}

async function noOverflow(locator){
  const overflow=await locator.evaluate(root=>[root,...root.querySelectorAll('.ua-simple-wrap,.ua-simple tr,.ua-extra-panel,.ua-role-list button')].filter(e=>{
    const r=e.getBoundingClientRect();
    return r.width>0&&getComputedStyle(e).display!=='contents'&&e.scrollWidth>e.clientWidth+2;
  }).map(e=>({tag:e.tagName,class:e.className,client:e.clientWidth,scroll:e.scrollWidth})));
  assert.deepEqual(overflow,[]);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const escaped=await locator.evaluate(root=>[...root.querySelectorAll('.ua-simple-wrap')].flatMap(wrap=>{
    const boundary=wrap.getBoundingClientRect();
    return [...wrap.querySelectorAll('tr>th,tr>td')].filter(cell=>{
      const r=cell.getBoundingClientRect();
      return r.width>0&&(r.left<boundary.left-1||r.right>boundary.right+1);
    }).map(cell=>({row:cell.parentElement.dataset.uaMatrixRow,text:cell.textContent.slice(0,80)}));
  }));
  assert.deepEqual(escaped,[],'every visible matrix cell stays within its actual container');
}

async function focusTrap(){
  // Include product extensions such as the feedback launcher inside the dialog.
  const candidates=dialog().locator('button,input:not([type=hidden]),select,textarea,a[href],summary,[tabindex]');
  const indices=await candidates.evaluateAll(nodes=>nodes.map((element,index)=>({element,index})).filter(({element})=>element.tabIndex>=0&&!element.matches(':disabled')&&element.checkVisibility()&&element.getClientRects().length>0).map(({index})=>index));
  assert(indices.length>2);
  const first=candidates.nth(indices[0]);
  for(const key of ['Tab','Shift+Tab']){
    await first.focus();const visited=new Set();let completed=false,browserUIStops=0;
    for(let step=0;step<indices.length+3;step++){
      await page.keyboard.press(key);
      const focus=await dialog().evaluate(root=>({inside:root.contains(document.activeElement),hasFocus:document.hasFocus(),tag:document.activeElement?.tagName,id:document.activeElement?.id,modal:root.matches(':modal'),index:[...root.querySelectorAll('button,input:not([type=hidden]),select,textarea,a[href],summary,[tabindex]')].indexOf(document.activeElement)}));
      assert(focus.modal,'native modal remains open during keyboard navigation');
      // Chromium can briefly focus its own toolbar at a native dialog boundary.
      // Accept only that unfocused-document BODY state; background controls fail.
      const browserUI=focus.tag==='BODY'&&!focus.hasFocus;
      assert(focus.inside||browserUI,key+' never focuses a background product control: '+JSON.stringify(focus));
      if(browserUI)browserUIStops++;
      visited.add(focus.index);
      if(focus.index===indices[0]){completed=true;break;}
    }
    assert(completed,key+' completes a bounded focus cycle');
    assert(visited.has(indices.at(-1)),key+' reaches the last product control');
    assert(indices.every(index=>visited.has(index)),key+' visits every visible enabled control');
    (report.keyboardCycles??=[]).push({stage,key,controls:indices.length,browserUIStops,status:'PASS'});
  }
}

try{
  fixture=await createRootEntryFixture({syntheticBindings:{PROCESS_IMPORT_ENABLED:'0',PROCESS_SESSION_SECRET:randomUUID()}});
  report.programCommit=fixture.programCommit;report.buildEntrySha256=fixture.buildEntrySha256;
  const password=randomUUID(),roleName='Nguyễn角色名稱'.repeat(4).slice(0,40);
  await fixture.db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').bind(JSON.stringify({
    platformUsers:JSON.stringify([{id:'frank',name:'Synthetic admin',role:'admin',enabled:true,password,inheritRole:true}]),
    processCustomRoles:JSON.stringify([{id:'custom_layout',name:roleName,description:'Synthetic only',lines:[],views:[],permissions:[],access:{'iqc.view':true}}]),
    processRoleTemplateOverrides:'{}',
  }),'synthetic-role-layout').run();
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
  page=await browser.newPage({viewport:{width:1440,height:1000}});
  // The browser never reaches a hosted Site or third-party assets.
  await page.route('**/*',route=>new URL(route.request().url()).origin===fixture.url.origin?route.continue():route.abort());
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('dialog',async event=>{
    const answer=confirmationAnswers.shift();
    report.confirmations.push({type:event.type(),answer:answer??'unexpected'});
    if(answer===true)await event.accept();else await event.dismiss();
  });
  await page.addInitScript(()=>localStorage.setItem('processUILanguage','zh'));
  stage='normal login';
  await page.goto(fixture.url.origin+'/login?system=process&view=data&dataTab=users');
  await page.locator('[name=id]').fill('frank');await page.locator('[name=password]').fill(password);
  await page.locator('[name=destination][value=platform]').click();
  await page.locator('[data-ua-page=roles]').waitFor({timeout:60000});
  await page.waitForFunction(()=>document.documentElement.dataset.processNavigationStatus==='ready');
  await page.locator('[data-ua-page=roles]').click();
  await page.locator('[data-ua-role=custom_layout]').click();
  const baseline=await fixture.db.prepare('SELECT revision,"values" FROM shared_state').first();

  for(const lang of ['zh','vi'])for(const [width,height] of [[1440,1000],[1165,742],[1024,768],[768,1024],[390,844],[320,740]]){
    stage=lang+' '+width;
    await page.setViewportSize({width,height});
    if(await page.evaluate(()=>localStorage.getItem('processUILanguage'))!==lang)await page.locator('.top-actions .language-switch').click();
    await page.waitForFunction(lang=>document.documentElement.lang===(lang==='zh'?'zh-Hant':'vi')&&document.body.classList.contains('lang-vi')===(lang==='vi'),lang);
    await closeSidebarThroughUI(width);
    await page.locator('[data-ua-page=roles]').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(evidence,'workspace-'+lang+'-'+width+'.png')});
    const preview=page.locator('.ua-role-preview');
    const dashboard=preview.locator('[data-ua-matrix-row=dashboard]');
    assert.equal(await dashboard.locator('details').count(),0);
    assert.equal(await preview.locator('[data-ua-cell]:enabled').count(),0);
    // Native scroll-to-start must leave the row below the sticky Site header.
    await dashboard.locator('th').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));
    await visiblePoint(dashboard.locator('th'));
    await noOverflow(page.locator('.ua-role-workspace'));
    await page.screenshot({path:path.join(evidence,'preview-empty-'+lang+'-'+width+'.png')});

    const previewIQC=preview.locator('[data-ua-details=iqc]');
    if(!await previewIQC.evaluate(e=>e.open))await previewIQC.locator('summary').click();
    assert(await previewIQC.evaluate(e=>e.open));
    await visiblePoint(preview.locator('[data-ua-cell="iqc.view"]'));
    await noOverflow(preview);
    await page.screenshot({path:path.join(evidence,'preview-details-'+lang+'-'+width+'.png')});
    const matrixWidth=await preview.locator('.ua-simple-wrap').evaluate(e=>e.clientWidth);
    if(await preview.locator('thead').isVisible()){
      const head=await preview.locator('thead th').all();
      const row=await preview.locator('[data-ua-matrix-row=iqc]').locator(':scope>th,:scope>td[data-label]').all();
      for(let i=0;i<row.length;i++){
        const a=await head[i].boundingBox(),b=await row[i].boundingBox();
        assert(Math.abs(a.x-b.x)<1&&Math.abs(a.width-b.width)<1,'header and cell columns align');
      }
    }

    if(width===1165||width===768){
      const list=await page.locator('.ua-role-list').boundingBox(),section=await page.locator('.ua-role-workspace>section').boundingBox();
      assert(list.y+list.height<=section.y+1,'constrained workspace puts the role list above the matrix');
    }
    const edit=page.locator('[data-ua-edit-role=custom_layout]');
    await edit.click();assert.equal(await dialog().locator('[name=name]').inputValue(),roleName);
    assert.equal(await dialog().locator('[data-ua-details=dashboard]').count(),0);
    await noOverflow(dialog());
    // Full unfiltered matrix, native inner scroll and pinned controls at short heights.
    await visiblePoint(dialog().locator('[data-ua-matrix-row="user-password"] th'));
    await visiblePoint(dialog().locator('header [data-ua-close]'));
    await visiblePoint(dialog().locator('footer [data-ua-close]'));
    await visiblePoint(dialog().locator('footer [type=submit]'));
    const scroll=await dialog().evaluate(root=>({outer:root.scrollTop,form:root.querySelector('form').scrollTop,body:root.querySelector('.ua-dialog-body').scrollTop,matrix:[...root.querySelectorAll('.ua-simple-wrap')].some(e=>e.scrollHeight>e.clientHeight+1)}));
    assert.equal(scroll.outer,0,'native dialog has no second vertical scroll');
    assert.equal(scroll.form,0);assert(scroll.body>0);assert.equal(scroll.matrix,false);
    await page.screenshot({path:path.join(evidence,'dialog-full-bottom-'+lang+'-'+width+'.png')});
    await dialog().locator('[data-ua-role-search]').fill('iqc');
    await focusTrap();
    const details=dialog().locator('[data-ua-details=iqc]'),summary=details.locator('summary');
    await summary.focus();await page.keyboard.press('Enter');assert(await details.evaluate(e=>e.open));
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.uaCell),'iqc.create');
    await page.keyboard.press('Shift+Tab');assert(await summary.evaluate(e=>e===document.activeElement));
    await page.keyboard.press('Tab');await page.keyboard.press('Space');
    assert(await dialog().locator('[data-ua-cell="iqc.create"]').isChecked());
    await noOverflow(dialog());
    const panel=await details.locator('.ua-extra-panel').boundingBox(),matrix=await dialog().locator('.ua-simple-wrap').boundingBox();
    assert(panel.width>matrix.width*.85&&panel.x>=matrix.x-1&&panel.x+panel.width<=matrix.x+matrix.width+1);
    await visiblePoint(dialog().locator('[data-ua-cell="iqc.view"]'));
    await page.screenshot({path:path.join(evidence,'dialog-'+lang+'-'+width+'.png')});

    confirmationAnswers.push(false);
    await dialog().locator('footer [data-ua-close]').click();
    assert.equal(await dialog().count(),1,'rejecting departure keeps the dialog open');
    assert(await dialog().locator('[data-ua-cell="iqc.create"]').isChecked(),'unsaved input survives rejected departure');
    confirmationAnswers.push(true);await page.keyboard.press('Escape');
    await dialog().waitFor({state:'detached'});
    assert(await edit.evaluate(e=>e===document.activeElement));
    await edit.click();
    assert.equal(await dialog().locator('[data-ua-cell="iqc.create"]').isChecked(),false,'reopen restores stored value after discard');
    assert(await dialog().locator('[data-ua-cell="iqc.view"]').isChecked());
    await dialog().locator('header [data-ua-close]').click();await dialog().waitFor({state:'detached'});
    assert.deepEqual(await fixture.db.prepare('SELECT revision,"values" FROM shared_state').first(),baseline);
    report.cases.push({lang,width,height,matrixWidth,status:'PASS',previewUnobscured:true,emptyAndEffectiveDetails:true,keyboardAndCancelReopen:true});
  }
  assert.deepEqual(confirmationAnswers,[]);
  assert(!report.confirmations.some(x=>x.answer==='unexpected'));
  assert.deepEqual(report.errors,[]);report.status='PASS_COMPILED_ROLE_LAYOUT';
}catch(error){
  report.status='FAIL_COMPILED_ROLE_LAYOUT';report.error={stage,message:error.message,stack:error.stack};process.exitCode=1;
  await page?.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});
}finally{
  await browser?.close();await fixture?.close();
  fs.writeFileSync(path.join(evidence,'compiled-role-layout.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}
