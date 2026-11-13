// Paired runner uses complete baseline/candidate builds with isolated synthetic
// D1/R2 and a normal signed fixture session; never touches the hosted Site.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';
import {pngFixture} from './photo-fixtures.mjs';
const output=process.env.IPQC_SPEED_OUTPUT;
const report={kind:'compiled Worker + Chromium, synthetic data only',conditions:{rounds:Number(process.env.IPQC_SPEED_ROUNDS||3),viewport:'1280x850',language:'zh-Hant',cache:'new browser context per round; warm within round',media:'deterministic lossless PNG 1200x800',network:'loopback, no artificial latency; outbound blocked',timing:'Node Playwright and in-browser wall time reported separately; excludes ChatGPT bridge; complete UI, images and references awaited'},samples:[],errors:[]};
for(let round=0;round<Number(process.env.IPQC_SPEED_ROUNDS||3);round++){
 const f=await createABCFixture({programCommit:process.env.PROCESS_PROGRAM_COMMIT,products:4});
 report.buildEntrySha256=f.buildEntrySha256;
 const b=await chromium.launch({...(process.env.PROCESS_TEST_CHROMIUM?{executablePath:process.env.PROCESS_TEST_CHROMIUM}:fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),headless:true});
 try{
  const c=await b.newContext({viewport:{width:1280,height:850}});await c.addCookies([{name:'process_demo',value:f.cookie(),url:f.url.origin}]);
  await c.addInitScript(()=>localStorage.setItem('processUILanguage','zh'));
  const p=await c.newPage();p.setDefaultTimeout(15000);p.on('dialog',d=>d.accept());p.on('pageerror',e=>report.errors.push(e.message));
  await p.route('**/*',r=>new URL(r.request().url()).origin===f.url.origin?r.continue():r.abort());
  const requests=[];p.on('request',r=>requests.push({method:r.method(),path:new URL(r.url()).pathname}));
  const contentReady=async()=>{await p.locator('#ipqcab-line').waitFor();await p.waitForFunction(()=>!document.querySelector('#ipqcab-loading')&&!sharedDraftAccountState().queued);await p.waitForFunction(()=>![...document.querySelectorAll('[data-ipqc-reference]')].some(n=>/載入中|Đang tải/.test(n.textContent)));await p.locator('.ipqcab-page img').evaluateAll(async images=>{await Promise.all(images.filter(i=>i.loading!=='lazy'||i.getBoundingClientRect().top<innerHeight).map(i=>i.decode()));});};
  const idle=async()=>{await p.waitForFunction(()=>!sharedDraftAccountState().queued&&IPQCABUI.navigation.canLeave()&&!document.querySelector('#ipqcab-save')?.disabled);await contentReady();};
  const measure=async(name,fn)=>{const count=requests.length,start=performance.now();const browserStart=await p.evaluate(()=>Date.now());await fn();const browserMs=(await p.evaluate(()=>Date.now()))-browserStart;const resources=await p.evaluate(since=>performance.getEntriesByType('resource').filter(e=>performance.timeOrigin+e.startTime>=since-1).map(e=>({path:new URL(e.name).pathname,initiator:e.initiatorType,durationMs:e.duration,ttfbMs:e.responseStart?e.responseStart-e.startTime:null,transferBytes:e.transferSize,decodedBytes:e.decodedBodySize})),browserStart);report.samples.push({round,name,playwrightMs:performance.now()-start,browserMs,requests:requests.slice(count),resources});if(output)fs.writeFileSync(output,JSON.stringify(report,null,2));};
  await p.goto(f.url.origin+'/process/?system=quality&view=data&dataTab=quality-ipqc-ab');await contentReady();
  await measure('warm-reload',async()=>{await p.reload();await contentReady();});
  await p.locator('#ipqcab-begin').click();await p.locator('#ipqcab-add-error').click();await p.locator('#ab-error-name').fill('Synthetic speed');await p.locator('#ab-apply').click();
  await p.locator('#ipqcab-add-item').click();await p.locator('#ab-standard').fill('Synthetic standard');await p.locator('#ab-method').fill('Visual');
  await p.locator('[data-ab-upload=standard]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(pngFixture({width:1200,height:800}))});await p.locator('.ipqcab-photo-row').waitFor();await p.locator('#ab-apply').click();
  await measure('image-save',async()=>{await p.locator('#ipqcab-save').click();await idle();assert.match(await p.locator('.ipqcab-page').innerText(),/整份草稿已存取/);});
  await measure('reload-after-save',async()=>{await p.reload();await contentReady();await p.locator('[data-ab-edit-item]').first().waitFor();});
  const nav=async tab=>{await p.evaluate(tab=>{void ProcessDeliveryNavigation.navigate('data',tab);},tab);await p.waitForFunction(tab=>ProcessSync.destination?.dataTab===tab&&document.documentElement.dataset.processNavigationStatus==='ready',tab);};
  await nav('quality-iqc');
  await measure('return-from-iqc',async()=>{await nav('quality-ipqc-ab');await contentReady();});
  await measure('open-submit-confirmation',async()=>{await p.locator('#ipqcab-submit').click();await p.locator('dialog[open] textarea').waitFor();});
  await p.locator('dialog[open] textarea').fill('Synthetic speed review');
  await measure('submit-confirm-to-pending',async()=>{await p.locator('dialog[open] button[type=submit]').click();await p.locator('#ipqcab-withdraw').waitFor();await idle();assert.equal(await p.locator('#ipqcab-save:not([disabled])').count(),0);});
  // Explicit list/detail fetches are outside the close measurement.
  await p.evaluate(()=>openSharedDraftHistory({editable:()=>false,client:createSharedDraftClient({endpoint:'/api/ipqc-ab/workflow?module=1&caseMetadata=1',actorId:ProcessSync.identity.id,headers:()=>ProcessSync.platformHeaders()})}));
  await p.locator('.shared-restore-overlay [data-case]').first().click();await p.locator('.shared-restore-overlay [data-back]').waitFor().catch(async error=>{console.error(await p.locator('.shared-restore-overlay').innerText());throw error;});
  await measure('close-fixed-case',async()=>{await p.locator('.shared-restore-overlay [data-close]').first().click();await p.locator('.shared-restore-overlay').waitFor({state:'detached'});await contentReady();});
  await p.locator('#ipqcab-withdraw').click();await p.locator('dialog[open] textarea').fill('Synthetic speed withdraw');
  await measure('withdraw-confirm-to-editable',async()=>{await p.locator('dialog[open] button[type=submit]').click();await p.locator('#ipqcab-save:not([disabled])').waitFor();await idle();});
  // A local-only deletion is deliberately abandoned by reload. No delete POST.
  await p.locator('[data-ab-delete-item]').first().click();
  await measure('reload-after-local-delete',async()=>{await p.reload();await contentReady();await p.locator('[data-ab-edit-item]').first().waitFor();});
  assert.deepEqual(report.errors,[]);
 }catch(error){report.failure={round,name:error.name,message:error.message};throw error;}
 finally{await b.close();await f.close();if(output)fs.writeFileSync(output,JSON.stringify(report,null,2));}
}
report.status='PASS';if(output)fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,samples:report.samples.length}));
