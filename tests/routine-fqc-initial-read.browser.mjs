// Prepared browser acceptance runner; NOT part of VM evidence and not run here.
// In an authorized browser-capable CI: node tests/routine-fqc-initial-read.browser.mjs
// All requests are intercepted for a reserved .invalid origin. No server, login,
// credentials, live site, business data or backend mutation is involved.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {fixture} from './fixtures/routine-fqc-durable.mjs';
const source = fs.readFileSync('public/process/routine-fqc.js', 'utf8');
const shared = fs.readFileSync('public/process/shared-draft-client.js', 'utf8');
const search = fs.readFileSync('public/process/routine-fqc-search.mjs', 'utf8');
const css = fs.readFileSync('public/process/routine-fqc.css', 'utf8');
const sourceSha256 = createHash('sha256').update(source).digest('hex');
const origin = 'https://routine-initial-read.invalid';
const unknown = fixture(); unknown.setMode('lost');
await assert.rejects(unknown.api.postOwned({action:'generate'}));
const savedUnknown = [...unknown.store.map];
const browser = await chromium.launch({headless:true,
  executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined});
const results = [];
try {
  for (const width of [390,1366]) for (const lang of ['zh','vi']) {
    for (const scenario of ['no-start-date','no-edit','history','generate','unknown','disabled','forbidden','late-actor','late-delivery']) {
      const context = await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
      try {
        const page = await context.newPage(), requests = [], errors = [];
        page.on('pageerror', e => errors.push(e.message));
        const remote = {identity:{id:'owner'},permissions:{view:true,edit:scenario!=='no-edit',save:true,history:true},revision:50,
          control:{revision:10,startDate:scenario==='no-start-date'?'':'2026-11-01',documents:[],jobs:[],cases:[]},
          sources:[],catalog:{lines:[],categories:[],items:[]},today:'2026-11-01'};
        await context.addInitScript(({saved}) => {
          window.__routineFixture = {epoch:1,delivery:1};
          const state = window.__routineFixture;
          window.ProcessSync = {identity:{id:'owner'},identityGeneration:()=>state.epoch,
            captureDelivery:()=>state.delivery,isCurrentDelivery:value=>value===state.delivery};
          for (const [key,value] of saved) localStorage.setItem(key,value);
        }, {saved:scenario==='unknown'?savedUnknown:[]});
        await page.route('**/*', async route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><section id="routine-fqc-root" class="rf-app">FQC · loading</section></body></html>`});
          if (url.pathname === '/process/routine-fqc-search.mjs') {
            if (scenario === 'late-actor') await page.evaluate(() => { window.ProcessSync.identity = {id:'other'}; });
            if (scenario === 'late-delivery') await page.evaluate(() => { window.__routineFixture.delivery++; });
            return route.fulfill({contentType:'text/javascript',body:search});
          }
          if (url.pathname !== '/api/routine-fqc') return route.abort();
          const row = {method:request.method(),path:url.pathname+url.search}; requests.push(row);
          const respond = async (body,status=200) => { const text=JSON.stringify(body);row.status=status;row.responseBytes=Buffer.byteLength(text);await route.fulfill({status,contentType:'application/json',body:text}); };
          if (scenario === 'disabled') return respond({error:'FQC_NOT_ENABLED'},404);
          if (scenario === 'forbidden') return respond({error:'FORBIDDEN'},403);
          if (request.method() === 'POST') {
            assert.equal(request.postDataJSON().action,'generate'); remote.control.revision++;remote.revision++;
            return respond({result:{ok:true},revision:remote.control.revision,requestId:randomUUID()});
          }
          assert.equal(url.search,'','mount must not make availability or automatic receipt requests');
          return respond(remote);
        });
        await page.goto(origin); await page.addStyleTag({content:css});
        await page.addScriptTag({content:shared}); await page.addScriptTag({content:source});
        const startedUTC = new Date().toISOString();
        const result = await page.evaluate(async history => {
          const root=document.querySelector('#routine-fqc-root'),start=performance.now();
          await window.RoutineFQCUI.mount(root,history);
          return {ms:performance.now()-start,text:root.textContent,error:window.RoutineFQCUI.navigation.error()?.message||null,
            receiptKeys:Object.keys(localStorage).filter(k=>k.startsWith('routine-fqc-receipt-v1:'))};
        },scenario==='history');
        const late=scenario.startsWith('late-'), generated=scenario==='generate';
        assert.deepEqual(requests.map(r=>r.method),generated?['GET','POST','GET']:['GET']);
        assert.equal(result.error,scenario==='forbidden'?'FORBIDDEN':null);
        assert.equal(result.receiptKeys.length,scenario==='unknown'?1:0);
        if (late) assert.equal(result.text,'FQC · loading');
        else if (scenario==='disabled') assert.match(result.text,lang==='zh'?/例行檢查準備中/:/Đang chuẩn bị/);
        else if (scenario==='forbidden') assert.match(result.text,/FORBIDDEN/);
        else {
          await page.locator('.rf-hero').waitFor({state:'visible'});
          if (scenario==='history') await page.locator('.rf-history').waitFor({state:'visible'});
          if (scenario==='unknown') await page.locator('[data-action="retry"]').waitFor({state:'visible'});
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'fixture must fit viewport');
          const first=page.locator('button:enabled').first();await first.focus();assert(await first.evaluate(el=>el===document.activeElement));
        }
        assert.deepEqual(errors,[]);
        results.push({scenario,width,lang,sourceSha256,startedUTC,...result,requests});
      } finally { await context.close(); }
    }
  }
  console.log(JSON.stringify({status:'PASS',layer:'INTERCEPTED_BROWSER_SYNTHETIC_DATA_NOT_LIVE_BACKEND_OR_HTTPS',sourceSha256,results},null,2));
} finally { await browser.close(); }
