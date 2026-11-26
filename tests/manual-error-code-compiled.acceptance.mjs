import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import test from 'node:test';
import {chromium} from 'playwright';
import {createABCFixture} from './ab-c-native-fixture.mjs';

const require = createRequire(import.meta.url);
const qualityFixture = require('../scripts/v3-quality-growth-fixture.cjs');
const cases = [
  {module:'fqc', key:'qualityMasterControl', add:'#fqc-add-error', edit:'[data-edit-error="error"]', form:'.fqc-modal-form', prefix:'fqc', id:'error'},
  {module:'iqc', key:'iqcMasterControl', add:'#iqc-add-error', edit:'[data-edit-error="error0"]', form:'#iqc-error-form', prefix:'iqc', id:'error0'},
  ...['A','B'].map(line => ({module:'ipqc-ab', key:'ipqcABMasterControl', line, add:'#ipqcab-add-error', edit:'[data-ab-edit-error="error0"]', form:'.ipqcab-dialog', prefix:'ipqcab', id:'error0'})),
  {module:'ipqc-c', key:'ipqcCMasterControl', add:'[data-ipqcc-add="error"]', edit:'[data-ipqcc-edit-error="error0"]', form:'#ipqcc-editor', prefix:'ipqcc', id:'error0'},
];

function seed(values) {
  const master = JSON.parse(values.masterDataControl);
  for (const config of cases.filter(c => c.line !== 'B')) {
    const data = qualityFixture(config.module,[{id:'synthetic',bytes:1}],0,1);
    const control = JSON.parse(data.values[data.key], (key,value) => {
      if (['mediaItems','standardPhotos','methodPhotos','photos'].includes(key)) return [];
      if (key === 'items' && Array.isArray(value) && ['iqc','ipqc-c'].includes(config.module)) {
        return value.map(item => ({...item, equipmentSnapshot:null}));
      }
      return value;
    });
    if (config.module === 'ipqc-ab') {
      control.scopes['B:GB'] = makeB(control.scopes['A:G']);
    }
    values[data.key] = JSON.stringify(control);
    if (config.module === 'fqc') {
      const {AB,C} = JSON.parse(data.values.masterDataControl).active;
      const b = makeB(AB);
      for (const key of ['categoryGroups','products','lines']) AB[key].push(...b[key]);
      for (const [scope,catalog] of Object.entries({AB,C})) {
        master.active[scope] = catalog;
        master.versions.find(v => v.scope === scope).snapshot = catalog;
      }
    }
  }
  values.masterDataControl = JSON.stringify(master);
}

function makeB(input) {
  return JSON.parse(JSON.stringify(input), (key,value) => {
    if (value === 'A') return 'B';
    if (value === 'A:G') return 'B:GB';
    if (value === 'G') return 'GB';
    if (value === 'PAB') return 'PBB';
    return typeof value === 'string' ? value.replaceAll('A-CUT','B-CUT').replace('ipqc-ab:A:G','ipqc-ab:B:GB') : value;
  });
}

