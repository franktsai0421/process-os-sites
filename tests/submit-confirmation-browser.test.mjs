// Production confirmation UI in isolated Chromium. No network, accounts or business state.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const source=fs.readFileSync('public/process/version-draft-ui.js','utf8');
const code=source.slice(source.indexOf('  const words ='),source.indexOf('  function decorateIssues('))+source.slice(source.indexOf('  function submitSnapshotHTML('),source.indexOf('  const updateSaved='))+'window.testConfirm=confirmSubmit;';
const css=fs.readFileSync('public/process/version-draft-ui.css','utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)});
try{
 for(const width of [320,390,1366])for(const lang of ['zh','vi'])await test(`Submit exact snapshot, cancel and keyboard confirmation ${width}px ${lang}`,async()=>{
  const page=await browser.newPage({viewport:{width,height:844}});await page.route('**/*',r=>r.abort());
  try{
   await page.setContent(`<html lang="${lang}"><head><style>body{margin:8px;font:16px sans-serif}button{min-height:44px}dialog{box-sizing:border-box;max-width:calc(100vw - 16px)}</style><style>${css}</style></head><body><button id="opener">Submit</button></body></html>`);
   await page.evaluate(()=>{window.host={ProcessSync:{identity:{id:'fixture'}}};});await page.addScriptTag({content:code});
   await page.locator('#opener').focus();await page.evaluate(()=>{window.answer='waiting';void window.testConfirm('','AB',{savedVersion:{id:'save-'+ 'x'.repeat(90),revision:27,at:'2026-10-30T00:00:00Z',actor:'Fixture <script>unsafe</script>'}}).then(v=>window.answer=v);});
   const modal=page.locator('dialog');assert(await modal.isVisible());assert(await modal.locator('.vd-snapshot-id').innerText().then(s=>s.includes('27')));assert.equal(await modal.locator('script').count(),0);
   assert(await page.evaluate(()=>document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth+1));
   await page.locator('[data-cancel]').click();assert.equal(await page.evaluate(()=>window.answer),null);assert.equal(await page.evaluate(()=>document.activeElement.id),'opener');
   await page.evaluate(()=>{window.answer='waiting';void window.testConfirm('','AB',{savedVersion:{id:'saved-fixture',revision:27,actor:'Synthetic'}}).then(v=>window.answer=v);});
   await page.locator('textarea').fill('核對修改 / Đã kiểm tra');await page.locator('dialog [type="submit"]').click();assert.equal(await page.evaluate(()=>window.answer),'核對修改 / Đã kiểm tra');
   const blocked=await page.evaluate(async()=>{try{await window.testConfirm('','AB',{masterSnapshot:{dirty:true}});}catch(e){return e.message;}});assert.equal(blocked,'UNSAVED_CHANGES_SAVE_REQUIRED');assert.equal(await page.locator('dialog').count(),0);
  }finally{await page.close();}
 });
}finally{await browser.close();}
