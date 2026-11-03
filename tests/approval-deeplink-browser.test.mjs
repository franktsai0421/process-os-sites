// Native Chromium DOM/navigation regression, NOT a full Worker/login E2E.
// Execute the exact master-data registration tail and the complete production
// ApprovalTabs, delivery-navigation and navigation-lifecycle sources. Only
// business projections, session identity and the shell render are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('../public/process/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const master = read('master-data.js');
const startMarker = '  const priorRender = render;';
const endMarker = "  window.addEventListener('process-language-change',";
const start = master.indexOf(startMarker);
const endStart = master.indexOf(endMarker, start);
const end = master.indexOf('\n', endStart);
assert(start >= 0 && master.indexOf(startMarker, start + 1) === -1);
assert(endStart > start && end > endStart);
const registration = master.slice(start, end);
assert(registration.includes('window.ApprovalTabs.mount('));
assert(registration.includes('state.approvalTab'));
const origin = 'https://approval-fixture.invalid';
const tabs = ['master', 'process', 'quality', 'routine'];
const labels = {
  zh: ['主資料送審', '製程版本確認', '品質系統資料庫', '例行檢查'],
  vi: ['Duyệt dữ liệu gốc', 'Duyệt phiên bản quy trình', 'Cơ sở dữ liệu chất lượng', 'Kiểm tra định kỳ'],
};
const assets = new Map(['approval-tabs.js', 'approval-tabs.css', 'delivery-navigation.js', 'navigation-lifecycle.mjs', 'delivery-purpose.mjs'].map(name => ['/process/' + name, read(name)]));

function fixture(lang) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="approval-tabs.css"></head><body><main id="view-root"></main>
<script src="approval-tabs.js"></script><script>
var state={view:'approval',dataTab:null,approvalTab:'master'};
var control={versions:[]},dataReady=Promise.resolve(),approvalReady;
var fixtureReads=[],fixtureMessages=[];
function approvalSection(){return '<p>synthetic master review</p>';}
function bindApprovalMaster(){}
function toast(message){fixtureMessages.push(message);}
function render(){document.querySelector('#view-root').innerHTML='<section class="approval-page"><p>synthetic process review</p></section>';}
function navigate(view){state.view=view;render();}
window.MasterDataWorkflow={resetProjection(){},canLeave:()=>true};
window.ProcessRuntimeProjection={install(){},canLeave:()=>true};
window.RoutineFQCUI={reviewHTML:()=>'<p>synthetic routine review</p>'};
window.ProcessSync={deliveryProjection:true,identity:{id:'synthetic-reviewer'},identityGeneration:()=>1,
 destination:{view:'approval',dataTab:null,system:'process'},catalog:{},pendingState:()=>({}),
 async prepareDestination(target){fixtureReads.push(target.approvalTab);return {destination:{...target,system:'process'}};},
 validateDestination(){},commitDestination(handle){this.destination=handle.destination;}};