for (const language of ['zh','vi']) for (const c of cases) {
  test(`manual error codes through the data backend, ${c.module} ${c.line || ''} ${language}`, async t => {
    const fixture = await createABCFixture({products:1,decorate:seed});
    t.after(() => fixture.close());
    const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
    t.after(() => browser.close());
    const context = await browser.newContext({serviceWorkers:'block'});
    const origin = fixture.url.origin;
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(lang => localStorage.setItem('processUILanguage',lang), language);
    await context.addCookies([{name:'process_demo',value:fixture.cookie('frank'),url:origin}]);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const path = '/process/?system=quality&view=data&dataTab=quality-'+c.module;
    const scope = c.line === 'B' ? 'B:GB' : 'A:G';
    const workflow = '/api/'+c.module+'/workflow'+(c.line ? '?scope='+encodeURIComponent(scope) : '');
    const form = page.locator(c.form);
    const code = form.locator('[name=code],#ab-error-code');
    const name = form.locator('[name=name],[name=nameVi],#ab-error-name');
    const apply = form.locator('[type=submit],#ab-apply');
    const raw = '  MiXeD Ω / 07 + [x]  ', renamed = 'Q 09 / 越';
    async function enter() {
      await page.goto(origin+path);
      if (c.module === 'iqc') await page.locator('[data-select-part=P1]').click();
      if (c.line === 'B') await page.locator('#ipqcab-line').selectOption('B');
      await page.locator(c.add).waitFor();
    }
    async function persisted(whole=false) {
      const row = await fixture.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();
      const values = await fixture.load('lib/process-state.ts').decodeValues(row.values);
      const control = JSON.parse(values[c.key]);
      if (c.line) return whole ? control.moduleDraft : control.scopes[scope];
      return c.module === 'fqc' ? control.libraries.fqc : control;
    }
    function response(action) {
      return page.waitForResponse(r => r.request().method()==='POST' && r.url().includes('/workflow') && r.request().postDataJSON()?.command?.action===action);
    }
    async function expectDuplicate() {
      await apply.click();
      assert.ok(await form.isVisible());
      const message = await form.evaluate(el => el.innerText+' '+Array.from(el.querySelectorAll('input'),item=>item.validationMessage).join(' '));
      assert.match(message,language==='vi'?/bản ghi khác/i:/另一筆/);
    }
    await enter();
    const original = await persisted(), before = original.workflow.working;
    const originalCode = before.errors.find(row => row.id === c.id).code;
    const active = original.versions.find(v => v.id === original.activeVersionId);
    await page.locator(c.add).click();
    assert.equal(await code.inputValue(),'');
    await name.fill('Synthetic manually entered');
    await code.fill(originalCode.toLowerCase()); await expectDuplicate();
    await code.fill(raw); await apply.click(); await form.waitFor({state:'hidden'});
    await page.locator(c.edit).click(); assert.equal(await code.inputValue(),originalCode);
    await apply.click(); await form.waitFor({state:'hidden'});
    await page.locator(c.edit).click(); await code.fill(raw.trim().toUpperCase()); await expectDuplicate();
    await code.fill(renamed); await apply.click(); await form.waitFor({state:'hidden'});
    const savedResponse = response('save'); await page.locator('#'+c.prefix+'-save').click();
    assert.equal((await savedResponse).status(),200);
    await enter();
    const stored = await persisted(), flow = stored.workflow;
    assert.equal(flow.working.errors.find(row=>row.id===c.id).code,renamed);
    const added = flow.working.errors.filter(row=>row.code===raw);
    assert.equal(added.length,1);
    assert.deepEqual(flow.working.items,before.items);
    assert.deepEqual(stored.versions.find(v=>v.id===stored.activeVersionId),active);
    for (const [invalid,reason] of [[originalCode,'ERROR_CODE_DUPLICATE'],['   ','ERROR_CODE_REQUIRED']]) {
      const codePath = ['errors',{id:added[0].id},'code'];
      const result = await page.request.post(origin+workflow,{headers:{Origin:origin,'X-Process-Expected-Actor':'frank'},data:{command:{
        action:'apply',operationId:randomUUID(),clientId:'manual-code-negative-test',sequence:1,generation:flow.generation,
        patches:[{op:'set',path:codePath,value:invalid}],guards:[{path:codePath,value:raw}]
      }}});
      assert.equal(result.status(),422);
      assert.equal((await result.json()).error,reason);
      assert.deepEqual(await persisted(),stored);
    }
    await page.locator('#'+c.prefix+'-submit').click();
    const confirm = page.locator('dialog.vd-confirm[open]');
    await confirm.locator('textarea').fill('Synthetic review');
    const submittedResponse = response('submit'); await confirm.locator('button[type=submit],button.signal').last().click();
    assert.equal((await submittedResponse).status(),200);
    const pending = (await persisted(Boolean(c.line))).workflow;
    assert.ok(pending.pendingId);
    assert.equal(pending.cases.find(row=>row.id===pending.pendingId).savedId,pending.saved.id);
    const content = c.line ? pending.saved.content.scopes[scope] : pending.saved.content;
    assert.deepEqual(content.items,before.items);
    assert.equal(content.errors.find(row=>row.id===c.id).code,renamed);
  });
}

