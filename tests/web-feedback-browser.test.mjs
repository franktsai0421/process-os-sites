// Actual Chromium, compiled Worker, normal application logins, owned D1/R2.
// No hosted profile, platform credentials, existing data or publication.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';
import {pngFixture} from './photo-fixtures.mjs';
const report={passed:[],browser:'',screenshots:[],api:[],unverified:['Hosted Chrome versus ChatGPT with the same real account','Physical devices and native Chinese/Vietnamese IME']};
let fixture,browser,lastPage,stage='setup';
const out='.sites-runtime/feedback-browser';fs.mkdirSync(out,{recursive:true});
async function check(name,run){stage=name;await run();report.passed.push(name);console.log('PASS '+name);}
function unzip(bytes){const files=new Map();let at=0;while(bytes.readUInt32LE(at)===0x04034b50){assert.equal(bytes.readUInt16LE(at+8),0);const size=bytes.readUInt32LE(at+18),length=bytes.readUInt16LE(at+26),extra=bytes.readUInt16LE(at+28),start=at+30+length+extra;files.set(bytes.subarray(at+30,at+30+length).toString('utf8'),bytes.subarray(start,start+size));at=start+size;}return files;}
try{
 fixture=await createFeedbackFixture();const originalState=await fixture.businessState();
 const bundled=chromium.executablePath();browser=await chromium.launch({headless:true,...(process.env.FEEDBACK_BROWSER_PATH?{executablePath:process.env.FEEDBACK_BROWSER_PATH}:fs.existsSync(bundled)?{executablePath:bundled}:{channel:'chrome'}),args:['--disable-background-networking']});report.browser=browser.version();
 async function login(actor,viewport={width:1365,height:900}){
  const context=await browser.newContext({viewport,hasTouch:true,serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===fixture.origin?route.continue():route.abort());
  const page=await context.newPage();lastPage=page;page.setDefaultTimeout(15000);
  page.on('pageerror',error=>{(report.pageErrors||=[]).push(error.message);});
  page.on('request',request=>{const url=new URL(request.url());if(url.pathname==='/api/web-feedback')report.api.push({action:url.searchParams.get('action'),method:request.method()});});
  await page.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');await page.locator('#id').fill(actor);await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await page.waitForSelector('.wf-row');return{context,page};
 }
 const owner=await login('frank'),page=owner.page;
 const call=(context,action,data)=>data===undefined?context.request.get(fixture.origin+'/api/web-feedback?action='+action):context.request.post(fixture.origin+'/api/web-feedback?action='+action,{data,headers:{Origin:fixture.origin}});
 let firstId,submittedId;
 await check('direct normal browser first load and reload show helper, only list/history tabs',async()=>{
  assert.equal(await page.locator('[data-board-tab=mine]').count(),0);assert.equal(await page.locator('#wf-launcher').isVisible(),true);
  await page.reload();await page.waitForSelector('.wf-row');assert.equal(await page.locator('#wf-launcher').isVisible(),true);
  firstId=await page.locator('[data-issue]').first().getAttribute('data-issue');assert.equal(await page.locator('[data-delete-issue]').count(),1);
 });
 await check('cold list overlaps slow assets; failed list shows retry and performs one fresh read',async()=>{
  const core='**/process/web-feedback.js?*',list='**/api/web-feedback?action=list';
  let coreReleased=false,readBeforeCore=false;
  await page.route(core,async r=>{await new Promise(resolve=>setTimeout(resolve,200));coreReleased=true;await r.continue();});
  await page.route(list,r=>{readBeforeCore=!coreReleased;return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'SYNTHETIC_LIST_RETRY'})});},{times:1});
  await page.reload();await page.getByText('SYNTHETIC_LIST_RETRY',{exact:true}).waitFor();
  assert(readBeforeCore);assert.equal(await page.locator('.wf-row').count(),0);
  const before=report.api.filter(r=>r.action==='list').length;
  await page.locator('#data-content button').filter({hasText:/重試|Thử lại/}).click();await page.waitForSelector('.wf-row');
  assert.equal(report.api.filter(r=>r.action==='list').length,before+1);await page.unroute(core);
 });
 await check('normal other-admin named Frank and staff cannot delete via forged direct API or UI',async()=>{
  for(const id of ['other-admin','employee']){const actor=await login(id);assert.equal(await actor.page.locator('[data-delete-issue]').count(),0);const response=await call(actor.context,'delete',{id:firstId,version:1,name:'frank',role:'admin',primary:true});assert.equal(response.status(),403);await actor.context.close();}
  lastPage=page;
 });
 await check('Chinese/Vietnamese composition events retain search input and selected detail',async()=>{
  const search=page.locator('[data-filter=search]');await search.evaluate(input=>{input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.value='Kiểm tra tiếng Việt';input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:input.value}));});assert.equal(await page.locator('.wf-row').count(),60);await search.dispatchEvent('compositionend');assert.equal(await page.locator('.wf-row').count(),30);assert.equal(await search.inputValue(),'Kiểm tra tiếng Việt');await search.fill('中文問題');assert.equal(await page.locator('.wf-row').count(),30);await search.fill('');assert.equal(await page.locator('.wf-row').count(),60);
  await page.locator('[data-issue]').nth(2).click();await page.locator('[data-issue]').nth(4).click();assert.equal(await page.locator('.wf-detail h3').textContent(),await page.locator('[data-issue]').nth(4).getAttribute('data-issue'));
 });
 await check('failed note save retains text; retry saves once without full list reload; completion/reopen persist',async()=>{
  const route='**/api/web-feedback?action=update';let fail=true,count=0;
  await page.route(route,async request=>{count++;if(fail){fail=false;return request.abort();}await new Promise(resolve=>setTimeout(resolve,180));return request.continue();});
  const note='私人備註 中文 · Ghi chú riêng tiếng Việt';await page.locator('[data-note]').fill(note);
  await page.locator('[data-update]').first().click();await page.waitForFunction(()=>document.querySelector('.wf-admin [role=status]')?.textContent.match(/尚未確認|Chưa xác nhận/));assert.equal(await page.locator('[data-note]').inputValue(),note);
  const lists=report.api.filter(r=>r.action==='list').length;
  await page.locator('[data-update]').first().evaluate(button=>{button.click();button.click();});await page.waitForFunction(()=>document.querySelector('[data-note]')?.value==='');assert.equal(count,2);assert.equal(report.api.filter(r=>r.action==='list').length,lists);
  await page.locator('[data-update]').nth(1).click();await page.waitForFunction(()=>document.querySelector('[data-update]')?.dataset.update==='done');await page.locator('[data-update]').nth(1).click();await page.waitForFunction(()=>document.querySelector('[data-update]')?.dataset.update==='open');
  const id=await page.locator('.wf-detail h3').textContent();await page.reload();await page.waitForSelector('.wf-row');await page.locator(`[data-issue="${id}"]`).click();assert((await page.locator('.wf-detail').textContent()).includes(note));await page.unroute(route);
  const staff=await login('employee');const data=await (await call(staff.context,'list')).json();assert(!JSON.stringify(data).includes(note));assert(!JSON.stringify(data).includes('notes'));await staff.context.close();lastPage=page;
 });
 let handoff,zipHash;
 await check('lost successful note response retries the same operation without duplicate notes',async()=>{
  let lost=false;const route='**/api/web-feedback?action=update';await page.route(route,async r=>{if(!lost){lost=true;const response=await r.fetch();assert.equal(response.status(),200);return r.abort();}return r.continue();});
  const id=await page.locator('.wf-detail h3').textContent(),note='Lost-response 唯一備註';await page.locator('[data-note]').fill(note);await page.locator('[data-update]').first().click();await page.waitForFunction(()=>document.querySelector('.wf-admin [role=status]')?.textContent.match(/尚未確認|Chưa xác nhận/));assert.equal(await page.locator('[data-note]').inputValue(),note);await page.locator('[data-update]').first().click();await page.waitForFunction(()=>document.querySelector('[data-note]')?.value==='');const issue=(await (await call(owner.context,'list')).json()).issues.find(i=>i.id===id);assert.equal(issue.notes.filter(n=>n.text===note).length,1);await page.unroute(route);
 });
 await check('selected handoff is immediately visible and ZIP contents/digests/Unicode match selection',async()=>{
  await page.locator('[data-pick]').nth(0).check();await page.locator('[data-pick]').nth(1).check();const ids=await page.locator('[data-pick]:checked').evaluateAll(nodes=>nodes.map(n=>n.dataset.pick));assert((await page.locator('[data-export]').textContent()).includes('(2)'));
  const before=report.api.filter(r=>r.action==='export').length;await page.locator('[data-export]').evaluate(button=>{button.click();button.click();});await page.locator('.wf-admin [role=status] a').waitFor();assert.equal(report.api.filter(r=>r.action==='export').length,before+1);
  handoff=new URL(await page.locator('.wf-admin [role=status] a').getAttribute('href'),fixture.origin).searchParams.get('id');const response=await call(owner.context,'download&id='+handoff);assert.equal(response.status(),200);const bytes=await response.body();zipHash=createHash('sha256').update(bytes).digest('hex');const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.wf-admin [role=status] a').click()]);assert.equal(await download.failure(),null);assert.equal(createHash('sha256').update(fs.readFileSync(await download.path())).digest('hex'),zipHash);const files=unzip(bytes),payload=JSON.parse(files.get('issues.json'));assert.deepEqual(payload.issues.map(i=>i.id),ids);assert(files.get('issues.json').toString().includes('Kiểm tra'));assert(files.get('issues.json').toString().includes('中文'));
  for(const entry of JSON.parse(files.get('manifest.json')).files)assert.equal(createHash('sha256').update(files.get(entry.path)).digest('hex'),entry.sha256);
  await page.locator('[data-board-tab=history]').click();await page.locator('.wf-history').waitFor();assert((await page.locator('.wf-history').textContent()).includes(handoff));await page.reload();await page.waitForSelector('.wf-row');await page.locator('[data-board-tab=history]').click();await page.locator('.wf-history').waitFor();assert((await page.locator('.wf-history').textContent()).includes(handoff));await page.locator('[data-board-tab=list]').click();
 });
 await check('Frank delete cancel is inert; confirmed delete persists and preserves immutable handoff/attachments',async()=>{
  await page.locator(`[data-issue="${firstId}"]`).click();const deletes=report.api.filter(r=>r.action==='delete').length;
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-delete-issue]').click();assert.equal(report.api.filter(r=>r.action==='delete').length,deletes);assert.equal(await page.locator(`[data-issue="${firstId}"]`).count(),1);
  await page.route('**/api/web-feedback?action=delete',r=>r.abort(),{times:1});page.once('dialog',dialog=>dialog.accept());await page.locator('[data-delete-issue]').click();await page.waitForFunction(()=>document.querySelector('.wf-admin [role=status]')?.textContent.match(/刪除失敗|Không xóa/));assert.equal(await page.locator(`[data-issue="${firstId}"]`).count(),1);
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-delete-issue]').click();await page.locator(`[data-issue="${firstId}"]`).waitFor({state:'detached'});await page.reload();await page.waitForSelector('.wf-row');assert.equal(await page.locator(`[data-issue="${firstId}"]`).count(),0);
  assert.equal(createHash('sha256').update(await (await call(owner.context,'download&id='+handoff)).body()).digest('hex'),zipHash);const stored=JSON.parse((await fixture.db.prepare('SELECT payload FROM web_feedback_store WHERE id=1').first()).payload);assert(stored.issues.find(i=>i.id===firstId).deletedAt);assert(stored.attachments.length>0);
 });
 await check('helper right corner opens/closes without list link; report drafts and attachments survive reload',async()=>{
  await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();assert.equal(await page.locator('#wf-panel [data-list]').count(),0);const rect=await page.locator('#wf-panel').boundingBox();assert(rect.x>900&&rect.x+rect.width<=1365);
  await page.locator('#wf-panel textarea').fill('回報草稿 Tiếng Việt');await page.locator('#wf-panel input[type=file]').setInputFiles({name:'附件_ảnh.png',mimeType:'image/png',buffer:pngFixture({width:32,height:32})});await page.waitForSelector('#wf-panel .wf-thumb');await page.locator('[data-close]').click();await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();assert.equal(await page.locator('#wf-panel textarea').inputValue(),'回報草稿 Tiếng Việt');await page.reload();await page.waitForSelector('.wf-row');await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();assert.equal(await page.locator('#wf-panel .wf-thumb').count(),1);
 });
 await page.evaluate(()=>{
  const container=document.createElement('section');container.id='feedback-probe';container.style.cssText='position:fixed;left:20px;top:120px;width:400px;height:280px;overflow:auto;background:white;z-index:100';container.innerHTML='<form><button id="probe-button">測試按鈕</button><input id="probe-input" value="unchanged"><img id="probe-image" draggable="true" alt="測試圖片" width="40" height="40"><table><tr><td id="probe-text">越文 bảng kiểm tra</td></tr></table><canvas id="probe-canvas" width="70" height="40"></canvas><div id="probe-blank" style="height:80px"></div><div style="height:1000px"></div><button id="probe-after-scroll">捲動後</button></form>';
  container.querySelector('img').src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>');document.body.append(container);window.__feedbackProbeEvents=[];
  for(const name of ['pointerdown','mousedown','touchstart','click','dragstart','submit','input'])container.addEventListener(name,e=>{window.__feedbackProbeEvents.push(name);if(name==='submit')e.preventDefault();},true);
 });
 await check('button/image/input/text/canvas/blank annotation blocks early underlying events; multiple markers retain text',async()=>{
  for(const [n,id] of ['probe-button','probe-image','probe-input','probe-text','probe-canvas','probe-blank'].entries()){
   if(n)await page.locator('[data-add]').click();await page.locator('#wf-panel textarea').fill('標記 '+id+' · ghi chú');const rect=await page.locator('#'+id).boundingBox();await page.locator('[data-select]').click();await page.waitForSelector('#wf-marking-shield[data-ready=true]');await page.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2);await page.locator('#wf-marking-shield').waitFor({state:'detached'});assert.equal(await page.locator('#wf-panel textarea').inputValue(),'標記 '+id+' · ghi chú');
  }
  assert.deepEqual(await page.evaluate(()=>window.__feedbackProbeEvents),[]);assert.equal(await page.locator('#probe-input').inputValue(),'unchanged');
  await page.locator('[data-marker="0"]').click();assert.equal(await page.locator('#wf-panel textarea').inputValue(),'標記 probe-button · ghi chú');assert.equal(await page.locator('#wf-panel .wf-thumb').count(),1);
 });
 await check('annotation permits inner scrolling, touch taps, Escape and restores underlying controls',async()=>{
  await page.locator('[data-select]').click();await page.mouse.move(100,250);await page.mouse.wheel(0,900);await page.waitForFunction(()=>document.querySelector('#feedback-probe').scrollTop>0);await page.keyboard.press('Escape');assert.equal(await page.locator('#wf-marking-shield').count(),0);
  await page.locator('#probe-after-scroll').scrollIntoViewIfNeeded();const rect=await page.locator('#probe-after-scroll').boundingBox();await page.locator('[data-select]').click();await page.locator('#wf-marking-shield[data-ready=true]').waitFor();await page.touchscreen.tap(rect.x+20,rect.y+10);await page.locator('#wf-marking-shield').waitFor({state:'detached'});assert.deepEqual(await page.evaluate(()=>window.__feedbackProbeEvents),[]);
  await page.locator('#probe-button').scrollIntoViewIfNeeded();await page.locator('#probe-button').click();assert((await page.evaluate(()=>window.__feedbackProbeEvents)).includes('pointerdown'));await page.locator('#probe-input').fill('restored');assert.equal(await page.locator('#probe-input').inputValue(),'restored');
 });
 await check('touch scroll keeps annotation active and repeated selection cancellation removes global listeners',async()=>{
  const cdp=await owner.context.newCDPSession(page);
  const count=async()=>{let total=0;for(const expression of ['window','document']){const result=await cdp.send('Runtime.evaluate',{expression});total+=(await cdp.send('DOMDebugger.getEventListeners',{objectId:result.result.objectId})).listeners.length;}return total;};
  const before=await count();await page.locator('[data-select]').click();await page.locator('[data-marker="1"]').click();assert.match(await page.locator('[data-select]').textContent(),/取消|Hủy/);await page.locator('[data-select]').click();assert.equal(await page.locator('#wf-marking-shield').count(),0);for(let i=0;i<4;i++){await page.locator('[data-select]').click();await page.locator('#wf-marking-shield[data-ready=true]').waitFor();await page.keyboard.press('Escape');}assert.equal(await count(),before);
  await page.locator('#probe-button').scrollIntoViewIfNeeded();await page.locator('[data-select]').click();await page.locator('#wf-marking-shield[data-ready=true]').waitFor();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:330}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150,y:160}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await page.locator('#wf-marking-shield').count(),1);assert(await page.locator('#feedback-probe').evaluate(el=>el.scrollTop>0));await page.keyboard.press('Escape');await cdp.detach();
 });
 await check('failed report retains fixed batch; rapid retry creates only the selected markers with position fallback',async()=>{
  let failed=false;const route='**/api/web-feedback?action=submit';await page.route(route,r=>{if(!failed){failed=true;return r.abort();}return r.continue();});await page.locator('[data-submit]').click();await page.waitForFunction(()=>document.querySelector('[data-submit]')?.textContent.match(/重試|Thử/));const before=(await (await call(owner.context,'list')).json()).issues.length;
  await page.locator('[data-submit]').evaluate(button=>{button.click();button.click();});await page.waitForFunction(()=>document.querySelector('#wf-panel [role=status]')?.textContent.match(/已建立|Đã tạo/));const issues=(await (await call(owner.context,'list')).json()).issues;assert.equal(issues.length-before,6);const submitted=issues.filter(i=>i.description.startsWith('標記 probe-'));assert.equal(submitted.length,6);assert(submitted.every(i=>i.location.position));submittedId=submitted[1].id;await page.waitForFunction(count=>document.querySelectorAll('.wf-row').length===count,issues.length);await page.unroute(route);
 });
 await check('desktop, narrow and phone widths show Vietnamese/Chinese controls without module overflow',async()=>{
  await page.evaluate(()=>document.querySelector('#feedback-probe').remove());
  for(const width of [1365,768,390,320]){await page.setViewportSize({width,height:844});for(const lang of ['zh','vi']){
   if(await page.locator('html').getAttribute('lang')!==lang)await page.locator('.top-language-switch').click();await page.waitForFunction(()=>document.querySelector('#wf-panel strong')?.textContent=== (document.documentElement.lang==='vi'?'Báo lỗi':'問題回報'));
   const rect=await page.locator('#wf-panel').boundingBox(),submit=await page.locator('[data-submit]').boundingBox();assert(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width&&rect.y+rect.height<=844);assert(submit.y+submit.height<=844);assert.equal(await page.locator('.wf-admin').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
   const file=`${out}/${width}-${lang}.png`;await page.screenshot({path:file});report.screenshots.push(file);
  }}
 });
 await check('missing/reused element does not highlight another target and shows retained report information',async()=>{
  await page.evaluate(()=>{sessionStorage.setItem('web-feedback-highlight',JSON.stringify({location:{type:'element',view:'data',tab:'web-feedback',system:'process',display:'原始標記位置',locator:{id:'wf-launcher',tag:'button',label:'old label'},context:{}},description:'原始內容 Nội dung gốc',issueId:'synthetic-marker',expires:Date.now()+60000}));window.WebFeedback.routeChanged();});
  assert.equal(await page.locator('.wf-outline').count(),0);assert((await page.locator('#wf-location-notice').textContent()).includes('原始內容 Nội dung gốc'));await page.locator('#wf-location-notice button').click();
 });
 await check('submitted issue opens its original marker through the actual detail button',async()=>{
  await page.locator('[data-close]').click();await page.locator(`[data-issue="${submittedId}"]`).click();await page.locator('[data-original]').click();await page.locator('#wf-location-notice').waitFor();assert((await page.locator('#wf-location-notice').textContent()).includes('標記 probe-image'));assert.equal(await page.locator('.wf-outline').count(),0);
 });
 await check('only feedback storage changed; business state/revision untouched',async()=>{assert.deepEqual(await fixture.businessState(),originalState);});
 assert.deepEqual(report.pageErrors||[],[]);report.status='PASS';
}catch(error){report.status='FAIL';report.failedStage=stage;report.error=String(error.stack).slice(0,2500);if(lastPage)await lastPage.screenshot({path:out+'/failure.png'}).catch(()=>{});process.exitCode=1;}
finally{await browser?.close();await fixture?.close();fs.writeFileSync(out+'/results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
