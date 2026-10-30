// Remote frames: immediate input protection, position fallback and restoration.
// Only synthetic frames fulfilled locally; actual Worker and normal app login.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createFeedbackFixture} from './web-feedback-native-fixture.mjs';
const fixture=await createFeedbackFixture(),out='.sites-runtime/feedback-frames',results=[];
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.FEEDBACK_BROWSER_PATH||chromium.executablePath()});
 const original=await fixture.businessState();
 async function check(name,run){
  const context=await browser.newContext({viewport:{width:1365,height:900},hasTouch:true});let loads=0;
  await context.route('**/*',r=>new URL(r.request().url()).origin===fixture.origin?r.continue():r.abort());
  await context.route('https://frame.synthetic.invalid/**',r=>{loads++;return r.fulfill({contentType:'text/html',body:`<style>body{margin:0}button{width:100%;height:100px}input{width:90%}</style><button>Frame action</button><input value="original"><script>window.frameNonce=crypto.randomUUID();for(const type of ['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','click','dblclick','dragstart'])document.addEventListener(type,()=>parent.postMessage({probe:'frame',type},'*'),true)</script>`});});
  const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(fixture.origin+'/login?view=data&dataTab=web-feedback');await page.locator('#id').fill('frank');await page.locator('#password').fill(fixture.password);await page.locator('.site-entry-submit').click();await page.waitForSelector('.wf-row');
   await page.evaluate(()=>{window.__frameHits=[];window.addEventListener('message',e=>{if(e.origin==='https://frame.synthetic.invalid'&&e.data?.probe==='frame')window.__frameHits.push(e.data.type);});});
   await run({page,context,loads:()=>loads});assert.deepEqual(errors,[]);assert.deepEqual(await fixture.businessState(),original);results.push({name,status:'PASS'});console.log('PASS '+name);
  }catch(error){results.push({name,status:'FAIL',error:String(error.stack).slice(0,2000)});process.exitCode=1;console.error('FAIL '+name+' '+error.message);fs.mkdirSync(out,{recursive:true});await page.screenshot({path:out+'/failure-'+results.length+'.png'});}
  finally{await context.close();}
 }
 async function insert(page,flow=false){
  await page.evaluate(flow=>{
   const frame=document.createElement('iframe');frame.id='frameprobe';frame.title='合成外部內容';frame.src='https://frame.synthetic.invalid/';
   if(flow){const container=document.createElement('div');container.id='frame-scroll';container.style.cssText='position:fixed;left:30px;top:150px;width:360px;height:180px;overflow:auto;z-index:100';frame.style.cssText='width:340px;height:300px;display:inline-block!important';container.append(frame);document.body.append(container);}
   else{frame.style.cssText='position:fixed;left:30px;top:150px;width:340px;height:180px;z-index:100';document.body.append(frame);}
  },flow);
  await page.frameLocator('#frameprobe').locator('input').waitFor();await page.frameLocator('#frameprobe').locator('input').fill('保留輸入 Giữ dữ liệu');
  const nonce=await page.frameLocator('#frameprobe').locator('body').evaluate(()=>window.frameNonce),style=await page.locator('#frameprobe').getAttribute('style');
  await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();return{nonce,style};
 }
 async function begin(page,mode='mouse'){
  if(mode==='touch')await page.locator('[data-select]').tap();
  else if(mode==='keyboard'){await page.locator('[data-select]').focus();await page.keyboard.press('Enter');}
  else await page.locator('[data-select]').click();
  await page.locator('#wf-marking-shield').waitFor();
 }
 for(const mode of ['mouse','touch','keyboard'])await check(mode+' immediate iframe input is blocked; cancellation preserves live frame and input',async({page,loads})=>{
  const saved=await insert(page),before=await page.locator('#frameprobe').boundingBox();
  for(let run=0;run<3;run++){
   await page.evaluate(()=>window.__frameHits=[]);await begin(page,mode);
   // No ready-state wait or animation frame before the first attempted input.
   if(mode==='touch')await page.touchscreen.tap(100,200);else await page.mouse.click(100,200);
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   assert.deepEqual(await page.evaluate(()=>window.__frameHits),[]);
   if(await page.locator('#wf-marking-shield').count()){
    const box=await page.locator('[data-wf-frame-placeholder]').boundingBox();for(const key of ['x','y','width','height'])assert(Math.abs(box[key]-before[key])<1,key);
    if(run===0)await page.keyboard.press('Escape');else if(run===1)await page.locator('[data-select]').click();else await page.locator('[data-close]').click();
   }
   assert.equal(await page.locator('[data-wf-frame-placeholder]').count(),0,JSON.stringify({mode,run,state:await page.evaluate(()=>({focus:document.activeElement?.outerHTML.slice(0,300),shield:!!document.querySelector('#wf-marking-shield'),status:document.querySelector('#wf-panel [role=status]')?.textContent}))}));assert.equal(await page.locator('#frameprobe').getAttribute('style'),saved.style);
   assert.equal(await page.frameLocator('#frameprobe').locator('input').inputValue(),'保留輸入 Giữ dữ liệu');assert.equal(await page.frameLocator('#frameprobe').locator('body').evaluate(()=>window.frameNonce),saved.nonce);assert.equal(loads(),1);
   await page.frameLocator('#frameprobe').locator('button').click();await page.waitForFunction(()=>window.__frameHits.includes('click'));
   if(!await page.locator('#wf-panel').isVisible()){await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();}
  }
 });
 await check('flow placeholder preserves scrolling and saved outer-frame location reaches the backend',async({page,context,loads})=>{
  await insert(page,true);const height=await page.locator('#frame-scroll').evaluate(el=>el.scrollHeight);
  await begin(page);await page.locator('#wf-marking-shield[data-ready=true]').waitFor();assert.equal(await page.locator('#frame-scroll').evaluate(el=>el.scrollHeight),height);
  await page.mouse.move(100,200);await page.mouse.wheel(0,80);await page.waitForFunction(()=>document.querySelector('#frame-scroll').scrollTop>0);
  await page.mouse.click(100,200);await page.locator('#wf-marking-shield').waitFor({state:'detached'});assert.deepEqual(await page.evaluate(()=>window.__frameHits),[]);
  await page.locator('#wf-panel textarea').fill('外框位置 Khung bên ngoài');await page.locator('[data-submit]').click();await page.waitForFunction(()=>document.querySelector('#wf-panel [role=status]')?.textContent.match(/已建立|Đã tạo/));
  const response=await context.request.get(fixture.origin+'/api/web-feedback?action=list');assert.equal(response.status(),200);const issue=(await response.json()).issues.find(i=>i.description==='外框位置 Khung bên ngoài');
  assert.equal(issue.location.locator.id,'frameprobe');assert.equal(issue.location.locator.tag,'iframe');assert.equal(issue.location.position.x,100);assert.equal(issue.location.position.y,200);assert.equal(loads(),1);
 });
 await check('frames inserted during selection are protected; display changes are restored and observers are removed',async({page})=>{
  await page.locator('#wf-launcher').click();await page.locator('[data-submit]').waitFor();await begin(page);await page.locator('#wf-marking-shield[data-ready=true]').waitFor();
  await page.evaluate(()=>{const f=document.createElement('iframe');f.id='late-frame';f.src='https://frame.synthetic.invalid/';f.style.cssText='position:fixed;left:30px;top:150px;width:340px;height:180px';document.body.append(f);});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#late-frame')).display==='none');assert.equal(await page.locator('[data-wf-frame-placeholder]').count(),1);
  await page.locator('#late-frame').evaluate(el=>el.style.setProperty('display','block'));
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#late-frame')).display==='none');await page.keyboard.press('Escape');
  assert.equal(await page.locator('#late-frame').evaluate(el=>el.style.display),'block');assert.equal(await page.locator('[data-wf-frame-placeholder]').count(),0);
  await page.evaluate(()=>{const f=document.createElement('iframe');f.id='after-cancel';f.src='https://frame.synthetic.invalid/';document.body.append(f);});
  await page.frameLocator('#after-cancel').locator('button').waitFor();assert.notEqual(await page.locator('#after-cancel').evaluate(el=>getComputedStyle(el).display),'none');
 });
}finally{await browser?.close();await fixture.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/results.json',JSON.stringify({results,status:results.some(r=>r.status==='FAIL')?'FAIL':'PASS'},null,2));}