${registration}
render();
</script><script type="module">
import * as policy from './delivery-purpose.mjs';
window.ProcessDeliveryPurpose=policy;
await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./delivery-navigation.js';script.onload=resolve;script.onerror=reject;document.head.append(script);});
await window.ProcessDeliveryNavigation.initialized;
window.fixtureReady=true;
</script></body></html>`;
}

async function selected(page, tab, { url = true } = {}) {
  await page.waitForFunction(expected => window.fixtureReady && state.approvalTab === expected && ProcessDeliveryNavigation.current().approvalTab === expected && !ProcessDeliveryNavigation.pending(), tab);
  const actual = await page.evaluate(() => ({
    selected: [...document.querySelectorAll('[role=tab][aria-selected=true]')].map(el => el.dataset.reviewTab),
    visible: [...document.querySelectorAll('[role=tabpanel]')].filter(el => !el.hidden).map(el => el.id),
    keyboard: [...document.querySelectorAll('[role=tab]')].filter(el => el.tabIndex === 0).map(el => el.dataset.reviewTab),
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    messages: fixtureMessages,
    charset: document.characterSet,
  }));
  assert.equal(actual.charset, 'UTF-8', 'fixture document must decode multilingual production sources as UTF-8');
  assert.deepEqual(actual.selected, [tab]);
  assert.deepEqual(actual.visible, ['approval-panel-' + tab]);
  assert.deepEqual(actual.keyboard, [tab]);
  assert.equal(actual.overflow, false);
  assert.deepEqual(actual.messages, []);
  assert(await page.locator('#approval-panel-' + tab).isVisible());
  if (url) assert.equal(new URL(page.url()).searchParams.get('approvalTab'), tab);
}

void test('native Chromium approval deep links, reload and indexed history', async t => {
  const executablePath = process.env.CHROME_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
  try {
    for (const width of [1280, 390]) for (const lang of ['zh', 'vi']) {
      await t.test(`${lang} / ${width}px`, async () => {
        const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width === 390, hasTouch: width === 390 });
        const errors = [];
        const blocked = [];
        await context.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) { blocked.push(url.href); return route.abort(); }
          if (url.pathname === '/process/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture(lang) });
          if (assets.has(url.pathname)) return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', body: assets.get(url.pathname) });
          blocked.push(url.href); return route.abort();
        });
        const page = await context.newPage();
        page.setDefaultTimeout(5000);
        page.on('pageerror', error => errors.push(error.message));
        try {
          for (const tab of tabs) {
            await page.goto(`${origin}/process/?system=process&view=approval&approvalTab=${tab}`);
            await selected(page, tab);
            assert.deepEqual(await page.locator('[data-review-label]').allTextContents(), labels[lang]);
            await page.reload();
            await selected(page, tab);
          }
          for (const suffix of ['', '&approvalTab=', '&approvalTab=invalid', '&approvalTab=PROCESS', '&approvalTab=process&approvalTab=quality', '&approvalTab=process&approvalTab=process']) {
            await page.goto(`${origin}/process/?system=process&view=approval${suffix}`);
            await selected(page, 'master', { url: false });
            await page.locator('[data-review-tab=quality]').click();
            await selected(page, 'quality');
            await page.goBack();
            await selected(page, 'master', { url: false });
            assert.equal(new URL(page.url()).search, '?system=process&view=approval' + suffix);
            await page.reload();
            await selected(page, 'master', { url: false });
          }
          // Server destinationPlan normalizes shared approval to process, even
          // when the incoming display URL uses system=quality.
          await page.goto(`${origin}/process/?system=quality&view=approval&approvalTab=process`);
          await selected(page, 'process');
          await page.reload();
          await selected(page, 'process');
          await page.locator('[data-review-tab=quality]').click();
          await selected(page, 'quality');
          assert.equal(new URL(page.url()).searchParams.get('system'), 'process');
          await page.goBack();
          await selected(page, 'process');
          assert.equal(new URL(page.url()).searchParams.get('system'), 'quality');
          await page.reload();
          await selected(page, 'process');
          await page.goto(`${origin}/process/?system=process&view=approval&approvalTab=master`);
          await selected(page, 'master');
          for (const tab of tabs.slice(1)) {
            await page.locator('[data-review-tab=' + tab + ']').click();
            await selected(page, tab);
          }
          for (const tab of ['quality', 'process', 'master']) { await page.goBack(); await selected(page, tab); }
          for (const tab of tabs.slice(1)) { await page.goForward(); await selected(page, tab); }
          assert.deepEqual(await page.evaluate(() => fixtureReads), ['process', 'quality', 'routine', 'quality', 'process', 'master', 'process', 'quality', 'routine']);
          await page.locator('[data-review-tab=routine]').focus();
          await page.keyboard.press('Home');
          await selected(page, 'master');
          assert.equal(await page.locator('[data-review-tab=master]').evaluate(el => el === document.activeElement), true);
          await page.keyboard.press('ArrowRight');
          await selected(page, 'process');
          assert.equal(await page.locator('[data-review-tab=process]').evaluate(el => el === document.activeElement), true);
          assert.deepEqual(errors, []);
          assert.deepEqual(blocked, []);
        } finally { await context.close(); }
      });
    }
  } finally { await browser.close(); }
});
